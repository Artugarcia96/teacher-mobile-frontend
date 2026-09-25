import { expect, request, test as base, type APIRequestContext, type Locator, type Page, type TestInfo } from '@playwright/test';
import { shot as baseShot } from '../helpers';

// Shared pieces of the Hoy flows (e2e/flows/hoy*.spec.ts). No AI anywhere: Hoy is deterministic.
//
// The demo backend freezes «today» on Thursday 19 Nov 2026 at 10:40 (SEPIA_TODAY / SEPIA_NOW). Two kinds of tests:
// - `demo`: the seeded demo teacher, only for what can be looked at or undone through the API (each test puts back
//   what it changes in a `finally`).
// - `world`: a teacher registered for that test alone, with the classes, students, units and class logs it needs.
//   Taking a list, checking homework or «Ya lo sé» cannot be undone, so those run there. Every run and every project
//   gets its own teacher, so the tests never depend on each other nor on their order.

const API = process.env.API || 'http://127.0.0.1:8000';
const APP = process.env.APP || 'http://127.0.0.1:5173';
export const TODAY = '2026-11-19'; // Thursday; the backend's «now» is 10:40
export const THU = 3;
export const FRI = 4;
export const MON = 0;

// ── API ─────────────────────────────────────────────────────────────────────
class Api {
  constructor(readonly ctx: APIRequestContext, readonly tokens: { access_token: string; refresh_token: string }) {}

  private async call<T>(method: string, path: string, data?: unknown): Promise<T> {
    const r = await this.ctx.fetch(`${API}/api${path}`, {
      method, data, headers: { authorization: `Bearer ${this.tokens.access_token}` },
    });
    if (!r.ok()) throw new Error(`${method} ${path} → ${r.status()} ${await r.text()}`);
    return r.json() as Promise<T>;
  }

  get<T = any>(path: string) { return this.call<T>('GET', path); }
  post<T = any>(path: string, data?: unknown) { return this.call<T>('POST', path, data ?? {}); }
  put<T = any>(path: string, data: unknown) { return this.call<T>('PUT', path, data); }
  patch<T = any>(path: string, data: unknown) { return this.call<T>('PATCH', path, data); }
  del<T = any>(path: string) { return this.call<T>('DELETE', path); }

