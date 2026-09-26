import { expect, test, type Page } from '@playwright/test';
import { shot, trackErrors } from '../helpers';
import {
  apiAs, DEMO, LOGGED_OUT, loginAccount, routeApiTo, startClosedSignupApi, uniqueEmail, type ClosedApi,
} from './acceso.helpers';

// Acceso · crear cuenta: validación, correo repetido, la cuenta nueva con su curso escolar por defecto, un servidor sin
// registro (solo «Entrar» y el enlace al piloto) y el registro cerrado a unos correos (SEPIA_SIGNUP_EMAILS). No AI.
// Nobody is signed in.
test.use({ storageState: LOGGED_OUT });

const PASSWORD = 'clave-segura-1';
const submit = (page: Page) => page.locator('form').getByRole('button', { name: 'Crear cuenta' });

async function fillSignup(page: Page, name: string, email: string, password: string) {
  await page.getByLabel('Nombre').fill(name);
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(password);
}

test('acceso-20 · crear cuenta: el botón espera a los tres campos y los errores se dicen antes de perder nada', async ({ page }, info) => {
  const errors = trackErrors(page);
  const signups: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/api/auth/register')) signups.push(r.postData() ?? ''); });
  await page.goto('/entrar?cuenta=nueva');
  await expect(submit(page)).toBeDisabled();
  await expect(page.getByLabel('Nombre')).toHaveAttribute('autocomplete', 'name');
  await expect(page.getByLabel('Contraseña')).toHaveAttribute('autocomplete', 'new-password');
  await page.getByLabel('Correo').fill(uniqueEmail(info, 'valida'));
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await expect(submit(page)).toBeDisabled(); // still no name
  await page.getByLabel('Nombre').fill('   ');
  await expect(submit(page)).toBeDisabled();

  // Short password: said on the spot, nothing sent.
  await fillSignup(page, 'Marta Ruiz Ortega', uniqueEmail(info, 'valida'), 'corta');
  await submit(page).click();
  await expect(page.getByRole('alert')).toHaveText('La contraseña debe tener al menos 8 caracteres.');
  expect(signups).toEqual([]);

  // Not an e-mail.
  await fillSignup(page, 'Marta Ruiz Ortega', 'marta@centro', PASSWORD);
  await submit(page).click();
  await expect(page.getByRole('alert')).toHaveText('Revisa el correo: no parece válido.');

  // An e-mail that already has an account (whatever its capitals).
  await page.getByLabel('Correo').fill(DEMO.email.toUpperCase());
  await submit(page).click();
  await expect(page.getByRole('alert')).toHaveText('Ya existe una cuenta con ese correo.');
  await expect(page).toHaveURL(/\/entrar\?cuenta=nueva$/);
  await expect(page.getByLabel('Nombre')).toHaveValue('Marta Ruiz Ortega');
  await shot(page, info, 'acceso-20-signup-error');
  expect(errors).toEqual([]);
});

test('acceso-21 · crear cuenta: la política de privacidad se abre aparte sin perder el formulario', async ({ page }) => {
  await page.goto('/entrar?cuenta=nueva');
  await page.getByLabel('Nombre').fill('Marta Ruiz Ortega');
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByRole('link', { name: 'política de privacidad' }).click()]);
  await expect(popup).toHaveURL(/\/landing\/privacidad\.html$/);
  await expect(popup.getByRole('heading', { level: 1, name: 'Privacidad' })).toBeVisible();
  await popup.close();
  await expect(page.getByLabel('Nombre')).toHaveValue('Marta Ruiz Ortega');
});

