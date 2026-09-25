import {
  bug, classMenuPick, dialog, esc, expect, MATES_2C, openClass, sheetsClosed, shot, test, toast, type Api, type CourseSpec, type Page,
} from './clases-helpers';

// Temario (docs/PRODUCT.md §4.1.4, §4.4): the units of the class by evaluación with their status, adding, renaming,
// moving, reordering and deleting them, the unit page header and menu (not its materials), and copying the units of
// another class. Importing with AI is in clases-importar.spec.ts. Each test is a teacher of its own.

const PLAN: CourseSpec = {
  ...MATES_2C,
  units: [
    { title: 'Números enteros', term: 1, status: 'done' },
    { title: 'Fracciones', term: 1, status: 'current', links: [{ url: 'https://www.youtube.com/watch?v=abc123', title: 'Vídeo: fracciones equivalentes' }] },
    { title: 'Potencias y raíces', term: 1 },
    { title: 'Ecuaciones de primer grado', term: 2 },
  ],
};

const term = (page: Page, label: string) =>
  page.locator('section.section').filter({ has: page.getByRole('heading', { name: label, exact: true }) });
const unitLink = (page: Page, title: string) => page.locator('.plan').getByRole('link', { name: new RegExp(esc(title)) });
const unitTitles = (page: Page, label: string) => term(page, label).locator('.plan-unit .row__title > span:first-child');

async function unitMenu(page: Page, title: string, item: string) {
  await page.getByRole('button', { name: `Opciones de ${title}` }).click();
  await page.getByRole('menu').getByRole('menuitem', { name: item, exact: true }).click();
}
async function unitMenuItems(page: Page, title: string) {
  await page.getByRole('button', { name: `Opciones de ${title}` }).click();
  const items = (await page.getByRole('menu').getByRole('menuitem').allInnerTexts()).map((t) => t.trim());
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
  return items;
}
async function statuses(api: Api, id: string): Promise<Record<string, string>> {
  return Object.fromEntries((await api.get(`/courses/${id}/units`)).map((u: { title: string; status: string }) => [u.title, u.status]));
}

