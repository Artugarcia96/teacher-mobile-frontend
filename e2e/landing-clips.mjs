#!/usr/bin/env node
// Short real recordings of the demo app for the landing → landing/clips/<clip>-<phone|desktop>[-dark].webm (VP9) and
// .mp4 (H.264, for browsers without WebM), a poster for each (.webp: the frame shown before the video plays, and the
// only one with reduced motion), landing/clips/clips.json with what each recording measured, and the link preview
// landing/img/og.jpg. Then landing/index.html gets a content hash on every clip and poster (nginx caches /landing/)
// and, in each <span data-wait="clip">, how long the AI really took.
//
// Every recording runs against its own API process on a fresh copy of a freshly seeded demo (SEED), with "today"
// frozen like the demo (19/11/2026 10:40), so no recording sees another one's taps. The AI is the real one (claude_cli,
// the same prompts as production). While it works the clip shows the real elapsed time («Espera real 1:08 ·
// acelerado») and plays that stretch sped up. The history clip first prepares, once per run, a class with an exam the
// AI generates, a scanned pile written by the backend's handwriting tool and the AI's grading (several minutes).
//
//   ../teacher-mobile-backend/scripts/dev.sh --demo   # seeds a fresh demo into the backend's data/ (SEED); stop it or leave it idle
//   npm run dev                                       # the app (APP); its /api calls are routed to each clip's API
//   npm run landing:clips                             # env: SEED, APP, BACKEND, PYTHON, FFMPEG, ONLY=corregir,…,og,
//                                                     #      DEVICES=phone,desktop, SCHEMES=light,dark
// FFMPEG must have libvpx-vp9, libx264 and libwebp (Playwright's own ffmpeg only has VP8); a static build from
// `pip download imageio-ffmpeg` has them. A light and a dark run can record at the same time (SCHEMES=light / dark).
//
// The pages are recorded in slow motion (animations and page timers run `slow` times slower and the video plays them
// back that much faster), so a software-rendered headless browser still gives smooth motion.
import { chromium } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const APP = process.env.APP || 'http://127.0.0.1:5173';
const BACKEND = process.env.BACKEND || join(ROOT, '../teacher-mobile-backend');
const SEED = process.env.SEED || join(BACKEND, 'data');
const PYTHON = process.env.PYTHON || [join(BACKEND, '.venv/bin/python'), '/home/user/.venv-backend/bin/python'].find(existsSync) || 'python3';
const OUT = join(ROOT, 'landing/clips');
const INDEX = join(ROOT, 'landing/index.html');
const OG = join(ROOT, 'landing/img/og.jpg');
const ONLY = process.env.ONLY?.split(',');
const SCHEMES = (process.env.SCHEMES || 'light,dark').split(',');
const ONLY_DEVICES = process.env.DEVICES?.split(',');
const DAY = '2026-11-19';
const CLOCK = '10:40';
const running = new Set(); // API processes to stop if the run fails or is interrupted

const FPS = 30;
const LAPSE = 2.2; // seconds of video for each wait for the AI, whatever it really took
const LAG = 0.2; // at most, for a wait for the app itself (the next paper's images): the recording machine is slower than a
// phone. The clip holds the frame from before the wait, so a half-loaded screen never shows.
// Screen content: mostly still frames with sharp text. A keyframe every 10 s (the clips loop from the start).
const VP9 = ['-c:v', 'libvpx-vp9', '-pix_fmt', 'yuv420p', '-crf', '38', '-b:v', '0', '-deadline', 'good', '-cpu-used', '2',
  '-row-mt', '1', '-tile-columns', '1', '-g', '300'];
const H264 = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level:v', '4.0', '-crf', '28', '-preset', 'slow', '-tune', 'animation',
  '-movflags', '+faststart', '-g', '300'];

