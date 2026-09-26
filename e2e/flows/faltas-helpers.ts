import { expect as baseExpect, request, test as base, type APIRequestContext, type Locator, type Page, type TestInfo } from '@playwright/test';
import { shot as baseShot } from '../helpers';

// Shared pieces of the Faltas flows (e2e/flows/faltas-*.spec.ts). No AI anywhere: attendance is deterministic.
//
// The demo backend freezes «today» on Thursday 19 Nov 2026 at 10:40 (SEPIA_TODAY / SEPIA_NOW). Two kinds of tests:
// - `demo`: the seeded demo teacher. Only for looking, or for what the test puts back through the API in a `finally`
//   (`pastLists` adds a slot to a demo class so that it has lists of past days to take, and removes it afterwards).
// - `world`: a teacher registered for that test alone, with the class, students and marks it needs. Taking a list
//   cannot be undone, so those run there. Every test and every project gets its own teacher: no test depends on
//   another one nor on their order.

const API = process.env.API || 'http://127.0.0.1:8000';
const APP = process.env.APP || 'http://127.0.0.1:5173';
export const TODAY = '2026-11-19'; // Thursday; the backend's «now» is 10:40
export const MON = 0;
export const WED = 2;
export const THU = 3;
export const FRI = 4;

// ── API ─────────────────────────────────────────────────────────────────────
export class Api {
  constructor(readonly ctx: APIRequestContext, readonly tokens: { access_token: string; refresh_token: string }) {}

  private async call<T>(method: string, path: string, data?: unknown): Promise<T> {
    const r = await this.ctx.fetch(`${API}/api${path}`, { method, data, headers: { authorization: `Bearer ${this.tokens.access_token}` } });
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
    if (!r.ok()) throw new Error(`Login ${email}: ${r.status()} — start the backend in demo mode`);
    return new Api(ctx, await r.json());
  }
}

export type Status = 'present' | 'absent' | 'late' | 'justified';
export interface StudentRef { id: string; first_name: string; last_name: string; name: string; sort_name: string }
export interface Slot { weekday: number; start: string; end: string }

// ── Attendance through the API ──────────────────────────────────────────────
export interface Summary {
  term: number;
  sessions_missing: { date: string; start: string; end: string }[];
  today: { date: string; start: string; end: string; taken: boolean }[];
  students: { student: StudentRef; absent: number; justified: number; late: number }[];
}
export const summary = (api: Api, courseId: string, term = 1) => api.get<Summary>(`/courses/${courseId}/attendance/summary?term=${term}`);

/** One list as the server has it: whether it is taken and each student's mark («absent · note» when it has a note). */
export async function list(api: Api, courseId: string, date: string, start: string) {
  const a = await api.get(`/courses/${courseId}/attendance?date=${date}&start=${start}`);
  const by: Record<string, string> = {};
  for (const r of a.students as { student: StudentRef; status: Status; note: string | null }[]) {
    by[r.student.sort_name] = r.note ? `${r.status} · ${r.note}` : r.status;
  }
  return { taken: a.taken as boolean, by };
}

/** Takes a list through the API with only these marks (the rest present). */
export const mark = (api: Api, courseId: string, date: string, start: string, marks: { student: StudentRef; status: Status; note?: string }[]) =>
  api.put(`/courses/${courseId}/attendance`, { date, start, marks: marks.map((m) => ({ student_id: m.student.id, status: m.status, note: m.note ?? null })) });

// ── A teacher for one test ─────────────────────────────────────────────────
export interface CourseSpec {
  subject?: string;
  group?: string;
  room?: string | null;
  slots: Slot[];
  /** "Apellidos, Nombre", in list order: the first list of the group (in the class from the start). */
  students?: string[];
  /** Lists taken before the test, with their marks (student = index in `students`). */
  lists?: { date: string; start: string; marks?: { student: number; status: Status; note?: string }[] }[];
  /** «Cerrar clase» of earlier sessions (what the next one shows: «Deberes: …» with «Revisar»). */
  logs?: { date: string; start: string; done?: string; next?: string; homework?: string }[];
  /** Another subject of the group of that earlier class (index in `courses`): same students, `students` is ignored. */
  sameGroupAs?: number;
}
export interface WorldSpec { courses: CourseSpec[] }
export interface WorldCourse { id: string; label: string; groupId: string; students: StudentRef[] }
export interface World { api: Api; courses: WorldCourse[] }

const STUDENTS = [
  'Alonso Gil, Marta', 'Benítez Ruiz, Pablo', 'Castro León, Lucía', 'Díaz Soto, Hugo',
  'Esteban Mora, Irene', 'Fuentes Vera, Adrián', 'García Peña, Sara', 'Herrero Ibáñez, Daniel',
];
/** Matemáticas · 2.º ESO C, 8 students, Thursday 10:20–11:15 (on now) and 12:40–13:35 (later today), Friday 09:25. */
export const CLASS: CourseSpec = {
  subject: 'Matemáticas', group: '2º ESO C', room: '112', students: STUDENTS,
  slots: [{ weekday: THU, start: '10:20', end: '11:15' }, { weekday: THU, start: '12:40', end: '13:35' }, { weekday: FRI, start: '09:25', end: '10:20' }],
};
export const LABEL = 'Matemáticas · 2.º ESO C';

