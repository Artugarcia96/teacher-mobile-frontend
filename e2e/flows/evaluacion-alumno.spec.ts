import {
  BASE, commentBox, confirmDialog, csvRows, DETAILS, downloaded, evalRow, evaluation, expect, isMobile, NAMES,
  openEvaluation, pdfText, press, sheetInHistory, sheetOf, shot, stepperValue, studentRow, STUDENTS, test, toast, type Api,
  type Page,
} from './evaluacion-helpers';

// La hoja del alumno en Evaluación (docs/PRODUCT.md §4.6): nota (± y «Usar la propuesta»), «Cómo se calcula», lo que le
// falta, el comentario de boletín, «Aceptar y siguiente» (sin aviso salvo el último, y sin aceptar el siguiente con un
// doble toque), ✕ / Esc / atrás (con cambios, preguntan antes de descartarlos), un comentario que ya no cuadra con la
// nota («Escrito para un 7 · nota 8») o que nombra otra calificación («Dice «un bien» · nota 7») y «Usar 8» de una
// recuperación. What the AI writes is in evaluacion-ia.spec.ts.

/** Every PUT of an evaluation row the page sends, from now on. */
function rowSaves(page: Page): string[] {
  const saves: string[] = [];
  page.on('request', (r) => { if (r.method() === 'PUT' && /\/evaluation\/\d\/students\//.test(r.url())) saves.push(r.postData() ?? ''); });
  return saves;
}

async function openSheet(page: Page, i: number, info: Parameters<typeof press>[1]) {
  await press(studentRow(page, NAMES[i]), info);
  const sheet = sheetOf(page, NAMES[i]);
  await expect(sheet).toBeVisible();
  return sheet;
}

const discard = (page: Page) => confirmDialog(page, 'Descartar los cambios');

test.describe('la hoja del alumno', () => {
  test.use({ worldSpec: { courses: [BASE] } });

  test('evaluacion-40 abrir la hoja: nota propuesta, lo que se sabe del alumno y el comentario vacío', async ({ page, world }, info) => {
    await openEvaluation(page, world.c.id);
    const sheet = await openSheet(page, 0, info);
    await expect(sheet.locator('.sheet__sub')).toHaveText('1 de 6 · Media 7,7 · propuesta 8 NT · 0 faltas');
    await expect(stepperValue(sheet)).toHaveText('8');
    await expect(sheet.getByText('Igual que la propuesta')).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Usar la propuesta' })).toHaveCount(0);
    await expect(commentBox(sheet)).toHaveValue('');
    await expect(commentBox(sheet)).toHaveAttribute('placeholder', 'Qué ha hecho bien, qué debe mejorar y una recomendación concreta.');
    await expect(sheet.getByText('Borrador IA')).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: 'Cómo se calcula' })).toHaveAttribute('aria-expanded', 'false');
    await expect(sheet.getByRole('button', { name: 'Aceptar y siguiente' })).toBeEnabled();
    await shot(page, info, 'hoja');
  });

  test('evaluacion-41 ajustar la nota con + y aceptar: se guarda, la fila dice «Ajustada» y el resumen cambia', async ({ page, world }, info) => {
    await openEvaluation(page, world.c.id);
    const sheet = await openSheet(page, 0, info);
    await press(sheet.getByRole('button', { name: 'Más' }), info);
    await expect(stepperValue(sheet)).toHaveText('9');
    await expect(sheet.getByText('Ajustada · propuesta 8')).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Usar la propuesta' })).toBeVisible();
    await sheet.getByRole('button', { name: 'Aceptar y siguiente' }).click();
    await expect(sheetOf(page, NAMES[1])).toBeVisible(); // on to Pablo
    await page.keyboard.press('Escape');

    const row = studentRow(page, NAMES[0]);
    await expect(row.locator('.grade-pill')).toHaveText('9SB');
    await expect(row.getByText('Ajustada (prop. 8)')).toBeVisible();
    await expect(page.getByLabel('Resumen de la evaluación')).toHaveText('Media 6,4 · 67 % aprobados · IN 2 · SU 0 · BI 1 · NT 1 · SB 2');
    expect(await evalRow(world.api, world.c.id, STUDENTS[0])).toMatchObject({ final_grade: 9, final: 9, proposed: 8 });

    await page.reload();
    await expect(studentRow(page, NAMES[0]).getByText('Ajustada (prop. 8)')).toBeVisible();
  });

  test('evaluacion-18 ✕ con la nota cambiada pregunta antes de descartar; el velo no cierra; descartar no guarda nada', async ({ page, world }, info) => {
    const saves = rowSaves(page);
    await openEvaluation(page, world.c.id);
    const sheet = await openSheet(page, 0, info);
    await press(sheet.getByRole('button', { name: 'Más' }), info);
    // A tap outside the sheet does not close it with a change pending.
    await page.mouse.click(4, 4);
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Cerrar' }).click();
    await expect(discard(page)).toContainText('Lo que has escrito se perderá.');
    await discard(page).getByRole('button', { name: 'Cancelar' }).click();
    await expect(stepperValue(sheet)).toHaveText('9');
    await sheet.getByRole('button', { name: 'Cerrar' }).click();
    await discard(page).getByRole('button', { name: 'Descartar' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(saves).toEqual([]);
    expect((await evalRow(world.api, world.c.id, STUDENTS[0])).final_grade).toBeNull();
    await expect(studentRow(page, NAMES[0]).locator('.grade-pill')).toHaveText('8NT');
  });

  test('evaluacion-42 la nota va de 1 a 10: «Más» y «Menos» se desactivan en los extremos', async ({ page, world }, info) => {
    const saves = rowSaves(page);
    await openEvaluation(page, world.c.id);
    const sheet = await openSheet(page, 3, info); // Hugo: propuesta 10
    const more = sheet.getByRole('button', { name: 'Más' });
    const less = sheet.getByRole('button', { name: 'Menos' });
    await expect(stepperValue(sheet)).toHaveText('10');
    await expect(more).toBeDisabled();
    for (let v = 9; v >= 1; v--) {
      await press(less, info);
      await expect(stepperValue(sheet)).toHaveText(String(v));
    }
    await expect(less).toBeDisabled();
    await expect(sheet.getByText('Ajustada · propuesta 10')).toBeVisible();
    // Back to the proposal: nothing changed, so ✕ closes without asking.
    await sheet.getByRole('button', { name: 'Usar la propuesta' }).click();
    await expect(stepperValue(sheet)).toHaveText('10');
    await sheet.getByRole('button', { name: 'Cerrar' }).click();
    await expect(sheet).toBeHidden();
    await expect(discard(page)).toHaveCount(0);
    expect(saves).toEqual([]);
    expect((await evalRow(world.api, world.c.id, STUDENTS[3])).final_grade).toBeNull();
  });

  test('evaluacion-43 escribir el comentario a mano y aceptarlo: queda como del profesor, aceptado', async ({ page, world }, info) => {
    await openEvaluation(page, world.c.id);
    const sheet = await openSheet(page, 1, info);
    await commentBox(sheet).fill('Ha trabajado poco. Debe repasar las operaciones con enteros cada día.');
    await sheet.getByRole('button', { name: 'Aceptar y siguiente' }).click();
    await expect(sheetOf(page, NAMES[2])).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(studentRow(page, NAMES[1]).locator('.ev-row__comment')).toHaveText('Ha trabajado poco. Debe repasar las operaciones con enteros cada día.');
    await expect(page.locator('.ev-count')).toHaveText('5 por redactar');
    await expect(page.getByRole('button', { name: 'Redactar 5 comentarios con IA' })).toBeVisible();
    expect(await evalRow(world.api, world.c.id, STUDENTS[1])).toMatchObject({
      comment: 'Ha trabajado poco. Debe repasar las operaciones con enteros cada día.', comment_source: 'manual',
      comment_status: 'final', comment_grade: 3, comment_stale: false,
    });
  });

  test('evaluacion-44 «Aceptar y siguiente»: pasa al siguiente sin aviso, un doble toque no acepta el siguiente; sin cambios, solo pasa', async ({ page, world }, info) => {
    const saves = rowSaves(page);
    await openEvaluation(page, world.c.id);
    const sheet = await openSheet(page, 0, info);
    await commentBox(sheet).fill('Buen trimestre: constante y participativa. Puede cuidar más la presentación.');
    const accept = page.getByRole('dialog').getByRole('button', { name: 'Aceptar y siguiente' });
    await accept.click();
    const next = sheetOf(page, NAMES[1]);
    await expect(next.locator('.sheet__sub')).toHaveText('2 de 6 · Media 3,3 · propuesta 3 IN · 0 faltas');
    await expect(accept).toBeDisabled(); // an instant on each student: a second tap cannot accept Pablo unseen
    await expect(accept).toBeEnabled();
    await expect(toast(page, /^Aceptado/)).toHaveCount(0); // no toast over the next comment
    await expect(commentBox(next)).toHaveValue('');
    expect(await evalRow(world.api, world.c.id, STUDENTS[0])).toMatchObject({
      comment_status: 'final', comment_source: 'manual', comment_grade: 8,
    });
    expect(saves).toHaveLength(1);

    // Pablo has nothing to accept: the sheet moves on without saving anything.
    await accept.click();
    await expect(sheetOf(page, NAMES[2]).locator('.sheet__sub')).toHaveText(/^3 de 6 · /);
    expect(saves).toHaveLength(1);
    expect(await evalRow(world.api, world.c.id, STUDENTS[1])).toMatchObject({ comment: null, final_grade: null });
  });

  test('evaluacion-45 el último alumno: «Aceptar» lo dice y cierra la hoja', async ({ page, world }, info) => {
    await openEvaluation(page, world.c.id);
    const sheet = await openSheet(page, 5, info);
    await expect(sheet.locator('.sheet__sub')).toHaveText(/^6 de 6 · /);
    await expect(sheet.getByRole('button', { name: 'Aceptar y siguiente' })).toHaveCount(0);
    await commentBox(sheet).fill('Ha mejorado mucho en la segunda mitad del trimestre.');
    await sheet.getByRole('button', { name: 'Aceptar', exact: true }).click();
    await expect(toast(page, 'Aceptado: Adrián')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await evalRow(world.api, world.c.id, STUDENTS[5])).comment_status).toBe('final');
  });

  test('evaluacion-46 Esc y el gesto de atrás: sin cambios cierran; con cambios preguntan, y descartar no guarda ni sale de la página', async ({ page, world }, info) => {
    const saves = rowSaves(page);
    await openEvaluation(page, world.c.id);
    const url = page.url();

    // Nothing touched: Esc only closes.
    let sheet = await openSheet(page, 2, info);
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();

    sheet = await openSheet(page, 4, info);
    await commentBox(sheet).fill('Tiene que entregar las tareas a tiempo.');
    await page.keyboard.press('Escape');
    await discard(page).getByRole('button', { name: 'Cancelar' }).click();
    await expect(commentBox(sheet)).toHaveValue('Tiene que entregar las tareas a tiempo.');
    // The phone's back gesture asks the same.
    await sheetInHistory(page);
    await page.goBack();
    await discard(page).getByRole('button', { name: 'Descartar' }).click();
    await expect(sheet).toBeHidden();
    expect(page.url()).toBe(url);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Primera evaluación');
    expect(saves).toEqual([]);
    expect((await evaluation(world.api, world.c.id)).rows[4].comment).toBeNull();
  });

  test('evaluacion-47 con teclado: abrir un alumno con Intro desde la lista', async ({ page, world }, info) => {
    test.skip(isMobile(info), 'keyboard path: desktop');
    await openEvaluation(page, world.c.id);
    await studentRow(page, NAMES[1]).focus();
    await page.keyboard.press('Enter');
    const sheet = sheetOf(page, NAMES[1]);
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
  });

  test('evaluacion-56 si no se puede guardar, lo dice y la hoja sigue abierta con lo escrito', async ({ page, world }, info) => {
    await page.route('**/api/courses/*/evaluation/1/students/*', (r) => r.fulfill({
      status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Internal Server Error' }),
    }));
    await openEvaluation(page, world.c.id);
    const sheet = await openSheet(page, 5, info);
    await commentBox(sheet).fill('Buen trimestre.');
    await sheet.getByRole('button', { name: 'Aceptar', exact: true }).click();
    await expect(toast(page, 'El servidor ha fallado. Inténtalo en un momento.')).toBeVisible();
    await expect(sheet).toBeVisible();
    await expect(commentBox(sheet)).toHaveValue('Buen trimestre.');
    await page.unroute('**/api/courses/*/evaluation/1/students/*');
    await sheet.getByRole('button', { name: 'Aceptar', exact: true }).click();
    await expect(toast(page, 'Aceptado: Adrián')).toBeVisible();
    expect((await evalRow(world.api, world.c.id, STUDENTS[5])).comment).toBe('Buen trimestre.');
  });

  test('evaluacion-57 si el cálculo no carga, «Cómo se calcula» lo dice', async ({ page, world }, info) => {
    await page.route('**/api/courses/*/gradebook?*', (r) => r.fulfill({
      status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Internal Server Error' }),
    }));
    await openEvaluation(page, world.c.id);
    const sheet = await openSheet(page, 0, info);
    await sheet.getByRole('button', { name: 'Cómo se calcula' }).click();
    await expect(sheet.getByText('No se ha podido cargar el cálculo. El servidor ha fallado. Inténtalo en un momento.')).toBeVisible({ timeout: 20_000 });
  });

  test('evaluacion-48 «Cómo se calcula»: la media de cada categoría y una fórmula que da la media mostrada', async ({ page, world }, info) => {
    await openEvaluation(page, world.c.id);
    const sheet = await openSheet(page, 0, info);
    const toggle = sheet.getByRole('button', { name: 'Cómo se calcula' });
    await toggle.click();
    const hide = sheet.getByRole('button', { name: 'Ocultar cómo se calcula' });
    await expect(hide).toHaveAttribute('aria-expanded', 'true');
    const breakdown = sheet.locator('.avg-breakdown');
    await expect(breakdown.locator('.row')).toHaveText([/^ExámenesPesa un 60 %8,00$/, /^Trabajos y fichasPesa un 30 %7,00$/, /^ObservaciónPesa un 10 %Sin notas$/]);
    await expect(breakdown.getByText('(8,00 × 60 + 7,00 × 30) / 90 = 7,67 → 7,7')).toBeVisible();
    await expect(breakdown).toContainText('Las categorías sin notas no cuentan: su peso se reparte entre las demás.');
    await hide.click();
    await expect(breakdown).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: 'Cómo se calcula' })).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('lo que la hoja cuenta de cada alumno', () => {
  test.use({ worldSpec: { courses: [DETAILS] } });

  test('evaluacion-49 recuperación, faltas justificadas, examen pendiente, notas que no cuentan y ACS', async ({ page, world }, info) => {
    await openEvaluation(page, world.c.id);

    let sheet = await openSheet(page, 1, info); // Pablo: recovered
    await expect(sheet.locator('.ev-sheet__facts')).toHaveText('Recuperación: 7,0 · la media pasa de 3,2 a 7,0 (3 → 7 rec.)');
    await sheet.getByRole('button', { name: 'Cómo se calcula' }).click();
    await expect(sheet.locator('.avg-breakdown')).toContainText('Recuperación: 7,0 → la media pasa de 3,2 a 7,0 (la recuperación sustituye si es mayor).');
    await sheet.getByRole('button', { name: 'Cerrar' }).click();

    sheet = await openSheet(page, 2, info); // Lucía: a task without a grade, two absences (one justified)
    await expect(sheet.locator('.sheet__sub')).toHaveText('3 de 6 · Media 6,2 · propuesta 6 BI · 2 faltas (1 just.)');
    await expect(sheet.locator('.ev-sheet__facts')).toHaveText('Sin nota que cuente: Trabajo · Proyecto');
    await sheet.getByRole('button', { name: 'Cerrar' }).click();

    sheet = await openSheet(page, 3, info); // Hugo: ACS
    await expect(sheet.locator('.ev-sheet__facts')).toHaveText('ACS: la nota y el comentario se refieren a su adaptación curricular.');
    await sheet.getByRole('button', { name: 'Cerrar' }).click();

    sheet = await openSheet(page, 4, info); // Irene: missed Examen U2
    await expect(sheet.locator('.sheet__sub')).toHaveText('5 de 6 · Media 4,5 · propuesta 5 SU · 1 falta');
    await expect(sheet.locator('.ev-sheet__facts')).toHaveText('Pendiente (faltó): Examen U2 · Fracciones');
    await sheet.getByRole('button', { name: 'Cómo se calcula' }).click();
    await expect(sheet.locator('.avg-breakdown__out li')).toHaveText(['Examen U2 · Fracciones: faltó, pendiente']);
    await sheet.getByRole('button', { name: 'Cerrar' }).click();

    sheet = await openSheet(page, 5, info); // Adrián: adjusted, an AI grade to review and a task without a grade
    await expect(stepperValue(sheet)).toHaveText('8');
    await expect(sheet.getByText('Ajustada · propuesta 7')).toBeVisible();
    await expect(sheet.locator('.ev-sheet__facts')).toHaveText('Sin nota que cuente: Trabajo · Proyecto, Examen U2 · Fracciones');
    await sheet.getByRole('button', { name: 'Cómo se calcula' }).click();
    await expect(sheet.locator('.avg-breakdown__out li')).toHaveText(['Trabajo · Proyecto: sin nota', 'Examen U2 · Fracciones: borrador IA']);
    await shot(page, info, 'hoja-hechos');
  });

  test('evaluacion-50 «Usar la propuesta» quita el ajuste', async ({ page, world }, info) => {
    await openEvaluation(page, world.c.id);
    const sheet = await openSheet(page, 5, info);
    await sheet.getByRole('button', { name: 'Usar la propuesta' }).click();
    await expect(stepperValue(sheet)).toHaveText('7');
    await expect(sheet.getByText('Igual que la propuesta')).toBeVisible();
    await sheet.getByRole('button', { name: 'Aceptar', exact: true }).click();
    await expect(toast(page, 'Guardado: Adrián')).toBeVisible();
    await expect(studentRow(page, NAMES[5]).getByText(/Ajustada/)).toHaveCount(0);
    await expect(studentRow(page, NAMES[5]).locator('.grade-pill')).toHaveText('7NT');
    expect(await evalRow(world.api, world.c.id, STUDENTS[5])).toMatchObject({ final_grade: null, final: 7 });
  });
});

test.describe('un alumno sin notas', () => {
  test.use({
    worldSpec: {
      courses: [{
        students: STUDENTS.slice(0, 2),
        activities: [{ title: 'Examen U1 · Números', date: '2026-10-29', grades: [6] }],
      }],
    },
  });

  test('evaluacion-51 sin propuesta: «Poner nota» empieza en 5', async ({ page, world }, info) => {
    await openEvaluation(page, world.c.id);
    const sheet = await openSheet(page, 1, info);
    await expect(sheet.locator('.sheet__sub')).toHaveText('2 de 2 · Media — · sin propuesta · 0 faltas');
    await expect(sheet.locator('.ev-sheet__facts')).toHaveText('Sin nota que cuente: Examen U1 · Números');
    await sheet.getByRole('button', { name: 'Poner nota' }).click();
    await expect(stepperValue(sheet)).toHaveText('5');
    await sheet.getByRole('button', { name: 'Aceptar', exact: true }).click();
    await expect(toast(page, 'Guardado: Pablo')).toBeVisible();
    await expect(studentRow(page, NAMES[1]).locator('.grade-pill')).toHaveText('5SU');
    expect(await evalRow(world.api, world.c.id, STUDENTS[1])).toMatchObject({ final_grade: 5, proposed: null, final: 5 });
  });
});

test.describe('un comentario que ya no cuadra con la nota', () => {
  // Adrián's comment was accepted with his proposal (7); then his grade was set to 8.
  const TEXT = 'Buen trabajo en las fichas; en los exámenes puede rendir más.';
  test.use({ worldSpec: { courses: [{ ...BASE, evaluation: [{ student: 5, comment: TEXT, accept: true }, { student: 5, final: 8 }] }] } });

  test('evaluacion-52 «Escrito para un 7 · nota 8»: no se imprime y no se puede aceptar hasta corregirlo o redactarlo de nuevo', async ({ page, world }, info) => {
    await openEvaluation(page, world.c.id);
    // The row says so instead of the text; the count too.
    await expect(studentRow(page, NAMES[5]).locator('.ev-row__comment')).toHaveText('Escrito para un 7 · nota 8');
    await expect(page.locator('.ev-count')).toHaveText('5 por redactar · 1 no cuadra con la nota');
    // Neither the CSV nor the acta prints it.
    const { body } = await downloaded(page, () => page.getByRole('button', { name: 'Exportar notas (CSV)' }).click());
    expect(csvRows(body)[6]).toEqual(['Fuentes Vera', 'Adrián', '8', 'NT', '']);

    const sheet = await openSheet(page, 5, info);
    const stale = sheet.locator('.callout').filter({ hasText: 'Escrito para un 7 · nota 8. Corrígelo o redáctalo de nuevo.' });
    await expect(stale).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'El comentario dice otra nota' })).toBeDisabled();
    await expect(sheet.getByRole('button', { name: 'Redactar de nuevo' })).toBeEnabled();
    await expect(sheet.getByRole('button', { name: /^Aceptar/ })).toHaveCount(0);

    // Back to the grade it was written for: it matches again.
    await sheet.getByRole('button', { name: 'Usar la propuesta' }).click();
    await expect(stale).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: 'Aceptar', exact: true })).toBeEnabled();
    await press(sheet.getByRole('button', { name: 'Más' }), info);
    await expect(sheet.getByText('Escrito para un 7 · nota 8. Corrígelo o redáctalo de nuevo.')).toBeVisible();

    // «Redactar de nuevo» replaces what the teacher accepted: it asks first.
    await sheet.getByRole('button', { name: 'Redactar de nuevo' }).click();
    const confirm = confirmDialog(page, 'Redactar de nuevo el comentario');
    await expect(confirm).toContainText('La IA escribe un borrador nuevo con la nota 8. El comentario actual se sustituye.');
    await confirm.getByRole('button', { name: 'Cancelar' }).click();
    await expect(confirm).toBeHidden();

    // Rewriting the text makes it the teacher's for this grade: it can be accepted.
    await commentBox(sheet).fill('Ha mejorado en los exámenes y mantiene el buen trabajo en las fichas.');
    await expect(sheet.getByText(/Corrígelo o redáctalo de nuevo/)).toHaveCount(0);
    await sheet.getByRole('button', { name: 'Aceptar', exact: true }).click();
    await expect(toast(page, 'Guardado: Adrián')).toBeVisible(); // it was accepted already: the new text is saved
    await expect(studentRow(page, NAMES[5]).locator('.ev-row__comment')).toHaveText('Ha mejorado en los exámenes y mantiene el buen trabajo en las fichas.');
    await expect(page.locator('.ev-count')).toHaveText('5 por redactar');
    expect(await evalRow(world.api, world.c.id, STUDENTS[5])).toMatchObject({
      comment_status: 'final', comment_source: 'manual', comment_grade: 8, comment_stale: false, final_grade: 8,
    });
  });
});

