import {
  average, bug, classMenu, CLASS, column, confirmDialog, expect, gradebook, isMobile, NAMES, openCuaderno, press, shot, test, terms, toast,
  type CourseSpec, type Page,
} from './cuaderno-helpers';

// Medias, evaluaciones y ponderaciones del Cuaderno (docs/PRODUCT.md §4.1.5, §4.5): the Media column is the server's;
// tapping it shows how it is built (category averages with two decimals, a formula that adds up to the average shown
// and, by name, what does not count); desktop also shows «Nota» (the proposal, or the adjustment made in Evaluación
// with «aj.»); «Media de la clase» at the bottom; 1.ª / 2.ª / 3.ª / Final; and the «Ponderaciones» sheet.
// Each test is a teacher of its own.

const [MARTA, PABLO, , , IRENE] = NAMES;
const E1 = 'Examen U1 · Números enteros';
const E2 = 'Examen U2 · Fracciones';

// Marta: 4,25 in E1 (NP in E2), 5,69 in her first worksheet (no grade in the second), 4,5 in Actitud (exempt in the
// second) and a 7 in the evaluación inicial, which does not count. Irene has nothing in Observación. Pablo's final
// grade was adjusted to 7 in Evaluación.
const MEDIAS: CourseSpec = {
  ...CLASS,
  activities: [
    { title: 'Prueba inicial', kind: 'exam', date: '2026-09-18', countsFor: 'none', grades: [7, 5, 6, 4, 8, 5] },
    { title: E1, kind: 'exam', date: '2026-10-15', grades: [4.25, 6, 7, 3, 8, 5] },
    { title: 'Ficha · Enteros', kind: 'worksheet', date: '2026-10-20', grades: [5.69, 7, 8, 4, 9, 6] },
    { title: 'Actitud', kind: 'attitude', date: '2026-10-30', grades: [4.5, 7, 8, 5, null, 6] },
    { title: E2, kind: 'exam', date: '2026-11-12', grades: ['NP', 5, 6, 4, 7, 6] },
    { title: 'Ficha · Fracciones', kind: 'worksheet', date: '2026-11-13', grades: [null, 6, 7, 5, 8, 7] },
    { title: 'Actitud de noviembre', kind: 'attitude', date: '2026-11-16', grades: ['EX', 8, 8, 6, null, 7] },
  ],
  adjust: [{ term: 1, student: 1, final: 7 }],
};

/** "6,7": one decimal, half up, the way the app prints the server's averages. */
const one = (v: number) => (Math.round(v * 10 + 1e-9) / 10).toFixed(1).replace('.', ',');
const why = (page: Page, name: string) => page.getByRole('dialog', { name });

