import { actionBar, demoIds, expect, heading, test, toast } from './marco.helpers';

// Marco · la red y el servidor: without connection a save fails at once and says so (nothing typed is lost), a screen
// that cannot load says why with «Reintentar», a server error is retried once in silence and a «not found» never.
// The hung connection (no answer in 20 s → «Reintentar») is in e2e/frame.spec.ts; an expired session going back to
// /entrar is in the acceso flows. No AI.

test.describe('red · sin conexión', () => {
  test.use({ teacherSpec: { school: 'IES Miguel Delibes' } });

  test('marco-60 · sin conexión, «Guardar cambios» falla al momento y lo dice; con conexión, guarda lo mismo', async ({ page, teacher }) => {
    await page.goto('/ajustes');
    await expect(page.getByLabel('Centro')).toHaveValue('IES Miguel Delibes');
    await page.getByLabel('Centro').fill('IES Rosa Chacel');
    await page.route('**/api/**', (route) => route.abort('internetdisconnected'));
    const started = Date.now();
    await actionBar(page).getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(actionBar(page).getByRole('alert')).toHaveText('Sin conexión con el servidor. Revisa tu conexión.');
    expect(Date.now() - started).toBeLessThan(5_000); // not a silent wait for the network
    await expect(page.getByLabel('Centro')).toHaveValue('IES Rosa Chacel');

    await page.unroute('**/api/**');
    await actionBar(page).getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(toast(page, 'Cambios guardados')).toBeVisible();
    expect((await teacher.api.get('/me')).teacher.school).toBe('IES Rosa Chacel');
  });
});

test('marco-61 · una pantalla que no carga por la conexión lo dice con «Reintentar», y al volver la conexión carga', async ({ page, demo }) => {
  const ids = await demoIds(demo);
  // The ficha of a student, opened while the connection is down.
  await page.route('**/api/students/**', (route) => route.abort('internetdisconnected'));
  await page.goto(`/alumnos/${ids.student.id}`);
  await expect(page.getByText('No se ha podido cargar la ficha', { exact: true })).toBeVisible();
  await expect(page.getByText('Sin conexión con el servidor. Revisa tu conexión.')).toBeVisible();
  await page.unroute('**/api/students/**');
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(heading(page, ids.student.name)).toBeVisible();

  // Evaluar, reached from the navigation with the connection down: the line says why, «Reintentar» loads it.
  await page.route('**/api/inbox', (route) => route.abort('internetdisconnected'));
  await page.goto('/evaluar');
  const line = page.locator('.callout', { hasText: 'No se ha podido cargar la bandeja.' });
  await expect(line).toContainText('Sin conexión con el servidor. Revisa tu conexión.');
  await page.unroute('**/api/inbox');
  await line.getByRole('button', { name: 'Reintentar' }).click();
  await expect(line).toHaveCount(0);
  await expect(page.getByText(/\d+ por revisar/).first()).toBeVisible();
});

test('marco-62 · un fallo del servidor se reintenta una vez en silencio y luego lo dice; un «no encontrado» no se reintenta', async ({ page, demo }) => {
  const ids = await demoIds(demo);
  const path = `**/api/students/${ids.student.id}`;
  let calls = 0;
  await page.route(path, (route) => { calls += 1; return route.fulfill({ status: 500, body: 'Internal Server Error' }); });
  await page.goto(`/alumnos/${ids.student.id}`);
  await expect(page.getByText('No se ha podido cargar la ficha', { exact: true })).toBeVisible();
  await expect(page.getByText('El servidor ha fallado. Inténtalo en un momento.')).toBeVisible();
  expect(calls).toBe(2);

  await page.unroute(path);
  calls = 0;
  await page.route(path, (route) => { calls += 1; return route.fulfill({ status: 404, json: { detail: { message: 'No se ha encontrado el alumno.', code: 'not_found' } } }); });
  await page.reload();
  await expect(page.getByText('No se ha encontrado el alumno', { exact: true })).toBeVisible();
  await page.waitForTimeout(1_500); // a retry would come within a second
  expect(calls).toBe(1);
});