test.describe('un comentario que nombra otra calificación', () => {
  // Adrián's grade is a 7 (NT), and his comment says «un bien»; Marta's matches hers.
  const CLASH = 'Ha obtenido un bien: trabaja con constancia y participa en clase.';
  const FINE = 'Muy buen trimestre; sigue así.';
  test.use({ worldSpec: { courses: [{ ...BASE, evaluation: [{ student: 5, comment: CLASH }, { student: 0, comment: FINE, accept: true }] }] } });

  test('evaluacion-58 «Dice «un bien» · nota 7»: no sale de Sepia ni se puede aceptar hasta corregir la calificación', async ({ page, world, context }, info) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openEvaluation(page, world.c.id);
    await expect(studentRow(page, NAMES[5]).locator('.ev-row__comment')).toHaveText('Dice «un bien» · nota 7');
    await expect(page.locator('.ev-count')).toHaveText('4 por redactar · 1 no cuadra con la nota');
    expect(await evalRow(world.api, world.c.id, STUDENTS[5])).toMatchObject({ comment: CLASH, comment_clash: 'un bien' });

    // The CSV leaves it empty and the notice says what it does not carry; «Copiar» leaves it out too.
    const { body } = await downloaded(page, () => page.getByRole('button', { name: 'Exportar notas (CSV)' }).click());
    expect(csvRows(body)[1][4]).toBe(FINE);
    expect(csvRows(body)[6]).toEqual(['Fuentes Vera', 'Adrián', '7', 'NT', '']);
    await expect(toast(page, 'Notas descargadas. No llevan 1 comentario: sin revisar o que no cuadran con la nota.')).toBeVisible();
    const acta = await downloaded(page, () => page.getByRole('button', { name: 'Acta (PDF)' }).click());
    await expect(toast(page, 'Acta descargada. No lleva 1 comentario: sin revisar o que no cuadran con la nota.')).toBeVisible();
    const printed = pdfText(acta.body);
    expect(printed).toContain('No se imprime 1 comentario: 1 que no cuadra con la nota.');
    expect(printed).toContain(FINE);
    expect(printed).not.toContain('un bien');
    await page.getByRole('button', { name: 'Más acciones' }).click();
    await page.getByRole('menuitem', { name: 'Copiar todos los comentarios' }).click();
    await expect(toast(page, '1 comentario copiado. Sin copiar 1 comentario: sin revisar o que no cuadran con la nota.')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`Alonso Gil, Marta\n${FINE}`);

    // The sheet says what clashes and only offers to correct it or draft it again.
    const sheet = await openSheet(page, 5, info);
    await expect(sheet.locator('.callout').filter({ hasText: 'El comentario dice «un bien» y la nota es un 7. Corrígelo o redáctalo de nuevo.' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'El comentario dice otra nota' })).toBeDisabled();
    await expect(sheet.getByRole('button', { name: /^Aceptar/ })).toHaveCount(0);

    // Correcting the grade in the text lets it be accepted.
    await commentBox(sheet).fill('Ha obtenido un notable: trabaja con constancia y participa en clase.');
    await expect(sheet.getByText(/Corrígelo o redáctalo de nuevo/)).toHaveCount(0);
    await sheet.getByRole('button', { name: 'Aceptar', exact: true }).click();
    await expect(toast(page, 'Aceptado: Adrián')).toBeVisible();
    await expect(studentRow(page, NAMES[5]).locator('.ev-row__comment')).toHaveText('Ha obtenido un notable: trabaja con constancia y participa en clase.');
    await expect(page.locator('.ev-count')).toHaveText('4 por redactar');
    expect(await evalRow(world.api, world.c.id, STUDENTS[5])).toMatchObject({ comment_status: 'final', comment_clash: null });
  });
});

