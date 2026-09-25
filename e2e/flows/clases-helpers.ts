import { expect, request, test as base, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';
import { shot as baseShot } from '../helpers';

// Shared pieces of the Clases flows (e2e/flows/clases-*.spec.ts): the class list, «Nueva clase», the class header and
// its «···» menu, Ajustes de la clase, Ponderaciones, the recovery rule and the Temario tab.
//
// The backend runs with «today» frozen on Thursday 19 Nov 2026 at 10:40 (SEPIA_TODAY / SEPIA_NOW). Two kinds of tests:
// - `demo`: the seeded demo teacher, only to look (nothing is changed there).
// - `teacher`: a teacher registered for that test alone with the classes, students, units and activities it needs.
//   Creating, archiving or deleting classes and editing units run there, so no test depends on another one nor on
//   their order, and a failed test leaves nothing behind for the next.

export const API = process.env.API || 'http://127.0.0.1:8000';
export const APP = process.env.APP || 'http://127.0.0.1:5173';
export const TODAY = '2026-11-19'; // Thursday; the backend's «now» is 10:40
export const MON = 0, TUE = 1, WED = 2, THU = 3, FRI = 4;

// ── API ─────────────────────────────────────────────────────────────────────
export class Api {
  constructor(readonly ctx: APIRequestContext, readonly tokens: { access_token: string; refresh_token: string }) {}

  async raw(method: string, path: string, data?: unknown) {
    return this.ctx.fetch(`${API}/api${path}`, { method, data, headers: { authorization: `Bearer ${this.tokens.access_token}` } });
  }

  private async call<T>(method: string, path: string, data?: unknown): Promise<T> {
    const r = await this.raw(method, path, data);
    if (!r.ok()) throw new Error(`${method} ${path} → ${r.status()} ${await r.text()}`);
    return r.json() as Promise<T>;
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
    if (!r.ok()) throw new Error(`Login ${email}: ${r.status()} — start the backend with the demo data`);
    return new Api(ctx, await r.json());
  }
}

// ── A teacher for one test ─────────────────────────────────────────────────
export interface Slot { weekday: number; start: string; end: string }
export interface UnitSpec { title: string; term: number | null; status?: 'pending' | 'current' | 'done'; links?: { url: string; title: string }[] }
export interface CourseSpec {
  subject?: string;
  short?: string;
  /** Group name as the teacher writes it ("2º ESO C"); a second class with the same name shares the group. */
  group?: string;
  room?: string;
  color?: string;
  slots?: Slot[];
  /** "Apellidos, Nombre", in list order. */
  students?: string[];
  units?: UnitSpec[];
  /** Graded things of the class (their category follows the kind: exam → Exámenes, worksheet → Trabajos…). */
  activities?: { title: string; kind: string; date: string; grades?: (number | null)[] }[];
  archived?: boolean;
}
export interface TeacherSpec { courses: CourseSpec[] }

export interface StudentRef { id: string; first_name: string; last_name: string; sort_name: string }
export interface TeacherCourse {
  id: string; groupId: string; label: string; students: StudentRef[];
  units: { id: string; title: string; term: number | null }[]; activities: { id: string; title: string }[];
}
export interface Teacher { api: Api; email: string; courses: TeacherCourse[] }

export const STUDENTS = [
  'Alonso Gil, Marta', 'Benítez Ruiz, Pablo', 'Castro León, Lucía', 'Díaz Soto, Hugo', 'Esteban Mora, Irene', 'Fuentes Vera, Adrián',
  'García Peña, Sara', 'Herrero Ibáñez, Daniel', 'Iglesias Lara, Nerea', 'Jiménez Ortiz, Mario', 'López Rey, Carla', 'Martín Sanz, Álvaro',
];

/** Matemáticas · 2.º ESO C: 12 students, Monday 08:30, Tuesday 09:25, Thursday 10:20-11:15 (on now) and Friday 12:40. */
export const MATES_2C: CourseSpec = {
  subject: 'Matemáticas', short: 'Mates', group: '2º ESO C', room: '112', color: 'teal',
  slots: [
    { weekday: MON, start: '08:30', end: '09:25' }, { weekday: TUE, start: '09:25', end: '10:20' },
    { weekday: THU, start: '10:20', end: '11:15' }, { weekday: FRI, start: '12:40', end: '13:35' },
  ],
  students: STUDENTS,
};

export async function createTeacher(ctx: APIRequestContext, spec: TeacherSpec): Promise<Teacher> {
  const email = `clases-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.sepia.es`;
  const r = await ctx.post(`${API}/api/auth/register`, { data: { name: 'Elena Prieto', email, password: 'sepia1234' } });
  if (!r.ok()) throw new Error(`Register: ${r.status()} ${await r.text()}`);
  const api = new Api(ctx, await r.json());
  const courses: TeacherCourse[] = [];
  for (const c of spec.courses) {
    const group = c.group ?? '2º ESO C';
    const level = Number(group.match(/\d/)?.[0] ?? 1);
    const course = await api.post('/courses', {
      subject: c.subject ?? 'Matemáticas', short: c.short ?? null, room: c.room ?? null, color: c.color ?? 'teal',
      schedule: c.slots ?? [],
      new_group: { name: group, stage: /bach/i.test(group) ? 'bachillerato' : 'eso', level },
    });
    let students: StudentRef[] = await api.get(`/groups/${course.group.id}/students`);
    if (c.students?.length && !students.length) {
      students = await api.post(`/groups/${course.group.id}/students`, {
        students: c.students.map((n) => { const [last, first] = n.split(', '); return { first_name: first, last_name: last }; }),
      });
    }
    const units = [];
    for (const u of c.units ?? []) {
      const unit = await api.post(`/courses/${course.id}/units`, { title: u.title, term: u.term, status: u.status ?? 'pending' });
      for (const l of u.links ?? []) await api.post(`/units/${unit.id}/links`, l);
      units.push(unit);
    }
    const activities = [];
    for (const a of c.activities ?? []) {
      const act = await api.post(`/courses/${course.id}/activities`, { title: a.title, kind: a.kind, date: a.date });
      const grades = (a.grades ?? []).map((score, i) => ({ student_id: students[i].id, score })).filter((g) => g.score !== null);
      if (grades.length) await api.put(`/activities/${act.id}/grades`, { grades });
      activities.push(act);
    }
    if (c.archived) await api.patch(`/courses/${course.id}`, { archived: true });
    courses.push({ id: course.id, groupId: course.group.id, label: course.label, students, units, activities });
  }
  return { api, email, courses };
}

// ── Fixtures ────────────────────────────────────────────────────────────────
type Fixtures = {
  /** Set with test.use({ teacherSpec }) to run the test as a teacher of its own. */
  teacherSpec: TeacherSpec | null;
  maybeTeacher: Teacher | null;
  /** The teacher of `teacherSpec`. */
  teacher: Teacher;
  /** The demo teacher, through the API. */
  demo: Api;
  /** Uncaught page errors fail the test. */
  pageErrors: string[];
};

export const test = base.extend<Fixtures>({
  teacherSpec: [null, { option: true }],
  maybeTeacher: async ({ teacherSpec }, use) => {
    if (!teacherSpec) return use(null);
    const ctx = await request.newContext();
    await use(await createTeacher(ctx, teacherSpec));
    await ctx.dispose();
  },
  teacher: async ({ maybeTeacher }, use) => {
    if (!maybeTeacher) throw new Error('This test needs test.use({ teacherSpec })');
    await use(maybeTeacher);
  },
  storageState: async ({ storageState, maybeTeacher }, use) => {
    // A test with its own teacher logs in as that teacher; the rest keep the demo login of global-setup.
    await use(maybeTeacher ? maybeTeacher.api.storageState() : storageState);
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
export type { Locator, Page } from '@playwright/test';

export const isMobile = (info: TestInfo) => info.project.name === 'mobile';

/** A flow that fails today because of an app bug: the spec keeps asserting the right behaviour and is expected to fail
 *  until the bug is fixed (Playwright then reports «unexpectedly passed»: drop the call). SHOW_BUGS=1 runs it as a
 *  normal test to see the failure. */
export function bug(id: string, what: string) {
  test.fail(!process.env.SHOW_BUGS, `${id}: ${what}`);
}

/** Screenshot for `npm run shots` (SHOTS=1): e2e/screenshots/<project>/clases-<name>.png. */
export const shot = (page: Page, info: TestInfo, name: string) => baseShot(page, info, `clases-${name}`);

// ── Demo data ──────────────────────────────────────────────────────────────
export interface DemoCourse { id: string; label: string; room: string | null; group: { id: string; name: string }; schedule: Slot[] }
export async function demoCourse(demo: Api, label: string): Promise<DemoCourse> {
  const all: DemoCourse[] = await demo.get('/courses');
  const c = all.find((x) => x.label === label);
  if (!c) throw new Error(`No demo class «${label}»`);
  return c;
}
export const DEMO_2B = 'Matemáticas · 2.º ESO B';
export const DEMO_1A = 'Matemáticas · 1.º ESO A';
export const DEMO_3A = 'Física y Química · 3.º ESO A';
export const DEMO_1BACH = 'Matemáticas I · 1.º Bach B';

// ── Page pieces ─────────────────────────────────────────────────────────────
export const toast = (page: Page, text: string | RegExp) => page.locator('.toasts .toast').filter({ hasText: text });

export const dialog = (page: Page, name: string | RegExp) => page.getByRole('dialog', { name, exact: typeof name === 'string' });

/** The row of a class in Clases (a link "Matemáticas · 2.º ESO B …"). */
export const classRow = (page: Page, label: string) =>
  page.locator('.courses__list').getByRole('link', { name: new RegExp(`^${esc(label)}`) });

/** Opens a class at a tab and waits for its header. */
export async function openClass(page: Page, id: string, tab = '', group?: string) {
  await page.goto(`/clases/${id}${tab ? `/${tab}` : ''}`);
  if (group) await expect(page.getByRole('heading', { level: 1, name: group })).toBeVisible();
  else await expect(page.getByRole('button', { name: 'Más opciones de la clase' })).toBeVisible();
}

/** Opens the class «···» menu and returns it. */
export async function classMenu(page: Page) {
  await page.getByRole('button', { name: 'Más opciones de la clase' }).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  return menu;
}

/** Picks an item of the class «···» menu. */
export async function classMenuPick(page: Page, item: string) {
  const menu = await classMenu(page);
  await menu.getByRole('menuitem', { name: item, exact: true }).click();
}

/** The segmented tabs of a class. */
export const tab = (page: Page, name: 'Cuaderno' | 'Alumnos' | 'Temario' | 'Faltas') =>
  page.getByRole('group', { name: 'Secciones de la clase' }).getByRole('button', { name, exact: true });

/** A timetable cell of the grid (free: a button; taken by another class: aria-disabled with its label). */
export const cell = (scope: Page | ReturnType<Page['getByRole']>, day: string, start: string, end: string) =>
  scope.getByRole('gridcell', { name: new RegExp(`^${day} de ${start} a ${end}`) });

/** An open sheet owns a history entry and gives it back (history.go(-1)) on the next tick after closing: wait for it
 *  before a `page.goto`, or the two navigations race (net::ERR_ABORTED). */
export async function sheetsClosed(page: Page) {
  await page.waitForFunction(() => !(window.history.state as { sheet?: string } | null)?.sheet);
}

export function esc(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
