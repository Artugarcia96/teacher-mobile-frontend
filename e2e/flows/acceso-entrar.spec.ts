import { expect, test, type Page } from '@playwright/test';
import { shot, trackErrors } from '../helpers';
import { apiAs, DEMO, goTo, LOGGED_OUT, loginAccount, openAs, openSettings, registerAccount, storedTokens } from './acceso.helpers';

// Acceso · entrar y salir: /entrar (errores, sin conexión, Intro), la sesión que se recuerda, las rutas protegidas,
// cerrar sesión y entrar con otra cuenta. No AI. Every test starts with nobody signed in.
test.use({ storageState: LOGGED_OUT });

const form = (page: Page) => page.locator('form');
const submit = (page: Page, name: 'Entrar' | 'Crear cuenta' = 'Entrar') => form(page).getByRole('button', { name });
const mode = (page: Page, name: 'Entrar' | 'Crear cuenta') => page.getByRole('group', { name: 'Acceso' }).getByRole('button', { name });

async function signInWithForm(page: Page, email: string, password: string) {
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await submit(page).click();
}

test('acceso-10 · sin sesión, cualquier dirección de la app lleva a /entrar', async ({ page }) => {
  const errors = trackErrors(page);
  for (const path of ['/', '/hoy', '/clases', '/clases/no-existe/cuaderno', '/alumnos/no-existe', '/evaluar', '/ajustes', '/otra-cosa']) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/entrar$/);
    await expect(page.getByLabel('Correo')).toBeVisible();
  }
  await expect(mode(page, 'Entrar')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('acceso-11 · entrar: el botón espera a los dos campos y los errores se dicen sin perder lo escrito', async ({ page }, info) => {
  await page.goto('/entrar');
  await expect(submit(page)).toBeDisabled();
  await page.getByLabel('Correo').fill(DEMO.email);
  await expect(submit(page)).toBeDisabled();
  await page.getByLabel('Contraseña').fill('no-es-esta');
  await expect(submit(page)).toBeEnabled();
  await submit(page).click();
  await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos.');
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.getByLabel('Correo')).toHaveValue(DEMO.email);
  await expect(page.getByLabel('Contraseña')).toHaveValue('no-es-esta');
  await expect(submit(page)).toBeEnabled();
  await shot(page, info, 'acceso-11-login-error');

  // An account that does not exist gets the same answer (nobody learns which e-mails have an account).
  await signInWithForm(page, 'nadie-aqui@centro.es', 'no-es-esta');
  await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos.');

  // Not an e-mail at all.
  await signInWithForm(page, 'demo-sepia.es', DEMO.password);
  await expect(page.getByRole('alert')).toHaveText('Revisa el correo y la contraseña.');

  // Switching to «Crear cuenta» and back clears the message.
  await mode(page, 'Crear cuenta').click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await mode(page, 'Entrar').click();
  await expect(page.getByLabel('Nombre')).toHaveCount(0);
});

test('acceso-12 · entrar solo con el teclado (correo con mayúsculas y espacios) abre Hoy con los datos del profesor', async ({ page }, info) => {
  const errors = trackErrors(page);
  await page.goto('/entrar');
  // The browser's password manager can fill and save these fields.
  await expect(page.getByLabel('Correo')).toHaveAttribute('autocomplete', 'email');
  await expect(page.getByLabel('Contraseña')).toHaveAttribute('autocomplete', 'current-password');
  await page.getByLabel('Correo').focus();
  await page.keyboard.type('  Demo@Sepia.es ');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Contraseña')).toBeFocused();
  await page.keyboard.type(DEMO.password);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/hoy$/);
  await expect(page.getByRole('heading', { name: 'Hoy' }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Agenda' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pendiente' })).toBeVisible();
  if (info.project.name === 'desktop') {
    await expect(page.getByRole('complementary', { name: 'Navegación' }).getByText('Mis clases')).toBeVisible();
  } else {
    await expect(page.getByRole('navigation', { name: 'Navegación' }).getByRole('link', { name: 'Clases', exact: true })).toBeVisible();
  }
  const tokens = await storedTokens(page);
  expect(tokens?.access_token && tokens.refresh_token).toBeTruthy();
  await shot(page, info, 'acceso-12-hoy-after-login');
  expect(errors).toEqual([]);
});

test('acceso-13 · la sesión se recuerda: recargar, otra pestaña y /entrar siguen dentro', async ({ page, context, request }) => {
  const acc = await registerAccount(request, test.info(), 'recordar');
  await page.goto('/entrar');
  await signInWithForm(page, acc.email, acc.password);
  await expect(page).toHaveURL(/\/hoy$/);

  await page.reload();
  await expect(page).toHaveURL(/\/hoy$/);
  await expect(page.getByText('Aún no tienes clases')).toBeVisible();

  const tab = await context.newPage();
  await tab.goto('/clases');
  await expect(tab).toHaveURL(/\/clases$/);
  await expect(tab.getByText('Crea tu primera clase')).toBeVisible();
  await tab.close();

  // Already signed in: /entrar goes straight to Hoy; «/» and an unknown address too.
  for (const path of ['/entrar', '/', '/otra-cosa']) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/hoy$/);
  }
});

