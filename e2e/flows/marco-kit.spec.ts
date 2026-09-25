import { bug, demoIds, expect, heading, isDesktop, sheetInHistory, shot, test, toast } from './marco.helpers';

// Marco · el kit en el uso diario: avisos (los de éxito se van solos, los de error se quedan hasta cerrarlos), menús
// «···» (ratón, teclado, Esc, fuera y siempre dentro de la pantalla), hojas (✕, Esc, velo, atrás del móvil, una
// confirmación encima de otra hoja) y el buscador de escritorio («Buscar», «/» y Ctrl+K). Demo teacher, nothing saved
// (the sugerencia of marco-40 is sent as a teacher of its own). The one-toast rule for repeated words is in
// e2e/frame.spec.ts; back closing «Anotar» on Hoy is in e2e/sheets.spec.ts. No AI.

test.describe('kit · avisos', () => {
  test.use({ teacherSpec: {} });

  test('marco-40 · un aviso de éxito se va solo; uno de error se queda hasta cerrarlo con ✕', async ({ page }) => {
    await page.goto('/ajustes');
    const box = page.getByRole('textbox', { name: 'Sugerencia' });
    await box.fill('Un calendario de exámenes compartido con el departamento');
    await page.getByRole('button', { name: 'Enviar sugerencia' }).click();
    const ok = toast(page, 'Gracias. Leemos todas las sugerencias.');
    await expect(ok).toBeVisible();
    await expect(ok).toHaveCount(0, { timeout: 6_000 });

    await box.fill('Otra sugerencia que no llega');
    await page.route('**/api/feedback', (route) => route.abort('connectionrefused'));
    await page.getByRole('button', { name: 'Enviar sugerencia' }).click();
    const failed = toast(page, 'Sin conexión con el servidor. Revisa tu conexión.');
    await expect(failed).toBeVisible();
    await page.waitForTimeout(5_000); // longer than any success toast lives
    await expect(failed).toBeVisible();
    await failed.getByRole('button', { name: 'Cerrar el aviso' }).click();
    await expect(failed).toHaveCount(0);
    await expect(box).toHaveValue('Otra sugerencia que no llega');
  });
});

test('marco-41 · menú «···»: se abre, Esc lo cierra solo a él, un toque fuera también, y cada opción hace lo suyo', async ({ page }) => {
  await page.goto('/hoy');
  const trigger = page.getByRole('button', { name: 'Más acciones' });
  const menu = page.getByRole('menu');
  await trigger.click();
  await expect(menu.getByRole('menuitem')).toHaveText(['Añadir evento', 'Voy a faltar', 'Ajustes']);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(heading(page, 'Hoy')).toBeVisible();

  // A tap outside closes it and does nothing else.
  await trigger.click();
  await expect(menu).toBeVisible();
  await page.mouse.click(5, 300);
  await expect(menu).toHaveCount(0);
  await expect(page).toHaveURL(/\/hoy$/);

  // An option does its action and the menu goes (here «Añadir evento» opens its sheet); Esc then closes that sheet.
  await trigger.click();
  await menu.getByRole('menuitem', { name: 'Añadir evento' }).click();
  const sheet = page.getByRole('dialog', { name: 'Añadir evento' });
  await expect(sheet).toBeVisible();
  await expect(menu).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  // Resizing the window (turning the phone) closes an open menu instead of leaving it adrift.
  await trigger.click();
  await expect(menu).toBeVisible();
  const size = page.viewportSize()!;
  await page.setViewportSize({ width: size.width - 20, height: size.height });
  await expect(menu).toHaveCount(0);
  await page.setViewportSize(size);
});

test('marco-42 · menú «···» con el teclado: Intro lo abre, el foco entra en sus opciones y Esc lo devuelve al botón', async ({ page }, info) => {
  test.skip(!isDesktop(info), 'a keyboard is the computer\'s');
  // BUG marco-B1: the menu opens but the focus stays on «···»; Tab goes on through the page behind the open menu
  // and the arrows do nothing, so its options cannot be reached with the keyboard.
  bug('marco-B1', 'a menu opened with the keyboard keeps the focus on «···»: its options cannot be reached');
  await page.goto('/hoy');
  const trigger = page.getByRole('button', { name: 'Más acciones' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: 'Añadir evento' })).toBeFocused({ timeout: 2_000 });
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: 'Voy a faltar' })).toBeFocused({ timeout: 2_000 });
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(menu.getByRole('menuitem').first()).toBeFocused({ timeout: 2_000 });
});