test.describe('notas ajustadas antes de una recuperación', () => {
  // Pablo 3 and Irene 4 recover with 8 and 9, but their grades were adjusted to 4 before: the recovery does not reach
  // the acta. Lucía (2) fails.
  test.use({
    worldSpec: {
      courses: [{
        students: STUDENTS,
        activities: [
          { title: 'Examen U1 · Números', date: '2026-10-29', grades: [8, 3, 2, 9, 4, 7] },
          { title: 'Recuperación de la 1.ª evaluación', date: '2026-11-18', countsFor: 'recovery', recovers: 1, only: [1, 4], grades: [null, 8, null, null, 9] },
        ],
        evaluation: [{ student: 1, final: 4 }, { student: 4, final: 4 }],
      }],
    },
  });

  test('evaluacion-53 «La nota ajustada (4) no incluye la recuperación (8)»: «Usar 8» en la página y en la hoja', async ({ page, world }, info) => {
    await openEvaluation(page, world.c.id);
    const callout = page.locator('.callout').filter({ hasText: 'no incluyen la recuperación' });
    await expect(callout).toHaveText('2 notas ajustadas no incluyen la recuperación. Benítez Ruiz, Pablo: ajustada 4, con la recuperación 8 Usar 8 · Esteban Mora, Irene: ajustada 4, con la recuperación 9 Usar 9');
    await expect(studentRow(page, NAMES[1]).locator('.ev-row__stale')).toHaveText('La nota ajustada (4) no incluye la recuperación (8)');
    await expect(studentRow(page, NAMES[1]).locator('.ev-row__meta')).toHaveText('Media 8,0 · 3 → 8 (rec.)');
    // Only Lucía fails: an adjustment the recovery has overtaken is not a fail.
    await expect(page.getByRole('button', { name: 'Crear recuperación (1)' })).toBeVisible();

    await callout.getByRole('button', { name: 'Usar 8' }).click();
    await expect(toast(page, 'Pablo: cuenta la recuperación (8)')).toBeVisible();
    await expect(page.locator('.callout').filter({ hasText: 'Una nota ajustada no incluye la recuperación.' })).toBeVisible();
    await expect(studentRow(page, NAMES[1]).locator('.grade-pill')).toHaveText('8NT');
    expect(await evalRow(world.api, world.c.id, STUDENTS[1])).toMatchObject({ final_grade: null, final: 8, stale_adjustment: false });

    const sheet = await openSheet(page, 4, info);
    const inSheet = sheet.locator('.callout').filter({ hasText: 'La nota ajustada (4) no incluye la recuperación (9).' });
    await inSheet.getByRole('button', { name: 'Usar 9' }).click();
    await expect(toast(page, 'Irene: cuenta la recuperación (9)')).toBeVisible();
    await expect(stepperValue(sheet)).toHaveText('9');
    await expect(sheet.getByText('Igual que la propuesta')).toBeVisible();
    await expect(inSheet).toHaveCount(0);
    await sheet.getByRole('button', { name: 'Cerrar' }).click();
    await expect(sheet).toBeHidden();
    await expect(page.locator('.callout').filter({ hasText: 'no incluye' })).toHaveCount(0);
    expect(await evalRow(world.api, world.c.id, STUDENTS[4])).toMatchObject({ final_grade: null, final: 9 });
  });
});

