import { demoCourse, DEMO_2B, expect, MATES_2C, openRoster, rosterRow, sheet, shot, test } from './alumnos-helpers';

// Clase › Alumnos: the roster by surname with one line per student («A vigilar», medidas, faltas) and the term average;
// a tap opens the student file; the empty and failed states; the two ways into «Añadir alumnos». No AI.

test.describe('demo class (read only)', () => {
  test('alumnos-01 the roster of 2.º ESO B: by surname, first «A vigilar» reason, measures and the average', async ({ page, demo }, info) => {
    const course = await demoCourse(demo, DEMO_2B);
    const roster: { sort_name: string; term_average: number | null }[] = await demo.get(`/courses/${course.id}/students`);

    // From Clases, as a teacher gets there.
    await page.goto('/clases');
    await page.getByRole('link', { name: /Matemáticas · 2\.º ESO B/ }).click();
    await page.getByRole('group', { name: 'Secciones de la clase' }).getByRole('button', { name: 'Alumnos' }).click();
    await expect(page).toHaveURL(new RegExp(`/clases/${course.id}/alumnos$`));

    const list = page.locator('.students-roster');
    await expect(list.getByRole('heading', { name: `${roster.length} alumnos` })).toBeVisible();
    await expect(list.getByText('Nota: media de la 1.ª evaluación.')).toBeVisible();
    // Same order as the server (by surname), one link per student and «Añadir alumnos» last.
    const titles = list.locator('a.row .row__title');
    await expect(titles).toHaveText(roster.map((s) => s.sort_name));
    await expect(list.locator('.row').last()).toHaveText(/Añadir alumnos/);

    // The average of the term, one decimal, as the server sends it.
    await expect(rosterRow(page, 'Cano Álvarez, Jorge').locator('.grade-pill')).toHaveText('4,7');
    // First «A vigilar» reason, capitalised; faltas are not repeated beside it.
    const hugo = rosterRow(page, 'Domínguez Marín, Hugo');
    await expect(hugo).toContainText('7 faltas sin justificar en 14 días');
    await expect(hugo.locator('.students-roster__abs')).toHaveCount(0);
    const ainhoa = rosterRow(page, 'Morales Castro, Ainhoa');
    await expect(ainhoa).toContainText('2 incidencias en 7 días');
    await expect(ainhoa.locator('.students-roster__abs')).toHaveCount(0); // her one absence is not beside a reason
    // Measures as short chips, two at most and «+N»; ACS with its level.
    const ruben = rosterRow(page, 'López Vázquez, Rubén');
    await expect(ruben.locator('.chip')).toHaveText(['Más tiempo', 'Letra ampliada', '+1']);
    await expect(rosterRow(page, 'Vázquez Delgado, Nerea').locator('.chip')).toHaveText(['ACS 5.º Primaria']);
    // A mark without measures says only «NEAE»: the diagnosis never shows in a list that may be projected.
    const nico = rosterRow(page, 'Guerrero Ruiz, Nicolás');
    await expect(nico.locator('.chip')).toHaveText(['NEAE']);
    await expect(nico).not.toContainText('Altas capacidades');
    // Nobody else carries a line.
    await expect(rosterRow(page, 'Castillo Medina, Adrián').locator('.row__sub')).toHaveCount(0);
    await shot(page, info, 'lista-2b');
  });

  test('alumnos-02 a row opens the student file, and back returns to the roster', async ({ page, demo }) => {
    const course = await demoCourse(demo, DEMO_2B);
    await openRoster(page, course.id);
    await rosterRow(page, 'Díaz Serrano, Ainhoa').click();
    await expect(page).toHaveURL(/\/alumnos\/[0-9a-f-]+$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Ainhoa Díaz Serrano' })).toBeVisible();
    await page.getByRole('button', { name: '2.º ESO B' }).click();
    await expect(page).toHaveURL(new RegExp(`/clases/${course.id}/alumnos$`));
    await expect(rosterRow(page, 'Díaz Serrano, Ainhoa')).toBeVisible();
  });

  test('alumnos-03 the roster could not load: it says so and «Reintentar» brings it', async ({ page, demo }) => {
    const course = await demoCourse(demo, DEMO_2B);
    let fail = true;
    await page.route(`**/api/courses/${course.id}/students`, (route) => (fail
      ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Error interno del servidor' }) })
      : route.continue()));
    await page.goto(`/clases/${course.id}/alumnos`);
    await expect(page.getByText('No se ha podido cargar la lista')).toBeVisible({ timeout: 15_000 });
    fail = false;
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(rosterRow(page, 'Cano Álvarez, Jorge')).toBeVisible();
    await expect(page.getByText('No se ha podido cargar la lista')).toHaveCount(0);
  });
});

test.describe('a class of its own', () => {
  test.use({
    teacherSpec: {
      courses: [
        {
          ...MATES_2C,
          // Three absences in October (older than 14 days: not «A vigilar») and two lates.
          marks: [
            { student: 0, date: '2026-10-05', start: '08:30', status: 'absent' },
            { student: 0, date: '2026-10-06', start: '09:25', status: 'absent' },
            { student: 0, date: '2026-10-13', start: '09:25', status: 'justified' },
            { student: 1, date: '2026-10-05', start: '08:30', status: 'absent' },
            { student: 1, date: '2026-10-06', start: '09:25', status: 'late' },
          ],
        },
        { subject: 'Física y Química', group: '3º ESO A', slots: [] },
      ],
    },
  });

  test('alumnos-04 three or more absences show in the row; fewer do not', async ({ page, teacher }) => {
    const [c] = teacher.courses;
    await openRoster(page, c.id);
    // absences (unjustified) of the term: 2 for Marta (the justified one is not counted), 1 for Pablo.
    await expect(rosterRow(page, 'Alonso Gil, Marta').locator('.students-roster__abs')).toHaveCount(0);
    await teacher.api.put(`/courses/${c.id}/attendance`, { date: '2026-10-20', start: '09:25', marks: [{ student_id: c.students[0].id, status: 'absent' }] });
    await page.reload();
    await expect(rosterRow(page, 'Alonso Gil, Marta').locator('.students-roster__abs')).toHaveText('3 faltas');
    await expect(rosterRow(page, 'Benítez Ruiz, Pablo').locator('.row__sub')).toHaveCount(0);
    // A reason of «A vigilar» that is not about absences leaves the count beside it.
    for (const date of ['2026-11-17', '2026-11-18']) {
      await teacher.api.post('/notes', { course_id: c.id, kind: 'incident', date, text: 'Interrumpe la clase.', student_ids: [c.students[0].id] });
    }
    await page.reload();
    await expect(rosterRow(page, 'Alonso Gil, Marta')).toHaveAccessibleName('Alonso Gil, Marta 2 incidencias en 7 días 3 faltas');
    await expect(rosterRow(page, 'Alonso Gil, Marta').locator('.students-roster__abs')).toHaveText('3 faltas');
    // No grade that counts yet in the class: no average pills.
    await expect(rosterRow(page, 'Alonso Gil, Marta').locator('.grade-pill')).toHaveCount(0);
  });

  test('alumnos-05 a class without students: the empty state opens «Añadir alumnos»', async ({ page, teacher }, info) => {
    const fyq = teacher.courses[1];
    await openRoster(page, fyq.id);
    await expect(page.getByText('Esta clase aún no tiene alumnos')).toBeVisible();
    await expect(page.getByText('Pega la lista desde Séneca, Raíces o una hoja de cálculo. Un alumno por línea.')).toBeVisible();
    await shot(page, info, 'lista-vacia');
    await page.getByRole('button', { name: 'Añadir alumnos' }).click();
    await expect(sheet(page, 'Añadir alumnos')).toBeVisible();
    await expect(page).toHaveURL(/\?anadir=1$/);
  });

  test('alumnos-06 «Añadir alumnos» from the last row of the roster and from the class «···» of another tab', async ({ page, teacher }) => {
    const [c] = teacher.courses;
    await openRoster(page, c.id);
    const add = sheet(page, 'Añadir alumnos');
    await page.locator('.students-roster').getByRole('button', { name: 'Añadir alumnos' }).click();
    await expect(add).toBeVisible();
    await expect(add.getByText('2.º ESO C')).toBeVisible();
    await expect(page).toHaveURL(/\?anadir=1$/);
    await add.getByRole('button', { name: 'Cerrar' }).click();
    await expect(add).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/clases/${c.id}/alumnos$`));

    // From the Cuaderno tab: the menu takes the teacher to Alumnos with the sheet open.
    await page.goto(`/clases/${c.id}/cuaderno`);
    await page.getByRole('button', { name: 'Más opciones de la clase' }).click();
    await page.getByRole('menuitem', { name: 'Añadir alumnos' }).click();
    await expect(add).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/clases/${c.id}/alumnos\\?anadir=1$`));
    // Back closes the sheet and stays on the roster.
    await page.goBack();
    await expect(add).toBeHidden();
    await expect(rosterRow(page, 'Alonso Gil, Marta')).toBeVisible();
  });
});