test.describe('cuaderno · medias', () => {
  test.use({ worldSpec: MEDIAS });

  test('cuaderno-70 · «Cómo se calcula»: categories, a formula that adds up, and what does not count by name', async ({ page, world }, info) => {
    await openCuaderno(page, world.id);
    await expect(average(page, MARTA)).toHaveAccessibleName(`Media de ${MARTA}: 4,7`);
    await press(average(page, MARTA), info);
    const s = why(page, MARTA);
    await expect(s.getByText('Media de la 1.ª evaluación')).toBeVisible();
    await expect(s.locator('.gb-avg-sheet__num')).toHaveText('4,7');
    await expect(s.getByText(/^Propuesta/)).toHaveText('Propuesta 5SU');
    for (const [label, weight, value] of [['Exámenes', 60, '4,25'], ['Trabajos y fichas', 30, '5,69'], ['Observación', 10, '4,50']] as const) {
      const row = s.locator('.row').filter({ hasText: label });
      await expect(row).toContainText(`Pesa un ${weight} %`);
      await expect(row).toContainText(value);
    }
    await expect(s.getByText('(4,25 × 60 + 5,69 × 30 + 4,50 × 10) / 100 = 4,71 → 4,7')).toBeVisible();
    const out = s.locator('.avg-breakdown__out li');
    await expect(out).toHaveText([
      'Prueba inicial: no cuenta', `${E2}: NP`, 'Ficha · Fracciones: sin nota', 'Actitud de noviembre: exento',
    ]);
    await shot(page, info, '70-breakdown');
    await s.getByRole('link', { name: 'Ver ficha del alumno' }).click();
    await expect(page).toHaveURL(new RegExp(`/alumnos/${world.students[0].id}`));
  });

  test('cuaderno-71 · a category without grades does not count: its weight goes to the others', async ({ page, world }, info) => {
    await openCuaderno(page, world.id);
    await press(average(page, IRENE), info);
    const s = why(page, IRENE);
    await expect(s.locator('.row').filter({ hasText: 'Observación' })).toContainText('Sin notas');
    await expect(s.getByText('(7,50 × 60 + 8,50 × 30) / 90 = 7,83 → 7,8')).toBeVisible();
    await expect(s.getByText('Las categorías sin notas no cuentan: su peso se reparte entre las demás.')).toBeVisible();
    await expect(s.locator('.avg-breakdown__out li')).toContainText(['Actitud: sin nota']);
  });

  test('cuaderno-72 · «Nota»: the proposal, or the grade adjusted in Evaluación with «aj.» (desktop column; the sheet on both)', async ({ page, world }, info) => {
    await openCuaderno(page, world.id);
    const nota = (r: number) => page.locator('tbody tr').nth(r).locator('td.gb-prop');
    if (isMobile(info)) {
      await expect(nota(0)).toBeHidden(); // 56 px of Media on a phone, no «Nota»
      await expect(page.getByRole('columnheader', { name: 'Nota' })).toBeHidden();
    } else {
      await expect(nota(0)).toHaveText('5SU');
      await expect(nota(1)).toHaveText('7NTaj.');
      await expect(nota(1).locator('[title]')).toHaveAttribute('title', 'Ajustada en Evaluación (propuesta 6)');
    }
    await press(average(page, PABLO), info);
    await expect(why(page, PABLO).getByText(/^Propuesta 6 · ajustada a/)).toHaveText('Propuesta 6 · ajustada a 7NT');
    const gb = await gradebook(world.api, world.id);
    expect(gb.students[1]).toMatchObject({ final: 7, adjusted: true });
  });

  test('cuaderno-73 · «Media de la clase»: each activity and the whole class, as the server computes them', async ({ page, world }) => {
    await openCuaderno(page, world.id);
    const gb = await world.api.get(`/courses/${world.id}/gradebook?term=1`);
    const foot = page.locator('tfoot tr');
    await expect(foot.getByText('Media de la clase')).toBeVisible();
    const cells = foot.locator('td.gb-cell');
    await expect(cells).toHaveCount(gb.activities.length);
    for (const [i, a] of gb.activities.entries()) await expect(cells.nth(i)).toHaveText(one(a.class_average));
    await expect(foot.locator('td.gb-avg')).toHaveText(one(gb.class_average));
    expect(gb.activities.map((a: { title: string }) => a.title)[0]).toBe('Actitud de noviembre'); // most recent first
  });

  test('cuaderno-74 · Media opens Evaluación, and so does «Evaluar la 1.ª» in the class menu', async ({ page, world }) => {
    await openCuaderno(page, world.id);
    await page.getByRole('link', { name: 'Media. Evaluar la 1.ª' }).click();
    await expect(page).toHaveURL(new RegExp(`/clases/${world.id}/evaluacion/1`));
    await expect(page.getByRole('heading', { name: 'Primera evaluación' })).toBeVisible();
    await openCuaderno(page, world.id);
    await classMenu(page, 'Evaluar la 1.ª');
    await expect(page.getByRole('heading', { name: 'Primera evaluación' })).toBeVisible();
    // Evaluación's «‹ Cuaderno» comes back to the same term
    await page.getByRole('button', { name: 'Cuaderno' }).first().click();
    await expect(page).toHaveURL(/cuaderno\?term=1/);
  });

  test('cuaderno-75 · 1.ª / 2.ª / 3.ª / Final: the term is in the address, survives a reload, and an empty one says what to do', async ({ page, world }) => {
    await openCuaderno(page, world.id);
    const seg = terms(page);
    await expect(seg.getByRole('button', { name: '1.ª' })).toHaveAttribute('aria-pressed', 'true'); // the current term
    await seg.getByRole('button', { name: '2.ª' }).click();
    await expect(page).toHaveURL(/term=2/);
    await expect(page.getByText('Aún no hay actividades en la 2.ª evaluación')).toBeVisible();
    await expect(page.getByText('Crea un examen, una ficha o cualquier cosa que quieras calificar.')).toBeVisible();
    await page.reload();
    await expect(seg.getByRole('button', { name: '2.ª' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Añadir actividad' }).click();
    await expect(page.getByRole('dialog', { name: 'Nueva actividad' })).toBeVisible();
    await page.keyboard.press('Escape');
    await seg.getByRole('button', { name: '3.ª' }).click();
    await expect(page.getByText('Aún no hay actividades en la 3.ª evaluación')).toBeVisible();
    await seg.getByRole('button', { name: '1.ª' }).click();
    await expect(column(page, E1)).toBeVisible();
    await expect(page).toHaveURL(/term=1/);
  });

  test('cuaderno-76 · Final: one read-only column per evaluación that opens it, and the final average', async ({ page, world }, info) => {
    await openCuaderno(page, world.id, 4);
    await expect(terms(page).getByRole('button', { name: 'Final' })).toHaveAttribute('aria-pressed', 'true');
    for (const t of ['1.ª ev.', '2.ª ev.', '3.ª ev.']) await expect(page.getByRole('link', { name: t })).toBeVisible();
    const first = page.locator('tbody tr').first().locator('td.gb-cell--ro');
    await expect(first).toHaveCount(3);
    await expect(first.nth(0)).toHaveText('4,7'); // Marta's 1.ª
    await expect(first.nth(1)).toHaveText('—');
    await expect(page.locator('tbody tr').first().getByRole('button', { name: /· / })).toHaveCount(0); // nothing to type here
    await expect(average(page, MARTA)).toHaveAccessibleName(`Media de ${MARTA}: 4,7`);
    await expect(page.getByText('La media final es la media de las evaluaciones con nota (con sus recuperaciones).')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Media. Evaluación final' })).toContainText('Final ›');
    await shot(page, info, '76-final');
    await press(average(page, MARTA), info);
    await expect(why(page, MARTA).getByText('Media de la evaluación final')).toBeVisible();
    await expect(why(page, MARTA).getByText('(4,71) / 1 = 4,71 → 4,7')).toBeVisible();
    await page.keyboard.press('Escape');
    await classMenu(page, 'Evaluación final');
    await expect(page).toHaveURL(new RegExp(`/clases/${world.id}/evaluacion/4`));
    await openCuaderno(page, world.id, 4);
    await page.getByRole('link', { name: '1.ª ev.' }).click();
    await expect(page.getByRole('heading', { name: 'Primera evaluación' })).toBeVisible();
  });
});

test.describe('cuaderno · nota final', () => {
  test.use({ worldSpec: MEDIAS });

  test('cuaderno-82 · Final gives no final grade until the 3.ª evaluación has an average, like the student file', async ({ page, world }, info) => {
    bug('CUA-11', 'Cuaderno › Final shows a final «Nota» (5 SU) in November; the student file shows «—» until the 3.ª has an average (StudentPage gradeOf): two numbers for the same thing');
    const file = await world.api.get(`/students/${world.students[0].id}`);
    const fin = file.courses[0].terms.find((t: { term: number }) => t.term === 4);
    expect(fin.final ?? null).toBeNull(); // nothing set by the teacher; the file prints «—»
    await openCuaderno(page, world.id, 4);
    if (!isMobile(info)) await expect(page.locator('tbody tr').first().locator('td.gb-prop')).toHaveText('—');
    await press(average(page, MARTA), info);
    await expect(why(page, MARTA).getByText(/^Propuesta/)).toHaveCount(0);
  });
});

// ── Ponderaciones ────────────────────────────────────────────────────────────
const weights = (page: Page) => page.getByRole('dialog', { name: 'Ponderaciones' });
async function openWeights(page: Page) {
  await classMenu(page, 'Ponderaciones');
  await expect(weights(page).getByRole('textbox', { name: 'Categoría' }).first()).toBeVisible();
  return weights(page);
}

test.describe('cuaderno · ponderaciones', () => {
  test.use({ worldSpec: MEDIAS });

  test('cuaderno-77 · change a weight: the total and a hint when it is not 100, and the averages follow', async ({ page, world }, info) => {
    await openCuaderno(page, world.id);
    const s = await openWeights(page);
    await expect(s.getByText('Matemáticas · 2.º ESO C')).toBeVisible();
    const labels = s.getByRole('textbox', { name: 'Categoría' });
    await expect(labels).toHaveCount(3);
    for (const [i, v] of ['Exámenes', 'Trabajos y fichas', 'Observación'].entries()) await expect(labels.nth(i)).toHaveValue(v);
    await expect(s.getByText('Total 100 %')).toBeVisible();
    await expect(s.getByText('No suman 100')).toHaveCount(0);
    await s.getByRole('spinbutton', { name: 'Peso de Exámenes' }).fill('50');
    await expect(s.getByText('Total 90 %')).toBeVisible();
    await expect(s.getByText(/No suman 100: se usan como proporciones\./)).toBeVisible();
    await shot(page, info, '77-weights');
    await s.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Ponderaciones guardadas')).toBeVisible();
    await expect(s).toBeHidden();
    // (4,25 × 50 + 5,69 × 30 + 4,50 × 10) / 90 = 4,76
    await expect(average(page, MARTA)).toHaveAccessibleName(`Media de ${MARTA}: 4,8`);
    const course = await world.api.get(`/courses/${world.id}`);
    expect(course.categories.map((c: { label: string; weight: number }) => [c.label, c.weight])).toEqual([['Exámenes', 50], ['Trabajos y fichas', 30], ['Observación', 10]]);
  });

  test('cuaderno-78 · add a category, name it and use it in a new activity; one without activities goes without asking', async ({ page, world }) => {
    await openCuaderno(page, world.id);
    let s = await openWeights(page);
    await s.getByRole('button', { name: 'Añadir categoría' }).click();
    await expect(s.getByRole('button', { name: 'Pon nombre a cada categoría' })).toBeDisabled();
    await s.getByRole('textbox', { name: 'Categoría' }).last().fill('Proyectos');
    await s.getByRole('spinbutton', { name: 'Peso de Proyectos' }).fill('20');
    await expect(s.getByText('Total 120 %')).toBeVisible();
    await s.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Ponderaciones guardadas')).toBeVisible();

    await page.getByRole('button', { name: 'Actividad', exact: true }).click();
    const create = page.getByRole('dialog', { name: 'Nueva actividad' });
    await create.getByRole('button', { name: 'Más opciones' }).click();
    await expect(create.getByLabel('Categoría').locator('option')).toContainText(['Proyectos (20 %)']);
    await create.getByRole('button', { name: 'Cerrar' }).click();

    s = await openWeights(page);
    await s.getByRole('button', { name: 'Quitar Proyectos' }).click();
    await s.getByRole('button', { name: 'Guardar' }).click();
    await expect(s).toBeHidden(); // saved without asking: nothing counted in it
    await expect(confirmDialog(page, 'Quitar «Proyectos»')).toHaveCount(0);
    await expect.poll(async () => (await world.api.get(`/courses/${world.id}`)).categories.length).toBe(3);
  });

  test('cuaderno-79 · removing a category with activities asks first, saying how many stop counting', async ({ page, world }) => {
    await openCuaderno(page, world.id);
    const s = await openWeights(page);
    await s.getByRole('button', { name: 'Quitar Observación' }).click();
    await expect(s.getByText('Total 90 %')).toBeVisible();
    await s.getByRole('button', { name: 'Guardar' }).click();
    const ask = confirmDialog(page, 'Quitar «Observación»');
    await expect(ask.getByText('2 actividades dejarán de contar en la media hasta que las cambies de categoría.')).toBeVisible();
    await ask.getByRole('button', { name: 'Cancelar' }).click();
    await expect(s).toBeVisible();
    expect((await world.api.get(`/courses/${world.id}`)).categories).toHaveLength(3);
    await s.getByRole('button', { name: 'Guardar' }).click();
    await ask.getByRole('button', { name: 'Quitar' }).click();
    await expect(toast(page, 'Ponderaciones guardadas')).toBeVisible();
    expect((await world.api.get(`/courses/${world.id}`)).categories.map((c: { key: string }) => c.key)).toEqual(['exams', 'work']);
  });

  test('cuaderno-81 · the activities of a removed category stop counting, as the confirmation said', async ({ page, world }, info) => {
    bug('CUA-08', 'grading.compute_term puts activities of a removed category into the FIRST category (Exámenes): Actitud counts as an exam at 60 %');
    await world.api.patch(`/courses/${world.id}`, { categories: [{ key: 'exams', label: 'Exámenes', weight: 60 }, { key: 'work', label: 'Trabajos y fichas', weight: 30 }] });
    await openCuaderno(page, world.id);
    // Marta without Observación: (4,25 × 60 + 5,69 × 30) / 90 = 4,73
    await press(average(page, MARTA), info);
    await expect(why(page, MARTA).locator('.row').filter({ hasText: 'Exámenes' })).toContainText('4,25');
    await expect(average(page, MARTA)).toHaveAccessibleName(`Media de ${MARTA}: 4,7`);
  });

  test('cuaderno-80 · what cannot be saved says why; a failed save keeps the sheet with the error', async ({ page, world }) => {
    await openCuaderno(page, world.id);
    const s = await openWeights(page);
    for (const label of ['Exámenes', 'Trabajos y fichas', 'Observación']) await s.getByRole('spinbutton', { name: `Peso de ${label}` }).fill('0');
    await expect(s.getByRole('button', { name: 'Los pesos deben sumar más de 0' })).toBeDisabled();
    await s.getByRole('spinbutton', { name: 'Peso de Exámenes' }).fill('100');
    await s.getByRole('button', { name: 'Quitar Trabajos y fichas' }).click();
    await s.getByRole('button', { name: 'Quitar Observación' }).click();
    await expect(s.getByRole('button', { name: 'Quitar Exámenes' })).toBeDisabled(); // at least one category
    await page.route('**/api/courses/*', (route) => route.request().method() === 'PATCH'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"boom"}' }) : route.fallback());
    await s.getByRole('button', { name: 'Guardar' }).click();
    await confirmDialog(page, 'Quitar «Trabajos y fichas», «Observación»').getByRole('button', { name: 'Quitar' }).click();
    await expect(s.getByRole('alert')).toHaveText('El servidor ha fallado. Inténtalo en un momento.');
    await expect(s.getByRole('spinbutton', { name: 'Peso de Exámenes' })).toHaveValue('100');
    expect((await world.api.get(`/courses/${world.id}`)).categories).toHaveLength(3);
  });
});
