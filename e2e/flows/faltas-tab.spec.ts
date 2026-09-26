import {
  bug, CLASS, closed, countListSaves, demoCourse, dialog, expect, headings, isMobile, listSheet, missingRow, openFaltas, pastLists, plural,
  rosterRow, section, shortDay, shot, studentRow, summary, tapTo, test, todayRow, TODAY, THU,
} from './faltas-helpers';

// Clase › Faltas (docs/PRODUCT.md §2 «Faltas (pestaña)», §4.9): the term selector, today's lists, the lists still due of
// the last 14 lective days and «Por alumno», which opens the student file unfolded at Asistencia (§4.8).
// Taking and editing lists from this tab: faltas-listas.spec.ts. What attendance changes elsewhere: faltas-efectos.spec.ts.

test.describe('faltas · la pestaña (demo)', () => {
  test('faltas-01 · reached from the class tabs and by its address; the current term is on screen', async ({ page, demo }, info) => {
    const c = await demoCourse(demo, 'Matemáticas · 2.º ESO B');
    await page.goto(`/clases/${c.id}/cuaderno`);
    await page.getByRole('group', { name: 'Secciones de la clase' }).getByRole('button', { name: 'Faltas' }).click();
    await expect(page).toHaveURL(new RegExp(`/clases/${c.id}/asistencia$`));
    const terms = page.getByRole('group', { name: 'Evaluación' });
    await expect(terms.getByRole('button')).toHaveText(['1.ª', '2.ª', '3.ª']);
    await expect(terms.getByRole('button', { name: '1.ª' })).toHaveAttribute('aria-pressed', 'true');
    await expect(headings(page)).toHaveText(['Hoy', 'Por alumno']);
    const [today] = (await summary(demo, c.id)).today; // 10:20–11:15, on now
    expect(today.start).toBe('10:20');
    await expect(todayRow(page, '10:20–11:15')).toContainText(today.taken ? 'Lista pasada' : 'Lista sin pasar');
    await expect(todayRow(page, '10:20–11:15').getByRole('button', { name: today.taken ? 'Editar lista' : 'Pasar lista' })).toBeVisible();
    await expect(section(page, 'Por alumno')).toContainText('Ordenado por faltas sin justificar.');
    await shot(page, info, '01-tab');

    await page.reload();
    await expect(page.getByRole('group', { name: 'Secciones de la clase' }).getByRole('button', { name: 'Faltas' })).toHaveAttribute('aria-pressed', 'true');
    await expect(headings(page)).toHaveText(['Hoy', 'Por alumno']);
  });

  test('faltas-02 · «Por alumno»: the server\'s students and counts, most unjustified absences first', async ({ page, demo }) => {
    const c = await demoCourse(demo, 'Matemáticas · 1.º ESO A');
    const s = await summary(demo, c.id);
    expect(s.students.length).toBeGreaterThan(5);
    for (let i = 1; i < s.students.length; i++) expect(s.students[i - 1].absent).toBeGreaterThanOrEqual(s.students[i].absent);

    await openFaltas(page, c.id);
    const rows = section(page, 'Por alumno').getByRole('link');
    await expect(rows).toHaveCount(s.students.length);
    const expected = s.students.map((r) => [
      r.absent && plural(r.absent, 'falta sin justificar', 'faltas sin justificar'),
      r.justified && plural(r.justified, 'justificada', 'justificadas'),
      r.late && plural(r.late, 'retraso', 'retrasos'),
    ].filter(Boolean).join(' · '));
    for (let i = 0; i < s.students.length; i++) {
      await expect(rows.nth(i)).toContainText(s.students[i].student.sort_name);
      await expect(rows.nth(i)).toContainText(expected[i]);
    }
    // Someone with only lates and someone with only justified absences read as such.
    expect(expected).toContain('1 justificada');
    expect(expected).toContain('2 retrasos');
  });

  test('faltas-03 · other terms: no list taken yet, and back to the 1.ª', async ({ page, demo }) => {
    const c = await demoCourse(demo, 'Matemáticas · 2.º ESO B');
    await openFaltas(page, c.id);
    const terms = page.getByRole('group', { name: 'Evaluación' });
    const count = (await summary(demo, c.id)).students.length;
    for (const [t, label] of [['2.ª', '2.ª evaluación'], ['3.ª', '3.ª evaluación']]) {
      await terms.getByRole('button', { name: t }).click();
      await expect(terms.getByRole('button', { name: t })).toHaveAttribute('aria-pressed', 'true');
      const body = section(page, 'Por alumno');
      await expect(body).toContainText('Aún no has pasado lista');
      await expect(body).toContainText(label);
      await expect(body.getByRole('link')).toHaveCount(0);
      await expect(headings(page)).toHaveText(['Por alumno']);
    }
    await terms.getByRole('button', { name: '1.ª' }).click();
    await expect(section(page, 'Por alumno').getByRole('link')).toHaveCount(count);
    await expect(headings(page)).toHaveText(['Hoy', 'Por alumno']);
  });

  test('faltas-04 · a student opens her file unfolded at Asistencia, with the same absences dated; back returns to Faltas', async ({ page, demo }, info) => {
    const c = await demoCourse(demo, 'Matemáticas · 2.º ESO B');
    const s = await summary(demo, c.id);
    const top = s.students[0];
    expect(top.absent).toBeGreaterThanOrEqual(3);
    await openFaltas(page, c.id);
    await studentRow(page, top.student.sort_name).click();

    await expect(page).toHaveURL(new RegExp(`/alumnos/${top.student.id}#asistencia$`));
    await expect(page.getByRole('heading', { level: 1, name: top.student.name })).toBeVisible();
    const total = top.absent + top.justified;
    const parts = [
      `${plural(total, 'falta', 'faltas')}${top.justified ? ` (${plural(top.justified, 'justificada', 'justificadas')})` : ''}`,
      top.late && plural(top.late, 'retraso', 'retrasos'),
    ].filter(Boolean).join(' · ');
    const counts = page.getByRole('button', { name: new RegExp(`^${parts.replace(/[()]/g, '\\$&')} en la 1\\.ª evaluación`) });
    await expect(counts).toHaveAttribute('aria-expanded', 'true');
    await expect(counts).toBeInViewport();
    const file = await demo.get(`/students/${top.student.id}`);
    const marks = file.courses.find((x: { course: { id: string } }) => x.course.id === c.id).attendance as { date: string; start: string; status: string }[];
    expect(marks.length).toBe(total + top.late);
    const dated = page.getByRole('button', { name: /: (justificar|quitar justificación)$/ });
    await expect(dated).toHaveCount(total);
    const first = marks[0];
    await expect(dated.first()).toHaveAccessibleName(new RegExp(`^${shortDay(first.date)} · ${first.start}, Falta`));
    await shot(page, info, '04-student');

    await expect(page.locator('.back-btn')).toHaveText('2.º ESO B');
    await page.locator('.back-btn').click();
    await expect(page).toHaveURL(new RegExp(`/clases/${c.id}/asistencia$`));
    await expect(studentRow(page, top.student.sort_name)).toBeVisible();
  });

  test('faltas-05 · the counts agree on every screen: Faltas, the file, Alumnos and Evaluación', async ({ page, demo }) => {
    // Hugo Domínguez Marín (2.º ESO B): the demo student with most unjustified absences.
    const c = await demoCourse(demo, 'Matemáticas · 2.º ESO B');
    const top = (await summary(demo, c.id)).students[0];
    const n = top.absent + top.justified;
    await openFaltas(page, c.id);
    await expect(studentRow(page, top.student.sort_name)).toContainText(plural(top.absent, 'falta sin justificar', 'faltas sin justificar'));

    await page.goto(`/alumnos/${top.student.id}`);
    await expect(page.getByRole('button', { name: new RegExp(`^${plural(n, 'falta', 'faltas')}.* en la 1\\.ª evaluación`) })).toBeVisible();

    await page.goto(`/clases/${c.id}/alumnos`);
    const rosterLine = page.getByRole('link', { name: new RegExp(`^${top.student.sort_name}`) });
    await expect(rosterLine).toContainText(`${top.absent} faltas sin justificar`);

    await page.goto(`/clases/${c.id}/evaluacion/1`);
    const evalRow = page.getByRole('button', { name: `${top.student.name}: editar nota y comentario` });
    await expect(evalRow).toContainText(plural(n, 'falta', 'faltas'));
  });

  test('faltas-06 · a list already taken opens with its marks; looking at it saves nothing', async ({ page, demo }) => {
    const c = await demoCourse(demo, 'Física y Química · 3.º ESO A');
    const saved = await demo.get(`/courses/${c.id}/attendance?date=${TODAY}&start=08:30`);
    expect(saved.taken).toBe(true);
    const saves = countListSaves(page);
    await openFaltas(page, c.id);
    const row = todayRow(page, '08:30–09:25');
    await expect(row).toContainText('Lista pasada');
    await row.getByRole('button', { name: 'Editar lista' }).click();
    const sheet = await listSheet(page);
    const rows = saved.students as { student: { sort_name: string }; status: string }[];
    await expect(sheet.getByRole('listitem')).toHaveCount(rows.length);
    const LABELS: Record<string, string> = { present: 'Presente', absent: 'Falta', late: 'Retraso', justified: 'Justificada' };
    for (let i = 0; i < rows.length; i++) {
      await expect(rosterRow(sheet, i + 1)).toHaveAccessibleName(`${i + 1}. ${rows[i].student.sort_name}: ${LABELS[rows[i].status]}. Toca para cambiar`);
    }
    await sheet.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(page.locator('.toasts .toast')).toHaveCount(0);
    expect(saves).toEqual([]);
    await expect(row).toContainText('Lista pasada');
  });

  test('faltas-09 · the tab does not load: the error and «Reintentar»', async ({ page, demo }) => {
    const c = await demoCourse(demo, 'Matemáticas · 2.º ESO B');
    let fail = true;
    await page.route('**/api/courses/*/attendance/summary**', (route) => (fail
      ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Error del servidor' }) })
      : route.continue()));
    await page.goto(`/clases/${c.id}/asistencia`);
    await expect(page.getByText('No se ha podido cargar la asistencia')).toBeVisible({ timeout: 20_000 });
    fail = false;
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(section(page, 'Por alumno').getByRole('link').first()).toBeVisible();
    await expect(page.getByText('No se ha podido cargar la asistencia')).toBeHidden();
  });
});