// `scale`: pixels of the clip per CSS pixel. The phone at 2x stays sharp in the landing's frames on a 3x phone screen;
// the desktop is a 1024 px window (the smallest with the desktop layout, so the app reads at the landing's ~700 px),
// recorded 1440 px wide.
const DEVICES = {
  phone: { slow: 4, scale: 2, context: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  desktop: { slow: 6, scale: 1.40625, context: { viewport: { width: 1024, height: 640 } } },
};

// ── The clips ───────────────────────────────────────────────────────────────────
// `devices`: device → viewport height (the hero's phone is shorter, so the whole screen fits under the headline).
// `prepare`: runs once per run, before the recordings of that clip (they start from the demo it leaves); `ids`, what
// else the clip needs to find through the API.
// `prelude`: runs through the API before each recording. `start`: where the recording begins, and `before`, what is
// done there before it (the clip starts on what matters, not on the top of the page).
const CLIPS = [
  { name: 'corregir', devices: { phone: 660, desktop: 640 }, start: (d) => `/clases/${d.course}/actividades/${d.exam}/revisar?alumno=${d.paper}`,
    run: reviewThePile },
  { name: 'historia', devices: { phone: 660, desktop: 640 }, prepare: historyExam, ids: historyIds,
    start: (d) => `/clases/${d.history.course}/actividades/${d.history.exam}/revisar?alumno=${d.history.paper}`, run: reviewAnEssay },
  { name: 'lista', devices: { phone: 844 }, start: () => '/hoy', run: passTheList },
  { name: 'versiones', devices: { phone: 844 }, prelude: withoutVersions, start: (d) => `/clases/${d.course}/actividades/${d.upcoming}`,
    before: (r) => r.scrollTo(r.page.getByText('Añadir modelo B'), 0), run: prepareVersions },
  { name: 'ficha', devices: { phone: 844 }, prelude: withoutRemedialWorksheet, start: (d) => `/clases/${d.course}/actividades/${d.exam}?paso=revisar`,
    before: (r) => r.scrollTo({ section: 'Errores frecuentes' }, 0), run: remedialWorksheet },
  { name: 'familia', devices: { phone: 844 }, prelude: listPassed, start: () => '/hoy',
    before: (r) => r.scrollTo({ section: 'A vigilar' }, 0), run: tellTheFamily },
  { name: 'evaluacion', devices: { phone: 844 }, start: (d) => `/clases/${d.course}/evaluacion/1`,
    before: (r, d) => r.scrollTo(r.page.locator('.row', { hasText: d.graded.sort_name }).first(), 0, 8), run: explainTheGrade },
].filter((c) => !ONLY || ONLY.includes(c.name));

/** The pile of fraction exams, in focus mode: a question the AI marked down, a quarter point back, «Aceptar y siguiente». */
async function reviewThePile(r) {
  const items = r.page.locator('.review-items .ritem');
  await r.hold(2000);
  if (r.device === 'desktop') {
    await r.tap(items.nth(1).locator('.ritem__ai')); // the sheet on the left frames that answer
    await r.hold(2600);
  } else {
    await r.scrollTo(items.nth(1), 1300, 10);
    await r.hold(2600);
  }
  r.poster();
  await r.tap(items.nth(1).getByRole('button', { name: 'Más' }));
  await r.hold(1100);
  await r.acceptAndNext();
  await r.hold(1900);
}

/** A history exam with written answers, in focus mode: the AI's reading of an answer, then «Aceptar y siguiente». */
async function reviewAnEssay(r) {
  const items = r.page.locator('.review-items .ritem');
  await r.hold(1700);
  if (r.device === 'desktop') {
    await r.tap(items.nth(1).locator('.ritem__ai'));
    await r.hold(3400);
  } else {
    await r.scrollTo(items.nth(1), 1300, 10);
    await r.hold(3400);
  }
  r.poster();
  await r.acceptAndNext();
  await r.hold(1900);
}

/** Hoy → «Pasar lista»: one absence (a tap), one late arrival (two taps), «Cerrar lista». */
async function passTheList(r, d) {
  const row = (name) => r.page.getByRole('button', { name: new RegExp(`^\\d+\\. ${escape(name)}:`) });
  await r.hold(1300);
  await r.tap(r.page.locator('.now-card__actions button', { hasText: 'Pasar lista' }));
  await r.page.locator('.roster__row').first().waitFor();
  await r.hold(1000);
  await r.tap(row(d.absent));
  await r.hold(700);
  await r.tap(row(d.late));
  await r.hold(450);
  await r.tap(row(d.late));
  await r.hold(1300);
  r.poster();
  await r.tap(r.page.getByRole('button', { name: 'Cerrar lista' }));
  await r.page.getByText('Lista pasada').first().waitFor();
  await r.hold(2000);
}

/** Preparar › Versiones: «Añadir modelo B», «Preparar versiones adaptadas», then the ACS version's own questions. */
async function prepareVersions(r, d) {
  const { page } = r;
  await r.hold(1600);
  await r.tap(page.getByText('Añadir modelo B'));
  await r.ai(async () => {
    await until('Modelo B', async () => (await d.api.get(`/activities/${d.upcoming}/versions`)).versions
      .some((v) => v.kind === 'modelo' && v.status !== 'generating'));
    await page.getByText('Escribiendo…').waitFor({ state: 'hidden', timeout: 120_000 });
  });
  await r.hold(1300);
  const adapt = page.getByRole('button', { name: 'Preparar versiones adaptadas' });
  await r.scrollTo(adapt, 1100, 300);
  await r.hold(500);
  await r.tap(adapt);
  await r.ai(async () => {
    await until('the adapted versions', async () => {
      const vs = await d.api.get(`/activities/${d.upcoming}/versions`);
      return !vs.pending_adapted.length && vs.versions.every((v) => v.status !== 'generating');
    });
    await page.getByText('Escribiendo…').waitFor({ state: 'hidden', timeout: 120_000 });
  });
  await r.scrollTo({ section: 'Versiones' }, 1300);
  await r.hold(1800);
  const { versions } = await d.api.get(`/activities/${d.upcoming}/versions`);
  const shown = versions.find((v) => /ACS/.test(v.label)) ?? versions.find((v) => v.kind === 'adaptada') ?? fail('No adapted version.');
  await r.tap(page.locator('.row', { hasText: shown.label }).first());
  const sheet = page.getByRole('dialog');
  await sheet.getByText(/^Preguntas · \d+/).waitFor();
  await r.settle();
  await r.hold(900);
  r.poster(); // the version's sheet at rest, before it scrolls to its questions
  await r.scrollIn(sheet.getByText(/^Preguntas · \d+/), 'top', 1400);
  await r.hold(2600);
}

/** Revisar › Errores frecuentes → «Crear ficha de refuerzo» (AI, in the unit while the teacher waits) → the worksheet
 *  with its answer key. */
async function remedialWorksheet(r, d) {
  const { page } = r;
  const create = page.getByRole('link', { name: /Crear ficha de refuerzo/ }).or(page.getByRole('button', { name: /Crear ficha de refuerzo/ })).first();
  await r.hold(1800);
  await r.tap(create);
  const dialog = page.getByRole('dialog');
  const createButton = dialog.getByRole('button', { name: 'Crear ficha', exact: true });
  await r.lag(async () => {
    await createButton.waitFor();
    await r.settle();
  });
  await r.hold(900);
  r.poster(); // the «Crear con IA» sheet at rest, with the worksheet chosen
  await r.scrollIn(dialog.getByLabel('Indicaciones (opcional)'), 'reveal', 1100); // the questions the class got wrong
  await r.hold(1600);
  await r.tap(createButton);
  await dialog.waitFor({ state: 'hidden' });
  await r.hold(1400); // the toast, and the worksheet's row with its progress
  const [unitId] = (await d.api.get(`/activities/${d.exam}`)).unit_ids;
  const row = page.locator('.row', { hasText: /Ficha de refuerzo/ }).first();
  await r.ai(async () => {
    const done = await until('the worksheet', async () => (await d.api.get(`/units/${unitId}`)).materials
      .find((m) => m.kind === 'worksheet' && /refuerzo/i.test(m.title) && m.status !== 'generating'));
    if (done.status !== 'ready') fail(`The worksheet ended ${done.status}.`);
    await row.locator('.spinner').waitFor({ state: 'detached', timeout: 120_000 });
  });
  await r.hold(1200);
  await r.tap(row);
  await r.lag(async () => {
    await page.getByRole('button', { name: 'Con soluciones' }).waitFor();
    await r.settle();
  });
  await r.hold(1000);
  await r.tap(page.getByRole('button', { name: 'Con soluciones' }));
  await r.hold(800);
  await r.scrollBy(460, 1600);
  await r.hold(2200);
}

/** Hoy › A vigilar: the student who has just missed class again → «Avisar a la familia» → «Copiar y guardar». */
async function tellTheFamily(r, d) {
  const { page } = r;
  await r.hold(1500);
  await r.tap(page.locator('.section:has-text("A vigilar") .row', { hasText: d.absentFirst }).first());
  await r.hold(1200);
  await r.tap(page.getByRole('button', { name: 'Avisar a la familia' }));
  await page.getByRole('textbox', { name: 'Mensaje para la familia' }).waitFor();
  await r.hold(2600);
  r.poster();
  await r.tap(page.getByRole('button', { name: 'Copiar y guardar' }));
  await page.getByText('Mensaje copiado').waitFor();
  await r.hold(1900);
}

/** Primera evaluación: a student's proposed grade → «Cómo se calcula» → the report comment the AI drafted →
 *  «Aceptar y siguiente», and the next student's own comment. */
async function explainTheGrade(r, d) {
  const { page } = r;
  await r.hold(1200);
  await r.tap(page.locator('.row', { hasText: d.graded.sort_name }).first());
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Cómo se calcula' }).waitFor();
  await r.hold(1300);
  await r.tap(sheet.getByRole('button', { name: 'Cómo se calcula' }));
  await r.hold(2400);
  r.poster();
  await r.scrollIn(sheet.getByText('Comentario de boletín'), 'reveal', 1300);
  await r.hold(2800);
  const title = await sheet.locator('.sheet__title').textContent();
  await r.tap(sheet.getByRole('button', { name: 'Aceptar y siguiente' }));
  await r.lag(() => page.waitForFunction((t) => document.querySelector('[role="dialog"] .sheet__title')?.textContent !== t, title));
  await r.hold(600);
  await r.scrollIn(sheet.getByText('Comentario de boletín'), 'reveal', 1100);
  await r.hold(2600);
}

// ── Before the recordings (through the API) ─────────────────────────────────────
/** Ids and names the clips need, found through the API of a fresh demo. */
async function demoIds(api) {
  const today = await api.get('/today');
  if (today.date !== DAY) fail(`The API's "today" is ${today.date}, not ${DAY}.`);
  const now = today.sessions.find((s) => s.status === 'now' && !s.cancelled) ?? fail('No class in progress at 10:40.');
  const course = now.course.id;
  const roster = await api.get(`/courses/${course}/students`);
  const absent = roster.find((s) => s.watch.some((w) => /falta/.test(w))) ?? roster[2];
  const late = roster.filter((s) => s !== absent && !s.watch.length && !s.support)[1] ?? roster[5];
  const toReview = (await api.get('/inbox')).to_review.find((t) => t.course.id === course) ?? fail('No exam to review in the class in progress.');
  const exam = toReview.activity.id;
  const upcoming = (await api.get(`/courses/${course}/gradebook?term=1`)).activities
    .find((a) => a.kind === 'exam' && a.date > DAY) ?? fail('No upcoming exam in the class in progress.');
  const evaluation = await api.get(`/courses/${course}/evaluation/1`);
  // A comment that says something concrete about an exam, for a student with nothing missing (the lowest pass).
  const graded = evaluation.rows.filter((row) => row.comment_status === 'draft' && !row.missing_grades.length
    && !row.pending_exams.length && /examen de fracciones/.test(row.comment ?? '') && row.final >= 5)
    .sort((a, b) => a.final - b.final)[0] ?? evaluation.rows[0];
  return { course, exam, upcoming: upcoming.id, paper: await cleanPaper(api, exam), graded: graded.student,
    absent: absent.sort_name, absentFirst: absent.first_name, late: late.sort_name };
}

/** The first paper still to review that has the AI's points, the name confirmed and nothing to fix first, where the
 *  AI took part of the points of question 2 (raising them is the teacher's call on a real attempt), where the student
 *  wrote no asides to the teacher (the AI's remarks would quote them), and whose next paper is just as clean (the
 *  clip ends on it). */
async function cleanPaper(api, exam) {
  const c = await api.get(`/activities/${exam}/correction`);
  const clean = (s) => s?.paper_id && s.match_status === 'confirmed' && s.grade?.status === 'suggested' && !s.flags.length;
  const aside = /\banota\b|\bapunta\b|escribe que|dice que|reconoce/i;
  const pending = c.students.filter(clean);
  for (const [k, s] of pending.entries()) {
    const review = await api.get(`/activities/${exam}/review/${s.student.id}`);
    const second = review.ai?.items?.[1];
    const max = review.items?.[1]?.points;
    if (second && max && second.points > 0 && second.points < max && !review.ai.items.some((i) => aside.test(i.feedback ?? ''))
      && clean(pending[k + 1]) && review.next_pending_id === pending[k + 1].student.id) return s.student.id;
  }
  return pending[0]?.student.id ?? fail('No paper with the AI\'s points left to review.');
}

/** The upcoming exam without versions, as if Modelo B and the adapted ones had never been prepared. */
async function withoutVersions(api, d) {
  for (const v of (await api.get(`/activities/${d.upcoming}/versions`)).versions) {
    await api.del(`/activities/${d.upcoming}/versions/${v.key}`);
  }
}

/** The unit of the exam without its remedial worksheet: the new one keeps the plain title, without «(2)». */
async function withoutRemedialWorksheet(api, d) {
  const activity = await api.get(`/activities/${d.exam}`);
  for (const unitId of activity.unit_ids ?? []) {
    for (const m of (await api.get(`/units/${unitId}`)).materials) {
      if (m.kind === 'worksheet' && /refuerzo/i.test(m.title)) await api.del(`/materials/${m.id}`);
    }
  }
}

/** The list of the class in progress, passed with one absence and one late arrival. */
async function listPassed(api, d) {
  const roster = await api.get(`/courses/${d.course}/students`);
  const id = (name) => roster.find((s) => s.sort_name === name).id;
  const now = (await api.get('/today')).sessions.find((s) => s.status === 'now' && !s.cancelled);
  await api.put(`/courses/${d.course}/attendance`, { date: DAY, start: now.start, marks: [
    { student_id: id(d.absent), status: 'absent' }, { student_id: id(d.late), status: 'late' }] });
}

/** A second subject with written answers: a history class of 1.º Bach B with an exam generated from its unit, a pile
 *  of scanned papers written by a real model imitating students (the backend's handwriting tool) and graded by the AI.
 *  → how long the AI took from the uploaded pile to every student's proposed points (the page says it). */
async function historyExam(api) {
  const group = (await api.get('/groups')).find((g) => g.stage === 'bachillerato') ?? fail('No Bachillerato group in the demo.');
  const course = await api.post('/courses', { subject: 'Historia del Mundo Contemporáneo', short: 'HMC', color: 'clay', room: '301',
    group_id: group.id, schedule: [{ weekday: 1, start: '12:40', end: '13:35' }, { weekday: 3, start: '09:25', end: '10:20' }] });
  const [unit] = await api.post(`/courses/${course.id}/units/bulk`, { units: [{ title: 'La Revolución francesa', term: 1 }] });
  await api.patch(`/units/${unit.id}`, { status: 'current' });
  const exam = await api.post(`/courses/${course.id}/activities`, { title: 'Examen U1 · La Revolución francesa', kind: 'exam',
    date: '2026-11-17', max_score: 10, unit_ids: [unit.id] });
  const { job } = await api.post(`/activities/${exam.id}/generate`, { unit_ids: [unit.id], n_items: 4, difficulty: 'medio',
    instructions: 'Preguntas de desarrollo con respuesta escrita: definir conceptos, explicar causas y consecuencias y relacionar hechos. Sin preguntas tipo test.' });
  await jobDone(api, job.id);
  const dir = mkdtempSync(join(tmpdir(), 'sepia-pile-'));
  execFileSync(PYTHON, ['-m', 'app.services.handwriting', '--activity', exam.id, '--students', '8', '--seed', '3', '--out', join(dir, 'pila.pdf')],
    { cwd: BACKEND, env: api.env, stdio: 'inherit' });
  const form = new FormData();
  form.append('files', new Blob([readFileSync(join(dir, 'pila.pdf'))], { type: 'application/pdf' }), 'escaneo.pdf');
  rmSync(dir, { recursive: true, force: true });
  form.append('mode', 'names');
  const t0 = Date.now();
  const upload = await api.upload(`/activities/${exam.id}/papers`, form);
  const ingest = await jobDone(api, upload.job.id);
  if (ingest.result?.suggest_job) await jobDone(api, ingest.result.suggest_job);
  return { pile: { papers: ingest.result.papers, pages: ingest.result.pages, seconds: Math.round((Date.now() - t0) / 1000) } };
}

async function jobDone(api, id) {
  const job = await until(`job ${id}`, async () => {
    const j = await api.get(`/jobs/${id}`);
    return ['done', 'failed'].includes(j.status) ? j : null;
  });
  if (job.status !== 'done') fail(`Job ${id} ${job.status}: ${job.error}`);
  return job;
}

/** The history exam and its first clean paper followed by another, like the fractions one. */
async function historyIds(api) {
  const course = (await api.get('/courses')).find((c) => c.subject === 'Historia del Mundo Contemporáneo') ?? fail('No history class.');
  const exam = (await api.get(`/courses/${course.id}/gradebook?term=1`)).activities.find((a) => a.kind === 'exam');
  const c = await api.get(`/activities/${exam.id}/correction`);
  const clean = c.students.filter((s) => s.paper_id && s.match_status === 'confirmed' && s.grade?.status === 'suggested' && !s.flags.length);
  const paper = clean.find((s, k) => clean[k + 1]) ?? clean[0] ?? fail('The history pile has no clean paper to review.');
  return { history: { course: course.id, exam: exam.id, paper: paper.student.id } };
}

// ── Recording ───────────────────────────────────────────────────────────────────
class Recorder {
  constructor(page, cdp, device) {
    Object.assign(this, { page, cdp, device, k: DEVICES[device].slow, frames: [], lapses: [], posterAt: null, aiSeconds: [] });
    cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
      this.frames.push({ data, t: metadata.timestamp, at: Date.now() / 1000 });
      cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    });
  }

  async start() {
    await this.cdp.send('Animation.enable');
    await this.cdp.send('Animation.setPlaybackRate', { playbackRate: 1 / this.k });
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, everyNthFrame: 1 });
    // A still page sends no frames: repaint a speck of it until the first frame of what it shows now arrives.
    const asked = Date.now() / 1000;
    for (let i = 0; i < 200 && !this.frames.some((f) => f.at > asked + 0.05); i++) {
      await this.page.evaluate(() => window.__clipNudge());
      await this.page.waitForTimeout(50);
    }
    this.t0 = Date.now() / 1000;
  }

  async stop() {
    this.t1 = Date.now() / 1000;
    await this.cdp.send('Page.stopScreencast');
  }

  /** Waits `ms` of video time. */
  hold(ms) { return this.page.waitForTimeout(ms * this.k); }
  poster() { this.posterAt = Date.now() / 1000; }

  /** Waits for the AI: the clip shows the real elapsed time and plays the wait in LAPSE seconds. */
  async ai(until) {
    await this.page.evaluate(() => window.__clipWait(true));
    const from = Date.now() / 1000;
    await until();
    const to = Date.now() / 1000;
    await this.page.evaluate(() => window.__clipWait(false));
    this.lapses.push([from, to, LAPSE]);
    this.aiSeconds.push(Math.round(to - from));
  }

  /** Waits for the app: in the clip it lasts at most LAG seconds, on the frame from before the wait. */
  async lag(until) {
    const from = Date.now() / 1000;
    await until();
    const to = Date.now() / 1000;
    this.lapses.push([from, to, Math.max(1 / FPS, Math.min(LAG, (to - from) / this.k)), true]);
  }

  /** Until the page shows everything it loads: no skeletons, every image loaded, decoded and painted. */
  async settle() {
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForFunction(() => !document.querySelector('.skel, [aria-busy="true"]')
      && [...document.images].every((i) => i.complete && i.naturalWidth), null, { timeout: 60_000 });
    await this.page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {})))
      .then(() => new Promise((painted) => requestAnimationFrame(() => requestAnimationFrame(painted)))));
  }

  /** A tap (phone) or a click with the pointer gliding to it (desktop); both drawn by the page overlay. */
  async tap(locator) {
    await locator.waitFor();
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    if (this.device === 'phone') {
      await this.page.evaluate(([x, y]) => window.__clipTouch(x, y), [x, y]);
      await this.hold(260);
      await locator.tap();
    } else {
      await this.page.evaluate(([x, y, ms]) => window.__clipGlide(x, y, ms), [x, y, 650 * this.k]);
      await this.hold(700);
      await this.page.mouse.move(x, y);
      await this.hold(120);
      await this.page.evaluate(([x, y]) => window.__clipTouch(x, y), [x, y]);
      await this.page.mouse.down();
      await this.page.mouse.up();
    }
  }

  /** «Aceptar y siguiente» in focus mode, then the next student's paper with its images. */
  async acceptAndNext() {
    const name = await this.page.locator('.review-bar__title strong').textContent();
    await this.tap(this.page.locator('.review-accept'));
    await this.lag(async () => {
      await this.page.waitForFunction((n) => document.querySelector('.review-bar__title strong')?.textContent !== n, name);
      await this.settle();
    });
  }

  /** Scrolls the page so the element (CSS selector, locator or { section: its title }) sits `margin` px under the top
   *  bar, in `ms` of video. */
  async scrollTo(target, ms, margin = 12) {
    const el = typeof target === 'string' ? this.page.locator(target).first()
      : target.section ? this.page.locator('.section__title', { hasText: new RegExp(`^${escape(target.section)}`) }).first()
        : target;
    await el.evaluate(async (node, [ms, margin]) => {
      const bar = document.querySelector('.topbar, .review-bar')?.getBoundingClientRect().bottom ?? 0;
      const y = window.scrollY + node.getBoundingClientRect().top - Math.max(bar, 0) - margin;
      await window.__clipScroll(window, Math.max(0, y), ms);
    }, [ms * this.k, margin]);
  }

  /** Scrolls whatever scrolls the page (the window or the app's own scroller) by `dy` px. */
  scrollBy(dy, ms) {
    return this.page.evaluate(([dy, ms]) => {
      const scroller = [...document.querySelectorAll('*')].find((el) => el.scrollHeight > el.clientHeight + 40
        && /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.getBoundingClientRect().width > 300);
      const target = scroller && document.scrollingElement.scrollHeight <= innerHeight + 4 ? scroller : window;
      const y = (target === window ? scrollY : target.scrollTop) + dy;
      return window.__clipScroll(target, y, ms);
    }, [dy, ms * this.k]);
  }

  /** Scrolls the scroller that holds `locator` (a sheet's body) until it shows whole ('reveal') or is at its top ('top'). */
  scrollIn(locator, how, ms) {
    return locator.first().evaluate((el, [how, ms]) => {
      let box = el.parentElement;
      while (box && !(box.scrollHeight > box.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
      const target = box ?? window;
      const now = target === window ? scrollY : target.scrollTop;
      const view = target === window ? { top: 0, bottom: innerHeight } : target.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const y = how === 'top' ? now + r.top - view.top - 8 : now + Math.max(0, r.bottom - view.bottom + 16);
      return window.__clipScroll(target, y, ms);
    }, [how, ms * this.k]);
  }

  /** The frames' clock is the compositor's: shift it onto this process's clock (the smallest delay seen). */
  aligned() {
    const shift = Math.min(...this.frames.map((f) => f.at - f.t));
    return this.frames.map((f) => ({ data: f.data, t: f.t + shift })).sort((a, b) => a.t - b.t);
  }

  /** Constant-frame-rate JPEG sequence of the recording (slow motion undone, each lapse squeezed into its seconds;
   *  a frozen one shows the frame from its start) and the index of its poster frame. */
  sequence() {
    const frames = this.aligned();
    const before = (time) => Math.max(0, frames.findLastIndex((f) => f.t <= time));
    const out = [];
    let j = 0;
    let poster = 0;
    for (let t = this.t0; t < this.t1;) {
      const lapse = this.lapses.find(([a, b]) => t >= a && t < b);
      while (j + 1 < frames.length && frames[j + 1].t <= t) j++;
      if (this.posterAt && t <= this.posterAt) poster = out.length;
      out.push(frames[lapse?.[3] ? before(lapse[0]) : j].data);
      t += lapse ? (lapse[1] - lapse[0]) / (lapse[2] * FPS) : this.k / FPS;
    }
    return { frames: out, poster: this.posterAt ? poster : Math.floor(out.length / 2) };
  }
}

/** Drawn into the page for the recording only: where a finger touches (the pointer, on desktop), smooth scrolls and
 *  the real time the AI is taking. Timed with performance.now() and the page's own timers from before slowTimers(). */
function overlay() {
  const tick = window.setInterval.bind(window);
  const untick = window.clearInterval.bind(window);
  const style = document.createElement('style');
  style.textContent = `
    html { scrollbar-width: none; } ::-webkit-scrollbar { display: none; }
    * { -webkit-tap-highlight-color: transparent; } /* the emulator's blue tap flash: the clip draws the finger itself */
    .clip-touch { position: fixed; z-index: 2147483647; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%;
      pointer-events: none; background: rgba(28, 28, 30, 0.16); box-shadow: 0 0 0 1.5px rgba(28, 28, 30, 0.28);
      animation: clip-touch 620ms cubic-bezier(.2,.8,.2,1) forwards; }
    @media (prefers-color-scheme: dark) { .clip-touch { background: rgba(255, 255, 255, 0.20); box-shadow: 0 0 0 1.5px rgba(255, 255, 255, 0.40); } }
    @keyframes clip-touch { 0% { transform: scale(.55); opacity: 0; } 25% { transform: scale(1); opacity: 1; } 100% { transform: scale(1.18); opacity: 0; } }
    .clip-pointer { position: fixed; z-index: 2147483647; left: 0; top: 0; width: 22px; height: 22px; pointer-events: none;
      filter: drop-shadow(0 1px 1.5px rgba(0,0,0,.35)); }
    .clip-wait { position: fixed; z-index: 2147483647; left: 50%; bottom: 112px; transform: translateX(-50%); display: flex;
      gap: 7px; align-items: baseline; padding: 9px 16px; border-radius: 999px; pointer-events: none; white-space: nowrap;
      background: rgba(18, 18, 20, 0.86); color: #fff; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
      font: 500 14px/1.2 'Instrument Sans Variable', 'Instrument Sans', system-ui, sans-serif; }
    .clip-wait b { font-weight: 650; font-variant-numeric: tabular-nums; }
    .clip-wait span:last-child { opacity: 0.72; }
    @media (min-width: 1024px) { .clip-wait { bottom: 40px; font-size: 15px; } }`;
  const pointer = new DOMParser().parseFromString(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22" class="clip-pointer"><path d="M4 2.5v15.2l3.9-3.7 2.6 5.9 2.7-1.2-2.6-5.8 5.4-.2z" fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>',
    'image/svg+xml').documentElement;
  let px = innerWidth * 0.62, py = innerHeight * 0.55;
  const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const place = () => { pointer.style.transform = `translate(${px - 4}px, ${py - 2}px)`; };
  addEventListener('DOMContentLoaded', () => {
    document.head.append(style);
    if (!matchMedia('(pointer: coarse)').matches) { document.body.append(pointer); place(); }
  });
  window.__clipTouch = (x, y) => {
    const dot = document.createElement('div');
    dot.className = 'clip-touch';
    dot.style.left = `${x}px`;
    dot.style.top = `${y}px`;
    document.body.append(dot);
    dot.addEventListener('animationend', () => dot.remove());
  };
  window.__clipGlide = (x, y, ms) => new Promise((done) => {
    const [x0, y0, t0] = [px, py, performance.now()];
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      px = x0 + (x - x0) * ease(k); py = y0 + (y - y0) * ease(k); place();
      if (k < 1) requestAnimationFrame(step); else done();
    };
    requestAnimationFrame(step);
  });
  window.__clipScroll = (target, y, ms) => new Promise((done) => {
    const get = () => (target === window ? scrollY : target.scrollTop);
    const set = (v) => (target === window ? scrollTo(0, v) : (target.scrollTop = v));
    const [y0, t0] = [get(), performance.now()];
    if (!ms) { set(y); return done(); }
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      set(y0 + (y - y0) * ease(k));
      if (k < 1) requestAnimationFrame(step); else done();
    };
    requestAnimationFrame(step);
  });
  let waiting = null;
  window.__clipWait = (on) => {
    untick(waiting?.timer);
    waiting?.el.remove();
    waiting = null;
    if (!on) return;
    const el = document.createElement('div');
    el.className = 'clip-wait';
    document.body.append(el);
    const t0 = Date.now();
    const draw = () => {
      const s = Math.floor((Date.now() - t0) / 1000);
      el.innerHTML = `<span>Espera real</span><b>${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}</b><span>· acelerado</span>`;
    };
    draw();
    waiting = { el, timer: tick(draw, 100) };
  };
  window.__clipNudge = () => {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:.01;background:#888;z-index:2147483647;pointer-events:none';
    document.documentElement.append(d);
    requestAnimationFrame(() => requestAnimationFrame(() => d.remove()));
  };
}

