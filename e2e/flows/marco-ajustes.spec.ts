import { actionBar, API, backButton, bug, expect, FRI, heading, isDesktop, sheetInHistory, shot, test, toast } from './marco.helpers';
import type { Page } from '@playwright/test';

// Marco · Ajustes: perfil (nombre, centro, comunidad autónoma), la cuenta, el curso escolar (evaluaciones y festivos)
// con un solo borrador y la barra «Sin guardar · Descartar · Guardar cambios», la apariencia del dispositivo, la línea
// de la IA, las sugerencias y cerrar sesión. Everything that saves runs as a teacher registered for that test.
// Holidays added, edited and removed in place are in e2e/settings.spec.ts. No AI.

async function openSettings(page: Page) {
  await page.goto('/ajustes');
  await expect(heading(page, 'Ajustes')).toBeVisible();
  await expect(page.getByLabel('Nombre', { exact: true })).not.toHaveValue('');
}

const save = async (page: Page) => {
  await actionBar(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(toast(page, 'Cambios guardados')).toBeVisible();
  await expect(actionBar(page)).toHaveCount(0);
};

test('marco-20 · Ajustes muestra perfil, cuenta, curso escolar, festivos, apariencia, sugerencias y cerrar sesión', async ({ page, demo }, info) => {
  const me = await demo.get('/me');
  await openSettings(page);
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(me.teacher.name);
  await expect(page.getByLabel('Centro')).toHaveValue(me.teacher.school);
  await expect(page.getByLabel('Comunidad autónoma')).toHaveValue(me.teacher.region);
  await expect(page.getByLabel('Comunidad autónoma').locator('option:checked')).toHaveText(me.region.name);
  await expect(page.locator('.row', { hasText: 'Cuenta' })).toContainText(me.teacher.email);

  // The school year: its three evaluaciones with dates in Spanish; its name is not typed anywhere.
  for (const [label, start, end] of [['1.ª evaluación', '8 sept 2026', '22 dic 2026'], ['2.ª evaluación', '8 ene 2027', '18 mar 2027'],
    ['3.ª evaluación', '30 mar 2027', '19 jun 2027']]) {
    const range = page.locator('.set-range', { hasText: label });
    await expect(range).toContainText(start);
    await expect(range).toContainText(end);
  }
  await expect(page.getByRole('button', { name: 'Editar Fiesta Nacional' })).toContainText('12 oct');
  await expect(page.getByRole('button', { name: 'Editar Navidad' })).toContainText('23 dic – 7 ene');
  await expect(page.getByRole('button', { name: 'Añadir festivo' })).toBeVisible();

  await expect(page.getByRole('group', { name: 'Tema' }).getByRole('button', { name: 'Sistema' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('textbox', { name: 'Sugerencia' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();

  // With the AI working nothing is said about it, and the AI's use and cost are not the teacher's business.
  await expect(page.getByText('IA no configurada en este servidor')).toHaveCount(0);
  await expect(page.getByText(/coste|uso de la IA|€|\$/i)).toHaveCount(0);
  await expect(actionBar(page)).toHaveCount(0);
  await shot(page, info, 'ajustes');
});

test.describe('ajustes · perfil', () => {
  test.use({ teacherSpec: { name: 'Elena Prieto Sanz', school: 'IES Miguel Delibes' } });

  test('marco-21 · nombre, centro y comunidad se guardan juntos y se ven en toda la app', async ({ page, teacher }, info) => {
    await openSettings(page);
    await expect(page.getByLabel('Comunidad autónoma')).toHaveValue('');
    const regions = await teacher.api.get<{ code: string; name: string }[]>('/regions');
    await expect(page.getByLabel('Comunidad autónoma').locator('option')).toHaveText(['Sin indicar', ...regions.map((r) => r.name)]);

    await page.getByLabel('Nombre', { exact: true }).fill('Elena Prieto');
    await expect(actionBar(page)).toContainText('Sin guardar');
    await page.getByLabel('Centro').fill('IES Rosa Chacel');
    await page.getByLabel('Comunidad autónoma').selectOption({ label: 'Andalucía' });
    await shot(page, info, 'ajustes-perfil-borrador');
    await save(page);

    const me = await teacher.api.get('/me');
    expect(me.teacher).toMatchObject({ name: 'Elena Prieto', school: 'IES Rosa Chacel', region: 'AN' });
    expect(me.region.name).toBe('Andalucía');
    if (isDesktop(info)) {
      const account = page.getByRole('complementary', { name: 'Navegación' }).locator('.side-me');
      await expect(account).toContainText('Elena Prieto');
      await expect(account).toContainText('IES Rosa Chacel');
    }
    await page.reload();
    await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Elena Prieto');
    await expect(page.getByLabel('Centro')).toHaveValue('IES Rosa Chacel');
    await expect(page.getByLabel('Comunidad autónoma')).toHaveValue('AN');

    // «Sin indicar» and an empty school are saved as nothing.
    await page.getByLabel('Comunidad autónoma').selectOption({ label: 'Sin indicar' });
    await page.getByLabel('Centro').fill('   ');
    await save(page);
    expect((await teacher.api.get('/me')).teacher).toMatchObject({ school: null, region: null });
    if (isDesktop(info)) await expect(page.locator('.side-me')).toContainText('Ajustes');
  });

  test('marco-22 · sin nombre no se puede guardar y lo dice; «Descartar» vuelve a lo guardado', async ({ page, teacher }) => {
    await openSettings(page);
    const name = page.getByLabel('Nombre', { exact: true });
    await name.fill('  ');
    await expect(page.getByText('Escribe tu nombre.', { exact: true })).toBeVisible();
    await expect(actionBar(page).getByRole('button', { name: 'Escribe tu nombre' })).toBeDisabled();
    await page.getByLabel('Centro').fill('IES Otro');

    await actionBar(page).getByRole('button', { name: 'Descartar' }).click();
    await expect(actionBar(page)).toHaveCount(0);
    await expect(name).toHaveValue('Elena Prieto Sanz');
    await expect(page.getByLabel('Centro')).toHaveValue('IES Miguel Delibes');
    expect((await teacher.api.get('/me')).teacher).toMatchObject({ name: 'Elena Prieto Sanz', school: 'IES Miguel Delibes' });
  });

  test('marco-23 · el borrador no se pierde cuando la app recarga los datos al volver a la pestaña', async ({ page, teacher }) => {
    await page.clock.install();
    await openSettings(page);
    await page.getByLabel('Centro').fill('IES Nuevo');
    // Meanwhile the name changes elsewhere (another device); the app reloads /me when the tab is shown again.
    await teacher.api.patch('/me', { name: 'Elena Cambiada' });
    await page.clock.fastForward('02:00');
    const reloaded = page.waitForResponse((r) => r.url().endsWith('/api/me') && r.request().method() === 'GET');
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange', { bubbles: true })));
    await reloaded;
    await expect(page.getByLabel('Centro')).toHaveValue('IES Nuevo');
    await expect(actionBar(page)).toContainText('Sin guardar');
    // Discarding shows what the server has now.
    await actionBar(page).getByRole('button', { name: 'Descartar' }).click();
    await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Elena Cambiada');
    await expect(page.getByLabel('Centro')).toHaveValue('IES Miguel Delibes');
  });

  test('marco-24 · un guardado que falla lo dice en la barra y conserva lo escrito; el siguiente guarda', async ({ page, teacher }) => {
    await openSettings(page);
    await page.getByLabel('Centro').fill('IES Rosa Chacel');
    await page.route('**/api/me', (route) => (route.request().method() === 'PATCH'
      ? route.fulfill({ status: 500, body: 'boom' }) : route.fallback()));
    await actionBar(page).getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(actionBar(page).getByRole('alert')).toHaveText('El servidor ha fallado. Inténtalo en un momento.');
    await expect(page.getByLabel('Centro')).toHaveValue('IES Rosa Chacel');
    await expect(actionBar(page).getByRole('button', { name: 'Guardar cambios' })).toBeEnabled();
    expect((await teacher.api.get('/me')).teacher.school).toBe('IES Miguel Delibes');

    await page.unroute('**/api/me');
    await save(page);
    expect((await teacher.api.get('/me')).teacher.school).toBe('IES Rosa Chacel');
  });
});

test.describe('ajustes · curso escolar', () => {
  test.use({ teacherSpec: {} });

  test('marco-25 · las fechas de una evaluación se guardan; si se solapan, el motivo sale en la barra sin perder nada', async ({ page, teacher }, info) => {
    await openSettings(page);
    const year = (await teacher.api.get('/me')).school_year;
    const [t1, t2] = year.terms;

    await page.getByLabel('1.ª evaluación: último día').fill('2026-12-18');
    await expect(page.locator('.set-range', { hasText: '1.ª evaluación' })).toContainText('18 dic 2026');
    await save(page);
    expect((await teacher.api.get('/me')).school_year.terms[0]).toMatchObject({ start: t1.start, end: '2026-12-18' });

    // The 2.ª starting before the 1.ª ends: the server says why, the bar keeps the draft.
    await page.getByLabel('2.ª evaluación: primer día').fill('2026-12-10');
    await actionBar(page).getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(actionBar(page).getByRole('alert')).toHaveText('Las evaluaciones no pueden solaparse.');
    await expect(page.locator('.set-range', { hasText: '2.ª evaluación' })).toContainText('10 dic 2026');
    await shot(page, info, 'ajustes-solapan');
    expect((await teacher.api.get('/me')).school_year.terms[1].start).toBe(t2.start);

    await page.getByLabel('2.ª evaluación: primer día').fill('2027-01-11');
    await save(page);
    expect((await teacher.api.get('/me')).school_year.terms[1]).toMatchObject({ start: '2027-01-11', end: t2.end });
    await page.reload();
    await expect(page.locator('.set-range', { hasText: '1.ª evaluación' })).toContainText('18 dic 2026');
    await expect(page.locator('.set-range', { hasText: '2.ª evaluación' })).toContainText('11 ene 2027');
  });
});

test.describe('ajustes · un festivo vacía ese día en Hoy', () => {
  test.use({ teacherSpec: { course: { slots: [{ weekday: FRI, start: '09:25', end: '10:20' }], students: ['Alonso Gil, Marta', 'Benítez Ruiz, Pablo'] } } });

  test('marco-26 · un festivo guardado en Ajustes quita la clase de ese día en Hoy al momento', async ({ page, teacher }, info) => {
    // BUG marco-B4: saving the school year only refreshes /me; Hoy keeps showing the class on the new holiday (and
    // the week, the next session of each class) from its cache until it is reloaded.
    bug('marco-B4', 'saving the school year does not refresh Hoy: the class still shows on the new holiday');
    const main = page.getByRole('main');
    await page.goto('/hoy?dia=2026-11-20');
    await expect(heading(page, 'Mañana')).toBeVisible();
    await expect(main.getByText('2.º ESO C · Mates').first()).toBeVisible();

    await page.getByRole('button', { name: 'Más acciones' }).click();
    await page.getByRole('menuitem', { name: 'Ajustes' }).click();
    await expect(heading(page, 'Ajustes')).toBeVisible();
    await page.getByRole('button', { name: 'Añadir festivo' }).click();
    const editor = page.locator('.set-holiday');
    await editor.getByLabel('Motivo').fill('Día del centro');
    await editor.getByLabel('Desde').fill('2026-11-20');
    await save(page);
    expect((await teacher.api.get('/me')).school_year.holidays).toContainEqual({ label: 'Día del centro', start: '2026-11-20', end: '2026-11-20' });

    await expect(backButton(page)).toHaveText('Mañana');
    await backButton(page).click();
    await expect(page).toHaveURL(/\/hoy\?dia=2026-11-20$/);
    await expect(page.getByText('Sin clases · Día del centro')).toBeVisible();
    await expect(main.getByText('2.º ESO C · Mates')).toHaveCount(0);
    await shot(page, info, 'ajustes-festivo-en-hoy');
  });
});

test('marco-27 · el tema claro, oscuro o del sistema se aplica al momento y se recuerda en el dispositivo', async ({ page }) => {
  const canvas = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const LIGHT = 'rgb(243, 241, 236)', DARK = 'rgb(14, 15, 17)';
  await page.emulateMedia({ colorScheme: 'light' });
  await openSettings(page);
  const theme = page.getByRole('group', { name: 'Tema' });
  await expect(theme.getByRole('button', { name: 'Sistema' })).toHaveAttribute('aria-pressed', 'true');
  expect(await canvas()).toBe(LIGHT);

  await theme.getByRole('button', { name: 'Oscuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(canvas).toBe(DARK);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(theme.getByRole('button', { name: 'Oscuro' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(canvas).toBe(DARK);
  // Also on the other screens (it is the device's, not the page's).
  await page.goto('/hoy');
  await expect(heading(page, 'Hoy')).toBeVisible();
  await expect.poll(canvas).toBe(DARK);

  await page.goto('/ajustes');
  await page.emulateMedia({ colorScheme: 'dark' });
  await theme.getByRole('button', { name: 'Claro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect.poll(canvas).toBe(LIGHT);

  await theme.getByRole('button', { name: 'Sistema' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
  await expect.poll(canvas).toBe(DARK);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(canvas).toBe(LIGHT);
  expect(await page.evaluate(() => localStorage.getItem('sepia.theme'))).toBeNull();
});

test('marco-28 · un servidor sin IA lo dice en Ajustes con una línea', async ({ page }, info) => {
  await page.route('**/api/me', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const r = await route.fetch();
    await route.fulfill({ response: r, json: { ...(await r.json()), ai_provider: 'none' } });
  });
  await openSettings(page);
  const line = page.locator('.row', { hasText: 'IA no configurada en este servidor' });
  await expect(line).toBeVisible();
  await expect(line).toContainText('Corregir con IA, crear materiales y redactar comentarios no están disponibles.');
  await shot(page, info, 'ajustes-sin-ia');
});

test.describe('ajustes · sugerencias', () => {
  test.use({ teacherSpec: {} });

  test('marco-29 · enviar una sugerencia: el botón dice qué falta, se envía y se vacía; si falla, lo escrito se queda', async ({ page }) => {
    await openSettings(page);
    const box = page.getByRole('textbox', { name: 'Sugerencia' });
    await expect(page.getByRole('button', { name: 'Escribe tu sugerencia' })).toBeDisabled();
    await box.fill('ab');
    await expect(page.getByRole('button', { name: 'Escribe tu sugerencia' })).toBeDisabled();

    // The server fails: the error stays until closed, and the text is still there.
    await box.fill('Echo en falta imprimir la lista de clase');
    await page.route('**/api/feedback', (route) => route.fulfill({ status: 500, body: 'boom' }));
    await page.getByRole('button', { name: 'Enviar sugerencia' }).click();
    const failed = toast(page, 'El servidor ha fallado. Inténtalo en un momento.');
    await expect(failed).toBeVisible();
    await expect(box).toHaveValue('Echo en falta imprimir la lista de clase');
    await page.unroute('**/api/feedback');

    const sent = page.waitForRequest((r) => r.url().endsWith('/api/feedback') && r.method() === 'POST');
    await page.getByRole('button', { name: 'Enviar sugerencia' }).click();
    const req = await sent;
    expect(req.postDataJSON()).toEqual({ text: 'Echo en falta imprimir la lista de clase' });
    expect((await req.response())!.status()).toBe(200);
    await expect(toast(page, 'Gracias. Leemos todas las sugerencias.')).toBeVisible();
    await expect(box).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Escribe tu sugerencia' })).toBeDisabled();
    await failed.getByRole('button', { name: 'Cerrar el aviso' }).click();
    await expect(failed).toHaveCount(0);
  });
});

test('marco-30 · cerrar sesión pide confirmación (Cancelar, Esc y atrás la cierran) y después no deja volver', async ({ page }, info) => {
  await page.goto('/hoy');
  await page.getByRole('button', { name: 'Más acciones' }).click();
  await page.getByRole('menuitem', { name: 'Ajustes' }).click();
  await expect(heading(page, 'Ajustes')).toBeVisible();
  const signOut = page.getByRole('button', { name: 'Cerrar sesión' });
  const ask = page.getByRole('dialog', { name: 'Cerrar sesión' });

  await signOut.click();
  await expect(ask).toContainText('Tendrás que volver a entrar con tu correo y contraseña.');
  await ask.getByRole('button', { name: 'Cancelar' }).click();
  await expect(ask).toBeHidden();

  await signOut.click();
  await expect(ask).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(ask).toBeHidden();
  await expect(page).toHaveURL(/\/ajustes$/);

  await signOut.click();
  await expect(ask).toBeVisible();
  await sheetInHistory(page);
  await page.goBack();
  await expect(ask).toBeHidden();
  await expect(page).toHaveURL(/\/ajustes$/);
  await expect(heading(page, 'Ajustes')).toBeVisible();

  await signOut.click();
  if (isDesktop(info)) {
    // On a computer the confirm button has the focus: Enter confirms.
    await expect(ask.getByRole('button', { name: 'Cerrar sesión' })).toBeFocused();
    await page.keyboard.press('Enter');
  } else {
    await ask.getByRole('button', { name: 'Cerrar sesión' }).click();
  }
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.getByLabel('Correo')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('sepia.tokens'))).toBeNull();
  // Back leads to Hoy, which is no longer open: it lands on /entrar again.
  await page.goBack();
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.getByLabel('Correo')).toBeVisible();
  await page.goto('/ajustes');
  await expect(page).toHaveURL(/\/entrar$/);
  // The demo login still works for the next tests: signing out only forgets the session on this device.
  expect((await page.request.post(`${API}/api/auth/login`, { data: { email: 'demo@sepia.es', password: 'sepia1234' } })).ok()).toBe(true);
});
