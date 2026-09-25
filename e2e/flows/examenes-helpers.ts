import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  expect as baseExpect, request, test as base, type APIRequestContext, type APIResponse, type Locator, type Page, type TestInfo,
} from '@playwright/test';
import { shot as baseShot } from '../helpers';

// Shared pieces of the exam flows (e2e/flows/examenes-*.spec.ts): the activity page (Preparar → Recoger → Revisar),
// the focus review, versions, repeat exams and grades typed by hand.
//
// The demo backend freezes «today» on Thursday 19 Nov 2026 at 10:40 (SEPIA_TODAY / SEPIA_NOW). Three kinds of data:
// - `world`: a teacher registered for that test alone, with the class, students, units, activities, rubrics and
//   attendance it needs (through the API, in a second). Everything that needs no scanned pile runs there.
// - `cloneExam`: a private copy, in the demo's 2.º ESO B, of an exam the real AI prepared when the demo was seeded:
//   «Examen U2 · Fracciones» (24 scanned papers, 18 AI suggestions, a page to place, blank backs, names to confirm)
//   or «Examen global · 1.ª evaluación» (generated, with Modelo B and four adapted versions). Made by
//   fixtures/exam_clone.py (no AI) and deleted at the end of the test, so tests never depend on each other.
// - `demo`: the seeded demo teacher, only looked at.
// Flows that call the real AI are tagged @ai (`--grep @ai` runs them alone, `--grep-invert @ai` the rest in minutes).
// The Python fixtures need the backend checkout (BACKEND_DIR, else ../teacher-mobile-backend next to the main
// checkout) and the same SEPIA_DATA_DIR / SEPIA_DATABASE_URL as the running API (none: the API's default ./data).

export const API = process.env.API || 'http://127.0.0.1:8000';
const APP = process.env.APP || 'http://127.0.0.1:5173';
export const TODAY = '2026-11-19'; // Thursday; the backend's «now» is 10:40
/** An AI step (generate, read, grade, write a version) waits this long for its job. */
export const AI_STEP = 240_000;

// ── API ─────────────────────────────────────────────────────────────────────
export class Api {
  constructor(readonly ctx: APIRequestContext, readonly tokens: { access_token: string; refresh_token: string }) {}

  /** The raw response (downloads, expected errors). */
  fetch(method: string, path: string, data?: unknown, multipart?: Record<string, unknown>): Promise<APIResponse> {
    return this.ctx.fetch(`${API}/api${path}`, {
      method, data, multipart: multipart as never, headers: { authorization: `Bearer ${this.tokens.access_token}` },
    });
  }

  private async call<T>(method: string, path: string, data?: unknown): Promise<T> {
    const r = await this.fetch(method, path, data);
    if (!r.ok()) throw new Error(`${method} ${path} → ${r.status()} ${await r.text()}`);
    return r.json() as Promise<T>;
  }

  /** A file behind one of the API's signed URLs ("/api/files/…?exp=…&sig=…"). */
  async file(url: string): Promise<APIResponse> {
    const r = await this.ctx.get(url.startsWith('http') ? url : `${API}${url}`);
    if (!r.ok()) throw new Error(`GET ${url} → ${r.status()}`);
    return r;
  }

  get<T = any>(path: string) { return this.call<T>('GET', path); }
  post<T = any>(path: string, data?: unknown) { return this.call<T>('POST', path, data ?? {}); }
  put<T = any>(path: string, data: unknown) { return this.call<T>('PUT', path, data); }
  patch<T = any>(path: string, data: unknown) { return this.call<T>('PATCH', path, data); }
  del<T = any>(path: string) { return this.call<T>('DELETE', path); }

