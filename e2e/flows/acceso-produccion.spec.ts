import { expect, test } from '@playwright/test';
import { trackErrors } from '../helpers';
import { API, DEMO, LOGGED_OUT, startNginxSite, type NginxSite } from './acceso.helpers';

// Acceso · la web como la sirve producción: nginx con deploy/nginx.conf.template delante del build de la app y de la
// landing (lo que empaqueta el workflow de despliegue), con /api hacia la API de pruebas. The dev server serves the
// landing at /landing/index.html and the app at "/"; here "/" is the landing and every other path is the app. No AI.
test.use({ storageState: LOGGED_OUT });
test.describe.configure({ mode: 'serial' });

let site: NginxSite | null = null;

test.beforeAll(async () => {
  test.setTimeout(180_000); // one production build
  site = await startNginxSite(API);
});
test.afterAll(() => site?.stop());
test.beforeEach(() => { test.skip(!site, 'nginx is not installed on this machine'); });

const at = (path: string) => `${site!.url}${path}`;

test('acceso-62 · «/» es la landing; «Entrar» abre la app, que entra por el /api de nginx y se queda en sus rutas', async ({ page }) => {
  const errors = trackErrors(page);
  const broken: string[] = [];
  page.on('response', (r) => { if (r.status() >= 400) broken.push(`${r.status()} ${r.url()}`); });

  const landing = await page.goto(at('/'));
  expect(landing?.headers()['cache-control']).toBe('no-cache');
  await expect(page).toHaveTitle('Sepia · El cuaderno del profesor');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Lista, notas y');
  // The brand of the landing stays on the landing.
  await page.getByRole('banner').getByRole('link', { name: 'Sepia, inicio' }).click();
  await expect(page).toHaveURL(at('/'));
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Lista, notas y');

  await page.getByRole('banner').getByRole('link', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(at('/entrar'));
  await page.getByLabel('Correo').fill(DEMO.email);
  await page.getByLabel('Contraseña').fill(DEMO.password);
  await page.locator('form').getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(at('/hoy'));
  await expect(page.getByRole('heading', { name: 'Agenda' })).toBeVisible();

  // A deep link reloaded is still the app (try_files → index.html), signed in.
  await page.goto(at('/clases'));
  await expect(page.getByRole('searchbox', { name: 'Buscar alumno o clase' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('searchbox', { name: 'Buscar alumno o clase' })).toBeVisible();
  await page.goto(at('/otra-cosa'));
  await expect(page).toHaveURL(at('/hoy'));
  expect(broken).toEqual([]);
  expect(errors).toEqual([]);
});

test('acceso-62b · sin sesión, una ruta de la app lleva a /entrar, y desde la landing se llega al alta', async ({ page }) => {
  await page.goto(at('/clases/no-existe/cuaderno'));
  await expect(page).toHaveURL(at('/entrar'));
  await expect(page.getByLabel('Correo')).toBeVisible();

  await page.goto(at('/'));
  await page.getByRole('banner').getByRole('link', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(at('/entrar'));
  await page.getByRole('group', { name: 'Acceso' }).getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByLabel('Nombre')).toBeVisible();
  // The sign-up's privacy link opens the landing's page, not the app.
  const [policy] = await Promise.all([page.waitForEvent('popup'), page.getByRole('link', { name: 'política de privacidad' }).click()]);
  await expect(policy).toHaveURL(at('/landing/privacidad.html'));
  await expect(policy.getByRole('heading', { level: 1, name: 'Privacidad' })).toBeVisible();
});

test('acceso-62c · la landing entera carga desde nginx: estilos, fuentes, imágenes y páginas legales', async ({ page }) => {
  const broken: string[] = [];
  page.on('response', (r) => { if (r.status() >= 400) broken.push(`${r.status()} ${r.url()}`); });
  await page.goto(at('/'));
  const imgs = page.locator('img:visible');
  for (let i = 0; i < await imgs.count(); i++) {
    const img = imgs.nth(i);
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0),
      { message: `image ${await img.getAttribute('src')} loads` }).toBe(true);
  }
  await page.getByRole('contentinfo').getByRole('link', { name: 'Aviso legal' }).click();
  await expect(page).toHaveURL(at('/landing/aviso-legal.html'));
  await expect(page.getByRole('heading', { level: 1, name: 'Aviso legal' })).toBeVisible();
  expect(broken).toEqual([]);
});

test('acceso-62d · caché y rutas de nginx: la app nunca se queda vieja, los bundles son inmutables y lo que falta es 404', async ({ request }) => {
  const app = await request.get(at('/hoy'));
  expect(app.status()).toBe(200);
  expect(app.headers()['cache-control']).toBe('no-store');
  const html = await app.text();
  expect(html).toContain('id="root"');
  const bundle = html.match(/\/assets\/index-[A-Za-z0-9_-]{8}\.js/)?.[0];
  expect(bundle, 'index.html cites its hashed bundle').toBeTruthy();
  const js = await request.get(at(bundle!));
  expect(js.status()).toBe(200);
  expect(js.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
  expect(js.headers()['content-type']).toContain('javascript');

  // Files copied as they are from public/assets are cached for an hour only; the landing's files too.
  const icon = await request.get(at('/assets/icon/squid.svg'));
  expect(icon.status()).toBe(200);
  expect(icon.headers()['cache-control']).toBe('public, max-age=3600');
  expect((await request.get(at('/landing/landing.css'))).headers()['cache-control']).toBe('public, max-age=3600');
  expect((await request.get(at('/manifest.json'))).status()).toBe(200);

  // What does not exist under /assets/ or /landing/ is a 404, not the app answering 200.
  expect((await request.get(at('/assets/index-00000000.js'))).status()).toBe(404);
  expect((await request.get(at('/landing/img/no-existe.png'))).status()).toBe(404);

  // /api goes to the API, prefix included: JSON, and the API's own 404.
  const health = await request.get(at('/api/health'));
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ ok: true });
  const missing = await request.get(at('/api/no-existe'));
  expect(missing.status()).toBe(404);
  expect(missing.headers()['content-type']).toContain('application/json');
  const me = await request.get(at('/api/me'));
  expect(me.status()).toBe(401);
});
