import { expect as baseExpect, request, test as base, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';
import { shot as baseShot } from '../helpers';

// Shared pieces of the «marco» flows (e2e/flows/marco-*.spec.ts): the app frame (sidebar, tab capsule, routes, back),
// Ajustes, the kit in daily use (toasts, confirmations, menus, sheets, search), signed files, the public share page
// and what the teacher sees when the network or the server fails.
//
// The backend runs with «today» frozen on Thursday 19 Nov 2026 at 10:40 (SEPIA_TODAY / SEPIA_NOW). Two kinds of tests:
// - the seeded demo teacher (the config's storage state), only to look: nothing is changed there;
// - a teacher registered for that test alone (`test.use({ teacherSpec })`), for everything that saves: Ajustes,
//   holidays, sharing, signing out. No test depends on another one nor on their order.

export const API = process.env.API || 'http://127.0.0.1:8000';
export const APP = process.env.APP || 'http://127.0.0.1:5173';
export const TODAY = '2026-11-19'; // Thursday; the backend's «now» is 10:40
export const MON = 0, TUE = 1, WED = 2, THU = 3, FRI = 4;
/** Screens loaded on demand (Ajustes, Evaluar, a unit…) can take longer than 5 s to arrive from the dev server. */
export const expect = baseExpect.configure({ timeout: 12_000 });
export const isDesktop = (info: TestInfo) => info.project.name === 'desktop';

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

  get<T = any>(path: string) { return this.call<T>('GET', path); } // eslint-disable-line @typescript-eslint/no-explicit-any
  post<T = any>(path: string, data?: unknown) { return this.call<T>('POST', path, data ?? {}); } // eslint-disable-line @typescript-eslint/no-explicit-any
  put<T = any>(path: string, data: unknown) { return this.call<T>('PUT', path, data); } // eslint-disable-line @typescript-eslint/no-explicit-any
  patch<T = any>(path: string, data: unknown) { return this.call<T>('PATCH', path, data); } // eslint-disable-line @typescript-eslint/no-explicit-any
  del<T = any>(path: string) { return this.call<T>('DELETE', path); } // eslint-disable-line @typescript-eslint/no-explicit-any

  /** Multipart upload (a material file). */
  async upload<T = any>(path: string, name: string, mimeType: string, buffer: Buffer): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
    const r = await this.ctx.post(`${API}/api${path}`, {
      headers: { authorization: `Bearer ${this.tokens.access_token}` }, multipart: { files: { name, mimeType, buffer } },
    });
    if (!r.ok()) throw new Error(`POST ${path} → ${r.status()} ${await r.text()}`);
    return r.json() as Promise<T>;
  }

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

// ── The demo teacher (read only) ──────────────────────────────────────────
export interface DemoIds {
  /** Matemáticas · 2.º ESO B (the class with the scanned exam, the unit «Fracciones» and its materials). */
  course: string;
  courses: { id: string; group: string; short: string }[];
  student: { id: string; name: string };
  unit: { id: string; title: string };
  upload: { id: string; title: string };
  notes: { id: string; title: string };
  exam: { id: string; title: string };
  inboxCount: number;
}

export async function demoIds(api: Api): Promise<DemoIds> {
  const courses = await api.get<{ id: string; short: string; group: { name: string } }[]>('/courses');
  const b = courses.find((c) => c.group.name.includes('2º ESO B'))!;
  const students = await api.get<{ id: string; name: string; sort_name: string }[]>(`/courses/${b.id}/students`);
  const hugo = students.find((s) => s.sort_name.startsWith('Domínguez Marín'))!;
  const units = await api.get<{ id: string; title: string }[]>(`/courses/${b.id}/units`);
  const unit = units.find((u) => u.title === 'Fracciones')!;
  const detail = await api.get<{ materials: { id: string; kind: string; title: string }[] }>(`/units/${unit.id}`);
  const upload = detail.materials.find((m) => m.kind === 'upload')!;
  const notes = detail.materials.find((m) => m.kind === 'notes')!;
  const inbox = await api.get<{ count: number; to_review: { activity: { id: string; title: string } }[] }>('/inbox');
  const exam = inbox.to_review.find((r) => r.activity.title === 'Examen U2 · Fracciones')!.activity;
  return {
    course: b.id,
    courses: courses.map((c) => ({ id: c.id, group: c.group.name.replace(/(\d)º/, '$1.º'), short: c.short })),
    student: { id: hugo.id, name: hugo.name }, unit, upload: { id: upload.id, title: upload.title },
    notes: { id: notes.id, title: notes.title }, exam, inboxCount: inbox.count,
  };
}

