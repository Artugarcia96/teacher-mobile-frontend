import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  expect, request, test as base, type APIRequestContext, type APIResponse, type Download, type Locator, type Page, type TestInfo,
} from '@playwright/test';
import { shot as baseShot } from '../helpers';

// Shared pieces of the Evaluación flows (e2e/flows/evaluacion-*.spec.ts): the Evaluar inbox, the term page of a class
// (proposals, adjustments, report comments, acta, CSV, recoveries) and the department report (docs/PRODUCT.md §4.6-4.7).
//
// The demo backend freezes «today» on Thursday 19 Nov 2026 at 10:40 (SEPIA_TODAY / SEPIA_NOW); a new teacher's
// 1.ª evaluación runs from 8 Sep to 22 Dec, the 2.ª opens on Friday 8 Jan 2027 and the 3.ª on Tuesday 30 Mar 2027.
// - `world`: a teacher registered for that test alone, with the classes, students, grades, absences, events and
//   evaluation rows it needs (through the API, in a second). Every test that writes runs there, so no test depends on
//   another one nor on their order, and the phone and desktop projects each get their own teacher.
// - `demo`: the seeded demo teacher, whose 2.º ESO B holds the 26 report comments the real AI drafted when the demo was
//   seeded. Only looked at, or put back in a `finally`.
// Flows that call the real AI are tagged @ai: `npx playwright test e2e/flows/evaluacion --grep @ai` runs them alone,
// `--grep-invert @ai` runs the rest in a couple of minutes. Flows that fail because of an app bug call `bug()`.

const API = process.env.API || 'http://127.0.0.1:8000';
const APP = process.env.APP || 'http://127.0.0.1:5173';
export const TODAY = '2026-11-19'; // Thursday; the backend's «now» is 10:40
/** Four minutes for one real AI step (a batch of report comments with Claude by terminal). */
export const AI_STEP = 240_000;

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

  get<T = any>(path: string) { return this.call<T>('GET', path); }
  post<T = any>(path: string, data?: unknown) { return this.call<T>('POST', path, data ?? {}); }
  put<T = any>(path: string, data: unknown) { return this.call<T>('PUT', path, data); }
  patch<T = any>(path: string, data: unknown) { return this.call<T>('PATCH', path, data); }

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
/** A grade: a score, NP, exento, an AI suggestion not reviewed yet ({ ai: 6 }) or nothing. */
export type Mark = number | 'NP' | 'EX' | { ai: number } | null;
export interface Slot { weekday: number; start: string; end: string }
export interface ActivitySpec {
  title: string;
  kind?: Kind;
  date: string;
  max?: number;
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
  color?: string;
  room?: string;
  slots?: Slot[];
  /** "Apellidos, Nombre", in list order (by surname). */
  students?: string[];
  units?: { title: string; term?: number; status: 'pending' | 'current' | 'done' }[];
  activities?: ActivitySpec[];
  /** Attendance lists with an absence (an exam that day → «Pendiente»). */
  absences?: { date: string; start: string; student: number; justified?: boolean }[];
  /** Support measures (e.g. ['acs']). */
  support?: { student: number; measures: string[] }[];
  /** Evaluation rows as the teacher left them: adjusted grade, a comment written by hand, accepted or not. */
  /** Applied in order: a comment is written for the grade that counts at that moment. */
  evaluation?: { term?: number; student: number; final?: number | null; comment?: string; accept?: boolean }[];
  recoveryRule?: 'replace_if_higher' | 'cap_5' | 'average';
}
export interface WorldSpec {
  courses: CourseSpec[];
  /** The three terms of the school year (default: Spain's, 1.ª from 8 Sep to 22 Dec). */
  terms?: { n: number; start: string; end: string }[];
  /** Calendar events, e.g. the evaluation session { title: 'Sesión de evaluación · 1.ª evaluación', date, kind: 'evaluation' }. */
  events?: { title: string; date: string; kind?: string }[];
}

