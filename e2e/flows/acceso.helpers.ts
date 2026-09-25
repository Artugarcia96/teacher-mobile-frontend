import { expect, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { chmodSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

// Helpers for the «acceso» flows: accounts made through the API, sessions put in the browser as the app keeps them,
// tokens that have expired, and a second API with closed sign-up.

export const API = process.env.API || 'http://127.0.0.1:8000';
/** A browser with nobody signed in (the config signs every test in as the demo teacher). */
export const LOGGED_OUT = { cookies: [], origins: [] };
export const DEMO = { email: 'demo@sepia.es', password: 'sepia1234' };
/** First render of a screen that is loaded on demand (Ajustes, Evaluar, a unit…): under the dev server and a busy
 *  machine its code can take longer than an assertion's 5 s to arrive. */
export const FIRST_RENDER = { timeout: 15_000 };
const TOKENS_KEY = 'sepia.tokens';

export interface Account {
  id: string;
  name: string;
  email: string;
  password: string;
  access_token: string;
  refresh_token: string;
}

/** Unique per run and per project, so phone and desktop never share an account and a rerun needs no cleanup. */
export function uniqueEmail(info: TestInfo, tag: string): string {
  const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  return `e2e-${tag}-${info.project.name}-${stamp}@centro.es`;
}

/** A brand-new teacher, registered through the API (the registration UI has its own spec). */
export async function registerAccount(request: APIRequestContext, info: TestInfo, tag: string, name = 'Marta Ruiz Ortega'): Promise<Account> {
  const email = uniqueEmail(info, tag);
  const password = 'clave-segura-1';
  const r = await request.post(`${API}/api/auth/register`, { data: { name, email, password } });
  expect(r.ok(), `register ${email}: ${r.status()} ${await r.text()}`).toBeTruthy();
  const t = await r.json();
  return { id: t.teacher.id, name, email, password, access_token: t.access_token, refresh_token: t.refresh_token };
}

export async function loginAccount(request: APIRequestContext, email: string, password: string) {
  const r = await request.post(`${API}/api/auth/login`, { data: { email, password } });
  expect(r.ok(), `login ${email}: ${r.status()}`).toBeTruthy();
  return r.json() as Promise<{ access_token: string; refresh_token: string; teacher: { id: string; name: string } }>;
}

/** JSON calls to the API as one teacher (to check what was saved, or to prepare what a flow does not cover). */
export function apiAs(request: APIRequestContext, token: string) {
  const headers = { Authorization: `Bearer ${token}` };
  const ok = async (r: Awaited<ReturnType<APIRequestContext['get']>>, what: string) => {
    expect(r.ok(), `${what}: ${r.status()} ${await r.text()}`).toBeTruthy();
    return r.status() === 204 ? undefined : r.json();
  };
  return {
    get: async (path: string) => ok(await request.get(`${API}/api${path}`, { headers }), `GET ${path}`),
    post: async (path: string, data: unknown) => ok(await request.post(`${API}/api${path}`, { headers, data }), `POST ${path}`),
    patch: async (path: string, data: unknown) => ok(await request.patch(`${API}/api${path}`, { headers, data }), `PATCH ${path}`),
    put: async (path: string, data: unknown) => ok(await request.put(`${API}/api${path}`, { headers, data }), `PUT ${path}`),
  };
}

/** Replace the session the browser holds, as the app stores it after «Entrar» (the page keeps running). */
export async function putTokens(page: Page, tokens: { access_token: string; refresh_token: string }) {
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [TOKENS_KEY, JSON.stringify({
    access_token: tokens.access_token, refresh_token: tokens.refresh_token,
  })] as const);
}

/** Open `path` with this session in the browser. */
export async function openAs(page: Page, tokens: { access_token: string; refresh_token: string }, path: string) {
  await page.goto('/entrar');
  await putTokens(page, tokens);
  await page.goto(path);
}

export async function storedTokens(page: Page): Promise<{ access_token: string; refresh_token: string } | null> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), TOKENS_KEY);
  return raw ? JSON.parse(raw) : null;
}