/** Page timers run k times slower too (toasts, autosave), like the animations. */
function slowTimers(k) {
  const [st, si] = [window.setTimeout, window.setInterval];
  window.setTimeout = (fn, ms, ...a) => st(fn, (ms || 0) * k, ...a);
  window.setInterval = (fn, ms, ...a) => si(fn, (ms || 0) * k, ...a);
}

// ── API processes ───────────────────────────────────────────────────────────────
function freePort() {
  return new Promise((resolve) => {
    const s = createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

/** An API process on a copy of `seed` (never the seed itself), with the demo's frozen "today" and the real AI. */
async function startApi(seed, logFile) {
  const dir = mkdtempSync(join(tmpdir(), 'sepia-clip-'));
  cpSync(seed, dir, { recursive: true });
  const port = await freePort();
  const env = { ...process.env, SEPIA_DATA_DIR: dir, SEPIA_DATABASE_URL: `sqlite+aiosqlite:///${join(dir, 'sepia.db')}`,
    SEPIA_TODAY: DAY, SEPIA_NOW: CLOCK, SEPIA_AI_PROVIDER: 'claude_cli' };
  const log = openSync(logFile, 'a');
  const proc = spawn(PYTHON, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(port)],
    { cwd: BACKEND, env, stdio: ['ignore', log, log] });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; ; i++) {
    try {
      const health = await (await fetch(`${base}/api/health`)).json();
      if (health.ai_provider !== 'claude_cli') fail(`The API answers with AI "${health.ai_provider}", not claude_cli.`);
      break;
    } catch (e) {
      if (i > 600 || proc.exitCode !== null) fail(`The API did not start (see ${logFile}): ${e.message}`);
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  const login = await (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'demo@sepia.es', password: 'sepia1234' }) })).json();
  if (!login.access_token) fail(`Demo login failed on ${SEED}: seed a fresh demo (scripts/dev.sh --demo).`);
  const call = async (method, path, body, form) => {
    const r = await fetch(`${base}/api${path}`, { method, headers: { authorization: `Bearer ${login.access_token}`,
      ...(body ? { 'content-type': 'application/json' } : {}) }, body: form ?? (body ? JSON.stringify(body) : undefined) });
    if (!r.ok) fail(`${method} ${path} → ${r.status} ${await r.text()}`);
    return r.json();
  };
  const stopped = new Promise((resolve) => proc.on('exit', resolve));
  return {
    port, dir, tokens: login,
    api: { env, get: (p) => call('GET', p), put: (p, b) => call('PUT', p, b), post: (p, b) => call('POST', p, b ?? {}),
      patch: (p, b) => call('PATCH', p, b), del: (p) => call('DELETE', p), upload: (p, form) => call('POST', p, null, form) },
    kill: () => { proc.kill(); rmSync(dir, { recursive: true, force: true }); },
    /** Stops the API; `keep` leaves its data dir (a prepared demo for later recordings). */
    stop: async (keep = false) => {
      proc.kill();
      await stopped;
      if (!keep) rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function until(what, check, minutes = 20) {
  const end = Date.now() + minutes * 60_000;
  for (;;) {
    const v = await check();
    if (v) return v;
    if (Date.now() > end) fail(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 1500));
  }
}

// ── Encoding ────────────────────────────────────────────────────────────────────
/** JPEG frames → VP9 WebM + H.264 MP4 + the poster frame as WebP. */
async function encode(frames, base, posterIndex) {
  const mjpeg = `${base}.mjpeg`;
  writeFileSync(mjpeg, Buffer.concat(frames.map((d) => Buffer.from(d, 'base64'))));
  const input = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', mjpeg,
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2'];
  await ffmpeg([...input, ...VP9, '-an', `${base}.webm`]);
  await ffmpeg([...input, ...H264, '-an', `${base}.mp4`]);
  writeFileSync(`${base}.jpg`, Buffer.from(frames[posterIndex], 'base64'));
  await ffmpeg(['-y', '-loglevel', 'error', '-i', `${base}.jpg`, '-c:v', 'libwebp', '-quality', '78', `${base}.webp`]);
  rmSync(`${base}.jpg`);
  rmSync(mjpeg);
}

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const ff = spawn(FFMPEG, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    ff.on('close', (code) => (code ? reject(new Error(`ffmpeg exited with ${code}`)) : resolve()));
  });
}

