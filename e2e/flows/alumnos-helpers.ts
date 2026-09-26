import { expect, request, test as base, type APIRequestContext, type Locator, type Page, type TestInfo } from '@playwright/test';
import { shot as baseShot } from '../helpers';

// Shared pieces of the Alumnos flows (e2e/flows/alumnos-*.spec.ts): Clase › Alumnos, «Añadir alumnos», the student file
// (notas, asistencia, observaciones, «A vigilar», apoyos, quitar del grupo) and the student search.
//
// The backend runs with «today» frozen on Thursday 19 Nov 2026 at 10:40 (SEPIA_TODAY / SEPIA_NOW). Two kinds of tests:
// - `demo`: the seeded demo teacher, to look at rich real data (AI drafts, NP, adapted versions, «A vigilar»). Nothing
//   is left changed there: what a test touches is put back in a `finally`.
// - `teacher`: a teacher registered for that test alone with the classes, students, grades, absences and notes it
//   needs. Every flow that adds, edits or removes runs there, so no test depends on another one nor on their order.

export const API = process.env.API || 'http://127.0.0.1:8000';
export const APP = process.env.APP || 'http://127.0.0.1:5173';
export const TODAY = '2026-11-19'; // Thursday; the backend's «now» is 10:40
export const MON = 0, TUE = 1, WED = 2, THU = 3, FRI = 4;

// ── API ─────────────────────────────────────────────────────────────────────
export class Api {
  constructor(readonly ctx: APIRequestContext, readonly tokens: { access_token: string; refresh_token: string }) {}

  raw(method: string, path: string, data?: unknown) {
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
    return { cookies: [], origins: [{ origin: APP, localStorage: [{ name: 'sepia.tokens', value: JSON.stringify(this.tokens) }] }] };
  }

  static async login(ctx: APIRequestContext, email: string, password: string): Promise<Api> {
    const r = await ctx.post(`${API}/api/auth/login`, { data: { email, password } });
    if (!r.ok()) throw new Error(`Login ${email}: ${r.status()} — start the backend with the demo data`);
    return new Api(ctx, await r.json());
  }
}

// ── A teacher for one test ─────────────────────────────────────────────────
export interface Slot { weekday: number; start: string; end: string }
type Mark = 'absent' | 'late' | 'justified';
type NoteKind = 'observation' | 'incident' | 'positive' | 'family';
export interface CourseSpec {
  subject?: string;
  short?: string;
  /** Group name as the teacher writes it ("2º ESO C"). */
  group?: string;
  /** Teach this subject to the group of an earlier class of the spec (same students, one more class for each). */
  sameGroupAs?: number;
  stage?: 'primaria' | 'eso' | 'bachillerato';
  color?: string;
  room?: string;
  slots?: Slot[];
  /** "Apellidos, Nombre", in list order. */
  students?: string[];
  /** Graded things of the class. `grades` by student index: a number, 'NP', or null (no grade). */
  activities?: { title: string; kind: string; date: string; max?: number; countsFor?: 'average' | 'none'; grades?: (number | 'NP' | null)[]; comments?: (string | null)[] }[];
  /** Attendance exceptions (the rest were present). */
  marks?: { student: number; date: string; start: string; status: Mark; note?: string }[];
  /** Observations of this class, by student indexes. */
  notes?: { students: number[]; kind: NoteKind; date: string; text: string }[];
  /** Homework checks of sessions of the schedule (the rest did it). */
  homework?: { date: string; start: string; marks: { student: number; status: 'not_done' | 'partial' }[] }[];
  /** Grades of the term set by the teacher in Evaluación (term 4 = final), by student index. */
  termGrades?: { term: number; student: number; grade: number }[];
}
export interface TeacherSpec { name?: string; courses: CourseSpec[] }

export interface StudentRef { id: string; first_name: string; last_name: string; name: string; sort_name: string }
export interface TeacherCourse { id: string; groupId: string; label: string; students: StudentRef[]; activities: { id: string; title: string }[] }
export interface Teacher { api: Api; email: string; name: string; courses: TeacherCourse[] }

export const STUDENTS = [
  'Alonso Gil, Marta', 'Benítez Ruiz, Pablo', 'Castro León, Lucía', 'Díaz Soto, Hugo', 'Esteban Mora, Irene', 'Fuentes Vera, Adrián',
  'García Peña, Sara', 'Herrero Ibáñez, Daniel', 'Iglesias Lara, Nerea', 'Jiménez Ortiz, Mario', 'López Rey, Carla', 'Martín Sanz, Álvaro',
];