export interface StudentRef { id: string; first_name: string; last_name: string; name: string; sort_name: string }
export interface ClassWorld {
  id: string;
  label: string;
  group: string;
  students: StudentRef[];
  /** Activity id by title. */
  act: Record<string, string>;
}
export interface World {
  api: Api;
  email: string;
  courses: ClassWorld[];
  /** The first class. */
  c: ClassWorld;
}

/** Tuesday 11:45 and Thursday 09:25. */
export const SLOTS: Slot[] = [{ weekday: 1, start: '11:45', end: '12:40' }, { weekday: 3, start: '09:25', end: '10:20' }];
/** In list order (by surname). `NAMES[i]`: "Marta Alonso Gil". */
export const STUDENTS = [
  'Alonso Gil, Marta', 'Benítez Ruiz, Pablo', 'Castro León, Lucía', 'Díaz Soto, Hugo', 'Esteban Mora, Irene', 'Fuentes Vera, Adrián',
];
export const NAMES = STUDENTS.map(fullName);
export function fullName(sortName: string): string {
  const [last, first] = sortName.split(', ');
  return `${first} ${last}`;
}

// ── Classes the flows share ─────────────────────────────────────────────────
/** Two graded activities: Marta 7,7 → 8 · Pablo 3,3 → 3 · Lucía 6,3 → 6 · Hugo 9,7 → 10 · Irene 4,3 → 4 · Adrián 7,3 → 7.
 *  Class: media 6,4 · 67 % aprobados · IN 2 · SU 0 · BI 1 · NT 2 · SB 1. */
export const BASE: CourseSpec = {
  students: STUDENTS,
  activities: [
    { title: 'Examen U1 · Números', date: '2026-10-29', grades: [8, 3, 6.5, 9.5, 4, 7] },
    { title: 'Ficha U1 · Operaciones', kind: 'worksheet', date: '2026-11-05', grades: [7, 4, 6, 10, 5, 8] },
  ],
};

/** Everything a row can say: an AI grade to review (Adrián, Examen U2), a task without two grades (Lucía, Adrián), a
 *  missed exam (Irene), a recovery (Pablo 3 → 7), two absences, one justified (Lucía), ACS (Hugo), an adjusted grade (Adrián 8, prop. 7)
 *  and a comment written by hand (Marta). Marta 7,5 → 8 · Pablo 7,0 → 7 · Lucía 6,2 → 6 · Hugo 9,3 → 9 · Irene 4,5 → 5 ·
 *  Adrián 7,3 → 7 (8 aj.). Class: media 7,0 · 100 % aprobados · IN 0 · SU 1 · BI 1 · NT 3 · SB 1. */
export const DETAILS: CourseSpec = {
  students: STUDENTS,
  activities: [
    { title: 'Examen U1 · Números', date: '2026-10-29', grades: [8, 3, 6.5, 9.5, 4, 7] },
    { title: 'Ficha U1 · Operaciones', kind: 'worksheet', date: '2026-11-05', grades: [7, 4, 6, 10, 5, 8] },
    { title: 'Trabajo · Proyecto', kind: 'task', date: '2026-11-12', grades: [8, 5, null, 9, 6, null] },
    { title: 'Examen U2 · Fracciones', date: '2026-11-17', grades: [7, 2, 6, 9, null, { ai: 6 }] },
    { title: 'Recuperación de la 1.ª evaluación', date: '2026-11-18', countsFor: 'recovery', recovers: 1, only: [1], grades: [null, 7] },
  ],
  absences: [
    { date: '2026-11-17', start: '11:45', student: 4 },
    { date: '2026-11-10', start: '11:45', student: 2, justified: true },
    { date: '2026-11-12', start: '09:25', student: 2 },
  ],
  support: [{ student: 3, measures: ['acs'] }],
  evaluation: [
    { student: 5, final: 8 },
    { student: 0, comment: 'Trabaja con constancia y participa en clase.' },
  ],
};

