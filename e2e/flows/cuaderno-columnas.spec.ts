import {
  bug, cell, cellInput, CLASS, column, confirmDialog, expect, gradebook, isMobile, LABEL, NAMES, openCuaderno, openEdit, press,
  sheet, shot, test, terms, toast, type CourseSpec, type Page, type World,
} from './cuaderno-helpers';

// Columnas del Cuaderno (docs/PRODUCT.md §4.5): «+ Actividad» for every kind the teacher can pick (an exam opens its
// page, the rest stay in the Cuaderno typing the first grade), the unit preselected from the title, «Más opciones»
// (categoría, peso, cuenta para, solo algunos alumnos), the term from the date; editing (long-press on a phone, the
// pencil or right-click on a computer) and deleting with confirmation. Each test is a teacher of its own.

const EXAM = 'Examen U1 · Números enteros';
const EMPTY = 'Ficha · Repaso';
const LATER = 'Trabajo · Estadística';
const [MARTA, PABLO, LUCIA, HUGO] = NAMES;

const WORLD: CourseSpec = {
  ...CLASS,
  units: [
    { title: 'Números enteros', status: 'done' }, { title: 'Fracciones', status: 'current' }, { title: 'Potencias y raíces', status: 'pending' },
  ],
  activities: [
    { title: EXAM, kind: 'exam', date: '2026-11-10', grades: [9, 7, 6] },
    { title: EMPTY, kind: 'worksheet', date: '2026-11-13' },
    { title: LATER, kind: 'task', date: '2027-01-20' },
  ],
};

const newSheet = (page: Page) => page.getByRole('dialog', { name: 'Nueva actividad' });
async function openNew(page: Page) {
  await page.getByRole('button', { name: 'Actividad', exact: true }).click();
  const s = newSheet(page);
  await expect(s.getByRole('textbox', { name: 'Título' })).toBeVisible();
  return s;
}
const created = async (world: World, title: string, term = 1) => {
  const a = (await gradebook(world.api, world.id, term)).activities.find((x) => x.title === title);
  return a ? { ...a, unit_ids: (await world.api.get(`/activities/${a.id}`)).unit_ids as string[] } : undefined;
};
const unitId = (world: World, title: string) => world.units.find((u) => u.title === title)!.id;

