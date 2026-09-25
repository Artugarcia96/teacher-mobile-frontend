import {
  answer, bug, correction, dialog, esc, expect, fileName, headerMenu, openActivity, opensPdf, patchResponse, pdfText, RUBRIC, shot, stepHead, stepRow, test, toast,
  type Page,
} from './examenes-helpers';

// Preparar (docs/PRODUCT.md §4.3 · 1): the three ways to prepare an exam, the «Generar examen con IA» sheet up to the
// point where the AI would start (the AI itself: examenes-ia.spec.ts), what a failed generation leaves, a server
// without AI, the rubric table (typed by the teacher, or of a generated exam whose PDF is laid out again) and the PDFs
// to print. No AI is called here.

const EXAM = 'Examen U2 · Fracciones';
const LATER = '2026-11-26'; // a week ahead: the exam stays on Preparar

const row = (page: Page, title: string) => page.getByRole('button', { name: new RegExp(`^${esc(title)}(\\s|$)`) });
const points = (page: Page, n: string) => page.getByRole('group', { name: `Puntos de la pregunta ${n}` });

test.describe('examenes · preparar sin documento', () => {
  test.use({
    worldSpec: {
      units: [{ title: 'Números enteros', status: 'done' }, { title: 'Fracciones', status: 'current' }, { title: 'Potencias', status: 'pending' }],
      activities: [{ title: EXAM, date: LATER }, { title: 'Examen de repaso', date: LATER }],
    },
  });

  test('examenes-11 · «Generar con IA» opens its sheet on the unit the title names; questions 4-12, difficulty, instructions', async ({ page, world }, info) => {
    await openActivity(page, `/clases/${world.id}/actividades/${world.act[EXAM]}`, EXAM);
    await row(page, 'Generar con IA').click();
    const sheet = dialog(page, 'Generar examen con IA');
    await expect(sheet.getByText('La IA redacta un borrador con soluciones. Lo revisas antes de imprimir.')).toBeVisible();
    await expect(page).toHaveURL(/generar=1/);
    const chip = (t: string) => sheet.getByRole('button', { name: t, exact: true });
    await expect(chip('Fracciones')).toHaveAttribute('aria-pressed', 'true');
    await expect(chip('Números enteros')).toHaveAttribute('aria-pressed', 'false');
    await expect(sheet.getByText('Esta unidad aún no tiene archivos ni fotos con texto: la IA partirá del título.', { exact: false })).toBeVisible();
    await chip('Números enteros').click();
    await expect(sheet.getByText('Estas unidades aún no tienen archivos ni fotos con texto', { exact: false })).toBeVisible();

    const n = sheet.getByRole('group', { name: 'Número de preguntas' });
    await expect(n.getByRole('status')).toHaveText('6');
    for (let i = 0; i < 2; i++) await n.getByRole('button', { name: 'Menos' }).click();
    await expect(n.getByRole('status')).toHaveText('4');
    await expect(n.getByRole('button', { name: 'Menos' })).toBeDisabled();
    for (let i = 0; i < 8; i++) await n.getByRole('button', { name: 'Más' }).click();
    await expect(n.getByRole('status')).toHaveText('12');
    await expect(n.getByRole('button', { name: 'Más' })).toBeDisabled();
    const difficulty = sheet.getByRole('group', { name: 'Dificultad' });
    await expect(difficulty.getByRole('button', { name: 'Media' })).toHaveAttribute('aria-pressed', 'true');
    await difficulty.getByRole('button', { name: 'Difícil' }).click();
    await expect(difficulty.getByRole('button', { name: 'Difícil' })).toHaveAttribute('aria-pressed', 'true');

    // No unit chosen: the button says what is missing.
    await chip('Fracciones').click();
    await chip('Números enteros').click();
    await expect(sheet.getByRole('button', { name: 'Elige al menos una unidad' })).toBeDisabled();
    await chip('Potencias').click();
    await expect(sheet.getByRole('button', { name: 'Generar examen' })).toBeEnabled();
    await shot(page, info, '11-generate-sheet');

    // Instructions typed: closing asks before losing them.
    await sheet.getByLabel('Indicaciones (opcional)').fill('Sin calculadora; un problema de recetas.');
    await sheet.getByRole('button', { name: 'Cerrar' }).click();
    await answer(page, 'Descartar los cambios', 'Cancelar');
    await expect(sheet.getByLabel('Indicaciones (opcional)')).toHaveValue('Sin calculadora; un problema de recetas.');
    await sheet.getByRole('button', { name: 'Cerrar' }).click();
    await answer(page, 'Descartar los cambios', 'Descartar');
    await expect(sheet).toBeHidden();
    await expect(page).not.toHaveURL(/generar=1/);
    await expect(row(page, 'Subir mi examen')).toBeVisible();
    expect((await correction(world.api, world.act[EXAM])).job).toBeNull(); // nothing was sent to the AI
  });

  test('examenes-12 · a class without units: the sheet says the AI will use the exam\'s title', async ({ page, world }) => {
    for (const u of world.units) await world.api.del(`/units/${u.id}`);
    await openActivity(page, `/clases/${world.id}/actividades/${world.act['Examen de repaso']}?generar=1`, 'Examen de repaso');
    const sheet = dialog(page, 'Generar examen con IA');
    await expect(sheet.getByText('Esta clase aún no tiene unidades. La IA usará el título del examen.')).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Generar examen' })).toBeEnabled();
  });

  test('examenes-13 · a generation that failed stays in Preparar with its reason; «Volver a intentar» sends the same request, «Elegir otra opción» the choices', async ({ page, world }, info) => {
    const id = world.act[EXAM];
    const params = { unit_ids: [world.units[1].id], n_items: 5, difficulty: 'dificil', instructions: 'Con un problema de recetas.' };
    const failed = { id: 'job-e2e', kind: 'generate_exam', status: 'failed', progress: 1, total: 3, message: '', error: 'La IA ha tardado demasiado.', params, result: null };
    await patchResponse(page, `**/api/activities/${id}/correction`, (c) => ({ ...c, job: failed }));
    let sent: unknown = null;
    await page.route(`**/api/activities/${id}/generate`, async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ detail: 'Ya hay un trabajo en marcha para este examen. Espera a que termine.' }) });
    });
    await openActivity(page, `/clases/${world.id}/actividades/${id}`, EXAM);
    await expect(page.getByText('No se ha podido generar el examen.')).toBeVisible();
    await expect(page.getByText('La IA ha tardado demasiado.')).toBeVisible();
    await expect(row(page, 'Subir mi examen')).toHaveCount(0);
    await shot(page, info, '13-generation-failed');
    await page.getByRole('button', { name: 'Volver a intentar' }).click();
    await expect.poll(() => sent).toEqual(params);
    await expect(toast(page, 'Ya hay un trabajo en marcha para este examen.')).toBeVisible();
    await page.getByRole('button', { name: 'Elegir otra opción' }).click();
    await expect(page.getByText('No se ha podido generar el examen.')).toHaveCount(0);
    await expect(row(page, 'Subir mi examen')).toBeVisible();
  });

  test('examenes-14 · a server without AI: uploading and generating say why, «Sin documento» still works', async ({ page, world }, info) => {
    await patchResponse(page, '**/api/me', (me) => ({ ...me, ai_provider: 'none' }));
    await openActivity(page, `/clases/${world.id}/actividades/${world.act[EXAM]}`, EXAM);
    const why = 'La IA no está configurada en este servidor.';
    await expect(page.getByRole('button', { name: /^Subir mi examen/ })).toHaveCount(0); // not a button any more
    await expect(page.getByText('Subir mi examen')).toBeVisible();
    await expect(page.getByText(why)).toHaveCount(2);
    await page.getByText('Generar con IA').click();
    await expect(dialog(page, 'Generar examen con IA')).toHaveCount(0);
    await shot(page, info, '14-no-ai');
    await row(page, 'Sin documento (solo nota)').click();
    await expect(stepHead(page, 2, 'Poner notas')).toBeVisible();
  });

  test('examenes-15 · «Subir mi examen» asks for a PDF or photos of each page', async ({ page, world }) => {
    await openActivity(page, `/clases/${world.id}/actividades/${world.act[EXAM]}`, EXAM);
    await expect(page.getByText('PDF o fotos de cada página. Se leen las preguntas, los puntos y las soluciones.')).toBeVisible();
    const chooser = page.waitForEvent('filechooser');
    await row(page, 'Subir mi examen').click();
    const fc = await chooser;
    expect(fc.isMultiple()).toBe(true);
    expect(await fc.element().getAttribute('accept')).toBe('application/pdf,image/*');
  });
});

