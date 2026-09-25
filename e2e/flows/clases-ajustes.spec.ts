import {
  bug, cell, classMenuPick, classRow, dialog, expect, isMobile, MATES_2C, openClass, sheetsClosed, shot, tab, test, toast, TODAY,
  type Page,
} from './clases-helpers';

// Ajustes de la clase (docs/PRODUCT.md §4.9): subject, abbreviation, room, colour and timetable; archive and delete at
// the end of the sheet. Ponderaciones (§4.1.5) from the Cuaderno menu and the recovery rule (§4.6) from Evaluación:
// the grading rules of the class. Each test is a teacher of its own.

async function openSettings(page: Page, id: string, group = '2.º ESO C') {
  await openClass(page, id, 'alumnos', group);
  await classMenuPick(page, 'Ajustes de la clase');
  const sheet = dialog(page, 'Ajustes de la clase');
  await expect(sheet).toBeVisible();
  return sheet;
}
const saveButton = (sheet: ReturnType<typeof dialog>) => sheet.locator('.sheet__foot').getByRole('button');

test.describe('clases · ajustes de la clase', () => {
  test.use({ teacherSpec: { courses: [MATES_2C] } });

  test('clases-36 · subject, abbreviation, room and colour are saved and shown everywhere', async ({ page, teacher }, info) => {
    const [c] = teacher.courses;
    const sheet = await openSettings(page, c.id);
    await sheet.getByRole('textbox', { name: 'Materia' }).fill('Matemáticas aplicadas');
    await sheet.getByRole('textbox', { name: 'Abreviatura' }).fill('M. Apl.');
    await sheet.getByRole('textbox', { name: 'Aula' }).fill('Lab. 3');
    await sheet.getByRole('radio', { name: 'Índigo' }).click();
    await shot(page, info, '36-ajustes-editados');
    await saveButton(sheet).click();
    await expect(toast(page, 'Cambios guardados')).toBeVisible();
    await expect(sheet).toBeHidden();
    await expect(page.locator('.page-head__eyebrow')).toHaveText('Matemáticas aplicadas');
    await expect(page.locator('.course-facts')).toHaveText('12 alumnos · Lab. 3 · En clase hasta 11:15');
    expect(await teacher.api.get(`/courses/${c.id}`)).toMatchObject({
      subject: 'Matemáticas aplicadas', short: 'M. Apl.', room: 'Lab. 3', color: 'indigo', label: 'Matemáticas aplicadas · 2.º ESO C',
    });
    if (!isMobile(info)) {
      await expect(page.getByRole('complementary', { name: 'Navegación' }).getByRole('link', { name: '2.º ESO C · M. Apl.' })).toBeVisible();
    }
    await page.reload();
    const again = await openSettings(page, c.id);
    await expect(again.getByRole('textbox', { name: 'Abreviatura' })).toHaveValue('M. Apl.');
    await expect(again.getByRole('radio', { name: 'Índigo' })).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    await expect(again).toBeHidden();
    await sheetsClosed(page);
    await page.goto('/clases');
    await expect(classRow(page, 'Matemáticas aplicadas · 2.º ESO C')).toBeVisible();
  });

  test('clases-37 · the subject is required; the abbreviation stops at 24 characters; an empty room is saved as none', async ({ page, teacher }) => {
    const [c] = teacher.courses;
    const sheet = await openSettings(page, c.id);
    await sheet.getByRole('textbox', { name: 'Materia' }).fill('  ');
    await expect(saveButton(sheet)).toHaveText('Escribe la materia');
    await expect(saveButton(sheet)).toBeDisabled();
    await sheet.getByRole('textbox', { name: 'Materia' }).fill('Matemáticas');
    await sheet.getByRole('textbox', { name: 'Abreviatura' }).fill('Matemáticas orientadas a las enseñanzas');
    await expect(sheet.getByRole('textbox', { name: 'Abreviatura' })).toHaveValue('Matemáticas orientadas a');
    await sheet.getByRole('textbox', { name: 'Aula' }).fill('');
    await saveButton(sheet).click();
    await expect(toast(page, 'Cambios guardados')).toBeVisible();
    await expect(page.locator('.course-facts')).toHaveText('12 alumnos · En clase hasta 11:15');
    expect(await teacher.api.get(`/courses/${c.id}`)).toMatchObject({ short: 'Matemáticas orientadas a', room: null });
  });

  test('clases-37b · what the server does not accept is stopped in the form, in words the teacher understands', async ({ page, teacher }) => {
    bug('BUG-CLASES-04', 'Aula (> 40) and Materia (> 80) reach the server and come back as «Revisa el campo «room»» / «subject»');
    const [c] = teacher.courses;
    const sheet = await openSettings(page, c.id);
    const room = sheet.getByRole('textbox', { name: 'Aula' });
    await room.fill('Aula de Música del edificio antiguo, planta 2');
    await saveButton(sheet).click();
    await expect(sheet.getByText(/Revisa el campo «/)).toHaveCount(0);
    // Like «Abreviatura», the field keeps to what the server stores (40 characters).
    expect((await room.inputValue()).length).toBeLessThanOrEqual(40);
    await sheet.getByRole('textbox', { name: 'Materia' }).fill('M'.repeat(90));
    expect((await sheet.getByRole('textbox', { name: 'Materia' }).inputValue()).length).toBeLessThanOrEqual(80);
  });

  test('clases-38 · the timetable is edited on the grid; past lists are kept', async ({ page, teacher }, info) => {
    const [c] = teacher.courses;
    // Today's 10:20 list is taken before the timetable changes.
    await teacher.api.put(`/courses/${c.id}/attendance`, { date: TODAY, start: '10:20', marks: [{ student_id: c.students[0].id, status: 'absent' }] });
    const sheet = await openSettings(page, c.id);
    // Its own hours are marked, not taken by another class.
    await expect(cell(sheet, 'jueves', '10:20', '11:15')).toHaveAttribute('aria-pressed', 'true');
    await expect(sheet.getByText('4 sesiones a la semana')).toBeVisible();
    await cell(sheet, 'jueves', '10:20', '11:15').click();
    await cell(sheet, 'viernes', '12:40', '13:35').click();
    await cell(sheet, 'miércoles', '11:45', '12:40').click();
    await expect(sheet.getByText('3 sesiones a la semana')).toBeVisible();
    await shot(page, info, '38-horario');
    await saveButton(sheet).click();
    await expect(toast(page, 'Cambios guardados')).toBeVisible();
    // No session now; the next one is Monday 08:30.
    await expect(page.locator('.course-facts')).toHaveText('12 alumnos · Aula 112 · Lunes 23 nov, 08:30');
    const saved = await teacher.api.get(`/courses/${c.id}`);
    expect(saved.schedule.map((s: { weekday: number; start: string }) => `${s.weekday} ${s.start}`)).toEqual(['0 08:30', '1 09:25', '2 11:45']);
    const list = await teacher.api.get(`/courses/${c.id}/attendance?date=${TODAY}&start=10:20`);
    expect(list.taken).toBe(true);
    expect(list.students.find((m: { student: { id: string } }) => m.student.id === c.students[0].id)?.status).toBe('absent');
  });

  test('clases-39 · without timetable: «Sin horario», and Faltas offers «Añadir horario»', async ({ page, teacher }, info) => {
    const [c] = teacher.courses;
    let sheet = await openSettings(page, c.id);
    for (const [day, start, end] of [['lunes', '08:30', '09:25'], ['martes', '09:25', '10:20'], ['jueves', '10:20', '11:15'], ['viernes', '12:40', '13:35']]) {
      await cell(sheet, day, start, end).click();
    }
    await expect(sheet.getByText('Toca las horas en las que das esta clase.')).toBeVisible();
    await saveButton(sheet).click();
    await expect(toast(page, 'Cambios guardados')).toBeVisible();
    await expect(page.locator('.course-facts')).toHaveText('12 alumnos · Aula 112 · Sin horario');

    await tab(page, 'Faltas').click();
    await expect(page.getByText('Esta clase no tiene horario')).toBeVisible();
    await expect(page.getByText('Añádelo para pasar lista.')).toBeVisible();
    await shot(page, info, '39-sin-horario');
    await page.getByRole('button', { name: 'Añadir horario' }).click();
    sheet = dialog(page, 'Ajustes de la clase');
    await cell(sheet, 'viernes', '12:40', '13:35').click();
    await saveButton(sheet).click();
    await expect(toast(page, 'Cambios guardados')).toBeVisible();
    await expect(page.getByText('Esta clase no tiene horario')).toHaveCount(0);
    await expect(page.locator('.course-facts')).toHaveText('12 alumnos · Aula 112 · Mañana 12:40');
  });

  test('clases-40 · a failed save stays in the sheet with the draft; the next try saves', async ({ page, teacher }) => {
    const [c] = teacher.courses;
    const sheet = await openSettings(page, c.id);
    await sheet.getByRole('textbox', { name: 'Aula' }).fill('Aula de música');
    let fail = true;
    await page.route((url) => url.pathname === `/api/courses/${c.id}`, (route) => (fail && route.request().method() === 'PATCH'
      ? route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ detail: 'Escribe el nombre de la materia.' }) })
      : route.fallback()));
    await saveButton(sheet).click();
    await expect(sheet.getByRole('alert')).toHaveText('Escribe el nombre de la materia.');
    await expect(sheet.getByRole('textbox', { name: 'Aula' })).toHaveValue('Aula de música');
    expect((await teacher.api.get(`/courses/${c.id}`)).room).toBe('112');
    fail = false;
    await saveButton(sheet).click();
    await expect(toast(page, 'Cambios guardados')).toBeVisible();
    expect((await teacher.api.get(`/courses/${c.id}`)).room).toBe('Aula de música');
  });

  test('clases-41b · archiving the only class: Clases still offers it back', async ({ page, teacher }) => {
    bug('BUG-CLASES-07', 'with no active class, Clases shows only «Crea tu primera clase»: the archived ones cannot be seen nor recovered');
    const [c] = teacher.courses;
    const sheet = await openSettings(page, c.id);
    await sheet.getByRole('button', { name: 'Archivar clase' }).click();
    await dialog(page, 'Archivar clase').getByRole('button', { name: 'Archivar', exact: true }).click();
    await expect(toast(page, 'Clase archivada')).toBeVisible();
    await expect(page).toHaveURL(/\/clases$/);
    await sheetsClosed(page);
    await page.goto('/clases'); // what the teacher finds when she comes back
    await expect(page.getByRole('heading', { level: 1, name: 'Clases' })).toBeVisible();
    // «Puedes recuperarla desde Clases»: the archived row is there even with no active class.
    await page.getByRole('button', { name: 'Ver clases archivadas' }).click({ timeout: 5000 });
    await page.getByRole('button', { name: /^Matemáticas · 2\.º ESO C/ }).click({ timeout: 5000 });
    await dialog(page, 'Recuperar Matemáticas · 2.º ESO C').getByRole('button', { name: 'Recuperar' }).click({ timeout: 5000 });
    await expect(toast(page, 'Clase recuperada')).toBeVisible();
    expect((await teacher.api.get(`/courses/${c.id}`)).archived).toBe(false);
  });

  test('clases-42 · «Eliminar definitivamente» asks, deletes the class and keeps its students and their notes', async ({ page, teacher }, info) => {
    const [c] = teacher.courses;
    await teacher.api.post('/notes', { course_id: c.id, kind: 'positive', date: TODAY, text: 'Ayuda a sus compañeros', student_ids: [c.students[0].id] });
    await page.goto('/clases');
    await classRow(page, 'Matemáticas · 2.º ESO C').click();
    await expect(page.getByRole('heading', { level: 1, name: '2.º ESO C' })).toBeVisible();
    await classMenuPick(page, 'Ajustes de la clase');
    const sheet = dialog(page, 'Ajustes de la clase');
    await sheet.getByRole('button', { name: 'Eliminar definitivamente' }).click();
    const ask = dialog(page, 'Eliminar Matemáticas · 2.º ESO C');
    await expect(ask.getByText('Se borran sus actividades, notas, programación, materiales y asistencia. No se puede deshacer. Los alumnos y sus observaciones se conservan.'))
      .toBeVisible();
    await shot(page, info, '42-eliminar');
    await ask.getByRole('button', { name: 'Cancelar' }).click();
    await expect(sheet).toBeVisible();
    expect((await teacher.api.raw('GET', `/courses/${c.id}`)).status()).toBe(200);

    await sheet.getByRole('button', { name: 'Eliminar definitivamente' }).click();
    await ask.getByRole('button', { name: 'Eliminar definitivamente' }).click();
    await expect(toast(page, 'Clase eliminada')).toBeVisible();
    await expect(page).toHaveURL(/\/clases$/);
    await expect(page.getByText('Crea tu primera clase')).toBeVisible();
    await expect(page.getByText('2.º ESO C')).toHaveCount(0); // nor in the desktop sidebar
    expect((await teacher.api.raw('GET', `/courses/${c.id}`)).status()).toBe(404);
    expect(await teacher.api.get('/courses?archived=true')).toEqual([]);
    // The students and their notes stay.
    expect(await teacher.api.get(`/groups/${c.groupId}/students`)).toHaveLength(12);
    const file = await teacher.api.get(`/students/${c.students[0].id}`);
    expect(JSON.stringify(file.notes)).toContain('Ayuda a sus compañeros');

    // Back does not lead to the deleted class.
    await page.goBack();
    await expect(page.getByText('No se ha encontrado la clase')).toHaveCount(0);
  });
});

