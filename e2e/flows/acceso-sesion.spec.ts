import { expect, test } from '@playwright/test';
import { shot, trackErrors } from '../helpers';
import { API, apiAs, FIRST_RENDER, forgeToken, LOGGED_OUT, openAs, putTokens, registerAccount, storedTokens } from './acceso.helpers';

// Acceso · la sesión caduca: el token de acceso dura 12 h y el de renovación 30 días. Con el primero caducado la app
// renueva sola (también a mitad de un guardado o de una subida con barra de progreso) y el profesor no nota nada; con
// los dos caducados vuelve a /entrar. No AI. Each test registers its own teacher.
test.use({ storageState: LOGGED_OUT });

test('acceso-50 · con el acceso caducado la app renueva la sesión sola y sigue en la misma pantalla', async ({ page, request }, info) => {
  const errors = trackErrors(page);
  const acc = await registerAccount(request, info, 'renueva');
  const expired = forgeToken(acc.id, 'access', -60);
  expect((await request.get(`${API}/api/me`, { headers: { Authorization: `Bearer ${expired}` } })).status()).toBe(401);

  const refreshes: string[] = [];
  const unauthorized: string[] = [];
  page.on('request', (r) => { if (r.url().endsWith('/api/auth/refresh')) refreshes.push(r.url()); });
  page.on('response', (r) => { if (r.status() === 401 && !r.url().includes('/auth/')) unauthorized.push(r.url()); });
  await openAs(page, { access_token: expired, refresh_token: acc.refresh_token }, '/clases');
  await expect(page).toHaveURL(/\/clases$/);
  await expect(page.getByText('Crea tu primera clase')).toBeVisible();
  // Several requests of the screen were refused together; the app renewed (never more than once per refusal) and
  // sent each of them again.
  expect(unauthorized.length).toBeGreaterThan(1);
  expect(refreshes.length).toBeGreaterThanOrEqual(1);
  expect(refreshes.length).toBeLessThanOrEqual(unauthorized.length);

  const tokens = await storedTokens(page);
  expect(tokens?.access_token).not.toBe(expired);
  expect((await request.get(`${API}/api/me`, { headers: { Authorization: `Bearer ${tokens!.access_token}` } })).ok()).toBe(true);
  expect(errors).toEqual([]);
});

test('acceso-51 · con las dos sesiones caducadas la app vuelve a /entrar y se entra de nuevo', async ({ page, request }, info) => {
  const errors = trackErrors(page);
  const acc = await registerAccount(request, info, 'caduca');
  await openAs(page, { access_token: forgeToken(acc.id, 'access', -60), refresh_token: forgeToken(acc.id, 'refresh', -60) }, '/clases');
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.getByLabel('Correo')).toBeVisible();
  expect(await storedTokens(page)).toBeNull();
  await shot(page, info, 'acceso-51-expired');

  await page.getByLabel('Correo').fill(acc.email);
  await page.getByLabel('Contraseña').fill(acc.password);
  await page.locator('form').getByRole('button', { name: 'Entrar' }).click();
  // Back in the app (whether it returns to Clases is acceso-17).
  await expect(page).toHaveURL(/\/(hoy|clases)$/);
  expect(await storedTokens(page)).not.toBeNull();
  expect(errors).toEqual([]);
});

test('acceso-52 · un token manipulado o de otro tipo no abre la app', async ({ page, request }, info) => {
  const acc = await registerAccount(request, info, 'manipulado');
  // The refresh token used as an access token, and an access token used to renew: both refused.
  expect((await request.get(`${API}/api/me`, { headers: { Authorization: `Bearer ${acc.refresh_token}` } })).status()).toBe(401);
  expect((await request.post(`${API}/api/auth/refresh`, { data: { refresh_token: acc.access_token } })).status()).toBe(401);

  await openAs(page, { access_token: `${acc.access_token}x`, refresh_token: acc.access_token }, '/hoy');
  await expect(page).toHaveURL(/\/entrar$/);
  expect(await storedTokens(page)).toBeNull();
});