/** Matemáticas · 2.º ESO C: 12 students, Monday 08:30, Tuesday 09:25, Thursday 10:20 (on now) and Friday 12:40. */
export const MATES_2C: CourseSpec = {
  subject: 'Matemáticas', short: 'Mates', group: '2º ESO C', room: '112', color: 'teal',
  slots: [
    { weekday: MON, start: '08:30', end: '09:25' }, { weekday: TUE, start: '09:25', end: '10:20' },
    { weekday: THU, start: '10:20', end: '11:15' }, { weekday: FRI, start: '12:40', end: '13:35' },
  ],
  students: STUDENTS,
};

const split = (n: string) => { const [last, first] = n.split(', '); return { first_name: first, last_name: last }; };

export async function createTeacher(ctx: APIRequestContext, spec: TeacherSpec): Promise<Teacher> {
  const email = `alumnos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.sepia.es`;
  const name = spec.name ?? 'Elena Prieto';
  const r = await ctx.post(`${API}/api/auth/register`, { data: { name, email, password: 'sepia1234' } });
  if (!r.ok()) throw new Error(`Register: ${r.status()} ${await r.text()}`);
  const api = new Api(ctx, await r.json());
  const courses: TeacherCourse[] = [];
  for (const c of spec.courses) {
    const group = c.group ?? '2º ESO C';
    const stage = c.stage ?? (/bach/i.test(group) ? 'bachillerato' : /prim/i.test(group) ? 'primaria' : 'eso');
    const shared = c.sameGroupAs !== undefined ? courses[c.sameGroupAs] : null;
    const course = await api.post('/courses', {
      subject: c.subject ?? 'Matemáticas', short: c.short ?? null, room: c.room ?? null, color: c.color ?? 'teal',
      schedule: c.slots ?? [],
      ...(shared ? { group_id: shared.groupId } : { new_group: { name: group, stage, level: Number(group.match(/\d/)?.[0] ?? 1) } }),
    });
    let students: StudentRef[] = shared ? shared.students : [];
    if (!shared && c.students?.length) students = await api.post(`/groups/${course.group.id}/students`, { students: c.students.map(split) });
    // The API answers sorted by surname; keep the spec's order so indexes match.
    if (!shared && c.students) students = c.students.map((n) => students.find((s) => s.sort_name === n)!);
    const activities = [];
    for (const a of c.activities ?? []) {
      const act = await api.post(`/courses/${course.id}/activities`, {
        title: a.title, kind: a.kind, date: a.date, max_score: a.max ?? 10, counts_for: a.countsFor ?? 'average',
      });
      const grades = (a.grades ?? []).map((g, i) => ({
        student_id: students[i].id, ...(g === 'NP' ? { status: 'absent' } : { score: g }),
        ...(a.comments?.[i] ? { comment: a.comments[i] } : {}),
      })).filter((_, i) => a.grades![i] !== null);
      if (grades.length) await api.put(`/activities/${act.id}/grades`, { grades });
      activities.push(act);
    }
    const lists = new Map<string, { date: string; start: string; marks: { student_id: string; status: Mark; note?: string }[] }>();
    for (const m of c.marks ?? []) {
      const k = `${m.date}|${m.start}`;
      if (!lists.has(k)) lists.set(k, { date: m.date, start: m.start, marks: [] });
      lists.get(k)!.marks.push({ student_id: students[m.student].id, status: m.status, note: m.note });
    }
    for (const l of lists.values()) await api.put(`/courses/${course.id}/attendance`, l);
    for (const n of c.notes ?? []) {
      await api.post('/notes', { course_id: course.id, kind: n.kind, date: n.date, text: n.text, student_ids: n.students.map((i) => students[i].id) });
    }
    for (const h of c.homework ?? []) {
      await api.put(`/courses/${course.id}/homework`, {
        date: h.date, start: h.start, marks: h.marks.map((m) => ({ student_id: students[m.student].id, status: m.status })),
      });
    }
    for (const t of c.termGrades ?? []) {
      await api.put(`/courses/${course.id}/evaluation/${t.term}/students/${students[t.student].id}`, { final_grade: t.grade });
    }
    courses.push({ id: course.id, groupId: course.group.id, label: course.label, students, activities });
  }
  return { api, email, name, courses };
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
    await use(maybeTeacher ? maybeTeacher.api.storageState() : storageState);
  },
  // «Copiar» and «Copiar y guardar» write to the clipboard; the tests read it back.
  permissions: ['clipboard-read', 'clipboard-write'],
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