/** A token signed as the API signs them (HS256, `sub` + `type` + `exp`). With the development key it is a real token
 *  that has expired; with another key the API rejects it the same way (401), so the flow under test is the same. */
export function forgeToken(sub: string, kind: 'access' | 'refresh', secondsFromNow: number): string {
  const secret = process.env.SEPIA_SECRET_KEY || 'dev-secret-change-me';
  const part = (x: object) => Buffer.from(JSON.stringify(x)).toString('base64url');
  const head = `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ sub, type: kind, exp: Math.floor(Date.now() / 1000) + secondsFromNow })}`;
  return `${head}.${createHmac('sha256', secret).update(head).digest('base64url')}`;
}

/** One of the three destinations, as the teacher taps it: the sidebar on desktop, the tab capsule on the phone. */
export async function goTo(page: Page, info: TestInfo, name: 'Hoy' | 'Clases' | 'Evaluar') {
  const nav = info.project.name === 'desktop'
    ? page.getByRole('complementary', { name: 'Navegación' })
    : page.getByRole('navigation', { name: 'Navegación' });
  await nav.getByRole('link', { name, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${name === 'Evaluar' ? 'evaluar' : name.toLowerCase()}$`));
}

/** Ajustes as a teacher reaches it: the sidebar on desktop, Hoy's «···» on the phone. */
export async function openSettings(page: Page, info: TestInfo, teacherName: string) {
  if (info.project.name === 'desktop') {
    await page.getByRole('complementary', { name: 'Navegación' }).getByRole('link', { name: new RegExp(teacherName) }).click();
  } else {
    await goTo(page, info, 'Hoy');
    await page.getByRole('button', { name: 'Más acciones' }).click();
    await page.getByRole('menuitem', { name: 'Ajustes' }).click();
  }
  await expect(page).toHaveURL(/\/ajustes$/);
  await expect(page.getByRole('heading', { name: 'Ajustes' }).first()).toBeVisible(FIRST_RENDER);
  await expect(page.getByLabel('Nombre')).toBeVisible();
}

// ── A second API with closed sign-up (SEPIA_SIGNUP_EMAILS) ──────────────────────────────────────────────────────

/** The backend checkout: BACKEND_DIR, or the sibling of the main frontend checkout (also from a git worktree). */
function backendDir(): string | null {
  if (process.env.BACKEND_DIR) return process.env.BACKEND_DIR;
  const candidates = [resolve(process.cwd(), '../teacher-mobile-backend')];
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
    candidates.push(resolve(dirname(common), '../teacher-mobile-backend'));
  } catch { /* not a git checkout */ }
  return candidates.find((d) => existsSync(join(d, 'app', 'main.py'))) ?? null;
}

/** Same choice of Python as the backend's scripts/dev.sh. */
function backendPython(dir: string): string {
  if (process.env.BACKEND_PYTHON) return process.env.BACKEND_PYTHON;
  const venv = join(dir, '.venv/bin/python');
  if (existsSync(venv)) return venv;
  if (existsSync('/home/user/.venv-backend/bin/python')) return '/home/user/.venv-backend/bin/python';
  return 'python3';
}

function freePort(): Promise<number> {
  return new Promise((ok, fail) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', fail);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => ok(port));
    });
  });
}

export interface ClosedApi { url: string; stop: () => void }

/** Start an empty API whose sign-up only admits `allowed` (its own temporary database). Null if there is no backend
 *  checkout next to this one. */
export async function startClosedSignupApi(allowed: string): Promise<ClosedApi | null> {
  const dir = backendDir();
  if (!dir) return null;
  const data = mkdtempSync(join(tmpdir(), 'sepia-e2e-closed-'));
  const port = await freePort();
  const child: ChildProcess = spawn(backendPython(dir), ['-m', 'uvicorn', 'app.main:app', '--port', String(port)], {
    cwd: dir,
    stdio: 'ignore',
    env: {
      ...process.env,
      SEPIA_DATA_DIR: data,
      SEPIA_DATABASE_URL: `sqlite+aiosqlite:///${data}/sepia.db`,
      SEPIA_SIGNUP_EMAILS: allowed,
      SEPIA_TODAY: '2026-11-19',
      SEPIA_NOW: '10:40',
    },
  });
  const url = `http://127.0.0.1:${port}`;
  const stop = () => {
    child.kill('SIGTERM');
    rmSync(data, { recursive: true, force: true });
  };
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${url}/api/health`)).ok) return { url, stop };
    } catch { /* still starting */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  stop();
  throw new Error(`The closed-sign-up API did not start on ${url}`);
}

/** Send every /api call of this page to another API (the page keeps its own origin; the app's own modules, such as
 *  /src/api/core.ts under Vite, are left alone). */
export async function routeApiTo(page: Page, apiUrl: string) {
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const u = new URL(route.request().url());
    const response = await route.fetch({ url: `${apiUrl}${u.pathname}${u.search}` });
    await route.fulfill({ response });
  });
}

// ── The site as production serves it: nginx with deploy/nginx.conf.template ────────────────────────────────────

export interface NginxSite { url: string; stop: () => void }

/** Build the app (vite build, no typecheck) and put the landing next to it as the deploy workflow packages the site
 *  (dist/ + landing/), then serve it with deploy/nginx.conf.template, its /api proxied to `apiUrl`. The template is used
 *  as it is, except what only the container decides: the port, the site folder and the API upstream. Null if there is
 *  no nginx on this machine. */
export async function startNginxSite(apiUrl: string): Promise<NginxSite | null> {
  const nginx = ['/usr/sbin/nginx', '/usr/local/sbin/nginx', '/usr/bin/nginx'].find((p) => existsSync(p));
  if (!nginx) return null;
  const dir = mkdtempSync(join(tmpdir(), 'sepia-e2e-nginx-'));
  chmodSync(dir, 0o755);
  const site = join(dir, 'site');
  execFileSync('npx', ['vite', 'build', '--outDir', site, '--emptyOutDir', '--logLevel', 'error'], { stdio: 'ignore' });
  cpSync('landing', join(site, 'landing'), { recursive: true });

  const port = await freePort();
  let server = readFileSync('deploy/nginx.conf.template', 'utf8');
  const swaps: [string, string][] = [
    ['listen 80;', `listen 127.0.0.1:${port};`],
    ['root /usr/share/nginx/html;', `root ${site};`],
    ['${SEPIA_API_UPSTREAM}', apiUrl],
  ];
  for (const [from, to] of swaps) {
    if (!server.includes(from)) throw new Error(`deploy/nginx.conf.template no longer has «${from}»: update startNginxSite`);
    server = server.replace(from, to);
  }
  writeFileSync(join(dir, 'server.conf'), server);
  const asRoot = process.getuid?.() === 0 ? 'user root;\n' : '';
  writeFileSync(join(dir, 'nginx.conf'), `${asRoot}worker_processes 1;
pid ${dir}/nginx.pid;
error_log ${dir}/error.log;
events { worker_connections 256; }
http {
  include /etc/nginx/mime.types;
  default_type application/octet-stream;
  access_log off;
  client_body_temp_path ${dir}/body;
  proxy_temp_path ${dir}/proxy;
  fastcgi_temp_path ${dir}/fastcgi;
  uwsgi_temp_path ${dir}/uwsgi;
  scgi_temp_path ${dir}/scgi;
  include ${dir}/server.conf;
}
`);
  const child = spawn(nginx, ['-p', dir, '-c', join(dir, 'nginx.conf'), '-g', 'daemon off;'], { stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}`;
  const stop = () => {
    child.kill('SIGTERM');
    rmSync(dir, { recursive: true, force: true });
  };
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`${url}/api/health`)).ok) return { url, stop };
    } catch { /* still starting */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  const log = existsSync(join(dir, 'error.log')) ? readFileSync(join(dir, 'error.log'), 'utf8') : '';
  stop();
  throw new Error(`nginx did not serve the site on ${url}\n${log}`);
}