test.describe('clases · temario', () => {
  test.use({ teacherSpec: { courses: [PLAN] } });

  test('clases-47 · units by evaluación with status, materials and what is shared', async ({ page, teacher }, info) => {
    const [c] = teacher.courses;
    const unit = await teacher.api.get(`/units/${c.units[1].id}`);
    await teacher.api.post(`/materials/${unit.materials[0].id}/share`, { origin: 'http://127.0.0.1' });
    await openClass(page, c.id, 'programacion', '2.º ESO C');
    await expect(page.getByText('1 de 4 unidades impartidas · En curso: Fracciones')).toBeVisible();
    await expect(term(page, '1.ª evaluación').getByText('3 unidades')).toBeVisible();
    await expect(term(page, '2.ª evaluación').getByText('1 unidad', { exact: true })).toBeVisible();
    await expect(unitTitles(page, '1.ª evaluación')).toHaveText(['Números enteros', 'Fracciones', 'Potencias y raíces']);
    await expect(unitTitles(page, '2.ª evaluación')).toHaveText(['Ecuaciones de primer grado']);
    await expect(unitLink(page, 'Números enteros').getByLabel('Impartida')).toBeVisible();
    await expect(unitLink(page, 'Fracciones').getByText('En curso')).toBeVisible();
    await expect(unitLink(page, 'Fracciones')).toContainText('1 material');
    await expect(unitLink(page, 'Fracciones').getByLabel('Compartido con alumnos')).toBeVisible();
    await expect(unitLink(page, 'Potencias y raíces')).toContainText('Sin materiales');
    await expect(unitLink(page, 'Potencias y raíces').getByLabel('Pendiente')).toBeVisible();
    await expect(term(page, '3.ª evaluación').getByText('Sin unidades')).toBeVisible();
    await shot(page, info, '47-temario');
  });

  test('clases-48 · «+ Unidad»: a title and an evaluación; it goes last in that evaluación', async ({ page, teacher }, info) => {
    const [c] = teacher.courses;
    await openClass(page, c.id, 'programacion', '2.º ESO C');
    await page.getByRole('button', { name: 'Unidad', exact: true }).click();
    const sheet = dialog(page, 'Nueva unidad');
    const save = sheet.locator('.sheet__foot').getByRole('button');
    await expect(save).toHaveText('Escribe el título');
    await expect(save).toBeDisabled();
    // The current evaluación comes chosen.
    await expect(sheet.getByRole('group', { name: 'Evaluación' }).getByRole('button', { name: '1.ª' })).toHaveAttribute('aria-pressed', 'true');
    await sheet.getByRole('textbox', { name: 'Título' }).fill('Proporcionalidad');
    await sheet.getByRole('group', { name: 'Evaluación' }).getByRole('button', { name: '2.ª' }).click();
    await shot(page, info, '48-nueva-unidad');
    await expect(save).toHaveText('Añadir unidad');
    await save.click();
    await expect(toast(page, 'Unidad añadida')).toBeVisible();
    await expect(sheet).toBeHidden();
    await expect(unitTitles(page, '2.ª evaluación')).toHaveText(['Ecuaciones de primer grado', 'Proporcionalidad']);
    await expect(page.getByText('1 de 5 unidades impartidas')).toBeVisible();
    const units = await teacher.api.get(`/courses/${c.id}/units`);
    expect(units.find((u: { title: string }) => u.title === 'Proporcionalidad')).toMatchObject({ term: 2, status: 'pending' });
  });

  test('clases-49 · «Añadir» in an empty evaluación chooses it; Enter adds the unit', async ({ page, teacher }) => {
    const [c] = teacher.courses;
    await openClass(page, c.id, 'programacion', '2.º ESO C');
    await term(page, '3.ª evaluación').getByRole('button', { name: 'Añadir' }).click();
    const sheet = dialog(page, 'Nueva unidad');
    await expect(sheet.getByRole('group', { name: 'Evaluación' }).getByRole('button', { name: '3.ª' })).toHaveAttribute('aria-pressed', 'true');
    await sheet.getByRole('textbox', { name: 'Título' }).fill('Estadística');
    await sheet.getByRole('textbox', { name: 'Título' }).press('Enter');
    await expect(toast(page, 'Unidad añadida')).toBeVisible();
    await expect(unitTitles(page, '3.ª evaluación')).toHaveText(['Estadística']);
    await expect(term(page, '3.ª evaluación').getByText('Sin unidades')).toHaveCount(0);
    expect((await teacher.api.get(`/courses/${c.id}/units`)).find((u: { title: string }) => u.title === 'Estadística').term).toBe(3);
  });

  test('clases-50 · status from the row menu: one unit en curso at a time', async ({ page, teacher }) => {
    const [c] = teacher.courses;
    await openClass(page, c.id, 'programacion', '2.º ESO C');
    expect(await unitMenuItems(page, 'Potencias y raíces'))
      .toEqual(['Marcar en curso', 'Marcar como impartida', 'Mover arriba', 'Eliminar']);
    expect(await unitMenuItems(page, 'Fracciones'))
      .toEqual(['Marcar como impartida', 'Marcar como pendiente', 'Mover arriba', 'Mover abajo', 'Eliminar']);

    // A later unit en curso: the one before it is done.
    await unitMenu(page, 'Potencias y raíces', 'Marcar en curso');
    await expect(toast(page, 'Unidad en curso')).toBeVisible();
    await expect(page.getByText('2 de 4 unidades impartidas · En curso: Potencias y raíces')).toBeVisible();
    await expect(unitLink(page, 'Fracciones').getByLabel('Impartida')).toBeVisible();
    expect(await statuses(teacher.api, c.id)).toMatchObject({ Fracciones: 'done', 'Potencias y raíces': 'current' });

    // An earlier unit en curso: the later one goes back to pending.
    await unitMenu(page, 'Números enteros', 'Marcar en curso');
    await expect(page.getByText('En curso: Números enteros')).toBeVisible();
    expect(await statuses(teacher.api, c.id)).toMatchObject({ 'Números enteros': 'current', 'Potencias y raíces': 'pending' });

    await unitMenu(page, 'Números enteros', 'Marcar como pendiente');
    await expect(toast(page, 'Unidad pendiente')).toBeVisible();
    await expect(page.getByText('1 de 4 unidades impartidas', { exact: true })).toBeVisible(); // nothing en curso
    await unitMenu(page, 'Ecuaciones de primer grado', 'Marcar como impartida');
    await expect(toast(page, 'Unidad impartida')).toBeVisible();
    expect(await statuses(teacher.api, c.id)).toEqual({
      'Números enteros': 'pending', Fracciones: 'done', 'Potencias y raíces': 'pending', 'Ecuaciones de primer grado': 'done',
    });
  });

  test('clases-51 · «Mover arriba / abajo» reorders inside the evaluación and is kept', async ({ page, teacher }) => {
    const [c] = teacher.courses;
    await openClass(page, c.id, 'programacion', '2.º ESO C');
    expect(await unitMenuItems(page, 'Números enteros')).not.toContain('Mover arriba');
    expect(await unitMenuItems(page, 'Potencias y raíces')).not.toContain('Mover abajo'); // never into the next evaluación
    expect(await unitMenuItems(page, 'Ecuaciones de primer grado')).toEqual(['Marcar en curso', 'Marcar como impartida', 'Eliminar']);

    await unitMenu(page, 'Números enteros', 'Mover abajo');
    await expect(unitTitles(page, '1.ª evaluación')).toHaveText(['Fracciones', 'Números enteros', 'Potencias y raíces']);
    await unitMenu(page, 'Potencias y raíces', 'Mover arriba');
    await expect(unitTitles(page, '1.ª evaluación')).toHaveText(['Fracciones', 'Potencias y raíces', 'Números enteros']);
    await expect.poll(async () => (await teacher.api.get(`/courses/${c.id}/units`)).map((u: { title: string }) => u.title))
      .toEqual(['Fracciones', 'Potencias y raíces', 'Números enteros', 'Ecuaciones de primer grado']);
    await page.reload();
    await expect(unitTitles(page, '1.ª evaluación')).toHaveText(['Fracciones', 'Potencias y raíces', 'Números enteros']);
  });

  test('clases-51b · a reorder the server refuses goes back and says so', async ({ page, teacher }) => {
    bug('BUG-CLASES-08', 'PlanTab passes onError to order.mutate(): it never fires, the row snaps back without a word');
    const [c] = teacher.courses;
    await page.route((url) => url.pathname === `/api/courses/${c.id}/units/order`, (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
    await openClass(page, c.id, 'programacion', '2.º ESO C');
    await unitMenu(page, 'Números enteros', 'Mover abajo');
    await expect(unitTitles(page, '1.ª evaluación')).toHaveText(['Números enteros', 'Fracciones', 'Potencias y raíces']);
    expect((await teacher.api.get(`/courses/${c.id}/units`)).map((u: { title: string }) => u.title).slice(0, 3))
      .toEqual(['Números enteros', 'Fracciones', 'Potencias y raíces']);
    // Every mutation gives feedback (CLAUDE.md, rule 7): the teacher must know the move did not stick.
    await expect(toast(page, 'El servidor ha fallado. Inténtalo en un momento.')).toBeVisible();
  });

  test('clases-52 · «Eliminar» asks first, then the unit and its materials are gone', async ({ page, teacher }, info) => {
    const [c] = teacher.courses;
    const material = (await teacher.api.get(`/units/${c.units[1].id}`)).materials[0];
    await openClass(page, c.id, 'programacion', '2.º ESO C');
    await unitMenu(page, 'Fracciones', 'Eliminar');
    const ask = dialog(page, '¿Eliminar «Fracciones»?');
    await expect(ask.getByText(/No se puede deshacer\.$/)).toBeVisible();
    await expect(ask.getByText(/material/)).toBeVisible();
    await shot(page, info, '52-eliminar-unidad');
    await ask.getByRole('button', { name: 'Cancelar' }).click();
    await expect(ask).toBeHidden();
    await expect(unitLink(page, 'Fracciones')).toBeVisible();

    await unitMenu(page, 'Fracciones', 'Eliminar');
    await ask.getByRole('button', { name: 'Eliminar' }).click();
    await expect(toast(page, 'Unidad eliminada')).toBeVisible();
    await expect(unitTitles(page, '1.ª evaluación')).toHaveText(['Números enteros', 'Potencias y raíces']);
    expect((await teacher.api.raw('GET', `/units/${c.units[1].id}`)).status()).toBe(404);
    expect((await teacher.api.raw('GET', `/materials/${material.id}`)).status()).toBe(404);
  });

  test('clases-52b · the delete question says «su material» for one material', async ({ page, teacher }) => {
    bug('BUG-CLASES-03', 'PlanTab/UnitPage say «Se borrarán también sus 1 material» (plural with one)');
    const [c] = teacher.courses;
    await openClass(page, c.id, 'programacion', '2.º ESO C');
    await unitMenu(page, 'Fracciones', 'Eliminar');
    const ask = dialog(page, '¿Eliminar «Fracciones»?');
    await expect(ask.getByText('Se borrará también su material. No se puede deshacer.')).toBeVisible();
  });

  test('clases-53 · a unit opens its page: course, evaluación and status; «‹ 2.º ESO C» goes back to Temario', async ({ page, teacher }, info) => {
    const [c] = teacher.courses;
    await openClass(page, c.id, 'programacion', '2.º ESO C');
    await unitLink(page, 'Fracciones').click();
    await expect(page).toHaveURL(new RegExp(`/clases/${c.id}/unidades/${c.units[1].id}$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Fracciones' })).toBeVisible();
    await expect(page.locator('.page-head__eyebrow')).toHaveText('Matemáticas · 2.º ESO C');
    await expect(page.locator('.page-head__sub')).toHaveText('1.ª evaluaciónEn curso');
    await shot(page, info, '53-unidad');
    await page.locator('.back-btn').filter({ hasText: '2.º ESO C' }).click();
    await expect(page).toHaveURL(new RegExp(`/clases/${c.id}/programacion$`));
    await expect(unitLink(page, 'Fracciones')).toBeVisible();
  });

  test('clases-54 · unit menu: «Renombrar» and «Cambiar evaluación» edit it in place', async ({ page, teacher }) => {
    const [c] = teacher.courses;
    await page.goto(`/clases/${c.id}/unidades/${c.units[1].id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Fracciones' })).toBeVisible();
    const menu = async (item: string) => {
      await page.getByRole('button', { name: 'Más opciones' }).click();
      await page.getByRole('menuitem', { name: item, exact: true }).click();
    };
    await page.getByRole('button', { name: 'Más opciones' }).click();
    expect((await page.getByRole('menuitem').allInnerTexts()).map((t) => t.trim()))
      .toEqual(['Marcar como impartida', 'Renombrar', 'Cambiar evaluación', 'Eliminar unidad']);
    await page.keyboard.press('Escape');

    await menu('Renombrar');
    const sheet = dialog(page, 'Editar unidad');
    await expect(sheet.getByRole('textbox', { name: 'Título' })).toHaveValue('Fracciones');
    await sheet.getByRole('textbox', { name: 'Título' }).fill('');
    await expect(sheet.locator('.sheet__foot').getByRole('button')).toHaveText('Escribe el título');
    await sheet.getByRole('textbox', { name: 'Título' }).fill('Fracciones y decimales');
    await sheet.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Unidad actualizada')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Fracciones y decimales' })).toBeVisible();

    await menu('Cambiar evaluación');
    await expect(sheet.getByRole('group', { name: 'Evaluación' }).getByRole('button', { name: '1.ª' })).toHaveAttribute('aria-pressed', 'true');
    await sheet.getByRole('group', { name: 'Evaluación' }).getByRole('button', { name: '2.ª' }).click();
    await sheet.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.locator('.page-head__sub')).toContainText('2.ª evaluación');
    expect(await teacher.api.get(`/units/${c.units[1].id}`)).toMatchObject({ unit: { title: 'Fracciones y decimales', term: 2 } });

    await sheetsClosed(page);
    await page.locator('.back-btn').click();
    await expect(unitTitles(page, '2.ª evaluación')).toHaveText(['Ecuaciones de primer grado', 'Fracciones y decimales']);
    await expect(unitTitles(page, '1.ª evaluación')).toHaveText(['Números enteros', 'Potencias y raíces']);
  });

  test('clases-54b · a unit without evaluación stays without it when renamed', async ({ page, teacher }) => {
    bug('BUG-CLASES-06', 'UnitFormSheet starts the evaluación at the current term when the unit has none: «Renombrar» moves it to the 1.ª');
    const [c] = teacher.courses;
    const loose = await teacher.api.post(`/courses/${c.id}/units`, { title: 'Repaso de verano', term: null });
    await openClass(page, c.id, 'programacion', '2.º ESO C');
    await expect(unitTitles(page, 'Sin evaluación')).toHaveText(['Repaso de verano']);
    await unitLink(page, 'Repaso de verano').click();
    await expect(page.locator('.page-head__sub')).toContainText('Sin evaluación');
    await page.getByRole('button', { name: 'Más opciones' }).click();
    await page.getByRole('menuitem', { name: 'Renombrar' }).click();
    const sheet = dialog(page, 'Editar unidad');
    await sheet.getByRole('textbox', { name: 'Título' }).fill('Repaso de verano (cuadernillo)');
    await sheet.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Unidad actualizada')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Repaso de verano (cuadernillo)' })).toBeVisible();
    await expect(page.locator('.page-head__sub')).toContainText('Sin evaluación');
    expect((await teacher.api.get(`/units/${loose.id}`)).unit.term).toBeNull();
  });

  test('clases-55 · unit menu: «Marcar como impartida» / «Marcar en curso» change the chip', async ({ page, teacher }) => {
    const [c] = teacher.courses;
    await page.goto(`/clases/${c.id}/unidades/${c.units[1].id}`);
    const sub = page.locator('.page-head__sub');
    await expect(sub).toContainText('En curso');
    await page.getByRole('button', { name: 'Más opciones' }).click();
    await page.getByRole('menuitem', { name: 'Marcar como impartida' }).click();
    await expect(toast(page, 'Unidad impartida')).toBeVisible();
    await expect(sub).toContainText('Impartida');
    await page.getByRole('button', { name: 'Más opciones' }).click();
    await expect(page.getByRole('menuitem', { name: 'Marcar como impartida' })).toHaveCount(0);
    await page.getByRole('menuitem', { name: 'Marcar en curso' }).click();
    await expect(toast(page, 'Unidad en curso')).toBeVisible();
    await expect(sub).toContainText('En curso');
    expect((await teacher.api.get(`/units/${c.units[1].id}`)).unit.status).toBe('current');
  });

  test('clases-56 · «Eliminar unidad» from its page asks, deletes it and returns to Temario', async ({ page, teacher }) => {
    const [c] = teacher.courses;
    await openClass(page, c.id, 'programacion', '2.º ESO C');
    await unitLink(page, 'Potencias y raíces').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Potencias y raíces' })).toBeVisible();
    await page.getByRole('button', { name: 'Más opciones' }).click();
    await page.getByRole('menuitem', { name: 'Eliminar unidad' }).click();
    const ask = dialog(page, '¿Eliminar «Potencias y raíces»?');
    await expect(ask.getByText('No se puede deshacer.', { exact: true })).toBeVisible();
    await ask.getByRole('button', { name: 'Eliminar' }).click();
    await expect(toast(page, 'Unidad eliminada')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/clases/${c.id}/programacion$`));
    await expect(unitTitles(page, '1.ª evaluación')).toHaveText(['Números enteros', 'Fracciones']);
    expect((await teacher.api.raw('GET', `/units/${c.units[2].id}`)).status()).toBe(404);
    // Back does not reopen the deleted unit.
    await page.goBack();
    await expect(page.getByText('No se ha encontrado la unidad')).toHaveCount(0);
  });

  test('clases-57 · a unit that does not exist: «No se ha encontrado la unidad» and «Volver al temario»', async ({ page, teacher }) => {
    const [c] = teacher.courses;
    await page.goto(`/clases/${c.id}/unidades/00000000-0000-0000-0000-000000000000`);
    await expect(page.getByText('No se ha encontrado la unidad')).toBeVisible();
    await page.getByRole('link', { name: 'Volver al temario' }).click();
    await expect(page).toHaveURL(new RegExp(`/clases/${c.id}/programacion$`));
  });

  test('clases-62 · a failed load of the units says so', async ({ page, teacher }) => {
    const [c] = teacher.courses;
    await page.route((url) => url.pathname === `/api/courses/${c.id}/units`, (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Servidor no disponible' }) }));
    await openClass(page, c.id, 'programacion', '2.º ESO C');
    await expect(page.getByText('No se ha podido cargar el temario')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Servidor no disponible')).toBeVisible();
  });
});

// ── An empty Temario and copying from another class ────────────────────────
const SIBLINGS = {
  courses: [
    { ...PLAN, units: PLAN.units!.slice(0, 3) },
    { subject: 'Matemáticas', short: 'Mates', group: '2º ESO D', color: 'ochre', students: ['Ruiz Paz, Ana'] },
    { subject: 'Lengua Castellana y Literatura', short: 'Lengua', group: '2º ESO E', color: 'rose' },
  ],
};

test.describe('clases · temario vacío', () => {
  test.use({ teacherSpec: { courses: [{ ...MATES_2C }] } });

  test('clases-58 · empty: what a Temario is for, «Importar temario» first and «Añadir unidad»', async ({ page, teacher }, info) => {
    const [c] = teacher.courses;
    await openClass(page, c.id, 'programacion', '2.º ESO C');
    await expect(page.getByText('Organiza el curso por unidades')).toBeVisible();
    await expect(page.getByText('Pega el índice del libro y Sepia propone las unidades de cada evaluación.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Copiar de/ })).toHaveCount(0); // no other class of Matemáticas 2.º ESO
    await shot(page, info, '58-temario-vacio');
    await page.getByRole('button', { name: 'Importar temario' }).click();
    await expect(dialog(page, 'Importar temario')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog(page, 'Importar temario')).toBeHidden();

    await page.getByRole('button', { name: 'Añadir unidad' }).click();
    const sheet = dialog(page, 'Nueva unidad');
    await sheet.getByRole('textbox', { name: 'Título' }).fill('Números enteros');
    await sheet.getByRole('button', { name: 'Añadir unidad' }).click();
    await expect(toast(page, 'Unidad añadida')).toBeVisible();
    await expect(page.getByText('1 unidad', { exact: true }).first()).toBeVisible();
    await expect(unitLink(page, 'Números enteros')).toBeVisible();
    expect(await teacher.api.get(`/courses/${c.id}/units`)).toHaveLength(1);
  });

  test('clases-61 · «Copiar de otra clase» without other classes says why it cannot', async ({ page, teacher }) => {
    const [c] = teacher.courses;
    await openClass(page, c.id, 'programacion', '2.º ESO C');
    await classMenuPick(page, 'Copiar de otra clase');
    const sheet = dialog(page, 'Copiar de otra clase');
    await expect(sheet.locator('.sheet__foot').getByRole('button')).toHaveText('No tienes otras clases');
    await expect(sheet.locator('.sheet__foot').getByRole('button')).toBeDisabled();
    await expect(sheet.getByRole('combobox', { name: 'Clase' })).toBeDisabled();
  });
});

test.describe('clases · copiar temario', () => {
  test.use({ teacherSpec: SIBLINGS });

  test('clases-59 · empty, with another group of the same subject and year: «Copiar de 2.º ESO C (3 unidades)» first', async ({ page, teacher }, info) => {
    const [a, b] = teacher.courses;
    await openClass(page, b.id, 'programacion', '2.º ESO D');
    const copy = page.getByRole('button', { name: 'Copiar de 2.º ESO C (3 unidades)' });
    await expect(copy).toBeVisible();
    await expect(page.getByRole('button', { name: 'Importar temario' })).toBeVisible();
    await shot(page, info, '59-copiar-de');
    await copy.click();
    await expect(toast(page, 'Temario copiado de 2.º ESO C: 3 unidades')).toBeVisible();
    await expect(unitTitles(page, '1.ª evaluación')).toHaveText(['Números enteros', 'Fracciones', 'Potencias y raíces']);
    await expect(unitLink(page, 'Fracciones')).toContainText('1 material');
    const units = await teacher.api.get(`/courses/${b.id}/units`);
    expect(units.map((u: { status: string }) => u.status)).toEqual(['pending', 'pending', 'pending']);
    const fr = await teacher.api.get(`/units/${units[1].id}`);
    expect(fr.materials.map((m: { title: string }) => m.title)).toEqual(['Vídeo: fracciones equivalentes']);
    // The source class keeps its own units.
    expect(await teacher.api.get(`/courses/${a.id}/units`)).toHaveLength(3);
  });

  test('clases-60 · «Copiar de otra clase» (menu): pick the class, see what comes, copy', async ({ page, teacher }, info) => {
    const [, b] = teacher.courses;
    await teacher.api.post(`/courses/${b.id}/units`, { title: 'Repaso de primaria', term: 1 });
    await openClass(page, b.id, 'programacion', '2.º ESO D');
    await expect(unitTitles(page, '1.ª evaluación')).toHaveText(['Repaso de primaria']);
    await classMenuPick(page, 'Copiar de otra clase');
    const sheet = dialog(page, 'Copiar de otra clase');
    const pick = sheet.getByRole('combobox', { name: 'Clase' });
    await expect(pick).toHaveValue(teacher.courses[0].id);
    await expect(pick.locator('option')).toHaveText(['Matemáticas · 2.º ESO C', 'Lengua Castellana y Literatura · 2.º ESO E']);
    await expect(sheet.getByText('Se añaden 3 unidades con 1 material al final de cada evaluación, todas como pendientes.')).toBeVisible();
    const go = sheet.locator('.sheet__foot').getByRole('button');
    await expect(go).toHaveText('Copiar 3 unidades');
    await pick.selectOption({ label: 'Lengua Castellana y Literatura · 2.º ESO E' });
    await expect(go).toHaveText('Esa clase no tiene unidades');
    await expect(go).toBeDisabled();
    await pick.selectOption({ label: 'Matemáticas · 2.º ESO C' });
    await shot(page, info, '60-copiar');
    await go.click();
    await expect(toast(page, 'Programación copiada: 3 unidades')).toBeVisible();
    await expect(sheet).toBeHidden();
    await expect(unitTitles(page, '1.ª evaluación')).toHaveText(['Repaso de primaria', 'Números enteros', 'Fracciones', 'Potencias y raíces']);
    expect(await teacher.api.get(`/courses/${b.id}/units`)).toHaveLength(4);
  });
});