test('acceso-22 · crear cuenta abre «Nueva clase» y deja hecho el curso escolar de España', async ({ page, request }, info) => {
  const errors = trackErrors(page);
  const email = uniqueEmail(info, 'alta');
  await page.goto('/entrar');
  await page.getByRole('group', { name: 'Acceso' }).getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByText('Al menos 8 caracteres.')).toBeVisible();
  await fillSignup(page, '  Marta Ruiz Ortega ', `  ${email.replace('e2e-', 'E2E-')} `, PASSWORD);
  await page.getByLabel('Contraseña').press('Enter');

  await expect(page).toHaveURL(/\/clases\?nueva=1$/);
  const sheet = page.getByRole('dialog', { name: 'Nueva clase' });
  await expect(sheet).toBeVisible();
  await shot(page, info, 'acceso-22-new-account');

  // Saved: the account signs in with those details, the e-mail in lower case, the name without spaces around it.
  const t = await loginAccount(request, email, PASSWORD);
  const me = await apiAs(request, t.access_token).get('/me');
  expect(me.teacher).toMatchObject({ email, name: 'Marta Ruiz Ortega', school: null, region: null });
  expect(me.school_year.label).toBe('2026-2027');
  expect(me.school_year.terms).toEqual([
    { n: 1, start: '2026-09-08', end: '2026-12-22' },
    { n: 2, start: '2027-01-08', end: '2027-03-18' },
    { n: 3, start: '2027-03-30', end: '2027-06-19' },
  ]);
  expect(me.school_year.holidays.map((h: { label: string }) => h.label)).toEqual([
    'Fiesta Nacional', 'Todos los Santos', 'Constitución e Inmaculada', 'Navidad', 'Semana Santa', 'Día del Trabajo',
  ]);

  // Closing the sheet leaves the empty Clases with its three steps; Hoy already knows the term.
  await sheet.getByRole('button', { name: 'Cerrar' }).click();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/clases$/);
  await expect(page.getByText('Crea tu primera clase')).toBeVisible();
  await expect(page.getByText('Pega la lista de alumnos.')).toBeVisible();
  await page.goto('/hoy');
  await expect(page.getByText('1.ª evaluación, semana 11')).toBeVisible();
  expect(errors).toEqual([]);
});

test('acceso-23b · un servidor sin registro solo ofrece «Entrar» y lleva a quien no tiene cuenta al piloto', async ({ page }) => {
  const errors = trackErrors(page);
  // What GET /auth/signup says in production with SEPIA_SIGNUP_EMAILS empty.
  await page.route((url) => url.pathname === '/api/auth/signup', (route) => route.fulfill({ json: { open: false } }));
  await page.goto('/entrar?cuenta=nueva');
  await expect(page.getByRole('link', { name: 'Apúntate al piloto' })).toHaveAttribute('href', 'https://linktr.ee/sepiaeducation');
  await expect(page.getByRole('group', { name: 'Acceso' })).toHaveCount(0);
  await expect(page.getByLabel('Nombre')).toHaveCount(0);
  await expect(submit(page)).toHaveCount(0);
  await expect(page.locator('form').getByRole('button', { name: 'Entrar' })).toBeVisible();
  expect(errors).toEqual([]);
});

test.describe('registro cerrado (SEPIA_SIGNUP_EMAILS)', () => {
  const INVITED = 'invitada@centro.es';
  let closed: ClosedApi | null = null;
  test.beforeAll(async () => { closed = await startClosedSignupApi(INVITED); });
  test.afterAll(() => closed?.stop());

  test('acceso-23 · solo los correos invitados pueden crear cuenta; el resto lo sabe', async ({ page }, info) => {
    test.skip(!closed, 'No backend checkout next to this one (set BACKEND_DIR) to start an API with closed sign-up');
    const errors = trackErrors(page);
    await routeApiTo(page, closed!.url);
    await page.goto('/entrar?cuenta=nueva');
    await fillSignup(page, 'Pablo Gil Navarro', 'pablo.gil@centro.es', PASSWORD);
    await submit(page).click();
    await expect(page.getByRole('alert')).toHaveText('El registro está cerrado en este servidor.');
    await expect(page).toHaveURL(/\/entrar\?cuenta=nueva$/);
    await shot(page, info, 'acceso-23-signup-closed');

    // The invited address gets in (capitals do not matter) and the app works against that server.
    await page.getByLabel('Correo').fill('Invitada@Centro.es');
    await submit(page).click();
    await expect(page).toHaveURL(/\/clases\?nueva=1$/);
    await expect(page.getByRole('dialog', { name: 'Nueva clase' })).toBeVisible();
    const r = await fetch(`${closed!.url}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: INVITED, password: PASSWORD }),
    });
    expect(r.ok).toBe(true);
    expect(errors).toEqual([]);
  });
});