  /** Polls a job until it ends (AI steps: up to AI_STEP). */
  async job(id: string, timeout = AI_STEP): Promise<any> {
    const end = Date.now() + timeout;
    for (;;) {
      const j = await this.get(`/jobs/${id}`);
      if (j.status === 'done' || j.status === 'failed') return j;
      if (Date.now() > end) throw new Error(`Job ${id} (${j.kind}) still ${j.status} after ${timeout / 1000} s`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  storageState() {
    return { cookies: [], origins: [{ origin: APP, localStorage: [{ name: 'sepia.tokens', value: JSON.stringify(this.tokens) }] }] };
  }

  static async login(ctx: APIRequestContext, email: string, password: string): Promise<Api> {
    const r = await ctx.post(`${API}/api/auth/login`, { data: { email, password } });
    if (!r.ok()) throw new Error(`Login ${email}: ${r.status()} — start the backend in demo mode`);
    return new Api(ctx, await r.json());
  }
}

// ── A teacher for one test ─────────────────────────────────────────────────
export type Kind = 'exam' | 'worksheet' | 'task' | 'oral' | 'notebook' | 'attitude' | 'other';
export type Mark = number | 'NP' | null;
export interface RubricItem { id: string; label: string; text: string; points: number; answer: string; steps: string[]; title?: string }
export interface ActivitySpec {
  title: string;
  kind?: Kind;
  date: string;
  max?: number;
  /** By student index. */
  grades?: Mark[];
  /** A rubric typed by the teacher (no document). */
  rubric?: RubricItem[];
  /** Linked units (indexes into `units`). */
  units?: number[];
}
export interface WorldSpec {
  subject?: string;
  group?: string;
  /** "Apellidos, Nombre". */
  students?: string[];
  units?: { title: string; status: 'pending' | 'current' | 'done' }[];
  activities?: ActivitySpec[];
  /** Attendance marks (an exam day with an absent student → «Faltó»). */
  absences?: { date: string; start: string; student: number; justified?: boolean }[];
}
export interface StudentRef { id: string; first_name: string; last_name: string; name: string; sort_name: string }
export interface World {
  api: Api;
  id: string;
  label: string;
  group: string;
  students: StudentRef[];
  units: { id: string; title: string }[];
  /** Activity id by title. */
  act: Record<string, string>;
}

/** Tuesday 11:45 and Thursday 09:25: exams on those days fall in a session (Tue 17 Nov, Thu 12 Nov…). */
export const SLOTS = [{ weekday: 1, start: '11:45', end: '12:40' }, { weekday: 3, start: '09:25', end: '10:20' }];
export const STUDENTS = ['Alonso Gil, Marta', 'Benítez Ruiz, Pablo', 'Castro León, Lucía', 'Díaz Soto, Hugo', 'Esteban Mora, Irene'];
/** "Marta Alonso Gil", in list order. */
export const NAMES = STUDENTS.map((s) => { const [last, first] = s.split(', '); return `${first} ${last}`; });
/** Three questions worth 10, typed by the teacher. */
export const RUBRIC: RubricItem[] = [
  { id: '1', label: '1', text: 'Simplifica $\\frac{12}{18}$.', points: 3, answer: '$\\frac{2}{3}$', steps: ['Divide entre 6.'] },
  { id: '2', label: '2', text: 'Calcula $\\frac{1}{2} + \\frac{1}{4}$.', points: 3, answer: '$\\frac{3}{4}$', steps: [] },
  { id: '3', label: '3', text: 'Un depósito de 60 L está lleno en sus $\\frac{2}{5}$. ¿Cuántos litros tiene?', points: 4, answer: '24 L', steps: [] },
];

async function createWorld(ctx: APIRequestContext, spec: WorldSpec): Promise<World> {
  const email = `examenes-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.sepia.es`;
  const r = await ctx.post(`${API}/api/auth/register`, { data: { name: 'Elena Prieto', email, password: 'sepia1234' } });
  if (!r.ok()) throw new Error(`Register: ${r.status()} ${await r.text()}`);
  const api = new Api(ctx, await r.json());
  const group = spec.group ?? '2º ESO C';
  const course = await api.post('/courses', {
    subject: spec.subject ?? 'Matemáticas', room: '112', schedule: SLOTS,
    new_group: { name: group, stage: 'eso', level: Number(group.match(/\d/)?.[0] ?? 1) },
  });
  const students: StudentRef[] = (spec.students ?? STUDENTS).length ? await api.post(`/groups/${course.group.id}/students`, {
    students: (spec.students ?? STUDENTS).map((n) => { const [last, first] = n.split(', '); return { first_name: first, last_name: last }; }),
  }) : [];
  const units: { id: string; title: string }[] = [];
  for (const u of spec.units ?? []) units.push(await api.post(`/courses/${course.id}/units`, { title: u.title, term: 1, status: u.status }));
  const act: Record<string, string> = {};
  for (const a of spec.activities ?? []) {
    const created = await api.post(`/courses/${course.id}/activities`, {
      title: a.title, kind: a.kind ?? 'exam', date: a.date, max_score: a.max ?? 10,
      unit_ids: (a.units ?? []).map((i) => units[i].id),
    });
    act[a.title] = created.id;
    if (a.rubric) await api.put(`/activities/${created.id}/rubric`, { items: a.rubric });
    const grades = (a.grades ?? []).flatMap((g, i) => g === null || g === undefined ? [] : [
      g === 'NP' ? { student_id: students[i].id, status: 'absent' } : { student_id: students[i].id, score: g },
    ]);
    if (grades.length) await api.put(`/activities/${created.id}/grades`, { grades });
  }
  for (const a of spec.absences ?? []) {
    await api.put(`/courses/${course.id}/attendance`, {
      date: a.date, start: a.start, marks: [{ student_id: students[a.student].id, status: a.justified ? 'justified' : 'absent' }],
    });
  }
  return { api, id: course.id, label: course.label, group: course.group.name, students, units, act };
}

// ── Copies of the demo's exams (fixtures/exam_clone.py) ─────────────────────
/** The backend checkout: BACKEND_DIR, or the sibling of this checkout or of the main one (from a git worktree). */
export function backendDir(): string {
  if (process.env.BACKEND_DIR) return process.env.BACKEND_DIR;
  const candidates = [resolve(process.cwd(), '../teacher-mobile-backend')];
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
    candidates.push(resolve(dirname(common), '../teacher-mobile-backend'));
  } catch { /* not a git checkout */ }
  const dir = candidates.find((d) => existsSync(join(d, 'app', 'main.py')));
  if (!dir) throw new Error('No backend checkout: set BACKEND_DIR');
  return dir;
}

/** Same choice of Python as the backend's scripts/dev.sh. */
export function backendPython(dir = backendDir()): string {
  if (process.env.BACKEND_PYTHON) return process.env.BACKEND_PYTHON;
  const venv = join(dir, '.venv/bin/python');
  if (existsSync(venv)) return venv;
  if (existsSync('/home/user/.venv-backend/bin/python')) return '/home/user/.venv-backend/bin/python';
  return 'python3';
}

/** Runs Python in the backend checkout, with the API's data (SEPIA_* from the environment). */
export function python(args: string[], timeout = 60_000, input?: Buffer): string {
  const dir = backendDir();
  return execFileSync(backendPython(dir), args, {
    cwd: dir, encoding: 'utf8', timeout, input, env: { ...process.env }, maxBuffer: 64 * 1024 * 1024,
  });
}

/** The most common font size of a PDF's text, in points (PyMuPDF from the backend's environment). */
export function pdfFontSize(pdf: Buffer): number {
  const out = python(['-c', [
    'import sys, fitz, collections',
    'd = fitz.open(stream=sys.stdin.buffer.read(), filetype="pdf")',
    'c = collections.Counter(round(s["size"]) for p in d for b in p.get_text("dict")["blocks"] for l in b.get("lines", []) for s in l["spans"] if s["text"].strip())',
    'print(c.most_common(1)[0][0])',
  ].join('\n')], 60_000, pdf);
  return Number(out.trim());
}

/** The text of a PDF, page by page (PyMuPDF from the backend's environment). */
export function pdfText(pdf: Buffer): string[] {
  const out = python(['-c', [
    'import sys, json, fitz',
    'd = fitz.open(stream=sys.stdin.buffer.read(), filetype="pdf")',
    'print(json.dumps([p.get_text() for p in d]))',
  ].join('\n')], 60_000, pdf);
  return JSON.parse(out) as string[];
}

export type DemoExam = 'fracciones' | 'global';
const DEMO_EXAMS: Record<DemoExam, string> = { fracciones: 'Examen U2 · Fracciones', global: 'Examen global · 1.ª evaluación' };
export const DEMO_CLASS = 'Matemáticas · 2.º ESO B';

export interface Clone { id: string; title: string; code: string; courseId: string; url: string }
export interface CloneOptions { title?: string; noPapers?: boolean; noVersions?: boolean; date?: string; unread?: boolean; foreign?: boolean }

// ── Fixtures ────────────────────────────────────────────────────────────────
type Fixtures = {
  /** Set with test.use({ worldSpec }) to run the test as a teacher of its own. */
  worldSpec: WorldSpec | null;
  maybeWorld: World | null;
  world: World;
  /** The demo teacher, through the API. */
  demo: Api;
  /** A private copy of a demo exam, deleted (with any repeat exam made from it) when the test ends. */
  cloneExam: (which: DemoExam, opts?: CloneOptions) => Promise<Clone>;
  /** Uncaught page errors fail the test. */
  pageErrors: string[];
};

export const test = base.extend<Fixtures>({
  worldSpec: [null, { option: true }],
  maybeWorld: async ({ worldSpec }, use) => {
    if (!worldSpec) return use(null);
    const ctx = await request.newContext();
    let world: World | null = null;
    for (let attempt = 1; !world; attempt++) {
      try {
        world = await createWorld(ctx, worldSpec);
      } catch (e) { // a dropped connection («socket hang up») is retried with a new teacher; an API error is not
        if (attempt >= 3 || !/socket hang up|ECONNRESET|ECONNREFUSED/.test(String(e))) throw e;
      }
    }
    await use(world);
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
  cloneExam: async ({ demo }, use, info) => {
    const made: string[] = [];
    let course: string | null = null;
    await use(async (which, opts = {}) => {
      course ??= (await demo.get<{ id: string; label: string }[]>('/courses')).find((c) => c.label === DEMO_CLASS)?.id ?? null;
      if (!course) throw new Error(`No demo class «${DEMO_CLASS}»: reset the data copy`);
      const gb = await demo.get(`/courses/${course}/gradebook?term=1`);
      const source = gb.activities.find((a: { title: string }) => a.title === DEMO_EXAMS[which]);
      if (!source) throw new Error(`No demo exam «${DEMO_EXAMS[which]}»: reset the data copy`);
      const tag = `${info.project.name === 'mobile' ? 'm' : 'd'}${Math.random().toString(36).slice(2, 5)}`;
      const args = [join(process.cwd(), 'e2e/flows/fixtures/exam_clone.py'), '--activity', source.id,
        '--title', opts.title ?? `${DEMO_EXAMS[which]} · ${tag}`];
      if (opts.noPapers) args.push('--no-papers');
      if (opts.noVersions) args.push('--no-versions');
      if (opts.date) args.push('--date', opts.date);
      if (opts.unread) args.push('--unread');
      if (opts.foreign) args.push('--foreign');
      const out = JSON.parse(python(args).trim().split('\n').pop()!);
      made.push(out.id);
      return { ...out, courseId: course, url: `/clases/${course}/actividades/${out.id}` };
    });
    for (const id of made) {
      const detail = await demo.fetch('GET', `/activities/${id}`);
      const repeats: { id: string }[] = detail.ok() ? (await detail.json()).repeats ?? [] : [];
      for (const r of repeats) await demo.fetch('DELETE', `/activities/${r.id}`);
      await demo.fetch('DELETE', `/activities/${id}`);
    }
  },
  pageErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await use(errors);
    expect(errors, 'uncaught errors in the page').toEqual([]);
  }, { auto: true }],
});
/** Web-first assertions wait up to 15 s: a page operation saves, then the exam is fetched again (a busy dev server
 *  running the AI for other tests can take a few seconds). */
export const expect = baseExpect.configure({ timeout: 15_000 });
export type { Locator, Page, TestInfo };

export const isMobile = (info: TestInfo) => info.project.name === 'mobile';

/** A flow that fails today because of an app bug: the spec keeps asserting the right behaviour and is expected to fail
 *  until the bug is fixed (Playwright then reports «unexpectedly passed»: drop the call). SHOW_BUGS=1 runs it as a
 *  normal test to see the failure. */
export function bug(id: string, what: string) {
  test.fail(!process.env.SHOW_BUGS, `${id}: ${what}`);
}

/** Screenshot for `npm run shots` (SHOTS=1): e2e/screenshots/<project>/examenes-<name>.png. */
export const shot = (page: Page, info: TestInfo, name: string) => baseShot(page, info, `examenes-${name}`);

// ── Server state ────────────────────────────────────────────────────────────
export const correction = (api: Api, id: string) => api.get(`/activities/${id}/correction`);
export const detail = (api: Api, id: string) => api.get(`/activities/${id}`);
/** The correction row of a student by "Apellidos, Nombre". */
export async function studentRow(api: Api, id: string, sortName: string) {
  const c = await correction(api, id);
  const s = c.students.find((x: { student: StudentRef }) => x.student.sort_name === sortName);
  if (!s) throw new Error(`${sortName} is not in the class of ${id}`);
  return s;
}

// ── Page pieces ─────────────────────────────────────────────────────────────
export const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const toast = (page: Page, text: string | RegExp) => page.locator('.toasts .toast').filter({ hasText: text });
export const dialog = (page: Page, title: string | RegExp) => page.getByRole('dialog', { name: title });

/** Opens an activity page and waits for its title. */
export async function openActivity(page: Page, url: string, title: string) {
  await page.goto(url);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible({ timeout: 20_000 });
}

/** Serves a JSON answer of the API with a change (a state only real AI runs or another server reach). */
export async function patchResponse(page: Page, url: string, patch: (json: any) => unknown) {
  await page.route(url, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    try {
      const r = await route.fetch();
      await route.fulfill({ response: r, json: patch(await r.json()) });
    } catch { /* the page closed while the request was on its way */ }
  });
}

