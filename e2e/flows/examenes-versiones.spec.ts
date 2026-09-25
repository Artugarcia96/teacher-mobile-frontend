import {
  answer, correction, dialog, esc, expect, fileName, headerMenu, openActivity, opensPdf, patchResponse, pdfFontSize, pdfText, shot, stepHead, stepRow, test, toast,
  type Api, type Page,
} from './examenes-helpers';

// Preparar › Versiones (docs/PRODUCT.md §4.3 · Versiones, Imprimir para la clase) on a private copy of the demo's
// «Examen global · 1.ª evaluación»: Modelo A (11 students), Modelo B (11, written by the AI and not opened yet) and four
// adapted versions from the class's support measures (Ainhoa: por pasos + letra ampliada, Rubén: letra ampliada,
// Sofía: por pasos, Nerea V.: ACS 5.º Primaria). Opening, editing, reassigning, removing, the letra ampliada version
// (laid out again without AI) and printing for the class. Writing a version with the AI: examenes-ia.spec.ts.

const versionRow = (page: Page, label: string) => page.getByRole('button', { name: new RegExp(`^${esc(label)} `) });
const versions = (api: Api, id: string) => api.get(`/activities/${id}/versions`);
const version = async (api: Api, id: string, key: string) => {
  const vs = await versions(api, id);
  return [vs.base, ...vs.versions].find((v: { key: string }) => v.key === key);
};

