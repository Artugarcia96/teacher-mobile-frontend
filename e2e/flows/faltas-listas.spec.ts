import {
  bug, CLASS, closed, countListSaves, demoCourse, dialog, expect, LABEL, list, listSheet, longDate, mark, missingRow, openFaltas,
  pastLists, rosterRow, rowOptions, section, shot, studentRow, summary, tapTo, test, toast, todayRow, TODAY, type Api,
  type DemoCourse, type PastLists,
} from './faltas-helpers';

// Lists from Clase › Faltas (docs/PRODUCT.md §4.2 «Pasar lista», §2 «Faltas»): today's lists, the lists still due of the
// last 14 lective days (take one, «Dar por pasadas», «No hubo clase») and editing a list already taken.
// The sheet's gestures in detail (long-press, notes, keyboard, back gesture) are the same component as in Hoy: see
// e2e/flows/hoy-lista.spec.ts; two devices on one list: e2e/attendance.spec.ts.

const BACH = 'Matemáticas I · 1.º Bach B';

test.describe('faltas · listas de hoy', () => {
  test.use({ worldSpec: { courses: [CLASS] } });

  test('faltas-20 · take today\'s list from Faltas: absences, a late arrival, a justified one with its note', async ({ page, world }, info) => {
    const c = world.courses[0];
    await openFaltas(page, c.id);
    await expect(todayRow(page, '10:20–11:15')).toContainText('Lista sin pasar');
    await expect(todayRow(page, '12:40–13:35')).toContainText('Lista sin pasar');
    await expect(section(page, 'Por alumno')).toContainText('Aún no has pasado lista');

    await todayRow(page, '10:20–11:15').getByRole('button', { name: 'Pasar lista' }).click();
    const sheet = await listSheet(page);
    await expect(sheet.getByText('10:20–11:15 · Aula 112', { exact: true })).toBeVisible();
    await expect(sheet.getByText('8 presentes', { exact: true })).toBeVisible();
    await expect(sheet.getByRole('listitem')).toHaveCount(8);
    await tapTo(sheet, 1, 'Falta');
    await tapTo(sheet, 2, 'Retraso');
    await tapTo(sheet, 3, 'Falta');
    const three = await rowOptions(page, info, rosterRow(sheet, 3));
    await three.getByRole('menuitem', { name: 'Justificar falta' }).click();
    await expect(rosterRow(sheet, 3)).toHaveAccessibleName(/: Justificada\./);
    const one = await rowOptions(page, info, rosterRow(sheet, 1));
    await one.getByRole('menuitem', { name: 'Añadir nota' }).click();
    const note = sheet.getByRole('textbox', { name: 'Nota' });
    await note.fill('Médico');
    await note.press('Enter');
    await expect(rosterRow(sheet, 1)).toContainText('Médico');
    await expect(sheet.getByText('5 presentes · 1 falta · 1 retraso · 1 justificada')).toBeVisible();
    await shot(page, info, '20-list');
    await sheet.getByRole('button', { name: 'Cerrar lista' }).click();
    await expect(toast(page, 'Lista pasada · 5 presentes · 1 falta · 1 retraso · 1 justificada')).toBeVisible();
    await expect(sheet).toBeHidden();

    await expect(todayRow(page, '10:20–11:15')).toContainText('Lista pasada');
    await expect(todayRow(page, '10:20–11:15').getByRole('button', { name: 'Editar lista' })).toBeVisible();
    await expect(todayRow(page, '12:40–13:35')).toContainText('Lista sin pasar');
    const rows = section(page, 'Por alumno').getByRole('link');
    await expect(rows).toHaveText([
      'Alonso Gil, Marta1 falta sin justificar', 'Castro León, Lucía1 justificada', 'Benítez Ruiz, Pablo1 retraso',
    ]);
    expect((await list(world.api, c.id, TODAY, '10:20')).by).toMatchObject({
      'Alonso Gil, Marta': 'absent · Médico', 'Benítez Ruiz, Pablo': 'late', 'Castro León, Lucía': 'justified', 'Díaz Soto, Hugo': 'present',
    });
    await page.reload();
    await expect(todayRow(page, '10:20–11:15')).toContainText('Lista pasada');
    await expect(rows).toHaveCount(3);
  });

  test('faltas-28 · opening a list and leaving it untouched does not take it; «Cerrar lista» takes it with everyone present', async ({ page, world }) => {
    const c = world.courses[0];
    const saves = countListSaves(page);
    await openFaltas(page, c.id);
    const later = todayRow(page, '12:40–13:35');
    await later.getByRole('button', { name: 'Pasar lista' }).click();
    let sheet = await listSheet(page);
    await sheet.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(page.locator('.toasts .toast')).toHaveCount(0);
    await expect(later).toContainText('Lista sin pasar');
    expect(saves).toEqual([]);
    expect((await list(world.api, c.id, TODAY, '12:40')).taken).toBe(false);

    await later.getByRole('button', { name: 'Pasar lista' }).click();
    sheet = await listSheet(page);
    await sheet.getByRole('button', { name: 'Cerrar lista' }).click();
    await expect(toast(page, 'Lista pasada · 8 presentes')).toBeVisible();
    await expect(later).toContainText('Lista pasada');
    const saved = await list(world.api, c.id, TODAY, '12:40');
    expect(saved.taken).toBe(true);
    expect(Object.values(saved.by).every((s) => s === 'present')).toBe(true);
  });

  test('faltas-27 · a save that fails keeps the sheet and its taps; the row is not «Lista pasada» until it goes through', async ({ page, world }) => {
    const c = world.courses[0];
    await openFaltas(page, c.id);
    await page.route('**/api/courses/*/attendance', (route) => (route.request().method() === 'PUT'
      ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Servicio no disponible' }) })
      : route.continue()));
    await todayRow(page, '10:20–11:15').getByRole('button', { name: 'Pasar lista' }).click();
    const sheet = await listSheet(page);
    await tapTo(sheet, 4, 'Falta');
    await expect(sheet.getByText('No se ha podido guardar', { exact: true })).toBeVisible();
    await sheet.getByRole('button', { name: 'Cerrar lista' }).click();
    await expect(toast(page, 'No se ha podido guardar la lista. Revisa la conexión y vuelve a intentarlo.')).toBeVisible();
    await expect(sheet).toBeVisible();
    await expect(rosterRow(sheet, 4)).toHaveAccessibleName(/: Falta\./);
    expect((await list(world.api, c.id, TODAY, '10:20')).taken).toBe(false);

    await page.unroute('**/api/courses/*/attendance');
    await sheet.getByRole('button', { name: 'Cerrar lista' }).click();
    await expect(toast(page, 'Lista pasada · 7 presentes · 1 falta')).toBeVisible();
    await expect(sheet).toBeHidden();
    await expect(todayRow(page, '10:20–11:15')).toContainText('Lista pasada');
    await expect(studentRow(page, 'Díaz Soto, Hugo')).toContainText('1 falta sin justificar');
    expect((await list(world.api, c.id, TODAY, '10:20')).by['Díaz Soto, Hugo']).toBe('absent');
  });
});

