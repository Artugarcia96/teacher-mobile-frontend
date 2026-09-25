#!/usr/bin/env node
// Real screenshots of the demo app for the landing page → landing/img/<shot>-<phone|desktop>[-dark].webp, plus the
// link preview (og.jpg). Then every image reference in landing/index.html gets ?v=<content hash>, so the week of
// cache nginx gives /landing/ never shows new copy with old images.
//
// Run against the demo exactly as `scripts/dev.sh --demo` leaves it (freshly seeded, "today" = 19/11/2026 10:40):
//   ../teacher-mobile-backend/scripts/dev.sh --demo     # API on :8000
//   npm run dev                                         # app on :5173
//   npm run landing:shots                               # env: APP, API, ONLY=hoy,lista,…,og, CHROMIUM
// Every id comes from the API: the class in progress, the exam with AI drafts to review, the presentation of the unit
// in progress and a student with support measures. The list of the class in progress is passed by tapping, as a
// teacher would (one absence, one late arrival, saved in the demo), so "hoy" is captured before "lista".
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const APP = process.env.APP || 'http://127.0.0.1:5173';
const API = process.env.API || 'http://127.0.0.1:8000';
const ONLY = process.env.ONLY?.split(',');
const OUT = new URL('../landing/img/', import.meta.url).pathname;
const INDEX = new URL('../landing/index.html', import.meta.url).pathname;

// `width`: pixels of the saved image (phone at 2x; desktop at 2x the landing's widest frame, 1168 px, so a 1280 px
// window shows the app at 91 %).
const DEVICES = {
  phone: { width: 780, context: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  desktop: { width: 2336, context: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 } },
};