// ── A teacher for one test ─────────────────────────────────────────────────
export interface Slot { weekday: number; start: string; end: string }
export interface TeacherSpec {
  name?: string;
  school?: string;
  /** One class «Matemáticas · 2.º ESO C» with these slots, students and units (none: a teacher without classes). */
  course?: { slots?: Slot[]; students?: string[]; units?: { title: string; term: number; status?: 'pending' | 'current' | 'done' }[] };
}
export interface Teacher {
  api: Api; email: string; name: string;
  course?: { id: string; label: string; units: { id: string; title: string }[] };
}

export const STUDENTS = ['Alonso Gil, Marta', 'Benítez Ruiz, Pablo', 'Castro León, Lucía', 'Díaz Soto, Hugo', 'Esteban Mora, Irene', 'Fuentes Vera, Adrián'];

export async function createTeacher(ctx: APIRequestContext, spec: TeacherSpec): Promise<Teacher> {
  const email = `marco-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}@e2e.sepia.es`;
  const name = spec.name ?? 'Elena Prieto Sanz';
  const r = await ctx.post(`${API}/api/auth/register`, { data: { name, email, password: 'sepia1234' } });
  if (!r.ok()) throw new Error(`Register: ${r.status()} ${await r.text()}`);
  const api = new Api(ctx, await r.json());
  if (spec.school) await api.patch('/me', { school: spec.school });
  if (!spec.course) return { api, email, name };
  const c = spec.course;
  const course = await api.post('/courses', {
    subject: 'Matemáticas', short: 'Mates', room: '112', color: 'teal', schedule: c.slots ?? [],
    new_group: { name: '2º ESO C', stage: 'eso', level: 2 },
  });
  if (c.students?.length) {
    await api.post(`/groups/${course.group.id}/students`, {
      students: c.students.map((n) => { const [last, first] = n.split(', '); return { first_name: first, last_name: last }; }),
    });
  }
  const units = [];
  for (const u of c.units ?? []) units.push(await api.post(`/courses/${course.id}/units`, { title: u.title, term: u.term, status: u.status ?? 'pending' }));
  return { api, email, name, course: { id: course.id, label: course.label, units } };
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
  maybeTeacher: async ({ teacherSpec }, provide) => {
    if (!teacherSpec) return provide(null);
    const ctx = await request.newContext();
    await provide(await createTeacher(ctx, teacherSpec));
    await ctx.dispose();
  },
  teacher: async ({ maybeTeacher }, provide) => {
    if (!maybeTeacher) throw new Error('This test needs test.use({ teacherSpec })');
    await provide(maybeTeacher);
  },
  storageState: async ({ storageState, maybeTeacher }, provide) => {
    // A test with its own teacher logs in as that teacher; the rest keep the demo login of global-setup.
    await provide(maybeTeacher ? maybeTeacher.api.storageState() : storageState);
  },
  // eslint-disable-next-line no-empty-pattern -- Playwright reads the fixtures a fixture needs from its destructuring
  demo: async ({}, provide) => {
    const ctx = await request.newContext();
    await provide(await Api.login(ctx, 'demo@sepia.es', 'sepia1234'));
    await ctx.dispose();
  },
  pageErrors: [async ({ page }, provide) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await provide(errors);
    expect(errors, 'uncaught errors in the page').toEqual([]);
  }, { auto: true }],
});

/** A known app bug: the test keeps asserting the right behaviour and is expected to fail until it is fixed.
 *  SHOW_BUGS=1 runs it as a normal test, to see how it fails. */
export function bug(id: string, what: string) {
  test.fail(!process.env.SHOW_BUGS, `${id}: ${what}`);
}

// ── The frame ───────────────────────────────────────────────────────────────
/** The navigation of this layout: the glass sidebar on a computer, the tab capsule on a phone. */
export function nav(page: Page, info: TestInfo) {
  return page.locator(isDesktop(info) ? 'aside.sidebar' : 'nav.tabcap');
}

/** The large title of the page on screen. */
export function heading(page: Page, name: string | RegExp) {
  return page.locator('h1.page-head__title', { hasText: name });
}

/** The back button of the top bar («‹ Hoy»). */
export function backButton(page: Page) {
  return page.locator('header.topbar .back-btn');
}

/** Toasts on screen with this text. */
export function toast(page: Page, text: string | RegExp) {
  return page.locator('.toast', { hasText: text });
}

/** The open sheet has taken its history entry (it does on the next tick): back now closes it, as a thumb would. */
export async function sheetInHistory(page: Page) {
  await page.waitForFunction(() => Boolean((window.history.state as { sheet?: string } | null)?.sheet));
}

/** The sticky «Sin guardar · Descartar · Guardar cambios» bar of Ajustes. */
export function actionBar(page: Page) {
  return page.locator('.action-bar');
}

export async function shot(page: Page, info: TestInfo, name: string) {
  await baseShot(page, info, `marco-${name}`);
}

/** A one-page PDF with real text (so the server stores it without asking the AI to read it). */
export function textPdf(text: string): Buffer {
  const stream = `BT /F1 18 Tf 72 720 Td (${text.replace(/[()\\]/g, '')}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
