import {
  answer, detail, dialog, esc, expect, headerMenu, NAMES, openActivity, shot, stepHead, stepRow, test, toast,
} from './examenes-helpers';

// The activity page of any kind (docs/PRODUCT.md §3, §4.3, §4.5): reached from its Cuaderno column, header with the
// class, date, term and scale, «Editar datos» and «Eliminar actividad» in «···», and the grades typed by hand when
// there is no document (any non-exam activity, or an exam «Sin documento (solo nota)»). Each test is a teacher of its
// own (world); nothing here calls the AI.

const EXAM = 'Examen U2 · Fracciones';
const TASK = 'Trabajo · Fracciones en la cocina';

test.describe('examenes · la página de la actividad', () => {
  test.use({
    worldSpec: {
      activities: [
        { title: EXAM, date: '2026-11-17' },
        { title: TASK, kind: 'task', date: '2026-11-12', grades: [8, null, null, null, null] },
      ],
    },
  });

  test('examenes-01 · the Cuaderno column opens the exam; its header names class, day, term and scale; «‹ Cuaderno» goes back', async ({ page, world }, info) => {
    await page.goto(`/clases/${world.id}/cuaderno`);
    await page.getByTitle(`${EXAM} · mantén pulsado para editar`).click();
    await expect(page).toHaveURL(new RegExp(`/actividades/${world.act[EXAM]}$`));
    await expect(page.getByRole('heading', { level: 1, name: EXAM })).toBeVisible();
    await expect(page.getByText('Matemáticas · 2.º ESO C', { exact: true })).toBeVisible();
    await expect(page.getByText('martes, 17 de noviembre · 1.ª evaluación · sobre 10', { exact: true })).toBeVisible();
    // Before its document, the exam opens on Preparar with the three ways to prepare it.
    await expect(stepHead(page, 1, 'Preparar')).toBeVisible();
    for (const choice of ['Subir mi examen', 'Generar con IA', 'Sin documento (solo nota)']) {
      await expect(page.getByRole('button', { name: new RegExp(`^${esc(choice)}`) })).toBeVisible();
    }
    await expect(stepRow(page, 2, 'Recoger')).toContainText('Primero prepara el examen');
    await expect(stepRow(page, 3, 'Revisar')).toContainText('Sin notas todavía');
    await shot(page, info, '01-exam-new');
    await page.getByRole('button', { name: 'Cuaderno', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/clases/${world.id}/cuaderno$`));
  });

  test('examenes-02 · «+ Actividad» (Examen) creates the exam and opens its page on Preparar', async ({ page, world }) => {
    await page.goto(`/clases/${world.id}/cuaderno`);
    await page.getByRole('button', { name: 'Actividad', exact: true }).click();
    const sheet = dialog(page, 'Nueva actividad');
    await sheet.getByLabel('Título').fill('Examen U3 · Potencias');
    await expect(sheet.getByRole('button', { name: 'Examen', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await sheet.getByLabel('Fecha').fill('2026-11-26');
    await sheet.getByRole('button', { name: 'Crear actividad' }).click();
    await expect(toast(page, '«Examen U3 · Potencias» añadida al cuaderno')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Examen U3 · Potencias' })).toBeVisible();
    await expect(page.getByText('jueves, 26 de noviembre · 1.ª evaluación · sobre 10')).toBeVisible();
    await expect(stepHead(page, 1, 'Preparar')).toBeVisible();
    const id = page.url().match(/actividades\/([^/?#]+)/)![1];
    const a = await detail(world.api, id);
    expect([a.kind, a.date, a.term, a.max_score]).toEqual(['exam', '2026-11-26', 1, 10]);
  });

  test('examenes-03 · a non-exam activity: grades typed by hand, Enter goes down, NP, decimals, out of range refused', async ({ page, world }, info) => {
    await openActivity(page, `/clases/${world.id}/actividades/${world.act[TASK]}`, TASK);
    await expect(page.getByText('jueves, 12 de noviembre · 1.ª evaluación · Trabajo · sobre 10')).toBeVisible();
    await expect(stepHead(page, 1, 'Preparar')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2, name: 'Notas · 1 de 5' })).toBeVisible();
    await expect(page.getByText('Nota sobre 10. Escribe NP si no se presentó. Se guarda al pasar a la siguiente casilla.')).toBeVisible();
    const box = (i: number) => page.getByRole('textbox', { name: `Nota de ${NAMES[i]}` });
    await expect(box(0)).toHaveValue('8');
    await expect(box(1)).toHaveAttribute('placeholder', '—');

    await box(1).fill('6,5');
    await box(1).press('Enter');
    await expect(box(2)).toBeFocused();
    await box(2).fill('np');
    await box(2).press('Enter');
    await expect(box(3)).toBeFocused();
    await box(3).fill('11');
    await box(3).press('Enter');
    await expect(toast(page, 'Escribe una nota entre 0 y 10 o NP.')).toBeVisible();
    await expect(box(3)).toHaveValue('');
    await box(4).fill('0');
    await box(4).press('Enter'); // the last box: Enter saves and leaves it
    await expect(box(4)).not.toBeFocused();
    await expect(page.getByRole('heading', { level: 2, name: 'Notas · 4 de 5' })).toBeVisible();
    await shot(page, info, '03-manual-grades');

    await expect.poll(async () => (await detail(world.api, world.act[TASK])).sheet.map((r: { score: number | null; status: string }) =>
      r.status === 'absent' ? 'NP' : r.score)).toEqual([8, 6.5, 'NP', null, 0]);
    await page.reload();
    await expect(box(1)).toHaveValue('6,5');
    await expect(box(2)).toHaveValue('NP');

    // A grade already there is changed in place.
    await box(0).fill('9,25');
    await box(0).press('Tab');
    await expect.poll(async () => (await detail(world.api, world.act[TASK])).sheet[0].score).toBe(9.25);
  });

  test('examenes-04 · «Editar datos»: title, date (and so the term) and maximum score, with the reason when it cannot save', async ({ page, world }, info) => {
    await openActivity(page, `/clases/${world.id}/actividades/${world.act[TASK]}`, TASK);
    await headerMenu(page, 'Editar datos');
    const sheet = dialog(page, 'Editar datos');
    await expect(sheet.getByLabel('Título')).toHaveValue(TASK);
    await expect(sheet.getByLabel('Nota máxima')).toHaveValue('10');
    await sheet.getByLabel('Título').fill('  ');
    await expect(sheet.getByRole('button', { name: 'Escribe un título' })).toBeDisabled();
    await sheet.getByLabel('Título').fill('Trabajo · Recetas con fracciones');
    await sheet.getByLabel('Nota máxima').fill('0');
    await expect(sheet.getByRole('button', { name: 'Revisa la nota máxima' })).toBeDisabled();
    await sheet.getByLabel('Nota máxima').fill('20');
    await sheet.getByLabel('Fecha').fill('2027-01-20');
    await expect(sheet.getByText('La evaluación se deduce de la fecha.')).toBeVisible();
    await shot(page, info, '04-edit-data');
    await sheet.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Datos guardados')).toBeVisible();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole('heading', { level: 1, name: 'Trabajo · Recetas con fracciones' })).toBeVisible();
    await expect(page.getByText('miércoles, 20 de enero · 2.ª evaluación · Trabajo · sobre 20')).toBeVisible();
    await expect(page.getByText('Nota sobre 20.', { exact: false })).toBeVisible();
    const a = await detail(world.api, world.act[TASK]);
    expect([a.title, a.date, a.term, a.max_score]).toEqual(['Trabajo · Recetas con fracciones', '2027-01-20', 2, 20]);
  });

  test('examenes-05 · «Editar datos» cannot lower the maximum below a grade already given: the server says why', async ({ page, world }) => {
    await openActivity(page, `/clases/${world.id}/actividades/${world.act[TASK]}`, TASK);
    await headerMenu(page, 'Editar datos');
    const sheet = dialog(page, 'Editar datos');
    await sheet.getByLabel('Nota máxima').fill('5');
    await sheet.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, /Hay 1 nota por encima de 5|por encima de 5/)).toBeVisible();
    await expect(sheet).toBeVisible();
    expect((await detail(world.api, world.act[TASK])).max_score).toBe(10);
  });

  test('examenes-06 · «Eliminar actividad» asks first; cancelled it stays, confirmed it goes with its grades', async ({ page, world }, info) => {
    await openActivity(page, `/clases/${world.id}/actividades/${world.act[TASK]}`, TASK);
    await headerMenu(page, 'Eliminar actividad');
    const ask = dialog(page, 'Eliminar la actividad');
    await expect(ask.getByText('Se borran sus notas del cuaderno y las hojas escaneadas.')).toBeVisible();
    await shot(page, info, '06-delete-ask');
    await answer(page, 'Eliminar la actividad', 'Cancelar');
    await expect(page.getByRole('heading', { level: 1, name: TASK })).toBeVisible();
    expect((await world.api.fetch('GET', `/activities/${world.act[TASK]}`)).status()).toBe(200);

    await headerMenu(page, 'Eliminar actividad');
    await answer(page, 'Eliminar la actividad', 'Eliminar');
    await expect(toast(page, 'Actividad eliminada')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/clases/${world.id}/cuaderno$`));
    await expect(page.getByTitle(`${TASK} · mantén pulsado para editar`)).toHaveCount(0);
    expect((await world.api.fetch('GET', `/activities/${world.act[TASK]}`)).status()).toBe(404);
    // Back does not reopen a deleted activity.
    await page.goBack();
    await expect(page).not.toHaveURL(new RegExp(world.act[TASK]));
  });

  test('examenes-07 · an exam «Sin documento (solo nota)»: step 2 is «Poner notas», and it stays so after reloading', async ({ page, world }, info) => {
    await openActivity(page, `/clases/${world.id}/actividades/${world.act[EXAM]}`, EXAM);
    await page.getByRole('button', { name: /^Sin documento \(solo nota\)/ }).click();
    await expect(stepHead(page, 2, 'Poner notas')).toBeVisible();
    await expect(stepRow(page, 1, 'Preparar')).toContainText('Sin documento (solo nota)');
    await expect(stepRow(page, 2, 'Recoger')).toHaveCount(0);
    const box = (i: number) => page.getByRole('textbox', { name: `Nota de ${NAMES[i]}` });
    await box(0).fill('7,75');
    await box(0).press('Enter');
    await box(1).fill('NP');
    await box(1).press('Enter');
    await expect(page.getByRole('heading', { level: 2, name: 'Notas · 2 de 5' })).toBeVisible();
    await shot(page, info, '07-exam-by-hand');
    await expect.poll(async () => (await detail(world.api, world.act[EXAM])).sheet.slice(0, 2).map((r: { score: number | null; status: string }) =>
      [r.score, r.status])).toEqual([[7.75, 'confirmed'], [null, 'absent']]);

    await page.reload();
    await expect(stepHead(page, 2, 'Poner notas')).toBeVisible();
    await expect(stepRow(page, 2, 'Poner notas')).toHaveCount(0);
    await expect(box(0)).toHaveValue('7,75');
    await expect(stepRow(page, 1, 'Preparar')).toContainText('Sin documento (solo nota)');
    // Preparar can still be opened to upload or generate it later.
    await stepRow(page, 1, 'Preparar').click();
    await expect(page.getByRole('button', { name: /^Subir mi examen/ })).toBeVisible();
  });

  test('examenes-08 · an activity that does not exist says so and leads back to the Cuaderno', async ({ page, world }) => {
    await page.goto(`/clases/${world.id}/actividades/00000000-0000-0000-0000-000000000000`);
    await expect(page.getByText('No se ha podido abrir la actividad')).toBeVisible();
    await page.getByRole('link', { name: 'Volver al cuaderno' }).click();
    await expect(page).toHaveURL(new RegExp(`/clases/${world.id}/cuaderno$`));
  });
});