/** An ffmpeg with VP9, H.264 and WebP. */
function findFfmpeg() {
  const bin = process.env.FFMPEG || 'ffmpeg';
  let encoders = '';
  try { encoders = execFileSync(bin, ['-hide_banner', '-encoders'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString(); } catch { /* reported below */ }
  if (!['libvpx-vp9', 'libx264', 'libwebp'].every((e) => encoders.includes(e))) {
    fail(`FFMPEG: needs an ffmpeg with libvpx-vp9, libx264 and libwebp (${bin} has not). pip download imageio-ffmpeg has one.`);
  }
  return bin;
}

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function fail(msg) {
  console.error(msg);
  for (const server of running) server.kill();
  process.exit(1);
}

// ── Run ─────────────────────────────────────────────────────────────────────────
const FFMPEG = findFfmpeg();
if (!existsSync(join(BACKEND, 'app/main.py'))) fail(`BACKEND: ${BACKEND} is not the backend repo (set BACKEND).`);
if (!existsSync(join(SEED, 'sepia.db'))) fail(`SEED: ${SEED} has no sepia.db. Seed the demo first (scripts/dev.sh --demo).`);
mkdirSync(OUT, { recursive: true });
const LOG = join(tmpdir(), 'sepia-landing-clips-api.log');
const manifestFile = join(OUT, 'clips.json');
// Software GL: without it headless Chromium skips backdrop-filter and the app's glass shows the content unblurred. One
// browser per pixel density, forced at launch: headless Chromium draws (and screencasts) at the density it was started
// with, whatever the page emulates, so without it every clip would have one pixel per CSS pixel.
const browsers = new Map();
const browserAt = async (scale) => {
  if (!browsers.has(scale)) {
    browsers.set(scale, await chromium.launch({ args: ['--enable-gpu', '--use-angle=swiftshader', `--force-device-scale-factor=${scale}`],
      handleSIGINT: false, handleSIGTERM: false }));
  }
  return browsers.get(scale);
};
let failed = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { for (const s of running) await s.stop(); process.exit(1); });

for (const clip of CLIPS) {
  let seed = SEED;
  let prepared = null;
  if (clip.prepare && Object.keys(clip.devices).some((d) => !ONLY_DEVICES || ONLY_DEVICES.includes(d))) {
    console.log(`${clip.name}: preparing the demo (real AI, several minutes)…`);
    prepared = await startApi(SEED, LOG);
    running.add(prepared);
    const measured = await clip.prepare(prepared.api);
    if (measured?.pile) {
      const saved = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : {};
      saved[`pile:${clip.name}`] = measured.pile;
      writeFileSync(manifestFile, `${JSON.stringify(Object.fromEntries(Object.entries(saved).sort()), null, 2)}\n`);
      console.log(`${clip.name}: the AI read and graded ${measured.pile.papers} papers (${measured.pile.pages} pages) in ${measured.pile.seconds} s`);
    }
    await prepared.stop(true);
    running.delete(prepared);
    seed = prepared.dir;
  }
  for (const [device, height] of Object.entries(clip.devices).filter(([d]) => !ONLY_DEVICES || ONLY_DEVICES.includes(d))) {
    for (const scheme of SCHEMES) {
      const key = `${clip.name}-${device}${scheme === 'dark' ? '-dark' : ''}`;
      const server = await startApi(seed, LOG);
      running.add(server);
      let page = null;
      try {
        const ids = { ...(await demoIds(server.api)), ...(clip.ids ? await clip.ids(server.api) : {}), api: server.api };
        if (clip.prelude) await clip.prelude(server.api, ids);
        const { slow, scale, context } = DEVICES[device];
        const viewport = { ...context.viewport, height };
        const ctx = await (await browserAt(scale)).newContext({ ...context, viewport, deviceScaleFactor: scale, colorScheme: scheme,
          locale: 'es-ES', timezoneId: 'Europe/Madrid' });
        await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(APP).origin });
        await ctx.route((url) => url.origin === new URL(APP).origin && url.pathname.startsWith('/api/'), async (route) => {
          const url = new URL(route.request().url());
          url.host = `127.0.0.1:${server.port}`;
          try {
            await route.fulfill({ response: await route.fetch({ url: url.toString(), maxRetries: 1, timeout: 0 }) });
          } catch {
            await route.abort().catch(() => {});
          }
        });
        await ctx.addInitScript((t) => localStorage.setItem('sepia.tokens', JSON.stringify(t)),
          { access_token: server.tokens.access_token, refresh_token: server.tokens.refresh_token });
        await ctx.addInitScript(overlay);
        await ctx.addInitScript(slowTimers, slow);
        page = await ctx.newPage();
        page.on('pageerror', (e) => { failed = true; console.error(`[${key}] ${e.message}`); });
        await page.goto(APP + clip.start(ids));
        const r = new Recorder(page, await ctx.newCDPSession(page), device);
        await r.settle();
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(600 * slow);
        if (clip.before) await clip.before(r, ids);
        await r.start();
        await clip.run(r, ids);
        await r.stop();
        const { frames, poster } = r.sequence();
        await encode(frames, join(OUT, key), poster);
        const size = (ext) => readFileSync(join(OUT, `${key}.${ext}`)).length;
        const seconds = +(frames.length / FPS).toFixed(1);
        const saved = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : {};
        saved[key] = { seconds, ai_seconds: r.aiSeconds, webm: size('webm'), mp4: size('mp4'), poster: size('webp') };
        writeFileSync(manifestFile, `${JSON.stringify(Object.fromEntries(Object.entries(saved).sort()), null, 2)}\n`);
        console.log(`${key}: ${seconds} s · webm ${kb(size('webm'))} · mp4 ${kb(size('mp4'))} · poster ${kb(size('webp'))}`
          + (r.aiSeconds.length ? ` · AI ${r.aiSeconds.join(' + ')} s` : ''));
        await ctx.close();
      } catch (e) {
        failed = true;
        console.error(`[${key}] ${e.stack || e.message}`);
        await page?.screenshot({ path: join(tmpdir(), `sepia-landing-clips-error-${key}.png`) }).catch(() => {});
      } finally {
        await server.stop();
        running.delete(server);
      }
    }
  }
  if (prepared) rmSync(prepared.dir, { recursive: true, force: true });
}
if (!ONLY || ONLY.includes('og')) await linkPreview();
for (const b of browsers.values()) await b.close();
stamp();
if (failed) fail('Some clips failed (see above).');