test('marco-43 · el menú de la última fila se abre hacia arriba y cabe entero en la pantalla', async ({ page, demo }, info) => {
  const ids = await demoIds(demo);
  await page.goto(`/clases/${ids.course}/unidades/${ids.unit.id}`);
  await expect(heading(page, 'Fracciones')).toBeVisible();
  const triggers = page.getByRole('button', { name: /^Opciones de / });
  await expect(triggers.first()).toBeVisible();
  const last = triggers.last();
  await last.scrollIntoViewIfNeeded();
  // Put the row at the bottom edge of the screen.
  const vh = page.viewportSize()!.height;
  await page.evaluate(async ([y]) => {
    const btns = [...document.querySelectorAll('button[aria-label^="Opciones de "]')];
    const b = btns[btns.length - 1].getBoundingClientRect();
    window.scrollBy(0, b.bottom - y);
  }, [vh - 110]);
  await last.click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  const box = (await menu.boundingBox())!;
  const anchor = (await last.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(vh);
  expect(box.y + box.height).toBeLessThanOrEqual(anchor.y + 1); // above its button
  await shot(page, info, 'menu-arriba');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});

test('marco-44 · una hoja se cierra con ✕, Esc, el velo y atrás; con algo escrito, pregunta antes y Esc cierra solo la pregunta', async ({ page }, info) => {
  await page.goto('/hoy');
  const month = page.getByRole('dialog', { name: 'Ir a una fecha' });
  const open = () => page.getByRole('button', { name: 'Ir a una fecha' }).click();

  await open();
  await expect(month).toBeVisible();
  await month.getByRole('button', { name: 'Cerrar' }).click();
  await expect(month).toBeHidden();

  await open();
  await page.keyboard.press('Escape');
  await expect(month).toBeHidden();

  await open();
  await page.locator('.sheet-scrim').click({ position: { x: 10, y: 10 } });
  await expect(month).toBeHidden();

  await open();
  await sheetInHistory(page);
  await page.goBack();
  await expect(month).toBeHidden();
  await expect(page).toHaveURL(/\/hoy$/);
  await expect(heading(page, 'Hoy')).toBeVisible();

  // Something typed: the scrim does nothing; Esc asks; Esc again closes only the question, the text stays.
  await page.getByRole('button', { name: 'Anotar' }).first().click();
  const note = page.getByRole('dialog', { name: 'Anotar' });
  await note.getByRole('textbox', { name: 'Texto' }).fill('Ha traído el material de dibujo');
  await page.locator('.sheet-scrim').first().click({ position: { x: 10, y: 10 } });
  await expect(note).toBeVisible();
  await page.keyboard.press('Escape');
  const ask = page.getByRole('dialog', { name: 'Descartar los cambios' });
  await expect(ask).toBeVisible();
  await shot(page, info, 'hoja-descartar');
  await page.keyboard.press('Escape');
  await expect(ask).toBeHidden();
  await expect(note).toBeVisible();
  await expect(note.getByRole('textbox', { name: 'Texto' })).toHaveValue('Ha traído el material de dibujo');
  await note.getByRole('button', { name: 'Cerrar' }).click();
  await ask.getByRole('button', { name: 'Descartar' }).click();
  await expect(note).toBeHidden();
  await expect(ask).toBeHidden();
  await expect(page).toHaveURL(/\/hoy$/);
});

test('marco-45 · atrás del móvil en una pantalla profunda cierra la hoja de arriba, no la pantalla', async ({ page, demo }) => {
  const ids = await demoIds(demo);
  await page.goto(`/clases/${ids.course}/alumnos`);
  await page.getByRole('link', { name: /Domínguez Marín, Hugo/ }).first().click();
  await expect(heading(page, ids.student.name)).toBeVisible();
  const url = page.url();

  await page.getByRole('button', { name: 'Anotar', exact: true }).click();
  const note = page.getByRole('dialog', { name: 'Anotar' });
  await expect(note).toBeVisible();
  await sheetInHistory(page);
  await page.goBack();
  await expect(note).toBeHidden();
  expect(page.url()).toBe(url);
  await expect(heading(page, ids.student.name)).toBeVisible();

  // With text: back asks; back again (on the question) closes the question only.
  await page.getByRole('button', { name: 'Anotar', exact: true }).click();
  await note.getByRole('textbox', { name: 'Texto' }).fill('Pregunta por la recuperación');
  await sheetInHistory(page);
  await page.goBack();
  const ask = page.getByRole('dialog', { name: 'Descartar los cambios' });
  await expect(ask).toBeVisible();
  await sheetInHistory(page);
  await page.goBack();
  await expect(ask).toBeHidden();
  await expect(note).toBeVisible();
  await expect(note.getByRole('textbox', { name: 'Texto' })).toHaveValue('Pregunta por la recuperación');
  expect(page.url()).toBe(url);

  // Close it for good; one more back leaves the ficha for the class, as without any sheet.
  await note.getByRole('button', { name: 'Cerrar' }).click();
  await ask.getByRole('button', { name: 'Descartar' }).click();
  await expect(note).toBeHidden();
  // Closing gives back the sheet's history entry (a history.back of its own); a thumb comes after it.
  await page.waitForFunction(() => !(window.history.state as { sheet?: string } | null)?.sheet);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/clases/${ids.course}/alumnos$`));
});

test('marco-46 · escritorio: «Buscar», «/» y Ctrl+K abren el buscador; Intro abre el primer alumno y atrás no lo reabre', async ({ page, demo }, info) => {
  test.skip(!isDesktop(info), 'the search sheet and its shortcuts are the computer\'s (the phone searches in Clases)');
  const ids = await demoIds(demo);
  await page.goto('/hoy');
  await expect(heading(page, 'Hoy')).toBeVisible();
  const sheet = page.getByRole('dialog', { name: 'Buscar' });
  const box = sheet.getByRole('searchbox', { name: 'Buscar alumno o clase' });

  await page.getByRole('complementary', { name: 'Navegación' }).getByRole('button', { name: /Buscar/ }).click();
  await expect(sheet).toBeVisible();
  await expect(box).toBeFocused();
  await expect(sheet.getByText('Escribe el nombre o el apellido (sin tildes también vale) o el grupo, como «2 ESO B».')).toBeVisible();
  await box.fill('zzqx');
  await expect(sheet.getByText('Sin resultados')).toBeVisible();
  await expect(sheet.getByText('No hay alumnos ni clases que coincidan con «zzqx».', { exact: false })).toBeVisible();
  // Esc first empties the box, then closes the sheet.
  await page.keyboard.press('Escape');
  await expect(box).toHaveValue('');
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  await page.keyboard.press('/');
  await expect(sheet).toBeVisible();
  await expect(box).toBeFocused();
  await expect(box).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await page.keyboard.press('Control+k');
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  // Not over another sheet (one Esc would close both), and «/» typed in a field is just a character.
  await page.getByRole('button', { name: 'Anotar' }).first().click();
  const note = page.getByRole('dialog', { name: 'Anotar' });
  await note.getByRole('textbox', { name: 'Texto' }).fill('Deberes 3/4');
  await page.keyboard.press('Control+k');
  await expect(sheet).toHaveCount(0);
  await expect(note.getByRole('textbox', { name: 'Texto' })).toHaveValue('Deberes 3/4');
  await note.getByRole('button', { name: 'Cerrar' }).click();
  await page.getByRole('dialog', { name: 'Descartar los cambios' }).getByRole('button', { name: 'Descartar' }).click();
  await expect(note).toBeHidden();

  // A student by surname without accents; Enter opens the first result.
  await page.keyboard.press('Control+k');
  await box.fill('dominguez marin');
  await expect(sheet.getByRole('button', { name: /Domínguez Marín, Hugo/ })).toContainText('2.º ESO B');
  await shot(page, info, 'buscar');
  // With the result on screen, Enter opens it (pressed at once after typing is marco-47).
  await expect(async () => {
    if (await box.isVisible()) await box.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/alumnos/${ids.student.id}$`), { timeout: 1_000 });
  }).toPass();
  await expect(heading(page, ids.student.name)).toBeVisible();
  await expect(sheet).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/hoy$/);
  await expect(heading(page, 'Hoy')).toBeVisible();
  await expect(sheet).toHaveCount(0);
});