test.describe('clases · archivar', () => {
  test.use({ teacherSpec: { courses: [MATES_2C, { subject: 'Tutoría', group: '1º ESO D', color: 'ochre', slots: [{ weekday: 3, start: '12:40', end: '13:35' }] }] } });

  test('clases-41 · «Archivar clase» asks, then the class leaves Hoy and Clases and waits in «Clases archivadas»', async ({ page, teacher }, info) => {
    const [c] = teacher.courses;
    const sheet = await openSettings(page, c.id);
    await sheet.getByRole('button', { name: 'Archivar clase' }).click();
    const ask = dialog(page, 'Archivar clase');
    await expect(ask.getByText('Deja de aparecer en Hoy y en Clases. Sus notas se conservan y puedes recuperarla desde Clases.')).toBeVisible();
    await ask.getByRole('button', { name: 'Cancelar' }).click();
    await expect(ask).toBeHidden();
    await expect(sheet).toBeVisible();
    expect((await teacher.api.get(`/courses/${c.id}`)).archived).toBe(false);

    await sheet.getByRole('button', { name: 'Archivar clase' }).click();
    await ask.getByRole('button', { name: 'Archivar', exact: true }).click();
    await expect(toast(page, 'Clase archivada')).toBeVisible();
    await expect(page).toHaveURL(/\/clases$/);
    await expect(page.locator('.courses__list').getByRole('link')).toHaveCount(1); // only the other class
    expect((await teacher.api.get(`/courses/${c.id}`)).archived).toBe(true);
    await shot(page, info, '41-archivada');

    const day = await teacher.api.get(`/today?date=${TODAY}`);
    expect(day.sessions.map((x: { course: { id: string } }) => x.course.id)).not.toContain(c.id);
    await page.goto('/hoy');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('2.º ESO C')).toHaveCount(0); // nor in the desktop sidebar
    await page.goto('/clases');
    await page.getByRole('button', { name: 'Ver clases archivadas' }).click();
    await expect(page.getByRole('button', { name: /^Matemáticas · 2\.º ESO C/ })).toContainText('Recuperar');
  });

});