/** og.jpg (1200×630, WhatsApp and other link previews): the hero title beside the review of an exam on the phone. */
async function linkPreview() {
  const poster = join(OUT, 'corregir-phone.webp');
  if (!existsSync(poster)) return;
  const ctx = await (await browserAt(1)).newContext({ viewport: { width: 1200, height: 630 }, colorScheme: 'light', locale: 'es-ES' });
  const page = await ctx.newPage();
  await page.goto(`${APP}/landing/index.html`); // same origin as the landing's fonts and styles
  await page.setContent(`<!doctype html><html lang="es"><head><meta charset="utf-8">
    <link rel="stylesheet" href="/landing/landing.css">
    <style>
      body { width: 1200px; height: 630px; overflow: hidden; display: grid; grid-template-columns: minmax(0, 1fr) 372px;
        gap: 56px; padding: 0 64px 0 88px; }
      .og__copy { align-self: center; }
      .og__copy h1 { font-size: 76px; margin-top: 14px; }
      .og__copy .line { display: block; }
      .og__shot { align-self: start; margin-top: 64px; border-radius: 26px; overflow: hidden; box-shadow: var(--device-shadow); }
    </style></head><body>
    <div class="ambient"></div>
    <div class="og__copy"><p class="kicker">Sepia · El cuaderno del profesor</p>
      <h1>Que el montón de exámenes <span class="line">no se coma tu&nbsp;domingo.</span></h1></div>
    <img class="og__shot" src="/landing/clips/corregir-phone.webp" width="372" alt="">
    </body></html>`);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  writeFileSync(OG, await page.screenshot({ type: 'jpeg', quality: 86 }));
  console.log(`landing/img/og.jpg ${kb(readFileSync(OG).length)}`);
  await ctx.close();
}