test.describe('faltas · una lista del día que ya terminó (demo)', () => {
  test('faltas-08 · a list ended today and still due is shown once, not in «Hoy» and again in «Listas sin pasar»', async ({ page, demo }, info) => {
    bug('FALTAS-BUG-01', 'today\'s ended list is listed twice: in «Hoy» and in «Listas sin pasar» (same date and time)');
    const c = await demoCourse(demo, 'Matemáticas I · 1.º Bach B');
    const early = await pastLists(demo, c, { weekday: THU, from: 6 * 60 }); // ended at dawn, nobody took it
    try {
      expect(early.missing).toContain(TODAY);
      await openFaltas(page, c.id);
      await expect(todayRow(page, `${early.start}–${early.end}`)).toContainText('Lista sin pasar');
      await shot(page, info, '08-twice');
      // Today's list, in «Hoy» or among the lists still due (whose other rows are the Thursdays before), but not in both.
      const times = `${early.start}–${early.end}`;
      await expect.poll(async () => (await todayRow(page, times).count()) + (await missingRow(page, TODAY).filter({ hasText: times }).count())).toBe(1);
    } finally {
      await early.restore(demo);
    }
  });
});

test.describe('faltas · un aula que no es un número', () => {
  test.use({ worldSpec: { courses: [{ ...CLASS, subject: 'Física y Química', group: '3º ESO A', room: 'Lab. 1' }] } });

  test('faltas-07 · the list says where the class is: «Lab. 1», not «Aula Lab. 1»', async ({ page, world }) => {
    const c = world.courses[0];
    await openFaltas(page, c.id);
    await expect(page.getByText(/^8 alumnos · Lab\. 1 · /)).toBeVisible(); // the class header
    await todayRow(page, '10:20–11:15').getByRole('button', { name: 'Pasar lista' }).click();
    const sheet = await listSheet(page);
    await expect(sheet.getByText('10:20–11:15 · Lab. 1', { exact: true })).toBeVisible();
  });
});