test.describe('faltas · volver atrás y datos al día', () => {
  test.use({ worldSpec: { courses: [CLASS] } });

  test('faltas-30 · the back gesture closes the list, keeps the taps and stays in Faltas', async ({ page, world }) => {
    const c = world.courses[0];
    await openFaltas(page, c.id);
    await todayRow(page, '10:20–11:15').getByRole('button', { name: 'Pasar lista' }).click();
    const sheet = await listSheet(page);
    await tapTo(sheet, 3, 'Falta');
    await page.goBack();
    await expect(sheet).toBeHidden();
    await expect(toast(page, 'Lista pasada · 7 presentes · 1 falta')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/clases/${c.id}/asistencia$`));
    await expect(todayRow(page, '10:20–11:15')).toContainText('Lista pasada');
    await expect(studentRow(page, 'Castro León, Lucía')).toContainText('1 falta sin justificar');
    expect((await list(world.api, c.id, TODAY, '10:20')).by['Castro León, Lucía']).toBe('absent');
  });

  test('faltas-31 · a list taken in Hoy shows in Faltas on coming back, without reloading', async ({ page, world }) => {
    const c = world.courses[0];
    await openFaltas(page, c.id);
    await expect(todayRow(page, '10:20–11:15')).toContainText('Lista sin pasar');
    await page.getByRole('link', { name: 'Hoy', exact: true }).first().click();
    await expect(page).toHaveURL(/\/hoy$/);
    await page.getByRole('region', { name: /^Ahora/ }).getByRole('button', { name: 'Pasar lista' }).click();
    const sheet = await listSheet(page);
    await tapTo(sheet, 1, 'Retraso');
    await sheet.getByRole('button', { name: 'Cerrar lista' }).click();
    await expect(toast(page, 'Lista pasada · 7 presentes · 1 retraso')).toBeVisible();
    await closed(page, sheet);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/clases/${c.id}/asistencia$`));
    await expect(todayRow(page, '10:20–11:15')).toContainText('Lista pasada');
    await expect(studentRow(page, 'Alonso Gil, Marta')).toContainText('1 retraso');
  });
});