async function createClass(api: Api, spec: CourseSpec): Promise<ClassWorld> {
  const group = spec.group ?? '2º ESO C';
  const course = await api.post('/courses', {
    subject: spec.subject ?? 'Matemáticas', room: spec.room ?? '112', color: spec.color ?? 'teal', schedule: spec.slots ?? SLOTS,
    new_group: { name: group, stage: spec.stage ?? 'eso', level: Number(group.match(/\d/)?.[0] ?? 1) },
  });
  const students: StudentRef[] = spec.students?.length ? await api.post(`/groups/${course.group.id}/students`, {
    students: spec.students.map((n) => { const [last, first] = n.split(', '); return { first_name: first, last_name: last }; }),
  }) : [];
  // The API answers in its own order: keep the list order of the spec.
  students.sort((a, b) => spec.students!.indexOf(a.sort_name) - spec.students!.indexOf(b.sort_name));
  for (const s of spec.support ?? []) {
    await api.patch(`/students/${students[s.student].id}`, { support: { measures: s.measures } });
  }
  for (const u of spec.units ?? []) await api.post(`/courses/${course.id}/units`, { title: u.title, term: u.term ?? 1, status: u.status });
  const act: Record<string, string> = {};
  for (const a of spec.activities ?? []) {
    const created = await api.post(`/courses/${course.id}/activities`, {
      title: a.title, kind: a.kind ?? 'exam', date: a.date, max_score: a.max ?? 10, weight: 1,
      counts_for: a.countsFor ?? 'average', recovers_term: a.countsFor === 'recovery' ? a.recovers ?? 1 : null,
      student_ids: a.only ? a.only.map((i) => students[i].id) : null,
    });
    act[a.title] = created.id;
    const grades = (a.grades ?? []).flatMap((g, i): { student_id: string; score?: number; status?: string }[] => {
      const student_id = students[i].id;
      if (g === null || g === undefined) return [];
      if (g === 'NP') return [{ student_id, status: 'absent' }];
      if (g === 'EX') return [{ student_id, status: 'exempt' }];
      if (typeof g === 'object') return [{ student_id, score: g.ai, status: 'suggested' }];
      return [{ student_id, score: g }];
    });
    if (grades.length) await api.put(`/activities/${created.id}/grades`, { grades });
  }
  for (const a of spec.absences ?? []) {
    await api.put(`/courses/${course.id}/attendance`, {
      date: a.date, start: a.start, marks: [{ student_id: students[a.student].id, status: a.justified ? 'justified' : 'absent' }],
    });
  }
  if (spec.recoveryRule) await api.put(`/courses/${course.id}/grading`, { recovery_rule: spec.recoveryRule });
  for (const e of spec.evaluation ?? []) {
    const body: Record<string, unknown> = {};
    if (e.final !== undefined) body.final_grade = e.final;
    if (e.comment !== undefined) body.comment = e.comment;
    await api.put(`/courses/${course.id}/evaluation/${e.term ?? 1}/students/${students[e.student].id}`, body);
    if (e.accept) await api.put(`/courses/${course.id}/evaluation/${e.term ?? 1}/students/${students[e.student].id}`, { comment_status: 'final' });
  }
  return { id: course.id, label: course.label, group: course.group.name, students, act };
}