test.describe('faltas · clases sin horario o sin alumnos', () => {
  test.describe('sin alumnos', () => {
    test.use({ worldSpec: { courses: [{ ...CLASS, students: [] }] } });

    test('faltas-10 · a class without students: no lists, «Añadir alumnos» opens the roster\'s add sheet', async ({ page, world }, info) => {
      const c = world.courses[0];
      await openFaltas(page, c.id);
      await expect(page.getByText('Esta clase aún no tiene alumnos')).toBeVisible();
      await expect(headings(page)).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Pasar lista' })).toHaveCount(0);
      await shot(page, info, '10-no-students');
      await page.getByRole('link', { name: 'Añadir alumnos' }).click();
      await expect(page).toHaveURL(new RegExp(`/clases/${c.id}/alumnos\\?anadir=1$`));
      await expect(page.getByRole('dialog', { name: /Añadir alumnos/ })).toBeVisible();
    });
  });

  test.describe('sin horario', () => {
    test.use({ worldSpec: { courses: [{ ...CLASS, slots: [] }] } });

    test('faltas-11 · a class without a timetable: «Añadir horario» opens its settings, and today\'s lists appear', async ({ page, world }, info) => {
      const c = world.courses[0];
      await openFaltas(page, c.id);
      await expect(page.getByText('Esta clase no tiene horario')).toBeVisible();
      await expect(page.getByText('Añádelo para pasar lista.')).toBeVisible();
      await expect(headings(page)).toHaveCount(0);
      await shot(page, info, '11-no-schedule');
      await page.getByRole('button', { name: 'Añadir horario' }).click();
      const settings = dialog(page, 'Ajustes de la clase');
      await expect(settings).toBeVisible();
      await settings.getByRole('gridcell', { name: 'jueves de 10:20 a 11:15' }).click();
      await expect(settings.getByRole('gridcell', { name: 'jueves de 10:20 a 11:15' })).toHaveAttribute('aria-pressed', 'true');
      await expect(settings.getByText('1 sesión a la semana')).toBeVisible();
      await settings.getByRole('button', { name: 'Guardar cambios' }).click();
      await expect(page.locator('.toasts .toast').filter({ hasText: 'Cambios guardados' })).toBeVisible();
      await expect(settings).toBeHidden();

      await expect(page.getByText('Esta clase no tiene horario')).toBeHidden();
      await expect(todayRow(page, '10:20–11:15')).toContainText('Lista sin pasar');
      const course = await world.api.get(`/courses/${c.id}`);
      expect(course.schedule).toEqual([expect.objectContaining({ weekday: THU, start: '10:20', end: '11:15' })]);
      await todayRow(page, '10:20–11:15').getByRole('button', { name: 'Pasar lista' }).click();
      await expect((await listSheet(page)).getByRole('listitem')).toHaveCount(8);
    });
  });
});

