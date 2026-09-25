import {
  expect, request, test as base, type APIRequestContext, type APIResponse, type Locator, type Page, type TestInfo,
} from '@playwright/test';
import { shot as baseShot } from '../helpers';

// Shared pieces of the Cuaderno flows (e2e/flows/cuaderno*.spec.ts).
//
// The demo backend freezes «today» on Thursday 19 Nov 2026 at 10:40 (SEPIA_TODAY / SEPIA_NOW); the 1.ª evaluación runs
// from 8 Sep to 22 Dec. Two kinds of tests:
// - `world`: a teacher registered for that test alone, with the class, students, activities, grades, absences and
//   homework checks it needs (through the API, in a second). Everything that writes grades or columns runs there, so
//   the tests never depend on each other nor on their order, and every project (phone, desktop) gets its own teacher.
// - `demo`: the seeded demo teacher, whose 2.º ESO B holds the drafts the real AI wrote when the demo was seeded
//   («Examen U2 · Fracciones», 18 por revisar). Only looked at, or put back in a `finally`.
// The one flow that calls the real AI is tagged @ai: `npx playwright test e2e/flows/cuaderno --grep @ai` runs it alone,
// `--grep-invert @ai` runs the rest in a few minutes. Flows that fail because of an app bug call `bug()` (below).

const API = process.env.API || 'http://127.0.0.1:8000';
const APP = process.env.APP || 'http://127.0.0.1:5173';
export const TODAY = '2026-11-19'; // Thursday; the backend's «now» is 10:40
export const MON = 0;
export const TUE = 1;
export const THU = 3;

// ── API ─────────────────────────────────────────────────────────────────────
export class Api {
  constructor(readonly ctx: APIRequestContext, readonly tokens: { access_token: string; refresh_token: string }) {}

  /** The raw response (downloads, expected errors). */
  fetch(method: string, path: string, data?: unknown): Promise<APIResponse> {
    return this.ctx.fetch(`${API}/api${path}`, { method, data, headers: { authorization: `Bearer ${this.tokens.access_token}` } });
  }

  private async call<T>(method: string, path: string, data?: unknown): Promise<T> {
    const r = await this.fetch(method, path, data);
    if (!r.ok()) throw new Error(`${method} ${path} → ${r.status()} ${await r.text()}`);
    return r.json() as Promise<T>;
  }

  /** A file behind one of the API's signed URLs ("/api/files/…?exp=…&sig=…"), as bytes. */
  async file(url: string): Promise<Buffer> {
    const r = await this.ctx.get(`${API}${url}`);
    if (!r.ok()) throw new Error(`GET ${url} → ${r.status()}`);
    return r.body();
  }

  get<T = any>(path: string) { return this.call<T>('GET', path); }
  post<T = any>(path: string, data?: unknown) { return this.call<T>('POST', path, data ?? {}); }
  put<T = any>(path: string, data: unknown) { return this.call<T>('PUT', path, data); }
  patch<T = any>(path: string, data: unknown) { return this.call<T>('PATCH', path, data); }
  del<T = any>(path: string) { return this.call<T>('DELETE', path); }

  /** The browser storage state that logs this teacher in. */
  storageState() {
    return {
      cookies: [],
      origins: [{ origin: APP, localStorage: [{ name: 'sepia.tokens', value: JSON.stringify(this.tokens) }] }],
    };
  }

  static async login(ctx: APIRequestContext, email: string, password: string): Promise<Api> {
    const r = await ctx.post(`${API}/api/auth/login`, { data: { email, password } });
    if (!r.ok()) throw new Error(`Login ${email}: ${r.status()} — start the backend in demo mode`);
    return new Api(ctx, await r.json());
  }
}

