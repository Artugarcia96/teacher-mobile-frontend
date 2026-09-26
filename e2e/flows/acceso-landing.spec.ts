import { expect, test, type Page } from '@playwright/test';
import { shot, trackErrors } from '../helpers';
import { LOGGED_OUT } from './acceso.helpers';

// Acceso · landing: every way in from the public page (nginx serves it at "/" in production; Vite serves the same
// files at /landing/index.html in development), and its legal pages. No AI. Nobody is signed in.
test.use({ storageState: LOGGED_OUT });

const LANDING = '/landing/index.html';

/** Every <img> the browser was asked to show has loaded (lazy ones are scrolled into view first). */
async function expectImagesLoaded(page: Page) {
  const imgs = page.locator('img:visible');
  const n = await imgs.count();
  for (let i = 0; i < n; i++) {
    const img = imgs.nth(i);
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0),
      { message: `image ${await img.getAttribute('src')} loads` }).toBe(true);
  }
}

const PILOT = 'https://linktr.ee/sepiaeducation';

test('acceso-01 · la landing carga entera: titular, grabaciones reales y sin errores', async ({ page }, info) => {
  const errors = trackErrors(page);
  const broken: string[] = [];
  page.on('response', (r) => { if (r.status() >= 400) broken.push(`${r.status()} ${r.url()}`); });
  await page.goto(LANDING);
  await expect(page).toHaveTitle('Sepia · El cuaderno del profesor');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Que el montón de exámenes');
  // The call to action is on the first screen, on the phone too.
  await expect(page.getByRole('link', { name: 'Apúntate al piloto' }).first()).toBeInViewport();
  await expect(page.getByRole('banner').getByRole('link', { name: 'Entrar' })).toBeInViewport();
  for (const h of ['También con respuestas largas', 'Pasar lista desde el móvil', 'Un examen adaptado para cada alumno',
    'Refuerzo de lo que peor ha salido', 'Mensajes a las familias', 'Evaluaciones más llevaderas',
    'La última palabra es tuya', '¿Quieres probarlo?']) {
    await expect(page.getByRole('heading', { name: h })).toBeAttached();
  }
  await shot(page, info, 'acceso-01-landing');
  await expectImagesLoaded(page);
  expect(broken).toEqual([]);
  expect(errors).toEqual([]);
});

test('acceso-02 · «Apúntate al piloto» lleva a la página del piloto; «Ya tengo cuenta» abre /entrar', async ({ page }) => {
  await page.goto(LANDING);
  // Header, first screen and closing: the same page to ask to join (outside Sepia, so only its address is checked).
  const join = page.getByRole('link', { name: 'Apúntate al piloto' });
  await expect(join).toHaveCount(3);
  for (const link of await join.all()) await expect(link).toHaveAttribute('href', PILOT);

  const closing = page.getByRole('region', { name: '¿Quieres probarlo?' });
  await closing.getByRole('link', { name: 'Ya tengo cuenta' }).click();
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.getByLabel('Correo')).toBeVisible();
  await expect(page.getByLabel('Contraseña')).toBeVisible();
});

test('acceso-03 · «Entrar» de la cabecera abre /entrar para iniciar sesión', async ({ page }) => {
  await page.goto(LANDING);
  await page.getByRole('banner').getByRole('link', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.getByRole('group', { name: 'Acceso' }).getByRole('button', { name: 'Entrar' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Nombre')).toHaveCount(0);
  await expect(page.getByLabel('Correo')).toBeVisible();
  await expect(page.getByLabel('Contraseña')).toBeVisible();
});

test('acceso-04 · «Ver cómo funciona» baja a la primera grabación y «Saltar al contenido» funciona con el teclado', async ({ page }) => {
  await page.goto(LANDING);
  await page.getByRole('link', { name: 'Ver cómo funciona' }).click();
  await expect(page).toHaveURL(/#historia$/);
  await expect(page.getByRole('heading', { name: 'También con respuestas largas' })).toBeInViewport();

  await page.goto(LANDING);
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Saltar al contenido' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#contenido$/);
});

test('acceso-05 · privacidad y aviso legal: se abren desde la landing, enlazan entre sí y vuelven a entrar', async ({ page }) => {
  await page.goto(LANDING);
  await page.getByRole('contentinfo').getByRole('link', { name: 'Privacidad' }).click();
  await expect(page).toHaveURL(/\/landing\/privacidad\.html$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Privacidad' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Qué datos guarda' })).toBeVisible();

  await page.getByRole('contentinfo').getByRole('link', { name: 'Aviso legal' }).click();
  await expect(page).toHaveURL(/\/landing\/aviso-legal\.html$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Aviso legal' })).toBeVisible();
  await page.getByRole('main').getByRole('link', { name: 'política de privacidad' }).click();
  await expect(page).toHaveURL(/\/landing\/privacidad\.html$/);

  // From a legal page the teacher can still sign in.
  await page.getByRole('banner').getByRole('link', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/entrar$/);

  // The AI paragraph of the landing points to the same policy.
  await page.goto(LANDING);
  await page.getByRole('region', { name: 'La última palabra es tuya' }).getByRole('link', { name: 'Cómo tratamos los datos' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Privacidad' })).toBeVisible();
});

// BUG acceso-B05: the published legal pages still show the owner's to-do box («Pendiente del titular antes de
// publicar: …»): the teacher who reads the privacy policy before creating an account sees that it is unfinished.
test('acceso-06 · las páginas legales no muestran notas pendientes del titular', async ({ page }) => {
  test.fail(true, 'acceso-B05: privacidad.html y aviso-legal.html muestran «Pendiente del titular antes de publicar»');
  for (const path of ['/landing/privacidad.html', '/landing/aviso-legal.html']) {
    await page.goto(path);
    expect(await page.getByRole('main').innerText(), path).not.toContain('Pendiente del titular');
  }
});