test.describe('examenes · versiones', () => {
  test('examenes-22 · the versions at a glance: who takes each, «Borrador IA» until opened, the class\'s measures and reminders', async ({ page, cloneExam }, info) => {
    const exam = await cloneExam('global');
    await openActivity(page, exam.url, exam.title);
    await expect(page.getByRole('heading', { level: 2, name: 'Versiones' })).toBeVisible();
    await expect(versionRow(page, 'Modelo A')).toHaveAccessibleName(/^Modelo A 11 alumnos · Jorge, Olivia, Nicolás C\. y 8 más$/);
    await expect(versionRow(page, 'Modelo B')).toHaveAccessibleName(/^Modelo B Borrador IA 11 alumnos · Adrián, Nerea C\., Carmen C\. y 8 más$/);
    await expect(versionRow(page, 'Adaptado · letra ampliada')).toHaveAccessibleName('Adaptado · letra ampliada 1 alumno · Rubén');
    await expect(versionRow(page, 'Adaptado · por pasos,')).toHaveAccessibleName(/Borrador IA 1 alumno · Ainhoa D\./);
    await expect(versionRow(page, 'Adaptado · ACS 5.º Primaria')).toHaveAccessibleName(/Borrador IA 1 alumno · Nerea V\./);
    await expect(page.getByRole('button', { name: /^Añadir modelo B/ })).toHaveCount(0); // there is one already
    await expect(page.getByRole('button', { name: /^Cambiar el reparto Quién hace cada versión, alumno a alumno$/ })).toBeVisible();

    await expect(page.getByRole('heading', { level: 2, name: 'Adaptaciones en esta clase' })).toBeVisible();
    await expect(page.getByText('Más tiempo: Rubén y Sofía · Lectura en voz alta: Rubén')).toBeVisible();
    const adaptations = page.locator('.section').filter({ has: page.getByRole('heading', { name: 'Adaptaciones en esta clase' }) });
    await expect(adaptations.getByText('López Vázquez, Rubén')).toBeVisible();
    await expect(adaptations.getByText('Más tiempo · Letra ampliada · Lectura en voz alta')).toBeVisible();
    await expect(adaptations.getByText('ACS 5.º Primaria', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Preparar versiones adaptadas' })).toHaveCount(0); // everyone has theirs
    await expect(page.getByText('Un PDF en orden de lista: cada copia con el nombre y la versión de su alumno, así al escanear cada hoja vuelve a su dueño.')).toBeVisible();
    await shot(page, info, '22-versions');

    // Collapsed, Preparar counts them.
    await stepRow(page, 3, 'Revisar').click();
    await expect(stepRow(page, 1, 'Preparar')).toContainText('Preparado · 6 preguntas · 5 versiones más');
  });

  test('examenes-23 · a version\'s sheet: its PDF and solutions (opening it reviews it), its students and questions', async ({ page, cloneExam, demo }, info) => {
    const exam = await cloneExam('global');
    await openActivity(page, exam.url, exam.title);
    await versionRow(page, 'Modelo B').click();
    const sheet = dialog(page, 'Modelo B');
    await expect(sheet.getByText(new RegExp(`^Marca ${esc(exam.code)}-B · \\d páginas$`))).toBeVisible();
    await expect(sheet.getByRole('heading', { name: 'Alumnos · 11' })).toBeVisible();
    await expect(sheet.getByText(/^Castillo Medina, Adrián · Cortés Domínguez, Nerea · /)).toBeVisible();
    await expect(sheet.getByRole('heading', { name: 'Preguntas · 6' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Rehacer' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Quitar versión' })).toBeVisible();
    await shot(page, info, '23-version-sheet');
    // Opened: no longer an AI draft, in the list and on the server.
    await expect.poll(async () => (await version(demo, exam.id, 'B')).draft).toBe(false);
    const pdf = await opensPdf(page, () => sheet.getByRole('button', { name: /^Ver el examen/ }).click());
    expect(pdf.name).toBe(fileName('Modelo B', exam.title, '2.º ESO B'));
    expect(pdfText(pdf.body)[0]).toMatch(new RegExp(`Sepia · ${esc(exam.code)}-B · Pág\\. 1/${pdfText(pdf.body).length}`));
    expect(pdfText(pdf.body)[0]).toContain('Modelo B');
    const key = await opensPdf(page, () => sheet.getByRole('button', { name: /^Soluciones/ }).click());
    expect(key.name).toBe(fileName('Soluciones Modelo B', exam.title, '2.º ESO B'));
    expect(pdfText(key.body)[0]).toContain('Modelo B'); // with 5-7 answer keys on the desk, each says which it is
    await sheet.getByRole('button', { name: 'Cerrar' }).click();
    await expect(versionRow(page, 'Modelo B')).not.toContainText('Borrador IA');
  });

  test('examenes-24 · a version\'s questions are edited like Modelo A\'s and its PDF is laid out again', async ({ page, cloneExam, demo }) => {
    const exam = await cloneExam('global');
    await openActivity(page, exam.url, exam.title);
    await versionRow(page, 'Modelo B').click();
    const sheet = dialog(page, 'Modelo B');
    await sheet.getByRole('button', { name: 'Editar pregunta 6' }).click();
    const q = dialog(page, 'Pregunta 6');
    await expect(q.getByLabel('Solución')).not.toHaveValue('');
    await q.getByLabel('Solución').fill('Le quedan 45 páginas.');
    await q.getByRole('button', { name: 'Hecho' }).click();
    await expect(toast(page, 'Pregunta 6 guardada · PDF actualizado')).toBeVisible({ timeout: 60_000 });
    const b = await demo.get(`/activities/${exam.id}/versions/B`);
    expect(b.rubric.items[5].answer).toBe('Le quedan 45 páginas.');
    const key = await opensPdf(page, () => sheet.getByRole('button', { name: /^Soluciones/ }).click());
    expect(pdfText(key.body).join('\n')).toContain('Le quedan 45 páginas.');
  });

  test('examenes-25 · Modelo A and the letra ampliada version: same questions, no «Rehacer»; Modelo A cannot be removed', async ({ page, cloneExam }) => {
    const exam = await cloneExam('global');
    await openActivity(page, exam.url, exam.title);
    await versionRow(page, 'Modelo A').click();
    let sheet = dialog(page, 'Modelo A');
    await expect(sheet.getByText('Para fotocopiar, sin nombres')).toBeVisible();
    await expect(sheet.getByText('Sus preguntas son las de la rúbrica del paso «Preparar».')).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Quitar versión' })).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: 'Rehacer' })).toHaveCount(0);
    const a = await opensPdf(page, () => sheet.getByRole('button', { name: /^Ver el examen/ }).click());
    expect(pdfText(a.body)[0]).toContain('Modelo A');
    await sheet.getByRole('button', { name: 'Cerrar' }).click();

    await versionRow(page, 'Adaptado · letra ampliada').click();
    sheet = dialog(page, 'Adaptado · letra ampliada');
    await expect(sheet.getByText('Las mismas preguntas del modelo A, con letra más grande y más espacio para responder. Se editan en el modelo A.')).toBeVisible();
    await expect(sheet.getByText('López Vázquez, Rubén')).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Rehacer' })).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: 'Quitar versión' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: /^Editar pregunta/ })).toHaveCount(0);
    const l = await opensPdf(page, () => sheet.getByRole('button', { name: /^Ver el examen/ }).click());
    expect(pdfFontSize(l.body)).toBeGreaterThan(pdfFontSize(a.body) + 1.5); // larger print (14 pt)
  });

  test('examenes-26 · «Cambiar el reparto»: one select per student, saved at once; also from a version\'s sheet', async ({ page, cloneExam, demo }, info) => {
    const exam = await cloneExam('global');
    const c = await correction(demo, exam.id);
    const jorge = c.students.find((s: { student: { sort_name: string } }) => s.student.sort_name === 'Cano Álvarez, Jorge').student;
    await openActivity(page, exam.url, exam.title);
    await page.getByRole('button', { name: /^Cambiar el reparto/ }).click();
    const sheet = dialog(page, 'Quién hace cada versión');
    await expect(sheet.getByText('Por defecto, A y B alternos por orden de lista; las versiones adaptadas, según las medidas de cada alumno.')).toBeVisible();
    const select = sheet.getByRole('combobox', { name: `Versión de ${jorge.name}` });
    await expect(select).toHaveValue('A');
    await expect(sheet.getByRole('combobox', { name: 'Versión de Rubén López Vázquez' })).toHaveValue('L');
    await shot(page, info, '26-assignment');
    await select.selectOption({ label: 'Modelo B' });
    await expect(toast(page, 'Jorge: Modelo B')).toBeVisible();
    await expect.poll(async () => (await version(demo, exam.id, 'B')).student_ids).toContain(jorge.id);
    await sheet.getByRole('button', { name: 'Cerrar' }).click();
    await expect(versionRow(page, 'Modelo B')).toContainText('12 alumnos');
    await expect(versionRow(page, 'Modelo A')).toContainText('10 alumnos');

    await versionRow(page, 'Adaptado · por pasos').first().click();
    await dialog(page, /^Adaptado · por pasos/).getByRole('button', { name: 'Cambiar el reparto' }).click();
    await expect(dialog(page, 'Quién hace cada versión')).toBeVisible();
    await expect(page.getByRole('dialog', { name: /^Adaptado/ })).toHaveCount(0); // never two sheets at once
    await dialog(page, 'Quién hace cada versión').getByRole('combobox', { name: `Versión de ${jorge.name}` }).selectOption('A');
    await expect(toast(page, 'Jorge: Modelo A')).toBeVisible();
    await expect.poll(async () => (await version(demo, exam.id, 'A')).student_ids).toContain(jorge.id);
  });

  test('examenes-27 · «Quitar versión» asks first; its students go back to Modelo A and «Añadir modelo B» comes back', async ({ page, cloneExam, demo }, info) => {
    const exam = await cloneExam('global');
    await openActivity(page, exam.url, exam.title);
    await versionRow(page, 'Modelo B').click();
    await dialog(page, 'Modelo B').getByRole('button', { name: 'Quitar versión' }).click();
    const ask = dialog(page, 'Quitar «Modelo B»');
    await expect(ask.getByText('11 alumnos vuelven al modelo A.')).toBeVisible();
    await shot(page, info, '27-remove-ask');
    await answer(page, 'Quitar «Modelo B»', 'Cancelar');
    await expect(dialog(page, 'Modelo B')).toBeVisible();
    await dialog(page, 'Modelo B').getByRole('button', { name: 'Quitar versión' }).click();
    await answer(page, 'Quitar «Modelo B»', 'Quitar versión');
    await expect(toast(page, 'Modelo B quitada')).toBeVisible();
    await expect(dialog(page, 'Modelo B')).toBeHidden();
    await expect(versionRow(page, 'Modelo B')).toHaveCount(0);
    // Without Modelo B, Modelo A is the class's exam again.
    await expect(versionRow(page, 'Examen de la clase')).toContainText('22 alumnos · Jorge, Adrián, Olivia y 19 más');
    await expect(versionRow(page, 'Modelo A')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Añadir modelo B La IA escribe otro examen con las mismas preguntas/ })).toBeVisible();
    expect((await versions(demo, exam.id)).versions.map((v: { key: string }) => v.key)).not.toContain('B');
  });

  test('examenes-28 · a student left without the version their measures ask for: warned everywhere, «Preparar versiones adaptadas» lays out letra ampliada without AI', async ({ page, cloneExam, demo }, info) => {
    const exam = await cloneExam('global');
    await demo.del(`/activities/${exam.id}/versions/L`); // Rubén (letra ampliada) back to Modelo A
    await openActivity(page, exam.url, exam.title);
    await expect(page.getByText('Rubén aún no tiene la versión que piden sus medidas.')).toBeVisible();
    const adaptations = page.locator('.section').filter({ has: page.getByRole('heading', { name: 'Adaptaciones en esta clase' }) });
    await expect(adaptations.getByText('Aún con el examen de la clase')).toBeVisible();
    await stepRow(page, 3, 'Revisar').click();
    await expect(stepRow(page, 1, 'Preparar')).toContainText('Rubén sin su versión adaptada');
    await stepRow(page, 1, 'Preparar').click();
    await shot(page, info, '28-missing-adapted');

    await page.getByRole('button', { name: 'Preparar versiones adaptadas' }).click();
    await expect(toast(page, 'Versiones preparadas. Revísalas antes de imprimir.')).toBeVisible({ timeout: 90_000 });
    await expect(versionRow(page, 'Adaptado · letra ampliada')).toHaveAccessibleName('Adaptado · letra ampliada 1 alumno · Rubén');
    await expect(page.getByText('Rubén aún no tiene la versión que piden sus medidas.')).toHaveCount(0);
    const l = await version(demo, exam.id, 'L');
    expect([l.status, l.draft, l.same_questions]).toEqual(['ready', false, true]);
  });

  test('examenes-29 · «Imprimir para la clase» asks about unreviewed versions («Revisar» opens the first), then one named PDF in list order', async ({ page, cloneExam, demo }, info) => {
    const exam = await cloneExam('global');
    await openActivity(page, exam.url, exam.title);
    await page.getByRole('button', { name: 'Imprimir para la clase' }).click();
    const ask = dialog(page, 'Hay versiones sin revisar');
    await expect(ask.getByText('«Modelo B» y 3 más las ha escrito la IA y aún no las has abierto.')).toBeVisible();
    await shot(page, info, '29-print-ask');
    await answer(page, 'Hay versiones sin revisar', 'Revisar');
    await expect(dialog(page, 'Modelo B')).toBeVisible();
    await dialog(page, 'Modelo B').getByRole('button', { name: 'Cerrar' }).click();
    await expect(versionRow(page, 'Modelo B')).not.toContainText('Borrador IA'); // opened: reviewed

    await page.getByRole('button', { name: 'Imprimir para la clase' }).click();
    await expect(dialog(page, 'Hay versiones sin revisar').getByText('«Adaptado · por pasos, letra ampliada» y 2 más')).toBeVisible();
    const pdf = await opensPdf(page, () => answer(page, 'Hay versiones sin revisar', 'Imprimir igualmente'));
    expect(pdf.name).toBe(fileName('Para la clase', exam.title, '2.º ESO B'));
    const pages = pdfText(pdf.body);
    expect(pages[0]).toContain('Reparto de copias');
    expect(pages[0]).toContain('Cano Álvarez, Jorge');
    expect(pages[0]).toMatch(/Recuerda: /);
    expect(pages.join('\n')).toMatch(new RegExp(`Sepia · ${esc(exam.code)}-B · nº \\d+ · Pág\\. 1/\\d`));
    expect((await versions(demo, exam.id)).named_print).toBe(true);

    // Printed for the class, the exam moves on to Recoger (before its day); the pile of named copies goes back to
    // each student by the number printed on it, and Recoger says so.
    await page.reload();
    await expect(stepHead(page, 2, 'Recoger')).toBeVisible();
    await expect(page.getByText('Cada copia lleva impreso el nombre del alumno y vuelve sola a su hoja.', { exact: false })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Cómo emparejar' })).toHaveCount(0);
  });

  test('examenes-30 · printing with a student still without their adapted version asks first; «···» prints for the class too', async ({ page, cloneExam, demo }) => {
    const exam = await cloneExam('global');
    await demo.del(`/activities/${exam.id}/versions/L`);
    for (const key of ['B', 'PL', 'P', 'C']) await demo.get(`/activities/${exam.id}/versions/${key}`); // opened: reviewed
    await openActivity(page, exam.url, exam.title);
    await headerMenu(page, 'Imprimir para la clase');
    const ask = dialog(page, 'Falta una versión adaptada');
    await expect(ask.getByText('Rubén aún no tiene la versión que piden sus medidas.')).toBeVisible();
    await answer(page, 'Falta una versión adaptada', 'Preparar versiones adaptadas');
    await expect(toast(page, 'Versiones preparadas. Revísalas antes de imprimir.')).toBeVisible({ timeout: 90_000 });
    await expect(versionRow(page, 'Adaptado · letra ampliada')).toBeVisible();
    const pdf = await opensPdf(page, () => headerMenu(page, 'Imprimir para la clase'));
    expect(pdfText(pdf.body)[0]).toContain('Reparto de copias');
  });
  test('examenes-79 · a version that could not be prepared, or that needs a look: said in its row, in its sheet, and printing waits', async ({ page, cloneExam }, info) => {
    const exam = await cloneExam('global');
    // What the server says after a failed writing and a warning of the AI's checks (both only reached with real AI runs).
    await patchResponse(page, `**/api/activities/${exam.id}/versions`, (vs) => {
      for (const v of vs.versions) {
        if (v.key === 'B') Object.assign(v, { status: 'failed', error: 'La IA ha tardado demasiado.' });
        if (v.key === 'P') Object.assign(v, { warnings: ['Revisa la pregunta 4: el enunciado incluye la solución.'] });
      }
      return vs;
    });
    await openActivity(page, exam.url, exam.title);
    await expect(versionRow(page, 'Modelo B')).toContainText('No se ha podido preparar · ábrela para rehacerla');
    await expect(versionRow(page, 'Adaptado · por pasos Borrador')).toContainText('Revísala antes de imprimir');
    await expect(page.getByRole('button', { name: 'Imprimir para la clase' })).toBeDisabled();
    await expect(page.getByText('Rehaz o quita las versiones que no se han podido preparar')).toBeVisible();
    await shot(page, info, '79-failed-version');
    await versionRow(page, 'Modelo B').click();
    const b = dialog(page, 'Modelo B');
    await expect(b.getByText('La IA ha tardado demasiado. Pulsa «Rehacer».')).toBeVisible();
    await expect(b.getByRole('button', { name: /^Ver el examen/ })).toHaveCount(0);
    await expect(b.getByRole('button', { name: 'Rehacer' })).toBeEnabled();
    await b.getByRole('button', { name: 'Cerrar' }).click();
    await versionRow(page, 'Adaptado · por pasos Borrador').click();
    await expect(dialog(page, 'Adaptado · por pasos').getByText('Revisa la pregunta 4: el enunciado incluye la solución.')).toBeVisible();
  });

  test('examenes-80 · after editing Modelo A the AI\'s versions say they were written for another one; a version with grades stays as printed; the review asks its questions', async ({ page, cloneExam, demo }, info) => {
    const exam = await cloneExam('global');
    await openActivity(page, exam.url, exam.title);
    await page.getByRole('button', { name: 'Editar pregunta 1' }).click();
    await expect(dialog(page, 'Pregunta 1').getByLabel('Solución')).not.toHaveValue('');
    await dialog(page, 'Pregunta 1').getByLabel('Solución').fill('$|-8|=8$; opuesto de $5$: $-5$; orden: $-8<-3<0<5<6$.');
    await dialog(page, 'Pregunta 1').getByRole('button', { name: 'Hecho' }).click();
    await expect(toast(page, 'Pregunta 1 guardada · PDF actualizado')).toBeVisible({ timeout: 60_000 });
    await expect(versionRow(page, 'Modelo B')).toContainText('Escrita para otro modelo A · rehazla');
    await versionRow(page, 'Modelo B').click();
    await expect(dialog(page, 'Modelo B').getByText('Se escribió a partir de un modelo A que ya ha cambiado. Rehazla para que coincida.')).toBeVisible();
    await shot(page, info, '80-stale');
    await dialog(page, 'Modelo B').getByRole('button', { name: 'Cerrar' }).click();

    // A grade typed for a student of Modelo B: the version is in use.
    const b = await version(demo, exam.id, 'B');
    const student = b.student_ids[0];
    await demo.put(`/activities/${exam.id}/grades`, { grades: [{ student_id: student, score: 7 }] });
    await page.reload();
    await expect(stepHead(page, 3, 'Revisar')).toBeVisible(); // with a grade, the exam opens on Revisar
    await stepRow(page, 1, 'Preparar').click();
    await versionRow(page, 'Modelo B').click();
    const sheet = dialog(page, 'Modelo B');
    await expect(sheet.getByText('Ya hay hojas o notas de esta versión: se queda como se imprimió.')).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Quitar versión' })).toBeDisabled();
    await expect(sheet.getByRole('button', { name: 'Rehacer' })).toBeDisabled();

    // Her review: Modelo B's questions, and the version at the end of the progress line.
    const bRubric = (await demo.get(`/activities/${exam.id}/versions/B`)).rubric.items;
    await page.goto(`${exam.url}/revisar?alumno=${student}`);
    await expect(page.locator('.review-bar__title .num')).toContainText('· Modelo B');
    await expect(page.locator('.ritem__text').first()).toContainText(bRubric[0].text.replace(/\$[^$]*\$/g, '').split(':')[0].trim().slice(0, 12));
  });
  test('examenes-85 · an exam without versions: «Examen de la clase» for everyone; printing for the class asks about the adapted versions, then names each copy', async ({ page, cloneExam, demo }) => {
    const exam = await cloneExam('global', { noVersions: true });
    const pending = (await versions(demo, exam.id)).pending_adapted.map((s: { first_name: string }) => s.first_name);
    await openActivity(page, exam.url, exam.title);
    await expect(versionRow(page, 'Examen de la clase')).toContainText('26 alumnos · toda la clase');
    await expect(page.getByRole('button', { name: /^Cambiar el reparto/ })).toHaveCount(0);
    await expect(page.getByText('Un PDF en orden de lista: cada copia con el nombre de su alumno, así al escanear cada hoja vuelve a su dueño.')).toBeVisible();
    await page.getByRole('button', { name: 'Imprimir para la clase' }).click();
    const ask = dialog(page, 'Faltan versiones adaptadas');
    await expect(ask.getByText(`${pending.slice(0, 2).join(', ')} y ${pending.length - 2} más aún no tienen la versión que piden sus medidas.`)).toBeVisible();
    const pdf = await opensPdf(page, () => answer(page, 'Faltan versiones adaptadas', 'Imprimir igualmente'));
    const pages = pdfText(pdf.body);
    expect(pages[0]).toContain('Cada copia lleva impreso el nombre del alumno, en orden de lista.');
    expect(pages[0]).not.toContain('Versión');
    expect(pages.join('\n')).toMatch(new RegExp(`Sepia · ${esc(exam.code)} · nº 1 · Pág\\. 1/\\d`));
    expect((await versions(demo, exam.id)).named_print).toBe(true);
  });
});