test.describe('los borradores de la IA de la demo (sin llamar a la IA)', () => {
  // 2.º ESO B of the demo: 26 report comments drafted by the AI when the demo was seeded. Only looked at.
  async function demoDraft(demo: Api) {
    const courses: { id: string; label: string }[] = await demo.get('/courses');
    const course = courses.find((c) => /2\.º ESO B/.test(c.label))!;
    const ev = await evaluation(demo, course.id);
    const index = ev.rows.findIndex((r) => r.comment_source === 'ai' && r.comment_status !== 'final' && !r.comment_stale
      && (r.proposed ?? 10) < 10 && r.final_grade == null);
    expect(index, 'a demo draft to look at').toBeGreaterThanOrEqual(0);
    return { course, row: ev.rows[index] };
  }

  test('evaluacion-54 cambiar la nota de un borrador de la IA avisa de que se redactará de nuevo al aceptar', async ({ page, demo }, info) => {
    const { course, row } = await demoDraft(demo);
    const saves = rowSaves(page);
    await openEvaluation(page, course.id);
    await expect(studentRow(page, row.student.name).locator('.ev-row__comment')).toHaveText(`Borrador IA ${row.comment}`);
    await press(studentRow(page, row.student.name), info);
    const sheet = sheetOf(page, row.student.name);
    await expect(sheet.getByText('Borrador IA')).toBeVisible();
    await expect(commentBox(sheet)).toHaveValue(row.comment!);
    await press(sheet.getByRole('button', { name: 'Más' }), info);
    await expect(sheet.getByText(`Al aceptar, la IA redacta de nuevo este borrador con la nota ${row.proposed! + 1}.`)).toBeVisible();
    // An AI draft is not «written for another grade»: accepting redrafts it, nothing blocks.
    await expect(sheet.getByText(/Corrígelo o redáctalo de nuevo/)).toHaveCount(0);
    await sheet.getByRole('button', { name: 'Usar la propuesta' }).click();
    await expect(sheet.getByText(/Al aceptar, la IA redacta de nuevo/)).toHaveCount(0);
    await sheet.getByRole('button', { name: 'Cerrar' }).click();
    await expect(sheet).toBeHidden();
    expect(saves).toEqual([]);
  });

  test('evaluacion-55 ✕ tras cambiar la nota de un borrador de la IA pregunta, y descartar no guarda ni pide otro borrador', async ({ page, demo }, info) => {
    const { course, row } = await demoDraft(demo);
    const saves = rowSaves(page);
    const drafts: string[] = [];
    // Never let the AI run on the demo from this test: the request is recorded and dropped.
    await page.route('**/api/courses/*/evaluation/1/comments', (r) => { drafts.push(r.request().postData() ?? ''); return r.abort(); });
    await openEvaluation(page, course.id);
    await press(studentRow(page, row.student.name), info);
    const sheet = sheetOf(page, row.student.name);
    await press(sheet.getByRole('button', { name: 'Más' }), info);
    await sheet.getByRole('button', { name: 'Cerrar' }).click();
    await discard(page).getByRole('button', { name: 'Descartar' }).click();
    await expect(sheet).toBeHidden();
    expect(drafts, 'no AI redraft on ✕').toEqual([]);
    expect(saves).toEqual([]);
    expect(await evalRow(demo, course.id, row.student.sort_name)).toMatchObject({
      final_grade: null, comment: row.comment, comment_source: 'ai', comment_status: 'draft',
    });
  });
});