test('marco-47 · escritorio: Intro nada más escribir en el buscador abre el primer resultado en cuanto llega', async ({ page, demo }, info) => {
  test.skip(!isDesktop(info), 'the search sheet is the computer\'s');
  // BUG marco-B6 (same cause as BUG-CLASES-01 in Clases): Enter reads the sheet's own debounced search, which is
  // still empty for 160 ms after typing, so it is ignored while the results are already on screen or on their way.
  bug('marco-B6', 'Enter right after typing in the search sheet is ignored');
  const ids = await demoIds(demo);
  // A school network: each search takes 0,8 s to answer. The teacher does not wait for the list to press Enter.
  await page.route((url) => url.pathname === '/api/search', async (route) => {
    await new Promise((r) => setTimeout(r, 800));
    await route.fallback();
  });
  await page.goto('/hoy');
  await expect(heading(page, 'Hoy')).toBeVisible();
  await page.keyboard.press('Control+k');
  const box = page.getByRole('dialog', { name: 'Buscar' }).getByRole('searchbox', { name: 'Buscar alumno o clase' });
  await box.fill('dominguez marin');
  await box.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/alumnos/${ids.student.id}$`), { timeout: 5_000 });
});

test('marco-48 · si la pestaña se recarga con una hoja abierta, atrás vuelve a la pantalla anterior al primer gesto', async ({ page }, info) => {
  // BUG marco-B9: the sheet's history entry survives the reload; the first back only drops it (same address, nothing
  // changes on screen) and it takes a second back to leave. Phones reload tabs they had in the background.
  bug('marco-B9', 'after a reload with a sheet open, the first back does nothing');
  await page.goto('/clases');
  await expect(heading(page, 'Clases')).toBeVisible();
  const link = isDesktop(info) ? page.getByRole('complementary', { name: 'Navegación' }).getByRole('link', { name: 'Hoy', exact: true })
    : page.getByRole('navigation', { name: 'Navegación' }).getByRole('link', { name: 'Hoy', exact: true });
  await link.click();
  await expect(heading(page, 'Hoy')).toBeVisible();
  await page.getByRole('button', { name: 'Ir a una fecha' }).click();
  await expect(page.getByRole('dialog', { name: 'Ir a una fecha' })).toBeVisible();
  await sheetInHistory(page);
  await page.reload();
  await expect(heading(page, 'Hoy')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/clases$/, { timeout: 3_000 });
  await expect(heading(page, 'Clases')).toBeVisible();
});