/** Nothing is wider than the screen (docs/PRODUCT.md §4.3: «nada es más ancho que la pantalla»). */
export async function fitsTheScreen(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
}

/** A collapsed exam step («1 Preparar Preparado · 6 preguntas»). */
export const stepRow = (page: Page, n: number, title: string) => page.getByRole('button', { name: new RegExp(`^${n} ${title}\\b`) });
/** The heading of the open step («2 · Recoger»). */
export const stepHead = (page: Page, n: number, title: string) => page.getByRole('heading', { level: 2, name: `${n} · ${title}` });

/** Opens the page header «···» and picks an item. */
export async function headerMenu(page: Page, item: string | RegExp) {
  await page.getByRole('button', { name: 'Más opciones' }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

/** Confirms (or not) the confirmation sheet with that title. */
export async function answer(page: Page, title: string | RegExp, button: string | RegExp) {
  const d = dialog(page, title);
  await expect(d).toBeVisible();
  await d.getByRole('button', { name: button }).click();
  await expect(d).toBeHidden();
}

/** The readable ASCII name of a download ("Soluciones - Examen U2 - Fracciones - 2o ESO B.pdf"; docs/PRODUCT.md §4.7). */
export function fileName(...parts: string[]): string {
  const s = parts.join(' - ').replace(/·/g, '-').replace(/\.?º/g, 'o').replace(/\.?ª/g, 'a')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ._()-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return `${s}.pdf`;
}

/** Something that opens a PDF in a new tab (a signed URL of the API): returns what the teacher gets. */
export async function opensPdf(page: Page, action: () => Promise<unknown>) {
  const req = page.context().waitForEvent('request', { predicate: (r) => /\/api\/files\//.test(r.url()), timeout: 90_000 });
  await action();
  const url = (await req).url();
  const r = await page.request.get(url);
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toContain('application/pdf');
  const body = await r.body();
  expect(body.subarray(0, 5).toString()).toBe('%PDF-');
  const disposition = r.headers()['content-disposition'] ?? '';
  const name = decodeURIComponent(disposition.match(/filename\*=UTF-8''([^;]+)/)?.[1] ?? disposition.match(/filename="([^"]+)"/)?.[1] ?? '');
  for (const p of page.context().pages()) if (p !== page) await p.close();
  return { url, name, body, disposition };
}