// ── A teacher for one test ─────────────────────────────────────────────────
export type Kind = 'exam' | 'worksheet' | 'task' | 'oral' | 'notebook' | 'attitude' | 'other';
/** A grade as the world stores it: a score, NP, exento or nothing. */
export type Mark = number | 'NP' | 'EX' | null;
export interface Slot { weekday: number; start: string; end: string }
export interface ActivitySpec {
  title: string;
  kind?: Kind;
  date: string;
  max?: number;
  category?: string;
  weight?: number;
  countsFor?: 'average' | 'none' | 'recovery';
  recovers?: number;
  /** Only these students (indexes into `students`); the whole class without it. */
  only?: number[];
  /** By student index. */
  grades?: Mark[];
}
export interface CourseSpec {
  subject?: string;
  group?: string;
  stage?: 'eso' | 'bachillerato';
  room?: string;
  slots?: Slot[];
  /** "Apellidos, Nombre". */
  students?: string[];
  units?: { title: string; status: 'pending' | 'current' | 'done' }[];
  categories?: { key: string; label: string; weight: number }[];
  activities?: ActivitySpec[];
  /** Attendance lists with absences (exam days → «Faltó»). */
  absences?: { date: string; start: string; student: number; justified?: boolean }[];
  /** Homework checks (the «Deberes» column); everyone else did it. */
  homework?: { date: string; start: string; notDone?: number[]; partial?: number[] }[];
  /** The teacher's final grade in Evaluación. */
  adjust?: { term: number; student: number; final: number }[];
}

export interface StudentRef { id: string; first_name: string; last_name: string; name: string; sort_name: string }
export interface World {
  api: Api;
  id: string;
  label: string;
  group: string;
  groupId: string;
  students: StudentRef[];
  units: { id: string; title: string }[];
  /** Activity id by title. */
  act: Record<string, string>;
}

/** Matemáticas · 2.º ESO C: Tuesday 11:45 and Thursday 09:25 (the exams and checks of the world fall on those). */
export const SLOTS: Slot[] = [{ weekday: TUE, start: '11:45', end: '12:40' }, { weekday: THU, start: '09:25', end: '10:20' }];
/** In list order (by surname). `name` of each: "Marta Alonso Gil". */
export const STUDENTS = [
  'Alonso Gil, Marta', 'Benítez Ruiz, Pablo', 'Castro León, Lucía', 'Díaz Soto, Hugo', 'Esteban Mora, Irene', 'Fuentes Vera, Adrián',
];
export const NAMES = STUDENTS.map((s) => { const [last, first] = s.split(', '); return `${first} ${last}`; });
export const LABEL = 'Matemáticas · 2.º ESO C';
export const CLASS: CourseSpec = { slots: SLOTS, students: STUDENTS };

async function createWorld(ctx: APIRequestContext, spec: CourseSpec): Promise<World> {
  const email = `cuaderno-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.sepia.es`;
  const r = await ctx.post(`${API}/api/auth/register`, { data: { name: 'Elena Prieto', email, password: 'sepia1234' } });
  if (!r.ok()) throw new Error(`Register: ${r.status()} ${await r.text()}`);
  const api = new Api(ctx, await r.json());
  const group = spec.group ?? '2º ESO C';
  const course = await api.post('/courses', {
    subject: spec.subject ?? 'Matemáticas', room: spec.room ?? '112', schedule: spec.slots ?? SLOTS,
    new_group: { name: group, stage: spec.stage ?? 'eso', level: Number(group.match(/\d/)?.[0] ?? 1) },
  });
  if (spec.categories) await api.patch(`/courses/${course.id}`, { categories: spec.categories });
  const students: StudentRef[] = spec.students?.length ? await api.post(`/groups/${course.group.id}/students`, {
    students: spec.students.map((n) => { const [last, first] = n.split(', '); return { first_name: first, last_name: last }; }),
  }) : [];
  const units = [];
  for (const u of spec.units ?? []) units.push(await api.post(`/courses/${course.id}/units`, { title: u.title, term: 1, status: u.status }));
  const act: Record<string, string> = {};
  for (const a of spec.activities ?? []) {
    const created = await api.post(`/courses/${course.id}/activities`, {
      title: a.title, kind: a.kind ?? 'exam', date: a.date, max_score: a.max ?? 10, category: a.category, weight: a.weight ?? 1,
      counts_for: a.countsFor ?? 'average', recovers_term: a.countsFor === 'recovery' ? a.recovers ?? 1 : null,
      student_ids: a.only ? a.only.map((i) => students[i].id) : null,
    });
    act[a.title] = created.id;
    const grades = (a.grades ?? []).flatMap((g, i) => g === null || g === undefined ? [] : [
      g === 'NP' ? { student_id: students[i].id, status: 'absent' } : g === 'EX' ? { student_id: students[i].id, status: 'exempt' }
        : { student_id: students[i].id, score: g },
    ]);
    if (grades.length) await api.put(`/activities/${created.id}/grades`, { grades });
  }
  for (const a of spec.absences ?? []) {
    await api.put(`/courses/${course.id}/attendance`, {
      date: a.date, start: a.start, marks: [{ student_id: students[a.student].id, status: a.justified ? 'justified' : 'absent' }],
    });
  }
  for (const h of spec.homework ?? []) {
    await api.put(`/courses/${course.id}/homework`, {
      date: h.date, start: h.start, marks: [
        ...(h.notDone ?? []).map((i) => ({ student_id: students[i].id, status: 'not_done' })),
        ...(h.partial ?? []).map((i) => ({ student_id: students[i].id, status: 'partial' })),
      ],
    });
  }
  for (const a of spec.adjust ?? []) {
    await api.put(`/courses/${course.id}/evaluation/${a.term}/students/${students[a.student].id}`, { final_grade: a.final });
  }
  return { api, id: course.id, label: course.label, group: course.group.name, groupId: course.group.id, students, units, act };
}