test.describe('faltas · editar una lista pasada', () => {
  test.use({
    worldSpec: {
      courses: [{
        ...CLASS,
        lists: [{ date: TODAY, start: '10:20', marks: [{ student: 0, status: 'absent', note: 'Médico' }, { student: 1, status: 'late' }, { student: 2, status: 'justified' }] }],
      }],
    },
  });

  test('faltas-21 · «Editar lista» opens the saved marks; undo an absence, unjustify one, note a late; closing with ✕ saves', async ({ page, world }, info) => {
    const c = world.courses[0];
    await openFaltas(page, c.id);
    await expect(section(page, 'Por alumno').getByRole('link')).toHaveText([
      'Alonso Gil, Marta1 falta sin justificar', 'Castro León, Lucía1 justificada', 'Benítez Ruiz, Pablo1 retraso',
    ]);
    await todayRow(page, '10:20–11:15').getByRole('button', { name: 'Editar lista' }).click();
    const sheet = await listSheet(page);
    await expect(rosterRow(sheet, 1)).toHaveAccessibleName('1. Alonso Gil, Marta: Falta. Toca para cambiar');
    await expect(rosterRow(sheet, 1)).toContainText('Médico');
    await expect(rosterRow(sheet, 2)).toHaveAccessibleName(/: Retraso\./);
    await expect(rosterRow(sheet, 3)).toHaveAccessibleName(/: Justificada\./);
    await expect(sheet.getByText('5 presentes · 1 falta · 1 retraso · 1 justificada')).toBeVisible();

    await tapTo(sheet, 1, 'Presente');
    const three = await rowOptions(page, info, rosterRow(sheet, 3));
    await expect(three.getByRole('menuitem')).toHaveText(['Quitar justificación', 'Añadir nota']);
    await three.getByRole('menuitem', { name: 'Quitar justificación' }).click();
    await expect(rosterRow(sheet, 3)).toHaveAccessibleName(/: Falta\./);
    const two = await rowOptions(page, info, rosterRow(sheet, 2));
    await two.getByRole('menuitem', { name: 'Añadir nota' }).click();
    await sheet.getByRole('textbox', { name: 'Nota' }).fill('Llega a las 10:35');
    await sheet.getByRole('textbox', { name: 'Nota' }).press('Enter');
    await tapTo(sheet, 4, 'Falta');
    await expect(sheet.getByText('Guardado', { exact: true })).toBeVisible();
    await sheet.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(toast(page, 'Lista pasada · 5 presentes · 2 faltas · 1 retraso')).toBeVisible();

    await expect(section(page, 'Por alumno').getByRole('link')).toHaveText([
      'Castro León, Lucía1 falta sin justificar', 'Díaz Soto, Hugo1 falta sin justificar', 'Benítez Ruiz, Pablo1 retraso',
    ]);
    expect((await list(world.api, c.id, TODAY, '10:20')).by).toMatchObject({
      'Alonso Gil, Marta': 'present', 'Benítez Ruiz, Pablo': 'late · Llega a las 10:35', 'Castro León, Lucía': 'absent', 'Díaz Soto, Hugo': 'absent',
    });
    // The note of a late arrival reaches the student file.
    await studentRow(page, 'Benítez Ruiz, Pablo').click();
    await expect(page.getByRole('button', { name: /^1 retraso en la 1\.ª evaluación/ })).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText('Retraso · Llega a las 10:35')).toBeVisible();
    await expect(page.getByRole('button', { name: /justificar/ })).toHaveCount(0); // a late arrival is only shown
  });
});

