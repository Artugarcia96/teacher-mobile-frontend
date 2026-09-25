#!/usr/bin/env node
// Capture screenshots of app routes as the demo teacher, phone (390×844 @2x) and desktop (1440×900).
// Usage: node e2e/shoot.mjs <outDir> /hoy /clases "/clases/<id>/cuaderno" …
//   env: APP=http://127.0.0.1:5173  API=http://127.0.0.1:8000  ONLY=mobile|desktop  WAIT=1200
//   A route can include actions after "::", e.g. "/hoy::click=text=Pasar lista" (Playwright selector);
//   several are run in order: "/ruta::click=text=Recoger::click=.page-thumb" (also scroll=<selector>,
//   fill=<selector>|<text> and wait=<ms>).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const [out = 'e2e/screenshots/adhoc', ...routes] = process.argv.slice(2);
const APP = process.env.APP || 'http://127.0.0.1:5173';
const API = process.env.API || 'http://127.0.0.1:8000';
const WAIT = Number(process.env.WAIT || 1200);
mkdirSync(out, { recursive: true });

const res = await fetch(`${API}/api/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: process.env.EMAIL || 'demo@sepia.es', password: process.env.PASSWORD || 'sepia1234' }),
});
if (!res.ok) { console.error('Login failed — is the backend running with the demo seed? (scripts/dev.sh --demo)'); process.exit(1); }
const tok = await res.json();

const viewports = [['mobile', { width: 390, height: 844 }, 2], ['desktop', { width: 1440, height: 900 }, 1]]
  .filter(([n]) => !process.env.ONLY || process.env.ONLY === n);
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
for (const [name, viewport, dpr] of viewports) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dpr, locale: 'es-ES' });
  await ctx.addInitScript((t) => localStorage.setItem('sepia.tokens', JSON.stringify(t)), { access_token: tok.access_token, refresh_token: tok.refresh_token });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${name}] PAGEERROR ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && console.log(`[${name}] console.error ${m.text()}`));
  let i = 0;
  for (const spec of routes) {
    const [path, ...actions] = spec.split('::');
    await page.goto(APP + path);
    await page.waitForTimeout(WAIT);
    for (const action of actions) {
      if (action.startsWith('click=')) { await page.locator(action.slice(6)).first().click(); await page.waitForTimeout(WAIT); }
      if (action.startsWith('scroll=')) { await page.locator(action.slice(7)).first().scrollIntoViewIfNeeded(); await page.waitForTimeout(WAIT); }
      if (action.startsWith('fill=')) {
        const [sel, ...text] = action.slice(5).split('|');
        await page.locator(sel).first().fill(text.join('|')); await page.waitForTimeout(WAIT);
      }
      if (action.startsWith('wait=')) await page.waitForTimeout(Number(action.slice(5)));
    }
    const file = `${out}/${name}-${String(i++).padStart(2, '0')}-${path.replace(/[^a-z0-9]+/gi, '_').slice(1, 50) || 'root'}.png`;
    await page.screenshot({ path: file, fullPage: process.env.FULL === '1' });
    console.log(file);
  }
  await ctx.close();
}
await browser.close();