/** index.html ← the recordings: data-v (a hash of the clip's videos) on each clip, ?v= on posters and images, in
 *  each <span data-wait="clip">, how long the AI took (the mean of its recordings, rounded: each video shows its own),
 *  and in each <span data-pile="clip">, the pile its demo was prepared with and how long the AI took to grade it. */
function stamp() {
  const files = readdirSync(OUT);
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  const sha = (paths) => {
    const h = createHash('sha1');
    for (const p of paths.sort()) h.update(readFileSync(p));
    return h.digest('hex').slice(0, 8);
  };
  const about = (s) => {
    if (s < 50) return `unos ${Math.max(5, Math.round(s / 5) * 5)}&nbsp;s`;
    const halves = Math.round(s / 30);
    const [min, half] = [Math.floor(halves / 2), halves % 2 ? ' y medio' : ''];
    return min === 1 ? `alrededor de un minuto${half}` : `unos ${min}&nbsp;minutos${half}`;
  };
  const html = readFileSync(INDEX, 'utf8')
    .replace(/(data-clip="([\w-]+)"[^>]*?data-v=")[^"]*"/g, (_, head, name) =>
      `${head}${sha(files.filter((f) => f.startsWith(`${name}-`) && /\.(webm|mp4)$/.test(f)).map((f) => join(OUT, f)))}"`)
    .replace(/\/landing\/((?:clips|img)\/[\w.-]+\.(?:webp|jpg))(?:\?v=\w+)?/g, (m, file) =>
      (existsSync(join(ROOT, 'landing', file)) ? `/landing/${file}?v=${sha([join(ROOT, 'landing', file)])}` : m))
    .replace(/(<span data-wait="([\w-]+)">)[^<]*(<\/span>)/g, (m, open, name, close) => {
      const waits = Object.entries(manifest).filter(([k]) => k.startsWith(`${name}-`) && !k.includes(':'))
        .map(([, v]) => v.ai_seconds.reduce((a, b) => a + b, 0)).filter(Boolean);
      return waits.length ? open + about(waits.reduce((a, b) => a + b, 0) / waits.length) + close : m;
    })
    .replace(/(<span data-pile="([\w-]+)">)[^<]*(<\/span>)/g, (m, open, name, close) => {
      const pile = manifest[`pile:${name}`];
      return pile ? `${open}${pile.papers} exámenes (${pile.pages} páginas escaneadas): la IA tardó ${about(pile.seconds)} en ordenarlos por alumno y proponer los puntos${close}` : m;
    });
  writeFileSync(INDEX, html);
}