test.describe('cuaderno · columnas', () => {
  test.use({ worldSpec: WORLD });

  test('cuaderno-30 · «+ Actividad»: a title first, the kinds a teacher picks, the term from the date, and typed text is not lost', async ({ page, world }, info) => {
    await openCuaderno(page, world.id);
    const s = await openNew(page);
    await expect(s.getByText(LABEL)).toBeVisible();
    await expect(s.getByRole('button', { name: 'Escribe un título' })).toBeDisabled();
    const kinds = s.locator('.field').filter({ has: page.getByText('Tipo', { exact: true }) });
    for (const k of ['Examen', 'Ficha', 'Trabajo', 'Oral', 'Cuaderno', 'Actitud', 'Otra']) await expect(kinds.getByRole('button', { name: k, exact: true })).toBeVisible();
    await expect(s.getByRole('button', { name: 'Deberes', exact: true })).toHaveCount(0); // derived from the homework checks
    await expect(s.getByRole('button', { name: 'Examen', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(s.getByText('jueves, 19 nov 2026')).toBeVisible();
    await expect(s.getByText('1.ª evaluación (por la fecha)')).toBeVisible();
    // The unit in progress, until the title names another one
    await expect(s.getByRole('button', { name: 'Fracciones', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await s.getByRole('textbox', { name: 'Título' }).fill('Examen U3 · Potencias y raíces');
    await expect(s.getByRole('button', { name: 'Potencias y raíces', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(s.getByRole('button', { name: 'Fracciones', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(s.getByRole('button', { name: 'Crear actividad' })).toBeEnabled();
    await shot(page, info, '30-new');

    // Something typed: closing asks first
    await s.getByRole('button', { name: 'Cerrar' }).click();
    const ask = confirmDialog(page, 'Descartar los cambios');
    await ask.getByRole('button', { name: 'Cancelar' }).click();
    await expect(s.getByRole('textbox', { name: 'Título' })).toHaveValue('Examen U3 · Potencias y raíces');
    await page.keyboard.press('Escape');
    await ask.getByRole('button', { name: 'Descartar' }).click();
    await expect(s).toBeHidden();
    expect((await gradebook(world.api, world.id)).activities).toHaveLength(2);
  });

  test('cuaderno-31 · a new exam opens its page to prepare it, and is a column dated «hoy»', async ({ page, world }, info) => {
    await openCuaderno(page, world.id);
    const s = await openNew(page);
    await s.getByRole('textbox', { name: 'Título' }).fill('Examen U3 · Potencias y raíces');
    await s.getByRole('button', { name: 'Crear actividad' }).click();
    await expect(toast(page, '«Examen U3 · Potencias y raíces» añadida al cuaderno')).toBeVisible();
    await expect(page).toHaveURL(/\/actividades\/[^/]+$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Examen U3 · Potencias y raíces');
    await expect(page.getByText('1 · Preparar')).toBeVisible();
    await shot(page, info, '31-exam-page');
    const a = await created(world, 'Examen U3 · Potencias y raíces');
    expect(a).toMatchObject({ kind: 'exam', category: 'exams', max_score: 10, weight: 1, counts_for: 'average', student_ids: null });
    expect(a!.unit_ids).toEqual([unitId(world, 'Potencias y raíces')]);

    // «‹» names where the activity was opened from: the class.
    await page.getByRole('button', { name: '2.º ESO C', exact: true }).click();
    await expect(page).toHaveURL(/\/cuaderno/);
    const col = column(page, 'Examen U3 · Potencias y raíces');
    await expect(col).toContainText('hoy');
    await expect(col).toHaveClass(/gb-today/);
    await expect(cell(page, MARTA, 'Examen U3 · Potencias y raíces')).toHaveText('—');
  });

  const KINDS = [
    { chip: 'Ficha', kind: 'worksheet', category: 'work', title: 'Ficha · Fracciones equivalentes' },
    { chip: 'Trabajo', kind: 'task', category: 'work', title: 'Trabajo · Fracciones en la cocina' },
    { chip: 'Oral', kind: 'oral', category: 'exams', title: 'Oral · Explica una suma' },
    { chip: 'Cuaderno', kind: 'notebook', category: 'work', title: 'Cuaderno de noviembre' },
    { chip: 'Actitud', kind: 'attitude', category: 'observation', title: 'Actitud y participación' },
    { chip: 'Otra', kind: 'other', category: 'work', title: 'Salida al museo' },
  ];
  for (const k of KINDS) {
    test(`cuaderno-32 · a new ${k.chip.toLowerCase()} stays in the Cuaderno, ready to type its first grade (${k.kind})`, async ({ page, world }, info) => {
      await openCuaderno(page, world.id);
      const s = await openNew(page);
      await s.getByRole('textbox', { name: 'Título' }).fill(k.title);
      await s.getByRole('button', { name: k.chip, exact: true }).click();
      await expect(s.getByRole('button', { name: k.chip, exact: true })).toHaveAttribute('aria-pressed', 'true');
      await s.getByRole('textbox', { name: 'Título' }).press('Enter'); // Enter in the title creates it
      await expect(toast(page, `«${k.title}» añadida al cuaderno`)).toBeVisible();
      await expect(s).toBeHidden();
      await expect(page).toHaveURL(/\/cuaderno/);
      // The new column, highlighted, with the first student's cell being typed
      await expect(column(page, k.title)).toContainText('hoy');
      const first = cellInput(page, MARTA, k.title);
      await expect(first).toBeFocused();
      await first.fill('8');
      await first.press('Enter');
      await expect(cellInput(page, PABLO, k.title)).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(cell(page, MARTA, k.title)).toHaveText('8');
      if (k.kind === 'worksheet') await shot(page, info, '32-new-column');
      const a = await created(world, k.title);
      expect(a).toMatchObject({ kind: k.kind, category: k.category, date: '2026-11-19', max_score: 10 });
      expect(a!.unit_ids).toEqual([unitId(world, 'Fracciones')]); // the unit in progress
      await expect.poll(async () => (await sheet(world.api, a!.id))['Alonso Gil, Marta']).toEqual({ score: 8, status: 'confirmed' });
    });
  }

  test('cuaderno-33 · «Más opciones»: nota máxima, categoría, peso and «No cuenta»', async ({ page, world }) => {
    await openCuaderno(page, world.id);
    const s = await openNew(page);
    await s.getByRole('textbox', { name: 'Título' }).fill('Prueba inicial');
    const max = s.getByRole('group', { name: 'Nota máxima' });
    await max.getByRole('button', { name: 'Más' }).click();
    await max.getByRole('button', { name: 'Más' }).click();
    await expect(max).toContainText('12');
    await s.getByRole('button', { name: 'Más opciones' }).click();
    await s.getByLabel('Categoría').selectOption({ label: 'Observación (10 %)' });
    await s.getByRole('group', { name: 'Peso' }).getByRole('button', { name: 'Más' }).click();
    await expect(s.getByRole('group', { name: 'Peso' })).toContainText('×1,5');
    await s.getByLabel('Cuenta para').selectOption({ label: 'No cuenta (evaluación inicial, diagnóstica)' });
    await expect(s.getByText('No cuenta para la media')).toBeVisible();
    await s.getByRole('button', { name: 'Crear actividad' }).click();
    await expect(toast(page, '«Prueba inicial» añadida al cuaderno')).toBeVisible();
    await expect(page).toHaveURL(/\/actividades\//); // still an exam: its page
    const a = await created(world, 'Prueba inicial');
    expect(a).toMatchObject({ kind: 'exam', category: 'observation', weight: 1.5, max_score: 12, counts_for: 'none' });

    await openCuaderno(page, world.id);
    const col = column(page, 'Prueba inicial');
    await expect(col).toContainText('No cuenta');
    await expect(col).toContainText('/12');
  });

  test('cuaderno-34 · only some students: their cells alone, Enter skips the rest', async ({ page, world }) => {
    await openCuaderno(page, world.id);
    const s = await openNew(page);
    await s.getByRole('textbox', { name: 'Título' }).fill('Ficha de refuerzo');
    await s.getByRole('button', { name: 'Ficha', exact: true }).click();
    await s.getByRole('button', { name: 'Más opciones' }).click();
    await expect(s.getByRole('button', { name: 'Toda la clase' })).toHaveAttribute('aria-pressed', 'true');
    await s.getByRole('button', { name: 'Toda la clase' }).click();
    await expect(s.getByRole('button', { name: 'Elige algún alumno' })).toBeDisabled();
    await s.getByRole('button', { name: 'Marta Alonso', exact: true }).click();
    await s.getByRole('button', { name: 'Hugo Díaz', exact: true }).click();
    await expect(s.getByText('Alumnos · 2 alumnos de 6')).toBeVisible();
    await s.getByRole('button', { name: 'Crear actividad' }).click();

    await expect(column(page, 'Ficha de refuerzo')).toContainText('2 alumnos');
    await expect(page.getByRole('cell', { name: `${PABLO} · Ficha de refuerzo: no hace esta actividad` })).toBeVisible();
    await expect(cell(page, PABLO, 'Ficha de refuerzo')).toHaveCount(0);
    await cellInput(page, MARTA, 'Ficha de refuerzo').fill('6');
    await cellInput(page, MARTA, 'Ficha de refuerzo').press('Enter');
    await expect(cellInput(page, HUGO, 'Ficha de refuerzo')).toBeFocused(); // Pablo and Lucía do not do it
    await page.keyboard.press('Escape');
    const a = await created(world, 'Ficha de refuerzo');
    expect(a!.student_ids).toEqual([world.students[0].id, world.students[3].id]);
  });

  test('cuaderno-35 · a date in the 2.ª evaluación: the Cuaderno moves to the 2.ª with the new column', async ({ page, world }) => {
    await openCuaderno(page, world.id);
    const s = await openNew(page);
    await s.getByRole('textbox', { name: 'Título' }).fill('Oral · Lectura en voz alta');
    await s.getByRole('button', { name: 'Oral', exact: true }).click();
    await s.getByLabel('Fecha').fill('2027-01-21');
    await expect(s.getByText('jueves, 21 ene 2027')).toBeVisible();
    await expect(s.getByText('2.ª evaluación (por la fecha)')).toBeVisible();
    await s.getByRole('button', { name: 'Crear actividad' }).click();
    await expect(page).toHaveURL(/term=2/);
    await expect(terms(page).getByRole('button', { name: '2.ª' })).toHaveAttribute('aria-pressed', 'true');
    await expect(cellInput(page, MARTA, 'Oral · Lectura en voz alta')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(column(page, LATER)).toBeVisible();
    expect((await created(world, 'Oral · Lectura en voz alta', 2))).toMatchObject({ date: '2027-01-21' });
  });

  test('cuaderno-36 · edit a column: title, kind and maximum; a phone long-presses the header, a computer uses the pencil or right-click', async ({ page, world }, info) => {
    await openCuaderno(page, world.id);
    if (!isMobile(info)) {
      await column(page, EXAM).locator('.gb-head').click({ button: 'right' });
      const viaRight = page.getByRole('dialog', { name: 'Editar actividad' });
      await expect(viaRight.getByRole('textbox', { name: 'Título' })).toHaveValue(EXAM);
      await viaRight.getByRole('button', { name: 'Cancelar' }).click();
      await expect(viaRight).toBeHidden();
    }
    const s = await openEdit(page, info, EXAM);
    await expect(page).toHaveURL(/\/cuaderno/); // a long-press edits, it does not open the activity
    await expect(s.getByText(LABEL)).toBeVisible();
    await expect(s.getByRole('textbox', { name: 'Título' })).toHaveValue(EXAM);
    await expect(s.getByLabel('Categoría')).toHaveValue('exams');
    await expect(s.getByLabel('Cuenta para')).toHaveValue('average');
    await expect(s.getByText('martes, 10 nov 2026')).toBeVisible();
    await shot(page, info, '36-edit');
    await s.getByRole('textbox', { name: 'Título' }).fill('Examen U1 · Enteros');
    await s.getByRole('button', { name: 'Oral', exact: true }).click();
    await s.getByRole('group', { name: 'Nota máxima' }).getByRole('button', { name: 'Más' }).click();
    await s.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Actividad guardada')).toBeVisible();
    await expect(s).toBeHidden();
    const col = column(page, 'Examen U1 · Enteros');
    await expect(col).toContainText('/11');
    await expect(cell(page, MARTA, 'Examen U1 · Enteros')).toHaveText('9');
    const a = await created(world, 'Examen U1 · Enteros');
    expect(a).toMatchObject({ kind: 'oral', max_score: 11, category: 'exams', date: '2026-11-10' });
  });

  test('cuaderno-37 · edit a column\'s date into the 2.ª evaluación: it moves there', async ({ page, world }, info) => {
    await openCuaderno(page, world.id);
    const s = await openEdit(page, info, EMPTY);
    await s.getByLabel('Fecha').fill('2027-02-04');
    await expect(s.getByText('2.ª evaluación (por la fecha)')).toBeVisible();
    await s.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Actividad guardada')).toBeVisible();
    await expect(column(page, EMPTY)).toHaveCount(0);
    await terms(page).getByRole('button', { name: '2.ª' }).click();
    await expect(column(page, EMPTY)).toBeVisible();
    expect(await created(world, EMPTY, 2)).toMatchObject({ date: '2027-02-04' });
  });

  test('cuaderno-38 · lowering the maximum below grades already given is refused, saying how many', async ({ page, world }, info) => {
    await openCuaderno(page, world.id);
    const s = await openEdit(page, info, EXAM);
    const max = s.getByRole('group', { name: 'Nota máxima' });
    for (let i = 0; i < 4; i++) await max.getByRole('button', { name: 'Menos' }).click();
    await expect(max).toContainText('6');
    await s.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Hay 2 notas por encima de 6. Corrígelas antes de bajar la nota máxima.')).toBeVisible();
    await expect(s).toBeVisible(); // nothing lost: the sheet stays open
    expect((await created(world, EXAM))!.max_score).toBe(10);
  });

  test('cuaderno-39 · the refusal reads right with a single grade above the new maximum', async ({ page, world }, info) => {
    bug('CUA-02', 'backend says «Hay 1 notas por encima de 8» (no singular) — app/api/activities.py patch_activity');
    await openCuaderno(page, world.id);
    const s = await openEdit(page, info, EXAM);
    const max = s.getByRole('group', { name: 'Nota máxima' });
    for (let i = 0; i < 2; i++) await max.getByRole('button', { name: 'Menos' }).click();
    await s.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, /por encima de 8/)).toBeVisible();
    await expect(toast(page, 'Hay 1 nota por encima de 8. Corrígela antes de bajar la nota máxima.')).toBeVisible({ timeout: 2000 });
  });

  test('cuaderno-40 · the edit sheet needs a title; «Cancelar» leaves the column as it was', async ({ page, world }, info) => {
    await openCuaderno(page, world.id);
    const s = await openEdit(page, info, EMPTY);
    await s.getByRole('textbox', { name: 'Título' }).fill('');
    await expect(s.getByRole('button', { name: 'Escribe un título' })).toBeDisabled();
    await s.getByRole('button', { name: 'Cancelar' }).click();
    await expect(s).toBeHidden();
    await expect(column(page, EMPTY)).toBeVisible();
    expect(await created(world, EMPTY)).toBeDefined();
  });

  test('cuaderno-41 · delete a column with grades: the confirmation says what goes with it', async ({ page, world }, info) => {
    await openCuaderno(page, world.id);
    let s = await openEdit(page, info, EXAM);
    await s.getByRole('button', { name: 'Eliminar actividad' }).click();
    const ask = confirmDialog(page, `Eliminar «${EXAM}»`);
    await expect(ask.getByText('Se borrarán también 3 notas y las hojas escaneadas. No se puede deshacer.')).toBeVisible();
    await shot(page, info, '41-delete');
    await ask.getByRole('button', { name: 'Cancelar' }).click();
    await expect(ask).toBeHidden();
    await expect(s).toBeVisible();
    await s.getByRole('button', { name: 'Eliminar actividad' }).click();
    await ask.getByRole('button', { name: 'Eliminar' }).click();
    await expect(toast(page, 'Actividad eliminada')).toBeVisible();
    await expect(column(page, EXAM)).toHaveCount(0);
    expect((await world.api.fetch('GET', `/activities/${world.act[EXAM]}`)).status()).toBe(404);

    // One without grades says so
    s = await openEdit(page, info, EMPTY);
    await s.getByRole('button', { name: 'Eliminar actividad' }).click();
    await expect(confirmDialog(page, `Eliminar «${EMPTY}»`).getByText('No tiene notas todavía.')).toBeVisible();
    await confirmDialog(page, `Eliminar «${EMPTY}»`).getByRole('button', { name: 'Eliminar' }).click();
    await expect(page.getByText('Aún no hay actividades en la 1.ª evaluación')).toBeVisible();
  });

  test('cuaderno-42 · a column header opens its activity, and «‹ 2.º ESO C» comes back to the same evaluación', async ({ page, world }, info) => {
    await openCuaderno(page, world.id, 2);
    await press(column(page, LATER).locator('.gb-head'), info);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(LATER);
    await expect(page).toHaveURL(new RegExp(`/actividades/${world.act[LATER]}`));
    await page.getByRole('button', { name: '2.º ESO C', exact: true }).click();
    await expect(terms(page).getByRole('button', { name: '2.ª' })).toHaveAttribute('aria-pressed', 'true');
    await expect(column(page, LATER)).toBeVisible();
  });

  test('cuaderno-43 · the phone\'s back gesture from an activity returns to the Cuaderno in the same evaluación', async ({ page, world }, info) => {
    await openCuaderno(page, world.id, 2);
    await press(column(page, LATER).locator('.gb-head'), info);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(LATER);
    await page.goBack();
    await expect(page).toHaveURL(/term=2/);
    await expect(column(page, LATER)).toBeVisible();
    await expect(cell(page, LUCIA, LATER)).toHaveText('—');
  });
});