// ── Fixtures ────────────────────────────────────────────────────────────────
type Fixtures = {
  /** Set with test.use({ worldSpec }) to run the test as a teacher of its own. */
  worldSpec: CourseSpec | null;
  maybeWorld: World | null;
  world: World;
  /** The demo teacher, through the API. */
  demo: Api;
  /** Uncaught page errors fail the test. */
  pageErrors: string[];
};

export const test = base.extend<Fixtures>({
  worldSpec: [null, { option: true }],
  maybeWorld: async ({ worldSpec }, use) => {
    if (!worldSpec) return use(null);
    const ctx = await request.newContext();
    await use(await createWorld(ctx, worldSpec));
    await ctx.dispose();
  },
  world: async ({ maybeWorld }, use) => {
    if (!maybeWorld) throw new Error('This test needs test.use({ worldSpec })');
    await use(maybeWorld);
  },
  storageState: async ({ storageState, maybeWorld }, use) => {
    // A world test logs in as its own teacher; the rest keep the demo login of global-setup.
    await use(maybeWorld ? maybeWorld.api.storageState() : storageState);
  },
  demo: async ({}, use) => {
    const ctx = await request.newContext();
    await use(await Api.login(ctx, 'demo@sepia.es', 'sepia1234'));
    await ctx.dispose();
  },
  pageErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await use(errors);
    expect(errors, 'uncaught errors in the page').toEqual([]);
  }, { auto: true }],
});
export { expect };
export type { Page, TestInfo };

export const isMobile = (info: TestInfo) => info.project.name === 'mobile';

/** A flow that fails today because of an app bug: the spec keeps asserting the right behaviour and is expected to fail
 *  until the bug is fixed (then Playwright reports it as «unexpectedly passed»: drop the call). SHOW_BUGS=1 runs it as
 *  a normal test to see the failure. */
export function bug(id: string, what: string) {
  test.fail(!process.env.SHOW_BUGS, `${id}: ${what}`);
}

/** Screenshot for `npm run shots` (SHOTS=1): e2e/screenshots/<project>/cuaderno-<name>.png. */
export const shot = (page: Page, info: TestInfo, name: string) => baseShot(page, info, `cuaderno-${name}`);