  async upload(path: string, name: string, text: string) {
    const r = await this.ctx.post(`${API}/api${path}`, {
      headers: { authorization: `Bearer ${this.tokens.access_token}` },
      multipart: { file: { name, mimeType: 'text/plain', buffer: Buffer.from(text) } },
    });
    if (!r.ok()) throw new Error(`POST ${path} → ${r.status()} ${await r.text()}`);
    return r.json();
  }

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
export interface Slot { weekday: number; start: string; end: string }
export interface CourseSpec {
  subject?: string;
  group?: string;
  room?: string;
  slots: Slot[];
  /** "Apellidos, Nombre", in list order. */
  students?: string[];
  units?: { title: string; status: 'pending' | 'current' | 'done' }[];
  /** «Cerrar clase» of earlier sessions (what the next one shows as «Toca»). */
  logs?: { date: string; start: string; done?: string; next?: string; homework?: string }[];
  /** Incidents (observations of kind «incidencia») per student index, with their date: 2 in 7 days → «A vigilar». */
  incidents?: { student: number; date: string; text: string }[];
  /** Exams dated before today without grades (Pendiente › «N sin nota»). */
  pastExams?: { title: string; date: string }[];
  /** Materials of the unit in progress: web links and plain-text files (nothing for the AI to read). */
  links?: { url: string; title: string }[];
  files?: { name: string; text: string }[];
}
export interface WorldSpec { teacher?: string; courses: CourseSpec[] }

export interface StudentRef { id: string; first_name: string; last_name: string; name: string; sort_name: string }
export interface WorldCourse { id: string; label: string; students: StudentRef[] }
export interface World { api: Api; courses: WorldCourse[] }

/** The class most world tests use: Matemáticas · 2.º ESO C, 12 students, Thursday 08:30 (closed, with homework),
 *  10:20-11:15 (now) and 12:40 (next), Friday 09:25. */
const STUDENTS = [
  'Alonso Gil, Marta', 'Benítez Ruiz, Pablo', 'Castro León, Lucía', 'Díaz Soto, Hugo', 'Esteban Mora, Irene', 'Fuentes Vera, Adrián',
  'García Peña, Sara', 'Herrero Ibáñez, Daniel', 'Iglesias Lara, Nerea', 'Jiménez Ortiz, Mario', 'López Rey, Carla', 'Martín Sanz, Álvaro',
];
export const CLASS: CourseSpec = {
  subject: 'Matemáticas', group: '2º ESO C', room: '112',
  slots: [
    { weekday: THU, start: '08:30', end: '09:25' }, { weekday: THU, start: '10:20', end: '11:15' },
    { weekday: THU, start: '12:40', end: '13:35' }, { weekday: FRI, start: '09:25', end: '10:20' },
  ],
  students: STUDENTS,
  units: [{ title: 'Fracciones', status: 'current' }, { title: 'Proporcionalidad', status: 'pending' }],
  logs: [{ date: TODAY, start: '08:30', done: 'Suma de fracciones con distinto denominador', next: 'Problemas de la p. 34', homework: 'p. 33, ej. 15-18' }],
};
export const LABEL = 'Matemáticas · 2.º ESO C';

async function createWorld(ctx: APIRequestContext, spec: WorldSpec): Promise<World> {
  const email = `hoy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.sepia.es`;
  const r = await ctx.post(`${API}/api/auth/register`, { data: { name: spec.teacher ?? 'Elena Prieto', email, password: 'sepia1234' } });
  if (!r.ok()) throw new Error(`Register: ${r.status()} ${await r.text()}`);
  const api = new Api(ctx, await r.json());
  const courses: WorldCourse[] = [];
  for (const c of spec.courses) {
    const group = c.group ?? '2º ESO C';
    const level = Number(group.match(/\d/)?.[0] ?? 1);
    const course = await api.post('/courses', {
      subject: c.subject ?? 'Matemáticas', room: c.room ?? null, schedule: c.slots,
      new_group: { name: group, stage: /bach/i.test(group) ? 'bachillerato' : 'eso', level },
    });
    const students: StudentRef[] = c.students?.length ? await api.post(`/groups/${course.group.id}/students`, {
      students: c.students.map((n) => { const [last, first] = n.split(', '); return { first_name: first, last_name: last }; }),
    }) : [];
    const units = [];
    for (const u of c.units ?? []) units.push(await api.post(`/courses/${course.id}/units`, { title: u.title, term: 1, status: u.status }));
    for (const log of c.logs ?? []) await api.put(`/courses/${course.id}/sessions/log`, log);
    for (const i of c.incidents ?? []) {
      await api.post('/notes', { course_id: course.id, kind: 'incident', date: i.date, text: i.text, student_ids: [students[i.student].id] });
    }
    for (const e of c.pastExams ?? []) await api.post(`/courses/${course.id}/activities`, { title: e.title, kind: 'exam', date: e.date });
    const current = units.find((u: { status: string }) => u.status === 'current');
    for (const l of c.links ?? []) await api.post(`/units/${current.id}/links`, l);
    for (const f of c.files ?? []) await api.upload(`/units/${current.id}/materials`, f.name, f.text);
    courses.push({ id: course.id, label: course.label, students });
  }
  return { api, courses };
}

// ── Fixtures ────────────────────────────────────────────────────────────────
type Fixtures = {
  /** Set with test.use({ worldSpec }) to run the test as a teacher of its own. */
  worldSpec: WorldSpec | null;
  /** The teacher of `worldSpec` (null without it). */
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

export const isMobile = (info: TestInfo) => info.project.name === 'mobile';

// ── Demo data ──────────────────────────────────────────────────────────────
export interface DemoCourse { id: string; label: string; room: string | null; group: { id: string; name: string }; schedule: Slot[] }
export async function demoCourse(demo: Api, label: string): Promise<DemoCourse> {
  const all: (DemoCourse & { label: string })[] = await demo.get('/courses');
  const c = all.find((x) => x.label === label);
  if (!c) throw new Error(`No demo class «${label}»`);
  return c;
}

/** Adds a Thursday slot to a demo class (created in September) whose list nobody has taken: the real condition of a
 *  list still due («Lista sin pasar» in Pendiente, today and the Thursday before). `restore()` puts the schedule back. */
export async function extraSlot(demo: Api, c: DemoCourse): Promise<{ start: string; end: string; restore: () => Promise<void> }> {
  const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  for (let m = 6 * 60; m <= 7 * 60 + 35; m += 5) {
    const start = hhmm(m);
    const end = hhmm(m + 50);
    const [today, before] = await Promise.all([
      demo.get(`/courses/${c.id}/attendance?date=${TODAY}&start=${start}`),
      demo.get(`/courses/${c.id}/attendance?date=2026-11-12&start=${start}`),
    ]);
    if (today.taken || before.taken) continue;
    await demo.patch(`/courses/${c.id}`, { schedule: [...c.schedule, { weekday: THU, start, end }] });
    return { start, end, restore: async () => { await demo.patch(`/courses/${c.id}`, { schedule: c.schedule }); } };
  }
  throw new Error('No free slot left: reset the data copy');
}

// ── Page pieces ─────────────────────────────────────────────────────────────
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** "jueves, 19 de noviembre" */
function longDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

/** Opens Hoy (today or `dia`) and waits until it shows that day. Until /api/me answers, Hoy shows the device's day
 *  (BUG-HOY-02): a tap on «Semana siguiente» in that moment would move from the wrong week. */
export async function openHoy(page: Page, dia?: string) {
  await page.goto(dia ? `/hoy?dia=${dia}` : '/hoy');
  await expect(page.getByText(new RegExp(`^${longDate(dia ?? TODAY)}`))).toBeVisible();
}

/** A page section by its heading ("Agenda", "Pendiente", "A vigilar"). */
export const section = (page: Page, title: string | RegExp) =>
  page.locator('section.section').filter({ has: page.getByRole('heading', { name: title, exact: typeof title === 'string' }) });

/** The «Ahora / Siguiente / Primera clase…» card. */
export const nowCard = (page: Page) =>
  page.getByRole('region', { name: /^(Ahora|Acaba de terminar|Siguiente|Primera clase|Última clase)/ });

export const toast = (page: Page, text: string | RegExp) => page.locator('.toasts .toast').filter({ hasText: text });

/** An agenda row by its start time. */
export const agendaRow = (page: Page, start: string) =>
  section(page, 'Agenda').getByRole('button', { name: new RegExp(`^${start.replace(':', '\\:')}`) });

/** A student of a roster sheet (Pasar lista, Revisar deberes) by list number. */
export const rosterRow = (scope: Page | Locator, n: number) => scope.getByRole('button', { name: new RegExp(`^${n}\\. `) });

/** Taps a student until the row says `status` (Presente → Falta → Retraso → Presente; Hecho → Sin hacer → Incompleto). */
export async function tapTo(scope: Page | Locator, n: number, status: string) {
  const row = rosterRow(scope, n);
  for (let i = 0; i < 4 && !(await row.getAttribute('aria-label'))?.includes(`: ${status}.`); i++) await row.click();
  await expect(row).toHaveAttribute('aria-label', new RegExp(`: ${status}\\.`));
}

/** Per-student options of «Pasar lista»: long-press on a phone (real touch events), right-click on a computer. */
export async function rowOptions(page: Page, info: TestInfo, row: Locator) {
  const menu = page.getByRole('menu');
  if (!isMobile(info)) {
    await row.click({ button: 'right' });
    await expect(menu).toBeVisible();
    return menu;
  }
  const box = (await row.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await expect(menu).toBeVisible();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  return menu;
}

/** Opens «···» in Hoy's header and picks an item. */
export async function hoyMenu(page: Page, item: string) {
  await page.getByRole('button', { name: 'Más acciones' }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

/** Screenshot for `npm run shots` (SHOTS=1): e2e/screenshots/<project>/hoy-<name>.png. */
export const shot = (page: Page, info: TestInfo, name: string) => baseShot(page, info, `hoy-${name}`);

/** A flow that fails today because of an app bug: the spec keeps asserting the right behaviour and is expected to fail
 *  until the bug is fixed (then Playwright reports it as «unexpectedly passed»: drop the call). SHOW_BUGS=1 runs it as
 *  a normal test to see the failure. */
export function bug(id: string, what: string) {
  test.fail(!process.env.SHOW_BUGS, `${id}: ${what}`);
}