test.describe('examenes · rúbrica escrita por el profesor', () => {
  test.use({ worldSpec: { activities: [{ title: EXAM, date: LATER, rubric: RUBRIC }] } });

  test('examenes-16 · the rubric table saves every change at once: a question with «Hecho», points after a pause, add and remove', async ({ page, world }, info) => {
    const id = world.act[EXAM];
    const saved = async (): Promise<[string, string, number, number][]> => (await correction(world.api, id)).rubric.items
      .map((i: { text: string; answer: string; points: number; steps: string[] }) => [i.text, i.answer, i.points, i.steps.length]);
    await openActivity(page, `/clases/${world.id}/actividades/${id}`, EXAM);
    await expect(stepHead(page, 1, 'Preparar')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Rúbrica · 3 preguntas' })).toBeVisible();
    // Only the solutions: the exam has no document to print.
    await expect(row(page, 'Soluciones')).toBeVisible();
    await expect(row(page, 'Examen para imprimir')).toHaveCount(0);
    await expect(page.getByText('Total 10 / 10')).toBeVisible();
    await expect(page.getByRole('button', { name: /Guardar/ })).toHaveCount(0); // nothing to save by hand

    // A question in its sheet: statement (with the formula's preview), solution and points; «Hecho» saves it.
    await page.getByRole('button', { name: 'Editar pregunta 1' }).click();
    let sheet = dialog(page, 'Pregunta 1');
    await expect(sheet.getByLabel('Enunciado')).toHaveValue(RUBRIC[0].text);
    await expect(sheet.getByText('Las fórmulas van entre $…$, por ejemplo $\\frac{3}{4}$.')).toBeVisible();
    await sheet.getByLabel('Enunciado').fill('Simplifica $\\frac{18}{24}$ hasta la fracción irreducible.');
    await expect(sheet.locator('.rubric-preview .katex')).toBeVisible();
    await sheet.getByLabel('Solución').fill('$\\frac{3}{4}$');
    await sheet.getByRole('group', { name: 'Puntos' }).getByRole('button', { name: 'Más' }).click();
    await expect(sheet.getByRole('group', { name: 'Puntos' }).getByRole('status')).toHaveText('3,25');
    await sheet.getByRole('button', { name: 'Hecho' }).click();
    await expect(sheet).toBeHidden();
    await expect(toast(page, /^Pregunta 1 guardada$/)).toBeVisible();
    // Edited, it loses the AI's steps (they solved the old statement).
    await expect.poll(saved).toEqual([
      ['Simplifica $\\frac{18}{24}$ hasta la fracción irreducible.', '$\\frac{3}{4}$', 3.25, 0],
      [RUBRIC[1].text, RUBRIC[1].answer, 3, 0], [RUBRIC[2].text, RUBRIC[2].answer, 4, 0],
    ]);
    await expect(points(page, '1').getByRole('status')).toHaveText('3,25');
    await expect(page.getByText('Total 10,25 / 10')).toBeVisible();
    await expect(page.getByText('La rúbrica suma 10,25 puntos y el examen es sobre 10. La nota se ajustará a esa escala.')).toBeVisible();

    // Points in the table: a run of taps is one save, after a short pause.
    const refetched = page.waitForResponse((r) => r.url().endsWith(`/api/activities/${id}/correction`) && r.request().method() === 'GET');
    await points(page, '1').getByRole('button', { name: 'Menos' }).click();
    await points(page, '3').getByRole('button', { name: 'Menos' }).click();
    await points(page, '2').getByRole('button', { name: 'Más' }).click();
    await expect(page.getByText('Total 10 / 10')).toBeVisible();
    await expect(page.getByText(/La rúbrica suma/)).toHaveCount(0);
    await expect(toast(page, /^Pregunta 2 guardada$/)).toBeVisible();
    await expect.poll(async () => (await saved()).map((x) => x[2])).toEqual([3, 3.25, 3.75]);
    await refetched; // the exam as saved is back on the page (adding a question before that: EX-06, examenes-86)

    // A fourth question: «Hecho» adds it; «Quitar» takes it away again, asking first.
    await page.getByRole('button', { name: 'Añadir pregunta' }).click();
    sheet = dialog(page, 'Pregunta 4');
    await sheet.getByLabel('Enunciado').fill('Ordena de menor a mayor: $\\frac{1}{2}, \\frac{2}{5}, \\frac{3}{4}$.');
    await sheet.getByRole('button', { name: 'Hecho' }).click();
    await expect(toast(page, /^Pregunta 4 añadida$/)).toBeVisible();
    await expect(page.getByText('Total 11 / 10')).toBeVisible();
    await expect.poll(async () => (await saved()).length).toBe(4);
    await shot(page, info, '16-rubric');
    await page.getByRole('button', { name: 'Editar pregunta 4' }).click();
    await dialog(page, 'Pregunta 4').getByRole('button', { name: 'Quitar' }).click();
    const ask = dialog(page, 'Quitar esta pregunta');
    await expect(ask.getByText('Deja de contar en la rúbrica.')).toBeVisible();
    await answer(page, 'Quitar esta pregunta', 'Quitar');
    await expect(toast(page, /^Pregunta 4 quitada$/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Editar pregunta 4' })).toHaveCount(0);
    await expect.poll(async () => (await saved()).length).toBe(3);

    // A question added and never finished is not kept; nor what is typed in a sheet closed without «Hecho».
    await page.getByRole('button', { name: 'Añadir pregunta' }).click();
    await dialog(page, 'Pregunta 4').getByRole('button', { name: 'Quitar' }).click(); // nothing saved: no question
    await expect(dialog(page, 'Quitar esta pregunta')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Editar pregunta 4' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Editar pregunta 2' }).click();
    await expect(dialog(page, 'Pregunta 2').getByLabel('Solución')).toHaveValue(RUBRIC[1].answer);
    await dialog(page, 'Pregunta 2').getByLabel('Solución').fill('3/4');
    await dialog(page, 'Pregunta 2').getByRole('button', { name: 'Cerrar' }).click();
    await answer(page, 'Descartar los cambios', 'Descartar');
    expect((await saved())[1][1]).toBe(RUBRIC[1].answer);
    await page.reload();
    await expect(points(page, '3').getByRole('status')).toHaveText('3,75');
    await expect(page.getByRole('button', { name: 'Editar pregunta 1' })).toContainText('hasta la fracción irreducible');
  });

  test('examenes-86 · a question being added right after a save is not lost when the saved rubric comes back', async ({ page, world }) => {
    bug('EX-06', 'RubricTable follows the server whenever the saved rubric comes back: a question added (or a sheet opened) before that refetch lands is dropped, and its sheet closes with what was typed');
    const id = world.act[EXAM];
    await openActivity(page, `/clases/${world.id}/actividades/${id}`, EXAM);
    // The school Wi-Fi: the exam takes a moment to come back after each save.
    await page.route(`**/api/activities/${id}/correction`, async (route) => {
      await new Promise((r) => setTimeout(r, 2500));
      await route.fallback();
    });
    await points(page, '3').getByRole('button', { name: 'Más' }).click();
    await expect(toast(page, /^Pregunta 3 guardada$/)).toBeVisible();
    await page.getByRole('button', { name: 'Añadir pregunta' }).click();
    const sheet = dialog(page, 'Pregunta 4');
    await sheet.getByLabel('Enunciado').fill('Calcula $\\frac{2}{3}$ de 90.');
    await page.waitForResponse((r) => r.url().endsWith(`/api/activities/${id}/correction`));
    await expect(sheet.getByLabel('Enunciado')).toHaveValue('Calcula $\\frac{2}{3}$ de 90.');
    await sheet.getByRole('button', { name: 'Hecho' }).click();
    await expect(toast(page, /^Pregunta 4 añadida$/)).toBeVisible();
  });

  test('examenes-17 · a typed rubric prints only its solutions: «Soluciones» from the step and from «···»', async ({ page, world }) => {
    await openActivity(page, `/clases/${world.id}/actividades/${world.act[EXAM]}`, EXAM);
    const key = await opensPdf(page, () => row(page, 'Soluciones').click());
    expect(key.name).toBe(fileName('Soluciones', EXAM, '2.º ESO C'));
    expect(pdfText(key.body).join('\n')).toContain('24 L');
    await page.getByRole('button', { name: 'Más opciones' }).click();
    const items = page.getByRole('menuitem');
    await expect(items).toHaveText(['Soluciones', 'Editar datos', 'Eliminar actividad']);
    const again = await opensPdf(page, () => page.getByRole('menuitem', { name: 'Soluciones' }).click());
    expect(again.name).toBe(key.name);
  });

  test('examenes-18 · collapsed, Preparar says what is ready; Recoger waits for the pile', async ({ page, world }) => {
    await openActivity(page, `/clases/${world.id}/actividades/${world.act[EXAM]}`, EXAM);
    await stepRow(page, 3, 'Revisar').click();
    await expect(stepRow(page, 1, 'Preparar')).toContainText('Preparado · 3 preguntas');
    await expect(stepRow(page, 2, 'Recoger')).toContainText('Aún no has subido las hojas');
    await stepRow(page, 2, 'Recoger').click();
    await expect(stepHead(page, 2, 'Recoger')).toBeVisible();
    await expect(page.getByText('Sube el PDF del escáner o haz fotos del montón')).toBeVisible();
  });
});

test.describe('examenes · examen generado (copia del demo)', () => {
  test('examenes-19 · the PDFs to print: exam with its marker, extra sheet, solutions; from the step and from «···»', async ({ page, cloneExam, demo }, info) => {
    const exam = await cloneExam('global', { noVersions: true });
    await openActivity(page, exam.url, exam.title);
    const printRow = row(page, 'Examen para imprimir');
    await expect(printRow).toContainText(new RegExp(`\\d páginas por alumno · cada página lleva la marca ${esc(exam.code)}`));
    const printed = await opensPdf(page, () => printRow.click());
    expect(printed.name).toBe(fileName(exam.title, '2.º ESO B'));
    const text = pdfText(printed.body);
    const n = text.length;
    expect(n).toBeGreaterThan(1);
    expect(text[0]).toContain('Nombre y apellidos');
    text.forEach((t, i) => expect(t).toMatch(new RegExp(`Sepia · ${esc(exam.code)} · Pág\\. ${i + 1}/${n}`)));
    expect((await correction(demo, exam.id)).pages_per_paper).toBe(n); // the row says what the PDF has
    const extra = await opensPdf(page, () => row(page, 'Hoja extra').click());
    expect(extra.name).toMatch(/^Hoja extra - /);
    expect(pdfText(extra.body)[0]).toMatch(/Ejercicio n/);
    const key = await opensPdf(page, () => row(page, 'Soluciones').click());
    expect(key.name).toMatch(/^Soluciones - /);
    await shot(page, info, '19-generated');

    await page.getByRole('button', { name: 'Más opciones' }).click();
    await expect(page.getByRole('menuitem')).toHaveText(['Examen para imprimir', 'Imprimir para la clase', 'Hoja extra', 'Soluciones', 'Editar datos', 'Eliminar actividad']);
    const fromMenu = await opensPdf(page, () => page.getByRole('menuitem', { name: 'Examen para imprimir' }).click());
    expect(fromMenu.name).toBe(printed.name);
    expect((await opensPdf(page, () => headerMenu(page, 'Hoja extra'))).name).toBe(extra.name);
    expect((await opensPdf(page, () => headerMenu(page, 'Soluciones'))).name).toBe(key.name);
    // They open in the browser's viewer, not as a download.
    expect(printed.disposition).toMatch(/^inline;/);
  });

  test('examenes-20 · a generated exam\'s question saved with «Hecho» lays the exam out again with the new statement', async ({ page, cloneExam, demo }) => {
    const exam = await cloneExam('global', { noVersions: true });
    await openActivity(page, exam.url, exam.title);
    await page.getByRole('button', { name: 'Editar pregunta 5' }).click();
    const sheet = dialog(page, 'Pregunta 5');
    await expect(sheet.getByLabel('Enunciado')).not.toHaveValue('');
    await sheet.getByLabel('Enunciado').fill('En una clase de 30 alumnos, $\\frac{2}{5}$ van en bici al instituto. ¿Cuántos alumnos van en bici?');
    await sheet.getByLabel('Solución').fill('12 alumnos');
    await sheet.getByRole('button', { name: 'Hecho' }).click();
    await expect(toast(page, 'Pregunta 5 guardada · PDF actualizado')).toBeVisible({ timeout: 60_000 });
    const items = (await correction(demo, exam.id)).rubric.items;
    expect(items[4]).toMatchObject({ answer: '12 alumnos', steps: [] });
    const printed = await opensPdf(page, () => row(page, 'Examen para imprimir').click());
    expect(pdfText(printed.body).join('\n')).toMatch(/van en bici al instituto/);
  });

  test('examenes-21 · «Cambiar el examen»: upload another one (file picker) or generate another with AI (its sheet)', async ({ page, cloneExam }) => {
    const exam = await cloneExam('global', { noVersions: true });
    await openActivity(page, exam.url, exam.title);
    await page.getByRole('button', { name: 'Cambiar el examen' }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('menuitem', { name: 'Subir otro examen' }).click();
    expect((await chooser).isMultiple()).toBe(true);
    await page.getByRole('button', { name: 'Cambiar el examen' }).click();
    await page.getByRole('menuitem', { name: 'Generar otro con IA' }).click();
    await expect(dialog(page, 'Generar examen con IA')).toBeVisible();
  });
});
