import {
  cell, classRow, dialog, expect, isMobile, MATES_2C, sheetsClosed, shot, test, toast, WED, type Page,
} from './clases-helpers';

// «Nueva clase» (docs/PRODUCT.md §4.1.2): subject + group (new or existing), timetable grid, room and colour; then
// the roster opens to add students. Every test is a teacher of its own (the demo is never changed).

async function openNew(page: Page) {
  await page.goto('/clases');
  await page.getByRole('button', { name: 'Nueva clase' }).click();
  const sheet = dialog(page, 'Nueva clase');
  await expect(sheet).toBeVisible();
  await expect(page).toHaveURL(/\/clases\?nueva=1$/);
  return sheet;
}

const footer = (sheet: ReturnType<typeof dialog>) => sheet.locator('.sheet__foot').getByRole('button');

test.describe('clases · nueva clase', () => {
  test.use({ teacherSpec: { courses: [MATES_2C] } });

  test('clases-15 · a class for a new group: grid, room, colour → the roster opens to add students', async ({ page, teacher }, info) => {
    const sheet = await openNew(page);
    await expect(footer(sheet)).toHaveText('Escribe la materia');
    await expect(footer(sheet)).toBeDisabled();

    await sheet.getByRole('button', { name: 'Física y Química', exact: true }).click();
    await expect(sheet.getByRole('textbox', { name: 'Materia' })).toHaveValue('Física y Química');
    await expect(sheet.getByRole('button', { name: 'Física y Química', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(footer(sheet)).toHaveText('Elige un grupo');
    await expect(footer(sheet)).toBeDisabled();

    await sheet.getByRole('button', { name: 'Nuevo grupo' }).click();
    await expect(footer(sheet)).toHaveText('Escribe el nombre del grupo');
    await sheet.getByRole('textbox', { name: 'Nombre del grupo' }).fill('3º ESO B');
    await expect(sheet.getByRole('combobox', { name: 'Etapa' })).toHaveValue('eso');
    await expect(sheet.getByRole('combobox', { name: 'Curso' })).toHaveValue('3');

    await cell(sheet, 'lunes', '11:45', '12:40').click();
    await cell(sheet, 'miércoles', '13:35', '14:30').click();
    await expect(cell(sheet, 'lunes', '11:45', '12:40')).toHaveAttribute('aria-pressed', 'true');
    await expect(sheet.getByText('2 sesiones a la semana')).toBeVisible();
    await sheet.getByRole('textbox', { name: 'Aula' }).fill('Lab. 2');
    await sheet.getByRole('radio', { name: 'Ciruela' }).click();
    await expect(sheet.getByRole('radio', { name: 'Ciruela' })).toHaveAttribute('aria-checked', 'true');
    await expect(footer(sheet)).toHaveText('Crear clase');
    await shot(page, info, '15-nueva-clase');

    await footer(sheet).click();
    await expect(toast(page, 'Clase creada')).toBeVisible();
    await expect(page).toHaveURL(/\/clases\/[0-9a-f-]+\/alumnos\?anadir=1$/);
    const add = dialog(page, 'Añadir alumnos');
    await expect(add).toBeVisible();
    await expect(add.getByText('3.º ESO B', { exact: true })).toBeVisible();

    const created = (await teacher.api.get('/courses')).find((c: { label: string }) => c.label === 'Física y Química · 3.º ESO B');
    expect(created).toMatchObject({
      subject: 'Física y Química', short: 'FyQ', room: 'Lab. 2', color: 'plum', student_count: 0,
      group: { name: '3º ESO B', stage: 'eso', level: 3 },
      schedule: [{ weekday: 0, start: '11:45', end: '12:40' }, { weekday: 2, start: '13:35', end: '14:30' }],
    });
    expect(page.url()).toContain(created.id);

    await add.getByRole('button', { name: 'Cerrar' }).click();
    await expect(add).toBeHidden();
    await expect(page.getByRole('heading', { level: 1, name: '3.º ESO B' })).toBeVisible();
    await expect(page.locator('.course-facts')).toHaveText('0 alumnos · Lab. 2 · Lunes 23 nov, 11:45');
    if (!isMobile(info)) {
      await expect(page.getByRole('complementary', { name: 'Navegación' }).getByRole('link', { name: '3.º ESO B · FyQ' })).toBeVisible();
    }
    await page.goto('/clases');
    await expect(classRow(page, 'Física y Química · 3.º ESO B')).toContainText('0 alumnos · Lunes 23 nov, 11:45');
  });

  test('clases-16 · an existing group: its students are reused, the hint says how to pick only some', async ({ page, teacher }) => {
    const sheet = await openNew(page);
    await sheet.getByRole('button', { name: 'Lengua', exact: true }).click();
    await expect(sheet.getByRole('textbox', { name: 'Materia' })).toHaveValue('Lengua Castellana y Literatura');
    await sheet.getByRole('button', { name: '2.º ESO C', exact: true }).click();
    await expect(sheet.getByText('Ya tiene 12 alumnos: se usarán en esta clase. ¿Solo algunos? Elige «Nuevo grupo» y añádelos desde 2.º ESO C.'))
      .toBeVisible();
    await expect(sheet.getByRole('textbox', { name: 'Nombre del grupo' })).toHaveCount(0);
    await footer(sheet).click();
    await expect(toast(page, 'Clase creada')).toBeVisible();
    // With students already there, the roster opens without the «Añadir alumnos» sheet.
    await expect(page).toHaveURL(/\/clases\/[0-9a-f-]+\/alumnos$/);
    await expect(dialog(page, 'Añadir alumnos')).toHaveCount(0);
    await expect(page.getByText('Alonso Gil, Marta')).toBeVisible();
    await expect(page.locator('.course-facts')).toContainText('12 alumnos');

    const created = (await teacher.api.get('/courses')).find((c: { subject: string }) => c.subject === 'Lengua Castellana y Literatura');
    expect(created.group.id).toBe(teacher.courses[0].groupId);
    expect(created.short).toBe('Lengua');
    expect(await teacher.api.get('/groups')).toHaveLength(1);
  });

  test('clases-17 · a new group typed like an existing one («2.º ESO C») joins that group', async ({ page, teacher }) => {
    const sheet = await openNew(page);
    await sheet.getByRole('textbox', { name: 'Materia' }).fill('Tutoría');
    await sheet.getByRole('button', { name: 'Nuevo grupo' }).click();
    await sheet.getByRole('textbox', { name: 'Nombre del grupo' }).fill('2.º ESO C');
    await footer(sheet).click();
    await expect(toast(page, 'Clase creada')).toBeVisible();
    await expect(page).toHaveURL(/\/alumnos$/);
    await expect(page.getByText('Alonso Gil, Marta')).toBeVisible();
    const created = (await teacher.api.get('/courses')).find((c: { subject: string }) => c.subject === 'Tutoría');
    expect(created.group.id).toBe(teacher.courses[0].groupId);
    expect(created.short).toBeNull(); // a subject typed by hand has no abbreviation
    expect(await teacher.api.get('/groups')).toHaveLength(1);
  });

  test('clases-18 · the group name guesses stage and year until the teacher picks them', async ({ page }) => {
    const sheet = await openNew(page);
    await sheet.getByRole('button', { name: 'Nuevo grupo' }).click();
    const name = sheet.getByRole('textbox', { name: 'Nombre del grupo' });
    const stage = sheet.getByRole('combobox', { name: 'Etapa' });
    const level = sheet.getByRole('combobox', { name: 'Curso' });
    for (const [typed, s, l] of [['1º Bach A', 'bachillerato', '1'], ['5º Primaria', 'primaria', '5'], ['2º CFGM', 'fp', '2'], ['4º ESO A', 'eso', '4']]) {
      await name.fill(typed);
      await expect(stage).toHaveValue(s);
      await expect(level).toHaveValue(l);
    }
    // Picked by hand: typing again no longer changes them.
    await stage.selectOption('bachillerato');
    await level.selectOption('2');
    await name.fill('4º ESO A · desdoble');
    await expect(stage).toHaveValue('bachillerato');
    await expect(level).toHaveValue('2');
  });

  test('clases-19 · the colour starts on the first one no other class uses', async ({ page }) => {
    const sheet = await openNew(page);
    // The existing class is «Verde azulado» (teal): the next free one is «Ocre».
    await expect(sheet.getByRole('radio', { name: 'Ocre' })).toHaveAttribute('aria-checked', 'true');
    await expect(sheet.getByRole('radio', { name: 'Verde azulado' })).toHaveAttribute('aria-checked', 'false');
    await expect(sheet.getByRole('radiogroup', { name: 'Color' }).getByRole('radio')).toHaveCount(8);
  });

  test('clases-20 · the other classes\' hours are taken; «Otra hora» adds a row of its own', async ({ page, teacher }, info) => {
    const sheet = await openNew(page);
    // Thursday 10:20 is Matemáticas · 2.º ESO C: shown with its group, not selectable.
    const taken = cell(sheet, 'jueves', '10:20', '11:15');
    await expect(taken).toHaveAccessibleName('jueves de 10:20 a 11:15: Matemáticas · 2.º ESO C');
    await expect(taken).toHaveText('2 C');
    await expect(taken).toHaveAttribute('aria-disabled', 'true');
    await expect(sheet.getByRole('button', { name: /^jueves de 10:20 a 11:15/ })).toHaveCount(0);
    await expect(sheet.getByText('Toca las horas en las que das esta clase.')).toBeVisible();

    await cell(sheet, 'viernes', '08:30', '09:25').click();
    await expect(sheet.getByText('1 sesión a la semana')).toBeVisible();
    await cell(sheet, 'viernes', '08:30', '09:25').click(); // tap again: off
    await expect(sheet.getByText('Toca las horas en las que das esta clase.')).toBeVisible();

    await sheet.getByRole('button', { name: 'Otra hora' }).click();
    const start = sheet.getByLabel('Empieza');
    const end = sheet.getByLabel('Termina');
    await start.fill('16:30');
    await end.fill('16:00');
    await expect(sheet.getByRole('button', { name: 'Añadir fila' })).toBeDisabled();
    await end.fill('17:25');
    await sheet.getByRole('button', { name: 'Añadir fila' }).click();
    await expect(sheet.getByRole('button', { name: 'Añadir fila' })).toHaveCount(0);
    await cell(sheet, 'martes', '16:30', '17:25').click();
    await expect(sheet.getByText('1 sesión a la semana')).toBeVisible();
    await shot(page, info, '20-otra-hora');

    await sheet.getByRole('textbox', { name: 'Materia' }).fill('Taller de matemáticas');
    await sheet.getByRole('button', { name: '2.º ESO C', exact: true }).click();
    await footer(sheet).click();
    await expect(toast(page, 'Clase creada')).toBeVisible();
    const created = (await teacher.api.get('/courses')).find((c: { subject: string }) => c.subject === 'Taller de matemáticas');
    expect(created.schedule).toEqual([{ weekday: 1, start: '16:30', end: '17:25', room: null }]);
  });

  test('clases-21 · a server error stays in the sheet with what was typed; the next try creates it', async ({ page, teacher }) => {
    const sheet = await openNew(page);
    await sheet.getByRole('button', { name: 'Inglés', exact: true }).click();
    await sheet.getByRole('button', { name: '2.º ESO C', exact: true }).click();
    let fail = true;
    await page.route((url) => url.pathname === '/api/courses', (route) => (fail && route.request().method() === 'POST'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Traceback…' }) })
      : route.fallback()));
    await footer(sheet).click();
    // A 500 never shows the server's text: a plain Spanish line.
    await expect(sheet.getByRole('alert')).toHaveText('El servidor ha fallado. Inténtalo en un momento.');
    await expect(sheet.getByRole('textbox', { name: 'Materia' })).toHaveValue('Inglés');
    expect(await teacher.api.get('/courses')).toHaveLength(1);

    fail = false;
    await footer(sheet).click();
    await expect(toast(page, 'Clase creada')).toBeVisible();
    expect(await teacher.api.get('/courses')).toHaveLength(2);
  });

  test('clases-22 · ✕, Esc and back close the sheet; it opens clean again', async ({ page }) => {
    let sheet = await openNew(page);
    await sheet.getByRole('textbox', { name: 'Materia' }).fill('Música');
    await sheet.getByRole('button', { name: 'Cerrar' }).click();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\/clases$/);

    await page.getByRole('button', { name: 'Nueva clase' }).click();
    sheet = dialog(page, 'Nueva clase');
    await expect(sheet.getByRole('textbox', { name: 'Materia' })).toHaveValue('');
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\/clases$/);

    await page.getByRole('button', { name: 'Nueva clase' }).click();
    await expect(sheet).toBeVisible();
    await page.goBack();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\/clases$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Clases' })).toBeVisible();

    // A link to «?nueva=1» opens it directly.
    await sheetsClosed(page);
    await page.goto('/clases?nueva=1');
    await expect(sheet).toBeVisible();
  });
});

test.describe('clases · grupo sin alumnos', () => {
  test.use({ teacherSpec: { courses: [{ subject: 'Tutoría', group: '2º ESO R', color: 'olive' }] } });

  test('clases-16b · an existing group without students: «Aún no tiene alumnos.» and the add sheet opens', async ({ page, teacher }) => {
    const sheet = await openNew(page);
    await sheet.getByRole('button', { name: 'Matemáticas', exact: true }).click();
    await sheet.getByRole('button', { name: '2.º ESO R', exact: true }).click();
    await expect(sheet.getByText('Aún no tiene alumnos.')).toBeVisible();
    await footer(sheet).click();
    await expect(toast(page, 'Clase creada')).toBeVisible();
    await expect(page).toHaveURL(/\/alumnos\?anadir=1$/);
    await expect(dialog(page, 'Añadir alumnos')).toBeVisible();
    const created = (await teacher.api.get('/courses')).find((c: { subject: string }) => c.subject === 'Matemáticas');
    expect(created.group.id).toBe(teacher.courses[0].groupId);
  });
});

test.describe('clases · horario de una clase nueva', () => {
  // The teacher's only class meets on Wednesday 09:00-09:55, off the usual 55-minute periods.
  test.use({ teacherSpec: { courses: [{ ...MATES_2C, subject: 'Física y Química', short: 'FyQ', group: '3º ESO A', slots: [{ weekday: WED, start: '09:00', end: '09:55' }] }] } });

  test('clases-23 · the rows are the teacher\'s own hours plus the usual periods that do not clash', async ({ page }) => {
    const sheet = await openNew(page);
    const rows = sheet.getByRole('grid', { name: 'Horario semanal' }).getByRole('row');
    await expect(rows).toHaveCount(5);
    await expect(rows.locator('.sched__time')).toHaveText(['09:0009:55', '10:2011:15', '11:4512:40', '12:4013:35', '13:3514:30']);
    await expect(cell(sheet, 'miércoles', '09:00', '09:55')).toHaveText('3 A');
    await expect(cell(sheet, 'lunes', '09:00', '09:55')).toHaveAttribute('aria-pressed', 'false');
  });
});