test.describe('faltas · la cabecera de la clase', () => {
  test.use({ worldSpec: { courses: [CLASS] } });

  test('faltas-14 · «Pasar lista» in the class header while the class is on (Faltas has it in its list row); once taken it goes away and Faltas says so', async ({ page, world }) => {
    const c = world.courses[0];
    await openFaltas(page, c.id);
    const header = page.locator('.topbar').getByRole('button', { name: 'Pasar lista' });
    // Faltas offers today's list in its own row: the header does not repeat it there.
    await expect(todayRow(page, '10:20–11:15').getByRole('button', { name: 'Pasar lista' })).toBeVisible();
    await expect(header).toHaveCount(0);
    const tabs = page.getByRole('group', { name: 'Secciones de la clase' });
    await tabs.getByRole('button', { name: 'Alumnos' }).click();
    await expect(header).toBeVisible();
    await header.click();
    const sheet = await listSheet(page);
    await tapTo(sheet, 6, 'Falta');
    await sheet.getByRole('button', { name: 'Cerrar lista' }).click();
    await expect(page.locator('.toasts .toast').filter({ hasText: 'Lista pasada · 7 presentes · 1 falta' })).toBeVisible();
    await expect(header).toHaveCount(0);
    await tabs.getByRole('button', { name: 'Faltas' }).click();
    await expect(todayRow(page, '10:20–11:15')).toContainText('Lista pasada');
    await expect(studentRow(page, 'Fuentes Vera, Adrián')).toContainText('1 falta sin justificar');
  });
});

test.describe('faltas · teclado (ordenador)', () => {
  test.use({ worldSpec: { courses: [CLASS] } });

  test('faltas-12 · keyboard only: the term, today\'s list (Space, Enter, Esc) and a student', async ({ page, world }, info) => {
    test.skip(isMobile(info), 'keyboard path of a computer');
    const c = world.courses[0];
    await openFaltas(page, c.id);
    const terms = page.getByRole('group', { name: 'Evaluación' });
    await terms.getByRole('button', { name: '2.ª' }).focus();
    await page.keyboard.press('Enter');
    await expect(terms.getByRole('button', { name: '2.ª' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Space');
    await expect(terms.getByRole('button', { name: '1.ª' })).toHaveAttribute('aria-pressed', 'true');

    const take = todayRow(page, '10:20–11:15').getByRole('button', { name: 'Pasar lista' });
    await take.focus();
    await page.keyboard.press('Enter');
    const sheet = await listSheet(page);
    await rosterRow(sheet, 2).focus();
    await page.keyboard.press('Space');
    await expect(rosterRow(sheet, 2)).toHaveAccessibleName(/: Falta\./);
    await page.keyboard.press('Enter');
    await expect(rosterRow(sheet, 2)).toHaveAccessibleName(/: Retraso\./);
    await page.keyboard.press('Escape');
    await closed(page, sheet);
    await expect(page.locator('.toasts .toast').filter({ hasText: 'Lista pasada · 7 presentes · 1 retraso' })).toBeVisible();
    await expect(todayRow(page, '10:20–11:15')).toContainText('Lista pasada');

    const student = studentRow(page, 'Benítez Ruiz, Pablo');
    await expect(student).toContainText('1 retraso');
    await student.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/alumnos/${c.students[1].id}#asistencia$`));
  });
});