// ── Ponderaciones ────────────────────────────────────────────────────────────
const WITH_GRADES = {
  courses: [{
    ...MATES_2C,
    activities: [
      { title: 'Examen U1 · Números enteros', kind: 'exam', date: '2026-10-15', grades: [4, 8] },
      { title: 'Ficha 1 · Enteros', kind: 'worksheet', date: '2026-10-20', grades: [10, 6] },
    ],
  }],
};

async function openWeights(page: Page, id: string) {
  await openClass(page, id, 'cuaderno', '2.º ESO C');
  await expect(page.getByRole('button', { name: /^Media de Marta Alonso Gil/ })).toBeVisible();
  await classMenuPick(page, 'Ponderaciones');
  const sheet = dialog(page, 'Ponderaciones');
  await expect(sheet).toBeVisible();
  return sheet;
}
const media = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`^Media de ${name}: `) });

test.describe('clases · ponderaciones', () => {
  test.use({ teacherSpec: WITH_GRADES });

  test('clases-43 · defaults 60/30/10; edited weights and names are saved and the averages follow', async ({ page, teacher }, info) => {
    const [c] = teacher.courses;
    const sheet = await openWeights(page, c.id);
    // Marta: exam 4, worksheet 10 → (4 × 60 + 10 × 30) / 90 = 6,0 (Observación has no grades: it does not count).
    await expect(media(page, 'Marta Alonso Gil')).toHaveAccessibleName('Media de Marta Alonso Gil: 6,0');
    await expect(sheet.getByText('Matemáticas · 2.º ESO C')).toBeVisible();
    const names = sheet.getByRole('textbox', { name: 'Categoría' });
    await expect(names).toHaveCount(3);
    await expect(names.nth(0)).toHaveValue('Exámenes');
    await expect(names.nth(1)).toHaveValue('Trabajos y fichas');
    await expect(names.nth(2)).toHaveValue('Observación');
    await expect(sheet.getByRole('spinbutton', { name: 'Peso de Exámenes' })).toHaveValue('60');
    await expect(sheet.getByRole('spinbutton', { name: 'Peso de Trabajos y fichas' })).toHaveValue('30');
    await expect(sheet.getByRole('spinbutton', { name: 'Peso de Observación' })).toHaveValue('10');
    await expect(sheet.getByText('Total 100 %')).toBeVisible();
    await expect(sheet.getByText('No suman 100: se usan como proporciones.', { exact: false })).toHaveCount(0);

    await sheet.getByRole('spinbutton', { name: 'Peso de Exámenes' }).fill('70');
    await expect(sheet.getByText('Total 110 %')).toBeVisible();
    await expect(sheet.getByText('No suman 100: se usan como proporciones.', { exact: false })).toBeVisible();
    await sheet.getByRole('spinbutton', { name: 'Peso de Observación' }).fill('0');
    await expect(sheet.getByText('Total 100 %')).toBeVisible();
    await names.nth(2).fill('Actitud');
    await expect(sheet.getByRole('spinbutton', { name: 'Peso de Actitud' })).toHaveValue('0');
    await shot(page, info, '43-ponderaciones');
    await sheet.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Ponderaciones guardadas')).toBeVisible();
    await expect(sheet).toBeHidden();

    expect((await teacher.api.get(`/courses/${c.id}`)).categories.map((x: { key: string; label: string; weight: number }) => [x.key, x.label, x.weight]))
      .toEqual([['exams', 'Exámenes', 70], ['work', 'Trabajos y fichas', 30], ['observation', 'Actitud', 0]]);
    // The server recomputes: (4 × 70 + 10 × 30) / 100 = 5,8.
    await expect(media(page, 'Marta Alonso Gil')).toHaveAccessibleName('Media de Marta Alonso Gil: 5,8');
  });

  test('clases-44 · «Añadir categoría» needs a name; weights that add up to 0 cannot be saved', async ({ page, teacher }) => {
    const [c] = teacher.courses;
    const sheet = await openWeights(page, c.id);
    const save = sheet.locator('.sheet__foot').getByRole('button');
    await sheet.getByRole('button', { name: 'Añadir categoría' }).click();
    await expect(sheet.getByRole('textbox', { name: 'Categoría' })).toHaveCount(4);
    await expect(save).toHaveText('Pon nombre a cada categoría');
    await expect(save).toBeDisabled();
    await sheet.getByRole('textbox', { name: 'Categoría' }).nth(3).fill('Cuaderno de clase');
    await sheet.getByRole('spinbutton', { name: 'Peso de Cuaderno de clase' }).fill('10');
    await expect(sheet.getByText('Total 110 %')).toBeVisible();
    for (const n of ['Exámenes', 'Trabajos y fichas', 'Observación', 'Cuaderno de clase']) {
      await sheet.getByRole('spinbutton', { name: `Peso de ${n}` }).fill('0');
    }
    await expect(save).toHaveText('Los pesos deben sumar más de 0');
    await expect(save).toBeDisabled();
    await sheet.getByRole('spinbutton', { name: 'Peso de Exámenes' }).fill('50');
    await sheet.getByRole('spinbutton', { name: 'Peso de Trabajos y fichas' }).fill('40');
    await sheet.getByRole('spinbutton', { name: 'Peso de Cuaderno de clase' }).fill('10');
    await save.click();
    await expect(toast(page, 'Ponderaciones guardadas')).toBeVisible();
    const cats = (await teacher.api.get(`/courses/${c.id}`)).categories;
    expect(cats.map((x: { label: string; weight: number }) => [x.label, x.weight]))
      .toEqual([['Exámenes', 50], ['Trabajos y fichas', 40], ['Observación', 0], ['Cuaderno de clase', 10]]);
    expect(new Set(cats.map((x: { key: string }) => x.key)).size).toBe(4);
  });

  test('clases-44b · a weight over 100 is stopped with a reason, not sent to the server', async ({ page, teacher }) => {
    bug('BUG-CLASES-04', 'a weight of 150 is sent and the sheet shows «Revisa el campo «categories.0.weight».»');
    const [c] = teacher.courses;
    const sheet = await openWeights(page, c.id);
    await sheet.getByRole('spinbutton', { name: 'Peso de Exámenes' }).fill('150');
    const save = sheet.locator('.sheet__foot').getByRole('button');
    await expect(save).toBeDisabled();
    await expect(save).toContainText('100');
    await expect(sheet.getByText(/Revisa el campo «/)).toHaveCount(0);
    expect((await teacher.api.get(`/courses/${c.id}`)).categories[0].weight).toBe(60);
  });

  test('clases-45 · removing a category asks only when it has activities; the last one cannot be removed', async ({ page, teacher }, info) => {
    const [c] = teacher.courses;
    let sheet = await openWeights(page, c.id);
    // Observación has no activities: removed without asking.
    await sheet.getByRole('button', { name: 'Quitar Observación' }).click();
    await sheet.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Ponderaciones guardadas')).toBeVisible();
    await expect(sheet).toBeHidden();
    expect((await teacher.api.get(`/courses/${c.id}`)).categories).toHaveLength(2);

    await classMenuPick(page, 'Ponderaciones');
    sheet = dialog(page, 'Ponderaciones');
    await sheet.getByRole('button', { name: 'Quitar Exámenes' }).click();
    await sheet.getByRole('button', { name: 'Guardar' }).click();
    const ask = dialog(page, 'Quitar «Exámenes»');
    await expect(ask.getByText('1 actividad dejará de contar en la media hasta que la cambies de categoría.')).toBeVisible();
    await shot(page, info, '45-quitar-categoria');
    await ask.getByRole('button', { name: 'Cancelar' }).click();
    await expect(ask).toBeHidden();
    await expect(sheet).toBeVisible();
    expect((await teacher.api.get(`/courses/${c.id}`)).categories).toHaveLength(2);
    // Only one left: it cannot be removed.
    await expect(sheet.getByRole('button', { name: 'Quitar Trabajos y fichas' })).toBeDisabled();

    await sheet.getByRole('button', { name: 'Guardar' }).click();
    await ask.getByRole('button', { name: 'Quitar' }).click();
    await expect(sheet).toBeHidden();
    await expect.poll(async () => (await teacher.api.get(`/courses/${c.id}`)).categories.map((x: { key: string }) => x.key))
      .toEqual(['work']);
  });

  test('clases-45b · an activity whose category was removed stops counting, as the confirmation said', async ({ page, teacher }) => {
    bug('BUG-CLASES-02', 'grading.compute_term folds an activity of a removed category into the first category: it keeps counting');
    const [c] = teacher.courses;
    const sheet = await openWeights(page, c.id);
    await sheet.getByRole('button', { name: 'Quitar Exámenes' }).click();
    await sheet.getByRole('button', { name: 'Guardar' }).click();
    const ask = dialog(page, 'Quitar «Exámenes»');
    await expect(ask.getByText('1 actividad dejará de contar en la media hasta que la cambies de categoría.')).toBeVisible();
    await ask.getByRole('button', { name: 'Quitar' }).click();
    await expect(toast(page, 'Ponderaciones guardadas')).toBeVisible();
    // Marta: exam 4 (no longer counts), worksheet 10 → 10,0; the server says 7,0 (the exam counted as a worksheet).
    await expect.poll(async () => {
      const book = await teacher.api.get(`/courses/${c.id}/gradebook?term=1`);
      return book.students.find((s: { student: { id: string } }) => s.student.id === c.students[0].id).average;
    }).toBe(10);
    await expect(media(page, 'Marta Alonso Gil')).toHaveAccessibleName('Media de Marta Alonso Gil: 10,0');
  });

  test('clases-46 · the recovery rule of the class is picked in Evaluación and marked «Actual»', async ({ page, teacher }, info) => {
    const [c] = teacher.courses;
    await page.goto(`/clases/${c.id}/evaluacion/1`);
    await expect(page.getByRole('heading', { name: 'Primera evaluación' })).toBeVisible();
    await page.getByRole('button', { name: 'Más acciones' }).click();
    await page.getByRole('menuitem', { name: 'Regla de las recuperaciones' }).click();
    const sheet = dialog(page, 'Regla de las recuperaciones');
    await expect(sheet.getByText('Matemáticas · 2.º ESO C · la acuerda el departamento')).toBeVisible();
    const rule = (name: string) => sheet.getByRole('button', { name: new RegExp(`^${name}`) });
    await expect(rule('Sustituye si es mayor')).toContainText('Actual');
    await expect(rule('Como máximo un 5')).toContainText('Aprobar la recuperación deja la evaluación en 5.');
    await expect(sheet.getByText('La recuperación nunca baja la nota. Se aplica a todas las recuperaciones de la clase.')).toBeVisible();
    await shot(page, info, '46-regla');
    await rule('Como máximo un 5').click();
    await expect(toast(page, 'Regla guardada: como máximo un 5')).toBeVisible();
    await expect(sheet).toBeHidden();
    expect((await teacher.api.get(`/courses/${c.id}/evaluation/1`)).recovery_rule).toBe('cap_5');

    await page.reload();
    await page.getByRole('button', { name: 'Más acciones' }).click();
    await page.getByRole('menuitem', { name: 'Regla de las recuperaciones' }).click();
    await expect(rule('Como máximo un 5')).toContainText('Actual');
    await expect(rule('Sustituye si es mayor')).not.toContainText('Actual');
    await rule('Media de ambas').click();
    await expect(toast(page, 'Regla guardada: media de ambas')).toBeVisible();
    expect((await teacher.api.get(`/courses/${c.id}/evaluation/1`)).recovery_rule).toBe('average');
  });
});