test('acceso-53 · la sesión caduca con Ajustes abierto: «Guardar cambios» renueva y guarda lo escrito', async ({ page, request }, info) => {
  const errors = trackErrors(page);
  const acc = await registerAccount(request, info, 'guardar');
  await openAs(page, acc, '/ajustes');
  await expect(page.getByLabel('Centro')).toBeVisible(FIRST_RENDER);
  await page.getByLabel('Centro').fill('IES Ribera del Tajo');

  // Twelve hours later the access token has expired; the refresh token is still good.
  await putTokens(page, { access_token: forgeToken(acc.id, 'access', -60), refresh_token: acc.refresh_token });
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Cambios guardados').last()).toBeVisible();
  await expect(page).toHaveURL(/\/ajustes$/);
  const me = await apiAs(request, acc.access_token).get('/me');
  expect(me.teacher.school).toBe('IES Ribera del Tajo');
  expect(errors).toEqual([]);
});

test('acceso-54 · la sesión caduca del todo con la app abierta: la siguiente acción lleva a /entrar', async ({ page, request }, info) => {
  const errors = trackErrors(page);
  const acc = await registerAccount(request, info, 'fuera');
  await openAs(page, acc, '/ajustes');
  await expect(page.getByLabel('Centro')).toBeVisible(FIRST_RENDER);
  await page.getByLabel('Centro').fill('IES Ribera del Tajo');
  await putTokens(page, { access_token: forgeToken(acc.id, 'access', -60), refresh_token: forgeToken(acc.id, 'refresh', -60) });
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page).toHaveURL(/\/entrar$/);
  expect(await storedTokens(page)).toBeNull();
  const me = await apiAs(request, acc.access_token).get('/me');
  expect(me.teacher.school).toBeNull();
  expect(errors).toEqual([]);
});

test('acceso-55 · una subida con barra de progreso también renueva la sesión y sube el archivo', async ({ page, request }, info) => {
  const errors = trackErrors(page);
  const acc = await registerAccount(request, info, 'subida');
  const api = apiAs(request, acc.access_token);
  const course = await api.post('/courses', {
    subject: 'Matemáticas', short: 'Mates', color: 'teal', room: '204', schedule: [], new_group: { name: '2º ESO B', stage: 'eso', level: 2 },
  });
  const unit = await api.post(`/courses/${course.id}/units`, { title: 'Fracciones', term: 1 });
  await openAs(page, { access_token: forgeToken(acc.id, 'access', -60), refresh_token: acc.refresh_token }, `/clases/${course.id}/unidades/${unit.id}`);
  await expect(page.getByText('Aún no hay materiales en esta unidad')).toBeVisible(FIRST_RENDER);

  // Expire the access token again right before the upload, so the upload itself (XMLHttpRequest) meets the 401.
  const renewed = await storedTokens(page);
  expect(renewed?.access_token).toBeTruthy();
  await putTokens(page, { access_token: forgeToken(acc.id, 'access', -60), refresh_token: renewed!.refresh_token });
  const uploads: number[] = [];
  page.on('response', (r) => { if (r.request().method() === 'POST' && r.url().endsWith(`/units/${unit.id}/materials`)) uploads.push(r.status()); });
  const chooser = page.waitForEvent('filechooser');
  if (info.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Añadir material' }).click();
    await page.getByRole('menuitem', { name: 'Subir archivos' }).click();
  } else {
    await page.getByRole('button', { name: 'Subir archivos' }).first().click();
  }
  await (await chooser).setFiles({ name: 'resumen-fracciones.txt', mimeType: 'text/plain', buffer: Buffer.from('Fracciones equivalentes: 1/2 = 2/4.') });
  await expect(page.getByText('Archivo subido')).toBeVisible();
  expect(uploads).toEqual([401, 200]); // refused with the old token, sent again with the renewed one
  await expect(page.getByText('resumen-fracciones', { exact: false }).first()).toBeVisible();
  const materials: { title: string }[] = (await api.get(`/units/${unit.id}`)).materials;
  expect(materials.map((m) => m.title).join(' ')).toContain('resumen-fracciones');
  expect(errors).toEqual([]);
});