async function createWorld(ctx: APIRequestContext, spec: WorldSpec): Promise<World> {
  const email = `faltas-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.sepia.es`;
  const r = await ctx.post(`${API}/api/auth/register`, { data: { name: 'Elena Prieto', email, password: 'sepia1234' } });
  if (!r.ok()) throw new Error(`Register: ${r.status()} ${await r.text()}`);
  const api = new Api(ctx, await r.json());
  const courses: WorldCourse[] = [];
  for (const c of spec.courses) {
    const group = c.group ?? '2º ESO C';
    const shared = c.sameGroupAs === undefined ? null : courses[c.sameGroupAs];
    const course = await api.post('/courses', {
      subject: c.subject ?? 'Matemáticas', room: c.room === undefined ? '112' : c.room, schedule: c.slots,
      ...(shared ? { group_id: shared.groupId } : {
        new_group: { name: group, stage: /bach/i.test(group) ? 'bachillerato' : 'eso', level: Number(group.match(/\d/)?.[0] ?? 1) },
      }),
    });
    const students: StudentRef[] = shared ? shared.students : c.students?.length ? await api.post(`/groups/${course.group.id}/students`, {
      students: c.students.map((n) => { const [last, first] = n.split(', '); return { first_name: first, last_name: last }; }),
    }) : [];
    for (const l of c.lists ?? []) {
      await mark(api, course.id, l.date, l.start, (l.marks ?? []).map((m) => ({ ...m, student: students[m.student] })));
    }
    for (const log of c.logs ?? []) await api.put(`/courses/${course.id}/sessions/log`, log);
    courses.push({ id: course.id, label: course.label, groupId: course.group.id, students });
  }
  return { api, courses };
}

// ── Demo data ──────────────────────────────────────────────────────────────
export interface DemoCourse { id: string; label: string; room: string | null; group: { id: string; name: string }; schedule: Slot[] }
export async function demoCourse(demo: Api, label: string): Promise<DemoCourse> {
  const all: DemoCourse[] = await demo.get('/courses');
  const c = all.find((x) => x.label === label);
  if (!c) throw new Error(`No demo class «${label}»`);
  return c;
}

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** The three days of that weekday before today, most recent first: the ones «Listas sin pasar» can still show. */
function weekdaysBefore(weekday: number): string[] {
  const d = new Date(`${TODAY}T12:00:00`);
  const out: string[] = [];
  while (out.length < 3) {
    d.setDate(d.getDate() - 1);
    if ((d.getDay() + 6) % 7 === weekday) out.push(iso(d));
  }
  return out;
}

export interface PastLists { start: string; end: string; missing: string[]; restore: (api: Api) => Promise<void> }
/** Gives a demo class (created in September) a slot nobody has taken a list of (by default on Wednesday afternoon):
 *  its lists of the last weeks are due («Listas sin pasar»), the real state of a teacher who forgot them. On Thursday
 *  early in the morning (`{ weekday: THU, from: 6 * 60 }`) today's list is one of them: ended and still due.
 *  `restore(api)` removes the slot and undoes what the test did to those lists (marks back to present, cancellations). */
export async function pastLists(demo: Api, c: DemoCourse, { weekday = WED, from = 16 * 60 } = {}): Promise<PastLists> {
  const dates = weekday === THU ? [TODAY, ...weekdaysBefore(weekday)] : weekdaysBefore(weekday);
  for (let m = from; m <= from + 4 * 60; m += 5) {
    const start = hhmm(m);
    const end = hhmm(m + 50);
    const lists = await Promise.all(dates.map((d) => demo.get(`/courses/${c.id}/attendance?date=${d}&start=${start}`)));
    if (lists.some((l) => l.taken)) continue;
    await demo.patch(`/courses/${c.id}`, { schedule: [...c.schedule, { weekday, start, end }] });
    const missing = (await summary(demo, c.id)).sessions_missing.filter((s) => s.start === start).map((s) => s.date);
    const restore = async (api: Api) => {
      for (const d of dates) {
        await api.del(`/courses/${c.id}/sessions/cancel?date=${d}&start=${start}`);
        const l = await api.get(`/courses/${c.id}/attendance?date=${d}&start=${start}`);
        const marked = (l.students as { student: StudentRef; status: Status }[]).filter((r) => r.status !== 'present');
        if (marked.length) await mark(api, c.id, d, start, marked.map((r) => ({ student: r.student, status: 'present' })));
      }
      await api.patch(`/courses/${c.id}`, { schedule: c.schedule });
    };
    if (missing.length < 2) { await restore(demo); throw new Error(`Only ${missing.length} past lists for ${start}: check the school year`); }
    return { start, end, missing, restore };
  }
  throw new Error('No free slot left: reset the data copy');
}