const login = await fetch(`${API}/api/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'demo@sepia.es', password: 'sepia1234' }),
});
if (!login.ok) fail('Demo login failed: start the API with ../teacher-mobile-backend/scripts/dev.sh --demo');
const tokens = await login.json();

async function api(path) {
  const r = await fetch(`${API}/api${path}`, { headers: { authorization: `Bearer ${tokens.access_token}` } });
  if (!r.ok) fail(`GET ${path} → ${r.status}`);
  return r.json();
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

// ── What to show, found through the API ──────────────────────────────────────
const today = await api('/today');
if (today.date !== '2026-11-19') fail('Not the frozen demo day: start the API with scripts/dev.sh --demo.');
const now = today.sessions.find((s) => s.status === 'now' && !s.cancelled)
  ?? fail('No class in progress: freeze "today" as the demo does (SEPIA_TODAY=2026-11-19 SEPIA_NOW=10:40).');
if ((!ONLY || ONLY.includes('hoy')) && now.attendance?.taken) {
  fail('The list of the class in progress is already taken: reseed the demo (scripts/dev.sh --demo) before capturing.');
}
const course = now.course.id;
const roster = await api(`/courses/${course}/students`);
const absentee = roster.find((r) => r.watch.some((w) => /faltas/.test(w))) ?? roster[0];
const late = roster.filter((r) => r !== absentee && !r.watch.length && !r.support)[1];
// The student with support measures lowest in the list, so the rows above show «A vigilar» reasons too.
const supported = roster.filter((r) => r.support?.measures?.length).at(-1)
  ?? fail('No student with support measures in the class in progress.');

const inbox = await api('/inbox');
const toReview = inbox.to_review.find((t) => t.course.id === course) ?? inbox.to_review[0]
  ?? fail('No exam with AI drafts to review: reseed the demo (scripts/dev.sh --demo).');
const correction = await api(`/activities/${toReview.activity.id}/correction`);
const reviewed = correction.next_pending_id ?? fail('The exam has no pending paper to review.');

const units = await api(`/courses/${course}/units`);
const unit = units.find((u) => u.status === 'current' && u.material_count > 0)
  ?? fail('The unit in progress has no materials: reseed the demo (scripts/dev.sh --demo).');
const { materials } = await api(`/units/${unit.id}`);
const material = materials.find((m) => m.kind === 'slides' && m.status === 'ready')
  ?? materials.find((m) => m.status === 'ready' && m.kind !== 'upload')
  ?? fail('The unit in progress has no generated material.');

// The phone shows the evaluation session instead of the gradebook: on 390 px the gradebook fits two activity columns
// next to an average of all of them.
const SHOTS = [
  { name: 'hoy', devices: ['phone'], path: '/hoy' },
  { name: 'lista', devices: ['phone'], path: '/hoy', act: passList },
  { name: 'cuaderno', devices: ['desktop'], path: `/clases/${course}/cuaderno` },
  { name: 'evaluacion', devices: ['phone'], path: `/clases/${course}/evaluacion/1` },
  { name: 'revisar', devices: ['phone', 'desktop'],
    path: `/clases/${toReview.course.id}/actividades/${toReview.activity.id}/revisar?alumno=${reviewed}`,
    act: (page, device) => device === 'phone' && showFirstQuestion(page) },
  { name: 'material', devices: ['phone', 'desktop'], path: `/clases/${course}/unidades/${unit.id}/materiales/${material.id}` },
  { name: 'alumnos', devices: ['phone'], path: `/clases/${course}/alumnos`, act: (page) => scrollTo(page, supported.sort_name) },
].filter((s) => !ONLY || ONLY.includes(s.name));

/** Opens «Pasar lista» for the class in progress and leaves one absence and one late arrival. */
async function passList(page) {
  await page.locator('.now-card__actions button').first().tap();
  await page.locator('.roster__row').first().waitFor();
  let taps = 0;
  for (const [row, label] of [[absentee, 'Falta'], [late, 'Retraso']]) {
    const name = row.sort_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const line = page.getByRole('button', { name: new RegExp(`^\\d+\\. ${name}:`) });
    for (let i = 0; i < 3 && !(await line.getAttribute('aria-label')).includes(`: ${label}.`); i++) {
      await line.tap();
      await page.waitForTimeout(150);
      taps++;
    }
  }
  if (taps) await page.getByText('Guardado', { exact: true }).waitFor(); // autosave
}

/** Scrolls the list so a whole row starts right under the top bar and the row with this text ends in the top 630 px
 *  (on phones the landing shows the top 1300 px of the 2x image). */
async function scrollTo(page, text) {
  await page.getByText(text, { exact: true }).first().evaluate((el) => {
    const bar = document.querySelector('.topbar').getBoundingClientRect().bottom;
    const least = el.closest('.row').getBoundingClientRect().bottom - 630;
    const snaps = [...el.closest('.list').querySelectorAll('.row')].map((r) => r.getBoundingClientRect().top - bar)
      .filter((d) => d >= least);
    window.scrollBy(0, snaps.length ? Math.min(...snaps) : least);
  });
}

/** Phone review: the first question with the points the AI proposes, right under the review bar. */
async function showFirstQuestion(page) {
  await page.locator('.review-items .ritem').first().evaluate((el) => {
    const bar = document.querySelector('.review-bar').getBoundingClientRect().bottom;
    window.scrollBy(0, el.getBoundingClientRect().top - bar - 12);
  });
}

/** Waits until the screen shows data: no skeletons, fonts and images loaded, network quiet. */
async function settle(page) {
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => !document.querySelector('.skel, [aria-busy="true"]')
    && [...document.images].every((i) => i.complete), null, { timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500); // sheet and page transitions
}

// ── Capture ──────────────────────────────────────────────────────────────────
mkdirSync(OUT, { recursive: true });
// Software GL: without it headless Chromium skips backdrop-filter, and the app's glass bars and sheets show the
// content behind them unblurred.
const browser = await chromium.launch({ args: ['--enable-gpu', '--use-angle=swiftshader'],
  ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) });
const encoder = await browser.newPage();

/** PNG → WebP with Chromium's own encoder, scaled to `width` px. */
async function webp(png, width) {
  const b64 = await encoder.evaluate(async ({ data, width }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = Math.round(img.naturalHeight * (width / img.naturalWidth));
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }, { data: png.toString('base64'), width });
  return Buffer.from(b64, 'base64');
}

// Shot by shot (both schemes of one shot before the next), so every «hoy» comes before the list is passed.
let failed = false;
const pages = {};
async function pageFor(device, scheme) {
  const key = `${device}-${scheme}`;
  if (pages[key]) return pages[key];
  const ctx = await browser.newContext({ ...DEVICES[device].context, colorScheme: scheme, locale: 'es-ES', timezoneId: 'Europe/Madrid' });
  await ctx.addInitScript((t) => localStorage.setItem('sepia.tokens', JSON.stringify(t)),
    { access_token: tokens.access_token, refresh_token: tokens.refresh_token });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { failed = true; console.error(`[${key}] ${e.message}`); });
  return (pages[key] = page);
}

for (const shot of SHOTS) {
  for (const device of shot.devices) {
    for (const scheme of ['light', 'dark']) {
      const page = await pageFor(device, scheme);
      await page.goto(APP + shot.path);
      await settle(page);
      if (shot.act) {
        await shot.act(page, device);
        await settle(page);
      }
      const file = `${shot.name}-${device}${scheme === 'dark' ? '-dark' : ''}.webp`;
      const data = await webp(await page.screenshot(), DEVICES[device].width);
      writeFileSync(OUT + file, data);
      console.log(`landing/img/${file}  ${(data.length / 1024).toFixed(0)} KB`);
    }
  }
}
if (!ONLY || ONLY.includes('og')) await linkPreview();
await browser.close();
stampVersions();
if (failed) fail('The app threw errors while capturing (see above).');

/** og.jpg, 1200×630 for WhatsApp and other link previews: the hero title beside the top of «Hoy» on the phone. */
async function linkPreview() {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, colorScheme: 'light', locale: 'es-ES' });
  const page = await ctx.newPage();
  await page.goto(`${APP}/landing/index.html`); // same origin as the landing's fonts
  await page.setContent(`<!doctype html><html lang="es"><head><meta charset="utf-8">
    <link rel="stylesheet" href="/landing/landing.css">
    <style>
      body { width: 1200px; height: 630px; overflow: hidden; display: grid; grid-template-columns: minmax(0, 1fr) 360px;
        gap: 64px; padding: 0 80px 0 88px; }
      .og__copy { align-self: center; padding-bottom: 12px; }
      .og__copy h1 { font-size: 80px; margin-bottom: 0; }
      .og__shot { width: 360px; margin-top: 72px; }
    </style></head><body>
    <div class="ambient"></div>
    <div class="og__copy"><p class="kicker">Sepia · Para Secundaria y Bachillerato</p>
      <h1>Lista, notas y <em>exámenes corregidos en&nbsp;borrador.</em></h1></div>
    <figure class="shot shot--phone og__shot"><img src="/landing/img/hoy-phone.webp" alt=""></figure>
    </body></html>`);
  await settle(page);
  writeFileSync(OUT + 'og.jpg', await page.screenshot({ type: 'jpeg', quality: 86 }));
  console.log('landing/img/og.jpg');
}

/** Every /landing/img/<file> in index.html → ?v=<first 8 hex of its SHA-1>. */
function stampVersions() {
  const html = readFileSync(INDEX, 'utf8').replace(/\/landing\/img\/([\w.-]+\.(?:webp|jpg))(?:\?v=\w+)?/g, (_, file) =>
    `/landing/img/${file}?v=${createHash('sha1').update(readFileSync(OUT + file)).digest('hex').slice(0, 8)}`);
  writeFileSync(INDEX, html);
}