test('acceso-14 · cerrar sesión desde Ajustes: pide confirmación, sale a /entrar y no deja volver atrás', async ({ page, request }, info) => {
  const errors = trackErrors(page);
  const acc = await registerAccount(request, info, 'salir');
  await openAs(page, acc, '/hoy');
  await openSettings(page, info, acc.name);

  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  const ask = page.getByRole('dialog', { name: 'Cerrar sesión' });
  await expect(ask).toContainText('Tendrás que volver a entrar con tu correo y contraseña.');
  await shot(page, info, 'acceso-14-logout-confirm');
  await ask.getByRole('button', { name: 'Cancelar' }).click();
  await expect(ask).toBeHidden();
  await expect(page).toHaveURL(/\/ajustes$/);
  expect(await storedTokens(page)).not.toBeNull();

  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await ask.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.getByLabel('Correo')).toBeVisible();
  expect(await storedTokens(page)).toBeNull();

  // Back (the phone's gesture) and a bookmarked address both land on /entrar.
  await page.goBack();
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.getByLabel('Correo')).toBeVisible();
  await page.goto('/ajustes');
  await expect(page).toHaveURL(/\/entrar$/);
  expect(errors).toEqual([]);
});

test('acceso-15 · salir y entrar con otra cuenta no enseña nada de la anterior', async ({ page, request }, info) => {
  const acc = await registerAccount(request, info, 'otra', 'Lucía Serrano Gil');
  const demo = await loginAccount(request, DEMO.email, DEMO.password);
  const demoCourses: { subject: string }[] = await apiAs(request, demo.access_token).get('/courses');
  expect(demoCourses.length).toBeGreaterThan(0);

  await page.goto('/entrar');
  await signInWithForm(page, DEMO.email, DEMO.password);
  await expect(page).toHaveURL(/\/hoy$/);
  await goTo(page, info, 'Clases');
  await expect(page.getByRole('main').getByRole('link', { name: new RegExp(demoCourses[0].subject) }).first()).toBeVisible();

  await openSettings(page, info, demo.teacher.name);
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.getByRole('dialog', { name: 'Cerrar sesión' }).getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/entrar$/);

  await signInWithForm(page, acc.email, acc.password);
  await expect(page).toHaveURL(/\/hoy$/);
  await expect(page.getByText('Aún no tienes clases')).toBeVisible();
  await goTo(page, info, 'Clases');
  await expect(page.getByText('Crea tu primera clase')).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(demoCourses[0].subject) })).toHaveCount(0);
  if (info.project.name === 'desktop') {
    const side = page.getByRole('complementary', { name: 'Navegación' });
    await expect(side.getByText('Mis clases')).toHaveCount(0);
    await expect(side.getByRole('link', { name: /Lucía Serrano Gil/ })).toBeVisible();
  }
});

test('acceso-16 · sin conexión, entrar lo dice y se puede reintentar', async ({ page, context }) => {
  await page.goto('/entrar');
  await page.getByLabel('Correo').fill(DEMO.email);
  await page.getByLabel('Contraseña').fill(DEMO.password);
  await context.setOffline(true);
  await submit(page).click();
  await expect(page.getByRole('alert')).toHaveText('Sin conexión con el servidor. Revisa tu conexión.');
  await expect(page).toHaveURL(/\/entrar$/);
  await context.setOffline(false);
  await submit(page).click();
  await expect(page).toHaveURL(/\/hoy$/);
});

// BUG acceso-B01: a link into the app opened without a session (a bookmark, a shared link, the session expired)
// goes to /entrar and, after signing in, always to Hoy: the page the teacher asked for is lost.
test('acceso-17 · un enlace a una pantalla de la app vuelve a esa pantalla después de entrar', async ({ page, request }) => {
  test.fail(true, 'acceso-B01: RequireAuth no guarda la dirección pedida y LoginPage siempre navega a /hoy');
  const demo = await loginAccount(request, DEMO.email, DEMO.password);
  const [course]: { id: string }[] = await apiAs(request, demo.access_token).get('/courses');
  await page.goto(`/clases/${course.id}/alumnos`);
  await expect(page).toHaveURL(/\/entrar/);
  await signInWithForm(page, DEMO.email, DEMO.password);
  await expect(page).toHaveURL(new RegExp(`/clases/${course.id}/alumnos$`));
});