// ── Fixtures ────────────────────────────────────────────────────────────────
type Fixtures = {
  /** Set with test.use({ worldSpec }) to run the test as a teacher of its own. */
  worldSpec: WorldSpec | null;
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
/** Web-first assertions wait up to 10 s: the dev server compiles a lazy page (the file, Evaluación) on its first visit. */
export const expect = baseExpect.configure({ timeout: 10_000 });

export const isMobile = (info: TestInfo) => info.project.name === 'mobile';

/** A flow that fails today because of an app bug: the spec keeps asserting the right behaviour and is expected to fail
 *  until the bug is fixed (then Playwright reports «unexpectedly passed»: drop the call). SHOW_BUGS=1 runs it as a
 *  normal test to see the failure. */
export function bug(id: string, what: string) {
  test.fail(!process.env.SHOW_BUGS, `${id}: ${what}`);
}

/** Screenshot for `npm run shots` (SHOTS=1): e2e/screenshots/<project>/faltas-<name>.png. */
export const shot = (page: Page, info: TestInfo, name: string) => baseShot(page, info, `faltas-${name}`);

// ── Dates as the app writes them ────────────────────────────────────────────
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
/** "miércoles, 18 de noviembre" */
export function longDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}
/** "mié 18 nov" (the student file's list of absences) */
export function shortDay(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  return `${WEEKDAYS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// ── Page pieces ─────────────────────────────────────────────────────────────
/** Opens the Faltas tab of a class and waits until its content (not the skeleton) is on screen. */
export async function openFaltas(page: Page, courseId: string) {
  await page.goto(`/clases/${courseId}/asistencia`);
  await expect(page.getByRole('group', { name: 'Evaluación' })).toBeVisible();
  await expect(page.locator('.att-tab .section, .att-tab .empty').first()).toBeVisible();
}

/** A section of the page by its heading ("Hoy", "Listas sin pasar · 3", "Por alumno"). */
export const section = (page: Page, title: string | RegExp) =>
  page.locator('section.section').filter({ has: page.getByRole('heading', { name: title, exact: typeof title === 'string' }) });
export const headings = (page: Page) => page.locator('main').getByRole('heading', { level: 2 });

/** A row of Faltas › Hoy by its times ("10:20–11:15"). */
export const todayRow = (page: Page, times: string) => section(page, 'Hoy').locator('.row').filter({ hasText: times });
/** A row of «Listas sin pasar» by its date. */
export const missingRow = (page: Page, isoDate: string) =>
  section(page, /^Listas sin pasar/).locator('.row').filter({ hasText: longDate(isoDate) });
/** A student of «Por alumno». */
export const studentRow = (page: Page, sortName: string) => section(page, 'Por alumno').getByRole('link', { name: new RegExp(`^${sortName}`) });

export const toast = (page: Page, text: string | RegExp) => page.locator('.toasts .toast').filter({ hasText: text });
/** What the page wrote to the clipboard (the test needs `permissions: ['clipboard-read', 'clipboard-write']`). */
export const clipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());
export const dialog = (page: Page, name: string) => page.getByRole('dialog', { name, exact: true });

/** The «Pasar lista» sheet, once its students are on screen. It has no accessible name (BUG-HOY-07, hoy-79): found by
 *  the list it holds. */
export async function listSheet(page: Page) {
  const list = page.getByRole('list', { name: /Lista de la clase/ });
  const sheet = page.getByRole('dialog').filter({ has: list });
  await expect(sheet.getByRole('list', { name: /Lista de la clase/ })).toBeVisible();
  return sheet;
}

/** Waits until a sheet is closed and its history entry is gone: until then a `page.goto` would be undone by the
 *  sheet's own `history.back()`. */
export async function closed(page: Page, sheet: Locator) {
  await expect(sheet).toBeHidden();
  await expect.poll(() => page.evaluate(() => (window.history.state as { sheet?: string } | null)?.sheet ?? null)).toBeNull();
}

/** A student of the list sheet by list number. */
export const rosterRow = (scope: Page | Locator, n: number) => scope.getByRole('button', { name: new RegExp(`^${n}\\. `) });

/** Taps a student until the row says `status` (Presente → Falta → Retraso → Presente). */
export async function tapTo(scope: Page | Locator, n: number, status: string) {
  const row = rosterRow(scope, n);
  for (let i = 0; i < 4 && !(await row.getAttribute('aria-label'))?.includes(`: ${status}.`); i++) await row.click();
  await expect(row).toHaveAttribute('aria-label', new RegExp(`: ${status}\\.`));
}

/** Per-student options of the list: long-press on a phone (real touch events), right-click on a computer. */
export async function rowOptions(page: Page, info: TestInfo, row: Locator) {
  const menu = page.getByRole('menu');
  if (!isMobile(info)) {
    await row.click({ button: 'right' });
    await expect(menu).toBeVisible();
    return menu;
  }
  await row.scrollIntoViewIfNeeded();
  const box = (await row.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await expect(menu).toBeVisible();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  return menu;
}

/** Counts the PUTs of attendance the page sends (to prove that looking at a list saves nothing). */
export function countListSaves(page: Page) {
  const saves: string[] = [];
  page.on('request', (r) => { if (r.method() === 'PUT' && /\/attendance$/.test(new URL(r.url()).pathname)) saves.push(r.postData() ?? ''); });
  return saves;
}