// ── Server state ────────────────────────────────────────────────────────────
export interface Cell { score: number | null; status: string; activity_id?: string | null; repeat?: boolean; absence?: string | null }
export interface GbRow { student: StudentRef; grades: Record<string, Cell>; average: number | null; final: number | null; adjusted: boolean; recovery: unknown; drafts: number }
export interface Gb { term: number; activities: { id: string; title: string; short_title: string; kind: string; category: string; weight: number; max_score: number; counts_for: string; recovers_term: number | null; student_ids: string[] | null; suggested: number; pending_absent: number; attendance_conflicts: number; class_average: number | null }[]; students: GbRow[]; categories: { key: string; label: string; weight: number }[] }

export const gradebook = (api: Api, courseId: string, term = 1) => api.get<Gb>(`/courses/${courseId}/gradebook?term=${term}`);

/** The grade of each student in an activity, by "Apellidos, Nombre": {score, status}. */
export async function sheet(api: Api, activityId: string): Promise<Record<string, { score: number | null; status: string }>> {
  const a = await api.get(`/activities/${activityId}`);
  return Object.fromEntries(a.sheet.map((r: { student: StudentRef; score: number | null; status: string }) =>
    [r.student.sort_name, { score: r.score, status: r.status }]));
}

// ── Page pieces ─────────────────────────────────────────────────────────────
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Opens the class on its Cuaderno (a term, or the current one) and waits for the grid or its empty state. */
export async function openCuaderno(page: Page, courseId: string, term?: number) {
  await page.goto(`/clases/${courseId}/cuaderno${term ? `?term=${term}` : ''}`);
  await expect(page.locator('table.gb, .empty').first()).toBeVisible();
}

/** A grade cell (its button) by student name ("Marta Alonso Gil") and activity title. */
export const cell = (page: Page, student: string, title: string) =>
  page.getByRole('button', { name: new RegExp(`^${esc(student)} · ${esc(title)}: `) });

/** The input of the cell being typed. */
export const cellInput = (page: Page, student: string, title: string) =>
  page.getByRole('textbox', { name: `${student} · ${title}`, exact: true });

/** A tap on phones, a click on computers. */
export async function press(target: Locator, info: TestInfo) {
  if (isMobile(info)) await target.tap();
  else await target.click();
}

/** Opens a cell, types `value` and leaves it with `key` (Enter by default: saves and goes down). */
export async function typeGrade(page: Page, info: TestInfo, student: string, title: string, value: string, key = 'Enter') {
  await press(cell(page, student, title), info);
  const input = cellInput(page, student, title);
  await expect(input).toBeFocused();
  await input.fill(value);
  await input.press(key);
}

/** The Media button of a student's row. */
export const average = (page: Page, student: string) => page.getByRole('button', { name: new RegExp(`^Media de ${esc(student)}: `) });

/** The header cell of a column, by the activity title. */
export const column = (page: Page, title: string) =>
  page.locator('th.gb-col').filter({ has: page.getByRole('button', { name: `Editar ${title}`, exact: true }) });

/** «Editar actividad» of a column: long-press on a phone (real touch events), the pencil on a computer. */
export async function openEdit(page: Page, info: TestInfo, title: string) {
  const sheet = page.getByRole('dialog', { name: 'Editar actividad' });
  if (!isMobile(info)) {
    await page.getByRole('button', { name: `Editar ${title}`, exact: true }).click();
  } else {
    await longPress(page, column(page, title).locator('.gb-head'));
  }
  await expect(sheet.getByRole('textbox', { name: 'Título' })).toBeVisible();
  return sheet;
}

/** Holds a finger on `target` until something opens (the 500 ms long-press of the column headers). */
export async function longPress(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await expect(page.getByRole('dialog')).toBeVisible();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** Opens the class «···» and picks an item. */
export async function classMenu(page: Page, item: string) {
  await page.getByRole('button', { name: 'Más opciones de la clase' }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

export const toast = (page: Page, text: string | RegExp) => page.locator('.toasts .toast').filter({ hasText: text });

/** The term selector of the Cuaderno. */
export const terms = (page: Page) => page.getByRole('group', { name: 'Evaluación' });

/** A confirmation dialog by its title. */
export const confirmDialog = (page: Page, title: string) => page.getByRole('dialog', { name: title });