test.describe('faltas · un alumno nuevo', () => {
  test.use({ worldSpec: { courses: [CLASS] } });

  test('faltas-29 · a student added today is on today\'s list and not on the lists of earlier days', async ({ page, world }) => {
    const c = world.courses[0];
    const [nuria] = await world.api.post(`/groups/${c.groupId}/students`, { students: [{ first_name: 'Nuria', last_name: 'Zamora Paz' }] });
    await openFaltas(page, c.id);
    await todayRow(page, '10:20–11:15').getByRole('button', { name: 'Pasar lista' }).click();
    let sheet = await listSheet(page);
    await expect(sheet.getByRole('listitem')).toHaveCount(9);
    await expect(rosterRow(sheet, 9)).toHaveAccessibleName('9. Zamora Paz, Nuria: Presente. Toca para cambiar');
    await sheet.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await closed(page, sheet);

    // Last Friday's list, from that day in Hoy (the Faltas tab does not keep lists of other days: faltas-26).
    await page.goto('/hoy?dia=2026-11-13');
    await page.locator('section.section').filter({ has: page.getByRole('heading', { name: 'Agenda' }) })
      .getByRole('button', { name: /^09:25/ }).click();
    await dialog(page, LABEL).getByRole('button', { name: /^Pasar lista/ }).click();
    sheet = await listSheet(page);
    await expect(sheet.getByText('viernes, 13 de noviembre · 09:25–10:20 · Aula 112')).toBeVisible();
    await expect(sheet.getByRole('listitem')).toHaveCount(8);
    await expect(sheet.getByText('Zamora Paz, Nuria')).toHaveCount(0);
    const past = await world.api.get(`/courses/${c.id}/attendance?date=2026-11-13&start=09:25`);
    expect(past.students.map((r: { student: { id: string } }) => r.student.id)).not.toContain(nuria.id);
  });
});