export const isMobile = (info: TestInfo) => info.project.name === 'mobile';

/** A flow that fails today because of an app bug: the spec keeps asserting the right behaviour and is expected to fail
 *  until the bug is fixed (Playwright then reports «unexpectedly passed»: drop the call). SHOW_BUGS=1 runs it as a
 *  normal test to see the failure. */
export function bug(id: string, what: string) {
  test.fail(!process.env.SHOW_BUGS, `${id}: ${what}`);
}

/** Screenshot for `npm run shots` (SHOTS=1): e2e/screenshots/<project>/alumnos-<name>.png. */
export const shot = (page: Page, info: TestInfo, name: string) => baseShot(page, info, `alumnos-${name}`);

// ── Demo data ──────────────────────────────────────────────────────────────
export interface DemoCourse { id: string; label: string; group: { id: string; name: string } }
export async function demoCourse(demo: Api, label: string): Promise<DemoCourse> {
  const all: DemoCourse[] = await demo.get('/courses');
  const c = all.find((x) => x.label === label);
  if (!c) throw new Error(`No demo class «${label}»`);
  return c;
}
/** A demo student by "Apellidos, Nombre" in a demo class. */
export async function demoStudent(demo: Api, course: DemoCourse, sortName: string): Promise<StudentRef & { support: any }> {
  const roster: (StudentRef & { support: any })[] = await demo.get(`/courses/${course.id}/students`);
  const s = roster.find((x) => x.sort_name === sortName);
  if (!s) throw new Error(`No demo student «${sortName}» in ${course.label}`);
  return s;
}
export const DEMO_2B = 'Matemáticas · 2.º ESO B';
export const DEMO_1A = 'Matemáticas · 1.º ESO A';
export const DEMO_BACH = 'Matemáticas I · 1.º Bach B';

// ── Page pieces ─────────────────────────────────────────────────────────────
/** The newest notice with that text (the one of a repeated action may still be fading out). */
export const toast = (page: Page, text: string | RegExp) => page.locator('.toasts .toast').filter({ hasText: text }).last();
export const sheet = (page: Page, title: string | RegExp) => page.getByRole('dialog', { name: title });
/** The confirmation sheet of a destructive action (its title is the question). */
export const confirmSheet = (page: Page, title: string | RegExp) => page.getByRole('dialog', { name: title });

/** A page section by its heading ("Notas", "Asistencia", "Observaciones"). */
export const section = (page: Page | Locator, title: string | RegExp) =>
  page.locator('section.section').filter({ has: page.getByRole('heading', { name: title, exact: typeof title === 'string' }) });

/** Clase › Alumnos, waiting for the roster. */
export async function openRoster(page: Page, courseId: string) {
  await page.goto(`/clases/${courseId}/alumnos`);
  await expect(page.getByRole('button', { name: 'Alumnos', pressed: true })).toBeVisible();
}

/** A roster row (a link to the student file) by "Apellidos, Nombre". */
export const rosterRow = (page: Page, sortName: string) =>
  page.locator('.students-roster').getByRole('link').filter({ has: page.getByText(sortName, { exact: true }) });

/** The student file, waiting for the name. */
export async function openFile(page: Page, studentId: string, name: string, hash = '') {
  await page.goto(`/alumnos/${studentId}${hash}`);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

/** «···» of the student file, then an item. */
export async function fileMenu(page: Page, item: string | RegExp) {
  await page.getByRole('button', { name: 'Más opciones', exact: true }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

/** «···» of the class, then an item. */
export async function classMenu(page: Page, item: string | RegExp) {
  await page.getByRole('button', { name: 'Más opciones de la clase' }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

/** Lets the page render what a tap just did (two frames). Only before asserting that something did NOT happen, where
 *  there is nothing to wait for. */
export const settle = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

/** What the page wrote to the clipboard. */
export const clipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

/** Makes the clipboard refuse to write (a browser that does not allow it). */
export const denyClipboard = (page: Page) => page.evaluate(() => {
  navigator.clipboard.writeText = () => Promise.reject(new DOMException('Denied', 'NotAllowedError'));
});