async function createWorld(ctx: APIRequestContext, spec: WorldSpec): Promise<World> {
  const email = `evaluacion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.sepia.es`;
  const r = await ctx.post(`${API}/api/auth/register`, { data: { name: 'Elena Prieto', email, password: 'sepia1234' } });
  if (!r.ok()) throw new Error(`Register: ${r.status()} ${await r.text()}`);
  const api = new Api(ctx, await r.json());
  if (spec.terms) {
    const year = await api.get('/school-year');
    await api.put('/school-year', { label: year.label, terms: spec.terms, holidays: year.holidays });
  }
  for (const e of spec.events ?? []) await api.post('/events', { title: e.title, date: e.date, kind: e.kind ?? 'evaluation' });
  const courses: ClassWorld[] = [];
  for (const c of spec.courses) courses.push(await createClass(api, c));
  return { api, email, courses, c: courses[0] };
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
export type { Locator, Page, TestInfo };

export const isMobile = (info: TestInfo) => info.project.name === 'mobile';

/** A flow that fails today because of an app bug: the spec keeps asserting the right behaviour and is expected to fail
 *  until the bug is fixed (then Playwright reports it as «unexpectedly passed»: drop the call). SHOW_BUGS=1 runs it as
 *  a normal test to see the failure. `when`: only there (a phone-only bug). */
export function bug(id: string, what: string, when = true) {
  test.fail(when && !process.env.SHOW_BUGS, `${id}: ${what}`);
}

/** Screenshot for `npm run shots` (SHOTS=1): e2e/screenshots/<project>/evaluacion-<name>.png. */
export const shot = (page: Page, info: TestInfo, name: string) => baseShot(page, info, `evaluacion-${name}`);

/** A tap on phones, a click on computers. `force`: no actionability wait (an aria-disabled control that still answers,
 *  or a tap that lands wherever the finger is, whatever is drawn on top). */
export async function press(target: Locator, info: TestInfo, force = false) {
  if (isMobile(info)) await target.tap({ force });
  else await target.click({ force });
}

// ── Server state ────────────────────────────────────────────────────────────
export interface EvalRow {
  student: StudentRef; average: number | null; proposed: number | null; qualitative: string | null; final_grade: number | null;
  final: number | null; stale_adjustment: boolean; final_qualitative: string | null; comment: string | null;
  comment_status: 'draft' | 'final' | null; comment_source: 'ai' | 'manual' | null; comment_grade: number | null;
  comment_stale: boolean; comment_clash: string | null; absences: number; justified: number;
  recovery: { before: number | null; before_proposed: number | null; score: number } | null;
  pending_exams: { title: string }[]; missing_grades: { title: string }[]; adapted: boolean;
}
export interface Evaluation {
  term: number; stats: { average: number | null; pass_rate: number | null; failing: number; distribution: Record<string, number> };
  rows: EvalRow[]; recovery_rule: string; comments_missing: number; comments_unreviewed: number; comments_stale: number;
  to_review: { title: string; count: number }[]; to_grade: { title: string; count: number }[]; pending_absent: number;
  session: { date: string; title: string } | null; job: { status: string } | null;
}

export const evaluation = (api: Api, courseId: string, term = 1) => api.get<Evaluation>(`/courses/${courseId}/evaluation/${term}`);

/** A student's evaluation row, by "Apellidos, Nombre". */
export async function evalRow(api: Api, courseId: string, sortName: string, term = 1): Promise<EvalRow> {
  const ev = await evaluation(api, courseId, term);
  const row = ev.rows.find((r) => r.student.sort_name === sortName);
  if (!row) throw new Error(`${sortName} is not in the evaluation`);
  return row;
}

// ── Page pieces ─────────────────────────────────────────────────────────────
export const TITLES: Record<number, string> = { 1: 'Primera evaluación', 2: 'Segunda evaluación', 3: 'Tercera evaluación', 4: 'Evaluación final' };

/** Opens a class's evaluation page and waits for its rows (or the state that replaces them). */
export async function openEvaluation(page: Page, courseId: string, term: number | string = 1) {
  await page.goto(`/clases/${courseId}/evaluacion/${term}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('.ev-list, .empty, .callout').first()).toBeVisible();
}

/** A class in Evaluar's «1.ª evaluación» section, named group first ("2.º ESO C · Matemáticas", PRODUCT §4.7): the
 *  sidebar lists the classes with the same name, so it is looked up inside its section. */
export const evaluarClass = (page: Page, name: RegExp | string, term = '1.ª evaluación') =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: term, exact: true }) }).getByRole('link', { name });

/** The row of a student in the evaluation list, by full name ("Marta Alonso Gil"). */
export const studentRow = (page: Page, name: string) =>
  page.getByRole('button', { name: `${name}: editar nota y comentario`, exact: true });

/** The student sheet (a dialog named after the student). */
export const sheetOf = (page: Page, name: string) => page.getByRole('dialog', { name, exact: true });

/** The grade shown by the sheet's stepper. */
export const stepperValue = (sheet: Locator) => sheet.getByRole('group', { name: 'Nota' }).locator('output');

/** The sheet's history entry is in place (the phone's back closes the sheet): it arrives on the next tick. */
export const sheetInHistory = (page: Page) =>
  page.waitForFunction(() => Boolean((window.history.state as { sheet?: string } | null)?.sheet));

export const commentBox = (sheet: Locator) => sheet.getByRole('textbox', { name: /Comentario de boletín/ });

export const toast = (page: Page, text: string | RegExp) => page.locator('.toasts .toast').filter({ hasText: text });

/** The «Más acciones» menu of the evaluation page: opens it and picks an item. */
export async function evalMenu(page: Page, item: string | RegExp) {
  await page.getByRole('button', { name: 'Más acciones' }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

/** The items of the «Más acciones» menu (opened and closed again with Escape). */
export async function evalMenuItems(page: Page): Promise<string[]> {
  await page.getByRole('button', { name: 'Más acciones' }).click();
  const items = page.getByRole('menuitem');
  await expect(items.first()).toBeVisible();
  const labels = (await items.allInnerTexts()).map((t) => t.trim());
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
  return labels;
}

/** The term selector of the page (and of the department report). */
export const terms = (scope: Page | Locator) => scope.getByRole('group', { name: 'Evaluación' });

/** A confirmation dialog by its title. */
export const confirmDialog = (page: Page, title: string) => page.getByRole('dialog', { name: title });

/** Runs `action` and returns the file the browser saves: its name and bytes. */
export async function downloaded(page: Page, action: () => Promise<unknown>): Promise<{ name: string; body: Buffer; download: Download }> {
  const [download] = await Promise.all([page.waitForEvent('download'), action()]);
  const path = await download.path();
  return { name: download.suggestedFilename(), body: readFileSync(path!), download };
}

/** A CSV the app downloads (UTF-8 with BOM, «;»), as rows of cells. */
export function csvRows(body: Buffer): string[][] {
  const text = body.toString('utf8').replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ';') { row.push(cell); cell = ''; }
    else if (ch === '\r') continue;
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// ── PDFs ────────────────────────────────────────────────────────────────────
function backendDir(): string {
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
function backendPython(dir: string): string {
  if (process.env.BACKEND_PYTHON) return process.env.BACKEND_PYTHON;
  const venv = join(dir, '.venv/bin/python');
  if (existsSync(venv)) return venv;
  if (existsSync('/home/user/.venv-backend/bin/python')) return '/home/user/.venv-backend/bin/python';
  return 'python3';
}

/** The text of a PDF (PyMuPDF from the backend's environment), all pages joined, whitespace collapsed, words whole. */
export function pdfText(pdf: Buffer): string {
  const dir = backendDir();
  const out = execFileSync(backendPython(dir), ['-c', [
    'import sys, fitz',
    'd = fitz.open(stream=sys.stdin.buffer.read(), filetype="pdf")',
    'print("\\n".join(p.get_text() for p in d))',
  ].join('\n')], { cwd: dir, encoding: 'utf8', timeout: 60_000, input: pdf, maxBuffer: 64 * 1024 * 1024 });
  // Typst hyphenates long words with a soft hyphen at the line end ("fraccio\u00ad nes"): join them back.
  return out.replace(/\u00ad\s*/g, '').replace(/\s+/g, ' ');
}