test.describe('faltas · listas sin pasar (demo)', () => {
  let c: DemoCourse;
  let past: PastLists;
  test.beforeEach(async ({ demo }) => {
    c = await demoCourse(demo, BACH);
    past = await pastLists(demo, c);
  });
  test.afterEach(async ({ demo }) => { await past?.restore(demo); });

  const due = (api: Api) => summary(api, c.id).then((s) => s.sessions_missing.filter((m) => m.start === past.start).map((m) => m.date));

  test('faltas-22 · a list of a past day: its date on the sheet; once taken it leaves «Listas sin pasar»', async ({ page, demo }, info) => {
    const n = past.missing.length;
    const before = await summary(demo, c.id);
    await openFaltas(page, c.id);
    const missing = section(page, /^Listas sin pasar/);
    await expect(missing.getByRole('heading')).toHaveText(`Listas sin pasar · ${n}`);
    await expect(missing).toContainText('Últimos 14 días lectivos.');
    const titles = missing.locator('.row .row__title');
    await expect(titles).toHaveText(past.missing.map(longDate)); // most recent first
    await expect(missingRow(page, past.missing[0])).toContainText(`${past.start}–${past.end}`);
    await shot(page, info, '22-missing');

    const day = past.missing[1];
    await missingRow(page, day).getByRole('button', { name: 'Pasar lista' }).click();
    const sheet = await listSheet(page);
    await expect(sheet.getByText(`${longDate(day)} · ${past.start}–${past.end} · Aula 301`, { exact: true })).toBeVisible();
    const size = await sheet.getByRole('listitem').count();
    await tapTo(sheet, 1, 'Falta');
    await sheet.getByRole('button', { name: 'Cerrar lista' }).click();
    await expect(toast(page, `Lista pasada · ${size - 1} presentes · 1 falta`)).toBeVisible();

    await expect(missing.getByRole('heading')).toHaveText(`Listas sin pasar · ${n - 1}`);
    await expect(missingRow(page, day)).toHaveCount(0);
    const first = (await demo.get(`/courses/${c.id}/attendance?date=${day}&start=${past.start}`)).students[0].student;
    const was = before.students.find((r) => r.student.id === first.id)?.absent ?? 0;
    await expect(studentRow(page, first.sort_name)).toContainText(`${was + 1} falta${was ? 's' : ''} sin justificar`);
    expect((await list(demo, c.id, day, past.start)).by[first.sort_name]).toBe('absent');
    expect(await due(demo)).not.toContain(day);
  });

  test('faltas-23 · «Dar por pasadas (todos presentes)»: asks first; then every list is taken, nobody absent', async ({ page, demo }) => {
    const n = past.missing.length;
    const before = (await summary(demo, c.id)).students;
    const pending = async () => ((await demo.get(`/today?date=${TODAY}`)).pending as { kind: string; course_id?: string; start?: string }[])
      .filter((p) => p.kind === 'attendance' && p.course_id === c.id && p.start === past.start).length;
    expect(await pending()).toBeGreaterThan(0); // Hoy › Pendiente asks for the ones of the last 7 lective days
    await openFaltas(page, c.id);
    const all = page.getByRole('button', { name: 'Dar por pasadas (todos presentes)' });
    await all.click();
    let confirm = dialog(page, 'Dar por pasadas');
    await expect(confirm).toContainText(`${n} listas quedarán con todos presentes. Podrás corregir cualquiera después.`);
    await confirm.getByRole('button', { name: 'Cancelar' }).click();
    await expect(confirm).toBeHidden();
    await expect(section(page, /^Listas sin pasar/).getByRole('heading')).toHaveText(`Listas sin pasar · ${n}`);
    expect(await due(demo)).toHaveLength(n);

    await all.click();
    confirm = dialog(page, 'Dar por pasadas');
    await confirm.getByRole('button', { name: 'Dar por pasadas' }).click();
    await expect(toast(page, `${n} listas pasadas con todos presentes`)).toBeVisible();
    await expect(section(page, /^Listas sin pasar/)).toHaveCount(0);
    for (const d of past.missing) {
      const l = await list(demo, c.id, d, past.start);
      expect(l.taken).toBe(true);
      expect(Object.values(l.by).every((s) => s === 'present')).toBe(true);
    }
    expect((await summary(demo, c.id)).students).toEqual(before);
    expect(await pending()).toBe(0);
  });

  test('faltas-24 · «No hubo clase»: asks first; the session is cancelled in Hoy too, and «Restaurar sesión» brings it back', async ({ page, demo }, info) => {
    const n = past.missing.length;
    const day = past.missing[0];
    await openFaltas(page, c.id);
    const more = page.getByRole('button', { name: `Más opciones del ${longDate(day)}` });
    await more.click();
    await page.getByRole('menuitem', { name: 'No hubo clase' }).click();
    let confirm = dialog(page, 'No hubo clase');
    await expect(confirm).toContainText(`La sesión del ${longDate(day)} a las ${past.start} queda cancelada y deja de contar como lista sin pasar.`);
    await confirm.getByRole('button', { name: 'Cancelar' }).click();
    await expect(confirm).toBeHidden();
    await expect(missingRow(page, day)).toHaveCount(1);

    await more.click();
    await page.getByRole('menuitem', { name: 'No hubo clase' }).click();
    confirm = dialog(page, 'No hubo clase');
    await shot(page, info, '24-confirm');
    await confirm.getByRole('button', { name: 'No hubo clase' }).click();
    await expect(toast(page, 'Sesión cancelada')).toBeVisible();
    await expect(missingRow(page, day)).toHaveCount(0);
    await expect(section(page, /^Listas sin pasar/).getByRole('heading')).toHaveText(`Listas sin pasar · ${n - 1}`);
    expect(await due(demo)).not.toContain(day);

    await page.goto(`/hoy?dia=${day}`);
    const agenda = page.locator('section.section').filter({ has: page.getByRole('heading', { name: 'Agenda' }) });
    const session = agenda.getByRole('button', { name: new RegExp(`^${past.start}`) });
    await expect(session).toContainText('Sin clase · No hubo clase');
    await session.click();
    await page.getByRole('button', { name: 'Restaurar sesión' }).click();
    await expect(toast(page, 'Sesión restaurada')).toBeVisible();
    await closed(page, dialog(page, c.label));
    await openFaltas(page, c.id);
    await expect(missingRow(page, day)).toHaveCount(1);
    expect(await due(demo)).toContain(day);
  });

  test('faltas-25 · edit a past list already taken (from that day in Hoy): justify an absence, mark a late arrival', async ({ page, demo }, info) => {
    const day = past.missing[0];
    const students = (await demo.get(`/courses/${c.id}/attendance?date=${day}&start=${past.start}`)).students.map((r: { student: unknown }) => r.student);
    await mark(demo, c.id, day, past.start, [{ student: students[1], status: 'absent' }]);
    const before = await summary(demo, c.id);
    const counts = (id: string, s = before) => s.students.find((r) => r.student.id === id) ?? { absent: 0, justified: 0, late: 0 };

    await page.goto(`/hoy?dia=${day}`);
    const agenda = page.locator('section.section').filter({ has: page.getByRole('heading', { name: 'Agenda' }) });
    await agenda.getByRole('button', { name: new RegExp(`^${past.start}`) }).click();
    await dialog(page, c.label).getByRole('button', { name: /^Editar lista.*Lista pasada · 1 falta/ }).click();
    const sheet = await listSheet(page);
    await expect(sheet.getByText(`${longDate(day)} · ${past.start}–${past.end} · Aula 301`, { exact: true })).toBeVisible();
    await expect(rosterRow(sheet, 2)).toHaveAccessibleName(/: Falta\./);
    const two = await rowOptions(page, info, rosterRow(sheet, 2));
    await two.getByRole('menuitem', { name: 'Justificar falta' }).click();
    await tapTo(sheet, 3, 'Retraso');
    await sheet.getByRole('button', { name: 'Cerrar lista' }).click();
    await expect(toast(page, /^Lista pasada · \d+ presentes · 1 retraso · 1 justificada$/)).toBeVisible();
    await closed(page, sheet);

    await openFaltas(page, c.id);
    const after = await summary(demo, c.id);
    expect(counts(students[1].id, after)).toMatchObject({ absent: counts(students[1].id).absent - 1, justified: counts(students[1].id).justified + 1 });
    expect(counts(students[2].id, after).late).toBe(counts(students[2].id).late + 1);
    await expect(studentRow(page, students[2].sort_name)).toContainText(/retraso/);
    expect((await list(demo, c.id, day, past.start)).by).toMatchObject({ [students[1].sort_name]: 'justified', [students[2].sort_name]: 'late' });
  });

  test('faltas-33 · «Dar por pasadas» leaves alone a list another device took meanwhile', async ({ page, demo }) => {
    const n = past.missing.length;
    const day = past.missing[1];
    await openFaltas(page, c.id);
    await expect(section(page, /^Listas sin pasar/).getByRole('heading')).toHaveText(`Listas sin pasar · ${n}`);
    const first = (await demo.get(`/courses/${c.id}/attendance?date=${day}&start=${past.start}`)).students[0].student;
    await mark(demo, c.id, day, past.start, [{ student: first, status: 'absent' }]); // the phone, while the tab is open
    await page.getByRole('button', { name: 'Dar por pasadas (todos presentes)' }).click();
    await dialog(page, 'Dar por pasadas').getByRole('button', { name: 'Dar por pasadas' }).click();
    await expect(toast(page, `${n - 1} listas pasadas con todos presentes`)).toBeVisible();
    await expect(section(page, /^Listas sin pasar/)).toHaveCount(0);
    expect((await list(demo, c.id, day, past.start)).by[first.sort_name]).toBe('absent');
  });

  test('faltas-32 · when the server fails, «Dar por pasadas» and «No hubo clase» say so and change nothing', async ({ page, demo }) => {
    const n = past.missing.length;
    await page.route('**/api/courses/*/attendance/bulk', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"x"}' }));
    await page.route('**/api/courses/*/sessions/cancel', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"x"}' }));
    await openFaltas(page, c.id);
    await page.getByRole('button', { name: 'Dar por pasadas (todos presentes)' }).click();
    await dialog(page, 'Dar por pasadas').getByRole('button', { name: 'Dar por pasadas' }).click();
    const failed = page.locator('.toasts .toast--error').filter({ hasText: 'El servidor ha fallado. Inténtalo en un momento.' });
    await expect(failed).toBeVisible();
    await failed.getByRole('button', { name: 'Cerrar el aviso' }).click();
    await expect(section(page, /^Listas sin pasar/).getByRole('heading')).toHaveText(`Listas sin pasar · ${n}`);

    await page.getByRole('button', { name: `Más opciones del ${longDate(past.missing[0])}` }).click();
    await page.getByRole('menuitem', { name: 'No hubo clase' }).click();
    await dialog(page, 'No hubo clase').getByRole('button', { name: 'No hubo clase' }).click();
    await expect(failed).toBeVisible();
    await expect(missingRow(page, past.missing[0])).toHaveCount(1);
    expect(await due(demo)).toHaveLength(n);
  });

  test('faltas-26 · the tab keeps the lists already taken, and one of a past day opens from there', async ({ page, demo }) => {
    bug('FALTAS-BUG-03', 'Faltas only shows today\'s lists and the ones still due: a list taken on an earlier day cannot be seen or edited from the tab (PRODUCT §2: «Listas pasadas, faltas y retrasos de la clase»)');
    const day = past.missing[0];
    const students = (await demo.get(`/courses/${c.id}/attendance?date=${day}&start=${past.start}`)).students.map((r: { student: unknown }) => r.student);
    await mark(demo, c.id, day, past.start, [{ student: students[0], status: 'absent' }]);
    await openFaltas(page, c.id);
    const taken = page.locator('main .row').filter({ hasText: longDate(day) });
    await expect(taken).toHaveCount(1, { timeout: 5_000 });
    await taken.getByRole('button').first().click();
    const sheet = await listSheet(page);
    await expect(sheet.getByText(`${longDate(day)} · ${past.start}–${past.end}`)).toBeVisible();
    await expect(rosterRow(sheet, 1)).toHaveAccessibleName(/: Falta\./);
  });
});