test.describe('examenes · llegar a un examen (demo)', () => {
  test('examenes-09 · Evaluar › «Por revisar» leads to the exam with drafts, on its review step', async ({ page }) => {
    await page.goto('/evaluar');
    await page.getByRole('link', { name: /Examen U2 · Fracciones/ }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Examen U2 · Fracciones' })).toBeVisible();
    await expect(stepHead(page, 3, 'Revisar')).toBeVisible();
    await expect(page.getByRole('link', { name: /^Revisar alumno a alumno · faltan \d+$/ })).toBeVisible();
  });

  test('examenes-10 · a unit\'s «Crear un examen de esta unidad» makes the exam and opens «Generar examen con IA» on that unit', async ({ page, demo }) => {
    const course = (await demo.get<{ id: string; label: string }[]>('/courses')).find((c) => c.label === 'Matemáticas · 2.º ESO B')!;
    const units: { id: string; title: string }[] = await demo.get(`/courses/${course.id}/units`);
    const unit = units.find((u) => u.title.includes('Fracciones')) ?? units[0];
    await page.goto(`/clases/${course.id}/unidades/${unit.id}`);
    await page.getByRole('button', { name: /^Crear un examen de esta unidad/ }).click();
    const sheet = dialog(page, 'Generar examen con IA');
    await expect(sheet).toBeVisible();
    const id = page.url().match(/actividades\/([^/?#]+)/)![1];
    try {
      await expect(page.getByRole('heading', { level: 1, name: `Examen · ${unit.title}` })).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`generar=1&unidad=${unit.id}`));
      await expect(sheet.getByRole('button', { name: unit.title, exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByText('jueves, 26 de noviembre · 1.ª evaluación · sobre 10')).toBeVisible(); // a week from today
      const a = await detail(demo, id);
      expect(a.unit_ids).toEqual([unit.id]);
      await sheet.getByRole('button', { name: 'Cerrar' }).click();
      await expect(sheet).toBeHidden();
      await expect(page).not.toHaveURL(/generar=1/);
    } finally {
      await demo.del(`/activities/${id}`);
    }
  });
  test('examenes-68 · a worksheet material «Evaluar esta ficha» becomes a column dated today, graded by hand on its page', async ({ page, demo }, info) => {
    const course = (await demo.get<{ id: string; label: string }[]>('/courses')).find((c) => c.label === 'Matemáticas · 2.º ESO B')!;
    const units: { id: string; title: string }[] = await demo.get(`/courses/${course.id}/units`);
    let ficha: { id: string; title: string; unit: string } | null = null;
    for (const u of units) {
      const m = (await demo.get(`/units/${u.id}`)).materials.find((x: { kind: string; status: string }) => x.kind === 'worksheet' && x.status === 'ready');
      if (m) { ficha = { id: m.id, title: m.title, unit: u.id }; break; }
    }
    if (!ficha) throw new Error('No worksheet in the demo 2.º ESO B: reset the data copy');
    await page.goto(`/clases/${course.id}/unidades/${ficha.unit}/materiales/${ficha.id}`);
    await page.getByRole('button', { name: 'Más opciones' }).click();
    await page.getByRole('menuitem', { name: 'Evaluar esta ficha' }).click();
    const ask = dialog(page, 'Evaluar esta ficha');
    await expect(ask.getByText(`Se añade una columna «${ficha.title}» al cuaderno con fecha de hoy (jueves, 19 de noviembre) y la rúbrica de la ficha.`, { exact: false })).toBeVisible();
    await answer(page, 'Evaluar esta ficha', 'Añadir al cuaderno');
    await expect(toast(page, 'Ficha añadida al cuaderno')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: ficha.title })).toBeVisible();
    const id = page.url().match(/actividades\/([^/?#]+)/)![1];
    try {
      await expect(page.getByText('jueves, 19 de noviembre · 1.ª evaluación · Ficha · sobre 10')).toBeVisible();
      const box = page.getByRole('textbox', { name: /^Nota de / }).first();
      await box.fill('8');
      await box.press('Enter');
      await expect(page.getByRole('heading', { level: 2, name: /^Notas · 1 de \d+$/ })).toBeVisible();
      await shot(page, info, '68-worksheet-graded');
      const a = await detail(demo, id);
      expect([a.kind, a.date, a.material_id]).toEqual(['worksheet', '2026-11-19', ficha.id]);
      expect(a.sheet.filter((r: { status: string }) => r.status === 'confirmed').map((r: { score: number }) => r.score)).toEqual([8]);
    } finally {
      await demo.del(`/activities/${id}`);
    }
  });
});
