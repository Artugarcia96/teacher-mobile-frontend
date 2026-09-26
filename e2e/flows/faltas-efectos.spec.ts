import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import {
  type Api, bug, CLASS, clipboard, closed, dialog, expect, FRI, LABEL, list, listSheet, MON, openFaltas, rosterRow, rowOptions, section,
  shot, studentRow, tapTo, test, THU, toast, todayRow, TODAY, WED,
} from './faltas-helpers';

// What a list changes elsewhere (docs/PRODUCT.md): a session without class or left to the substitute (§4.2 «No hay
// clase», «Voy a faltar») and the Faltas tab; «A vigilar» (≥ 3 unjustified absences in 14 days) and the justification
// from the student file (§4.8); the roster's «N faltas» (§4.9); Evaluación and its acta (§4.6); «Faltó» in the
// Cuaderno on the day of an exam (§4.5); the homework check of that session, which leaves out who was absent whichever
// is done first (§4.2 «Revisar deberes»); the file of a student in two classes and «Avisar a la familia» (§4.8, §4.2).

const agenda = (page: Page) => page.locator('section.section').filter({ has: page.getByRole('heading', { name: 'Agenda' }) });
const agendaRow = (page: Page, start: string) => agenda(page).getByRole('button', { name: new RegExp(`^${start}`) });
/** The rows of Faltas › Hoy, by their times. */
const todayTimes = (page: Page) => section(page, 'Hoy').locator('.row .row__title');

test.describe('faltas · sesiones sin clase y guardias', () => {
  test.use({ worldSpec: { courses: [CLASS] } });

  test('faltas-40 · «No hay clase» in Hoy takes the session out of Faltas; «Restaurar sesión» puts it back', async ({ page, world }, info) => {
    const c = world.courses[0];
    await openFaltas(page, c.id);
    await expect(todayTimes(page)).toHaveText(['10:20–11:15', '12:40–13:35']);

    await page.goto('/hoy');
    await agendaRow(page, '12:40').click();
    let session = dialog(page, LABEL);
    await session.getByRole('button', { name: 'No hay clase' }).click();
    const why = dialog(page, 'No hay clase');
    await why.getByRole('textbox', { name: 'Motivo' }).fill('Excursión');
    await why.getByRole('button', { name: 'No hay clase' }).click();
    await expect(toast(page, 'Sin clase')).toBeVisible();
    await closed(page, why);

    await openFaltas(page, c.id);
    await expect(todayTimes(page)).toHaveText(['10:20–11:15']);
    await shot(page, info, '40-cancelled');

    await page.goto('/hoy');
    await expect(agendaRow(page, '12:40')).toContainText('Sin clase · Excursión');
    await agendaRow(page, '12:40').click();
    session = dialog(page, LABEL);
    await session.getByRole('button', { name: 'Restaurar sesión' }).click();
    await expect(toast(page, 'Sesión restaurada')).toBeVisible();
    await closed(page, session);
    await openFaltas(page, c.id);
    await expect(todayTimes(page)).toHaveText(['10:20–11:15', '12:40–13:35']);
  });

  test('faltas-42 · a session left to the substitute: out of Faltas › Hoy; its list, taken later, counts; «Ya no falto» brings it back', async ({ page, world }) => {
    const c = world.courses[0];
    await world.api.post('/absences', { sessions: [{ course_id: c.id, date: TODAY, start: '12:40', task: 'Problemas de la p. 34.' }] });
    await openFaltas(page, c.id);
    await expect(todayTimes(page)).toHaveText(['10:20–11:15']);

    await page.goto('/hoy');
    await expect(agendaRow(page, '12:40')).toContainText('Ausente');
    await agendaRow(page, '12:40').click();
    await dialog(page, LABEL).getByRole('button', { name: /^Pasar lista.*Con la hoja de la guardia/ }).click();
    const sheet = await listSheet(page);
    await tapTo(sheet, 5, 'Falta');
    await sheet.getByRole('button', { name: 'Cerrar lista' }).click();
    await expect(toast(page, 'Lista pasada · 7 presentes · 1 falta')).toBeVisible();
    await closed(page, sheet);

    await openFaltas(page, c.id);
    await expect(studentRow(page, 'Esteban Mora, Irene')).toContainText('1 falta sin justificar');
    await expect(todayTimes(page)).toHaveText(['10:20–11:15']);

    await world.api.del(`/courses/${c.id}/sessions/cancel?date=${TODAY}&start=12:40`); // «Ya no falto» (Hoy: hoy-74)
    await page.reload();
    await expect(todayTimes(page)).toHaveText(['10:20–11:15', '12:40–13:35']);
    await expect(todayRow(page, '12:40–13:35')).toContainText('Lista pasada');
  });
});

test.describe('faltas · una lista y luego «No hay clase»', () => {
  test.use({ worldSpec: { courses: [{ ...CLASS, lists: [{ date: TODAY, start: '10:20', marks: [{ student: 0, status: 'absent' }, { student: 1, status: 'late' }] }] }] } });

  test('faltas-41 · the absences of a session that did not take place stop counting', async ({ page, world }) => {
    bug('FALTAS-BUG-06', 'a session marked «No hay clase» after its list was taken keeps counting its absences and lates (Faltas, file, A vigilar, Evaluación, acta)');
    const c = world.courses[0];
    await openFaltas(page, c.id);
    await expect(studentRow(page, 'Alonso Gil, Marta')).toContainText('1 falta sin justificar');
    await world.api.post(`/courses/${c.id}/sessions/cancel`, { date: TODAY, start: '10:20', note: 'Actividad del centro' }); // Hoy › session › «No hay clase»
    await page.reload();
    await expect(todayTimes(page)).toHaveText(['12:40–13:35']);
    await expect(section(page, 'Por alumno').getByRole('link')).toHaveCount(0);
  });
});

test.describe('faltas · a vigilar y justificar desde la ficha', () => {
  test.use({
    worldSpec: {
      courses: [{
        ...CLASS,
        lists: [
          { date: '2026-11-12', start: '10:20', marks: [{ student: 3, status: 'absent' }] },
          { date: '2026-11-13', start: '09:25', marks: [{ student: 3, status: 'absent' }] },
        ],
      }],
    },
  });

  test('faltas-43 · a third absence in 14 days puts the student in «A vigilar»; justifying one from her file takes her out', async ({ page, world }, info) => {
    const c = world.courses[0];
    const hugo = c.students[3];
    await openFaltas(page, c.id);
    await expect(studentRow(page, 'Díaz Soto, Hugo')).toContainText('2 faltas sin justificar');
    await todayRow(page, '10:20–11:15').getByRole('button', { name: 'Pasar lista' }).click();
    const sheet = await listSheet(page);
    await tapTo(sheet, 4, 'Falta');
    await sheet.getByRole('button', { name: 'Cerrar lista' }).click();
    await expect(toast(page, 'Lista pasada · 7 presentes · 1 falta')).toBeVisible();
    await expect(studentRow(page, 'Díaz Soto, Hugo')).toContainText('3 faltas sin justificar');
    await closed(page, sheet);

    const reason = '3 faltas sin justificar en 14 días';
    await page.goto(`/clases/${c.id}/alumnos`);
    await expect(page.getByRole('link', { name: /^Díaz Soto, Hugo/ })).toContainText(reason);
    await page.goto(`/clases/${c.id}/asistencia`);
    await studentRow(page, 'Díaz Soto, Hugo').click();
    await expect(page.getByRole('button', { name: `A vigilar: ${reason}` })).toBeVisible();
    const today = page.getByRole('button', { name: 'jue 19 nov · 10:20, Falta sin justificar: justificar' });
    await expect(page.getByRole('button', { name: /^3 faltas en la 1\.ª evaluación/ })).toHaveAttribute('aria-expanded', 'true');
    await shot(page, info, '43-watch');
    await today.click();
    await expect(toast(page, 'Falta justificada')).toBeVisible();
    await expect(page.getByRole('button', { name: 'jue 19 nov · 10:20, Falta justificada: quitar justificación' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^3 faltas \(1 justificada\) en la 1\.ª evaluación/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^A vigilar/ })).toHaveCount(0);
    expect((await list(world.api, c.id, TODAY, '10:20')).by['Díaz Soto, Hugo']).toBe('justified');

    await page.locator('.back-btn').click();
    await expect(studentRow(page, 'Díaz Soto, Hugo')).toContainText('2 faltas sin justificar · 1 justificada');
    const watch = await world.api.get(`/students/${hugo.id}`);
    expect(watch.watch).toEqual([]);
  });

  test('faltas-44 · «Quitar justificación» in the file, and «Deshacer» from its notice', async ({ page, world }) => {
    const c = world.courses[0];
    await page.goto(`/alumnos/${c.students[3].id}#asistencia`);
    const fri = page.getByRole('button', { name: 'vie 13 nov · 09:25, Falta sin justificar: justificar' });
    await fri.click();
    await expect(toast(page, 'Falta justificada')).toBeVisible();
    await toast(page, 'Falta justificada').getByRole('button', { name: 'Deshacer' }).click();
    await expect(toast(page, 'Deshecho')).toBeVisible();
    await expect(fri).toBeVisible();
    expect((await list(world.api, c.id, '2026-11-13', '09:25')).by['Díaz Soto, Hugo']).toBe('absent');

    await fri.click();
    const justified = page.getByRole('button', { name: 'vie 13 nov · 09:25, Falta justificada: quitar justificación' });
    await justified.click();
    await expect(toast(page, 'Justificación quitada')).toBeVisible();
    await expect(fri).toBeVisible();
    await openFaltas(page, c.id);
    await expect(studentRow(page, 'Díaz Soto, Hugo')).toContainText('2 faltas sin justificar');
  });
});

test.describe('faltas · alumnos, evaluación y acta', () => {
  // Three unjustified absences in October (older than 14 days: not «A vigilar»), a justified one and a late arrival.
  test.use({
    worldSpec: {
      courses: [{
        ...CLASS,
        slots: [...CLASS.slots, { weekday: THU, start: '08:30', end: '09:25' }],
        lists: [
          { date: '2026-10-01', start: '10:20', marks: [{ student: 4, status: 'absent' }, { student: 0, status: 'absent' }] },
          { date: '2026-10-08', start: '10:20', marks: [{ student: 4, status: 'absent' }] },
          { date: '2026-10-15', start: '10:20', marks: [{ student: 4, status: 'absent' }, { student: 1, status: 'late' }] },
          { date: '2026-10-22', start: '10:20', marks: [{ student: 4, status: 'justified' }] },
        ],
      }],
    },
  });

  test('faltas-45 · Alumnos says «3 faltas» from three unjustified absences; Faltas and the file agree', async ({ page, world }) => {
    const c = world.courses[0];
    await page.goto(`/clases/${c.id}/alumnos`);
    const irene = page.getByRole('link', { name: /^Esteban Mora, Irene/ });
    await expect(irene).toContainText('3 faltas');
    await expect(irene).not.toContainText('14 días');
    await expect(page.getByRole('link', { name: /^Alonso Gil, Marta/ })).not.toContainText('falta'); // one is not worth a line
    await openFaltas(page, c.id);
    await expect(section(page, 'Por alumno').getByRole('link')).toHaveText([
      'Esteban Mora, Irene3 faltas sin justificar · 1 justificada', 'Alonso Gil, Marta1 falta sin justificar', 'Benítez Ruiz, Pablo1 retraso',
    ]);
    await studentRow(page, 'Esteban Mora, Irene').click();
    await expect(page.getByRole('button', { name: /^4 faltas \(1 justificada\) en la 1\.ª evaluación/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /: justificar$/ })).toHaveCount(3);
    await expect(page.getByRole('button', { name: /: quitar justificación$/ })).toHaveCount(1);
  });

  test('faltas-46 · Evaluación shows each student\'s absences; the acta (PDF) downloads with its name', async ({ page, world }) => {
    const c = world.courses[0];
    await page.goto(`/clases/${c.id}/evaluacion/1`);
    await expect(page.getByRole('button', { name: 'Irene Esteban Mora: editar nota y comentario' })).toContainText(/\b3 faltas|4 faltas/);
    await expect(page.getByRole('button', { name: 'Marta Alonso Gil: editar nota y comentario' })).toContainText('1 falta');
    await expect(page.getByRole('button', { name: 'Hugo Díaz Soto: editar nota y comentario' })).not.toContainText('falta');
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Acta (PDF)' }).click()]);
    expect(file.suggestedFilename()).toBe('Acta - Matematicas - 2o ESO C - 1a evaluacion.pdf');
    expect(readFileSync(await file.path()).subarray(0, 5).toString()).toBe('%PDF-');
    await expect(toast(page, 'Acta descargada')).toBeVisible();
  });

  test('faltas-13 · Evaluación counts the justified absences the file counts, or says they are only the unjustified ones', async ({ page, world }) => {
    const c = world.courses[0];
    await page.goto(`/alumnos/${c.students[4].id}`);
    await expect(page.getByRole('button', { name: /^4 faltas \(1 justificada\) en la 1\.ª evaluación/ })).toBeVisible();
    await page.goto(`/clases/${c.id}/evaluacion/1`);
    await expect(page.getByRole('button', { name: 'Irene Esteban Mora: editar nota y comentario' })).toContainText(/4 faltas|3 faltas sin justificar/);
  });

  test('faltas-47 · a list ended before the class existed is not asked for (as in Hoy)', async ({ page, world }) => {
    bug('FALTAS-BUG-02', 'Faltas asks for today\'s 08:30 list («Lista sin pasar», «Listas sin pasar · 1») of a class created at 10:40, which Hoy and Pendiente rightly leave out');
    const c = world.courses[0];
    const hoy = await world.api.get(`/today?date=${TODAY}`);
    const s830 = hoy.sessions.find((s: { start: string }) => s.start === '08:30');
    expect(s830.pending).toBe(false); // Hoy's rule: the session ended before the class was created
    await openFaltas(page, c.id);
    await expect(section(page, /^Listas sin pasar/)).toHaveCount(0);
    await expect(todayRow(page, '08:30–09:25')).not.toContainText('Lista sin pasar');
  });
});

test.describe('faltas · el día del examen', () => {
  test.use({ worldSpec: { courses: [{ ...CLASS, slots: [...CLASS.slots, { weekday: FRI, start: '12:40', end: '13:35' }] }] } });

  test('faltas-48 · an absence on an exam day is «Faltó» in the Cuaderno; putting the student present again clears it', async ({ page, world }) => {
    const c = world.courses[0];
    await world.api.post(`/courses/${c.id}/activities`, { title: 'Examen U1', kind: 'exam', date: TODAY });
    const cell = page.getByRole('button', { name: /^Pablo Benítez Ruiz · Examen U1: / });

    await openFaltas(page, c.id);
    await todayRow(page, '10:20–11:15').getByRole('button', { name: 'Pasar lista' }).click();
    let sheet = await listSheet(page);
    await tapTo(sheet, 2, 'Falta');
    await sheet.getByRole('button', { name: 'Cerrar lista' }).click();
    await expect(toast(page, 'Lista pasada · 7 presentes · 1 falta')).toBeVisible();
    await closed(page, sheet);
    await page.goto(`/clases/${c.id}/cuaderno`);
    await expect(cell).toHaveText('Faltó');

    await openFaltas(page, c.id);
    await todayRow(page, '10:20–11:15').getByRole('button', { name: 'Editar lista' }).click();
    sheet = await listSheet(page);
    await expect(rosterRow(sheet, 2)).toHaveAccessibleName(/: Falta\./);
    await tapTo(sheet, 2, 'Presente');
    await sheet.getByRole('button', { name: 'Cerrar lista' }).click();
    await expect(toast(page, 'Lista pasada · 8 presentes')).toBeVisible();
    await closed(page, sheet);
    await page.goto(`/clases/${c.id}/cuaderno`);
    await expect(cell).toHaveText('—');
  });
});


// ── Deberes: quien faltó no cuenta ──────────────────────────────────────────
/** The «Deberes (1.ª)» grades of a class by «Apellidos, Nombre» (null = no grade: the student has no check that counts). */
async function homeworkGrades(api: Api, courseId: string): Promise<Record<string, number | null>> {
  const book = await api.get(`/courses/${courseId}/gradebook?term=1`);
  const act = book.activities.find((a: { kind: string }) => a.kind === 'homework');
  if (!act) return {};
  return Object.fromEntries(book.students.map((s: { student: { sort_name: string }; grades: Record<string, { score: number | null; status: string }> }) => {
    const g = s.grades[act.id];
    return [s.student.sort_name, g && g.status === 'confirmed' ? g.score : null];
  }));
}
const nowCard = (page: Page) => page.getByRole('region', { name: /^Ahora/ });
// The homework check has no accessible name either (BUG-HOY-07): found by its title.
const homeworkSheet = (page: Page) => page.getByRole('dialog').filter({ has: page.locator('.roster-title', { hasText: /^Deberes · / }) });
/** A cell of «Deberes (1.ª)» in the Cuaderno, by «Nombre Apellidos». */
const homeworkCell = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`^${name} · Deberes \\(1\\.ª\\): `) });

test.describe('faltas · deberes de una sesión con faltas', () => {
  // Homework set when the class was closed last Friday: today's 10:20 session (on now) shows «Deberes: …» and «Revisar».
  test.use({ worldSpec: { courses: [{ ...CLASS, logs: [{ date: '2026-11-13', start: '09:25', next: 'Problemas de la p. 34', homework: 'p. 33, ej. 15-18' }] }] } });

  test('faltas-15 · list first, then the homework check: who was absent (also justified) is «Faltó» and does not count; a late arrival does', async ({ page, world }, info) => {
    const c = world.courses[0];
    await openFaltas(page, c.id);
    await todayRow(page, '10:20–11:15').getByRole('button', { name: 'Pasar lista' }).click();
    const sheet = await listSheet(page);
    await tapTo(sheet, 5, 'Falta');
    await tapTo(sheet, 3, 'Falta');
    const lucia = await rowOptions(page, info, rosterRow(sheet, 3));
    await lucia.getByRole('menuitem', { name: 'Justificar falta' }).click();
    await expect(rosterRow(sheet, 3)).toHaveAccessibleName(/: Justificada\./);
    await tapTo(sheet, 4, 'Retraso');
    await sheet.getByRole('button', { name: 'Cerrar lista' }).click();
    await expect(toast(page, 'Lista pasada · 5 presentes · 1 falta · 1 retraso · 1 justificada')).toBeVisible();
    await closed(page, sheet);

    await page.goto('/hoy');
    await expect(nowCard(page).getByText('Deberes: p. 33, ej. 15-18')).toBeVisible();
    await nowCard(page).getByRole('button', { name: 'Revisar' }).click();
    const check = homeworkSheet(page);
    await expect(rosterRow(check, 5)).toHaveAccessibleName('5. Esteban Mora, Irene: Faltó');
    await expect(rosterRow(check, 5)).toBeDisabled();
    await expect(rosterRow(check, 3)).toHaveAccessibleName('3. Castro León, Lucía: Faltó');
    await expect(rosterRow(check, 3)).toBeDisabled();
    await expect(rosterRow(check, 4)).toHaveAccessibleName(/^4\. Díaz Soto, Hugo: Hecho\./);
    await expect(check.getByText('6 hechos', { exact: true })).toBeVisible();
    await tapTo(check, 4, 'Sin hacer');
    await tapTo(check, 1, 'Incompleto');
    await expect(check.getByText('4 hechos · 1 sin hacer · 1 incompleto', { exact: true })).toBeVisible();
    await shot(page, info, '15-homework');
    await check.getByRole('button', { name: 'Terminar revisión' }).click();
    await expect(toast(page, 'Deberes revisados · 4 hechos · 1 sin hacer · 1 incompleto')).toBeVisible();
    await closed(page, check);

    expect(await homeworkGrades(world.api, c.id)).toMatchObject({
      'Esteban Mora, Irene': null, 'Castro León, Lucía': null, 'Díaz Soto, Hugo': 0, 'Alonso Gil, Marta': 5, 'Benítez Ruiz, Pablo': 10,
    });
    await page.goto(`/clases/${c.id}/cuaderno`);
    await expect(homeworkCell(page, 'Irene Esteban Mora')).toHaveText('—');
    await expect(homeworkCell(page, 'Lucía Castro León')).toHaveText('—');
    await expect(homeworkCell(page, 'Hugo Díaz Soto')).toHaveText('0');
    await expect(homeworkCell(page, 'Marta Alonso Gil')).toHaveText('5');

    // The files: the check is not Irene's; Hugo's late arrival counts him in.
    await openFaltas(page, c.id);
    await studentRow(page, 'Esteban Mora, Irene').click();
    await expect(page.getByRole('button', { name: /^1 falta en la 1\.ª evaluación/ })).toBeVisible();
    await expect(page.getByText(/^Deberes:/)).toHaveCount(0);
    await page.goto(`/alumnos/${c.students[3].id}`);
    await expect(page.getByRole('button', { name: /^1 retraso en la 1\.ª evaluación/ })).toBeVisible();
    await expect(page.getByText('Deberes: no hizo 1 de 1', { exact: true })).toBeVisible();
  });

  test('faltas-18 · the homework check first, then the list: who turns out absent stops counting at once, and counts again if the list is put right', async ({ page, world }, info) => {
    const c = world.courses[0];
    await page.goto('/hoy');
    await nowCard(page).getByRole('button', { name: 'Revisar' }).click();
    const check = homeworkSheet(page);
    await expect(check.getByText('8 hechos', { exact: true })).toBeVisible();
    await tapTo(check, 6, 'Sin hacer');
    await tapTo(check, 5, 'Sin hacer');
    await check.getByRole('button', { name: 'Terminar revisión' }).click();
    await expect(toast(page, 'Deberes revisados · 6 hechos · 2 sin hacer')).toBeVisible();
    await closed(page, check);
    expect(await homeworkGrades(world.api, c.id)).toMatchObject({ 'Fuentes Vera, Adrián': 0, 'Esteban Mora, Irene': 0 });

    // Adrián was absent and Irene came with a note from home: the list from Faltas says so.
    await openFaltas(page, c.id);
    await todayRow(page, '10:20–11:15').getByRole('button', { name: 'Pasar lista' }).click();
    let sheet = await listSheet(page);
    await tapTo(sheet, 6, 'Falta');
    await tapTo(sheet, 5, 'Falta');
    const irene = await rowOptions(page, info, rosterRow(sheet, 5));
    await irene.getByRole('menuitem', { name: 'Justificar falta' }).click();
    await expect(rosterRow(sheet, 5)).toHaveAccessibleName(/: Justificada\./);
    await sheet.getByRole('button', { name: 'Cerrar lista' }).click();
    await expect(toast(page, 'Lista pasada · 6 presentes · 1 falta · 1 justificada')).toBeVisible();
    await closed(page, sheet);

    expect(await homeworkGrades(world.api, c.id)).toMatchObject({ 'Fuentes Vera, Adrián': null, 'Esteban Mora, Irene': null, 'Alonso Gil, Marta': 10 });
    await page.goto(`/clases/${c.id}/cuaderno`);
    await expect(homeworkCell(page, 'Adrián Fuentes Vera')).toHaveText('—');
    await expect(homeworkCell(page, 'Irene Esteban Mora')).toHaveText('—');
    await expect(homeworkCell(page, 'Marta Alonso Gil')).toHaveText('10');

    await page.goto('/hoy');
    await nowCard(page).getByRole('button', { name: /sin hacer|Todos hechos/ }).click();
    await expect(rosterRow(check, 6)).toHaveAccessibleName('6. Fuentes Vera, Adrián: Faltó');
    await expect(rosterRow(check, 5)).toHaveAccessibleName('5. Esteban Mora, Irene: Faltó');
    await expect(check.getByText('6 hechos', { exact: true })).toBeVisible();
    await check.getByRole('button', { name: 'Terminar revisión' }).click();
    await closed(page, check);
    await page.goto(`/alumnos/${c.students[5].id}`);
    await expect(page.getByRole('button', { name: /^1 falta en la 1\.ª evaluación/ })).toBeVisible();
    await expect(page.getByText(/^Deberes:/)).toHaveCount(0);

    // Adrián was there after all: «Editar lista» puts him present and the check counts him again, with his tap.
    await openFaltas(page, c.id);
    await todayRow(page, '10:20–11:15').getByRole('button', { name: 'Editar lista' }).click();
    sheet = await listSheet(page);
    await tapTo(sheet, 6, 'Presente');
    await sheet.getByRole('button', { name: 'Cerrar lista' }).click();
    await expect(toast(page, 'Lista pasada · 7 presentes · 1 justificada')).toBeVisible();
    await closed(page, sheet);
    expect(await homeworkGrades(world.api, c.id)).toMatchObject({ 'Fuentes Vera, Adrián': 0, 'Esteban Mora, Irene': null });
    await page.goto(`/alumnos/${c.students[5].id}`);
    await expect(page.getByText('Deberes: no hizo 1 de 1', { exact: true })).toBeVisible();
  });
});

// ── Las faltas en la ficha ─────────────────────────────────────────────────
test.describe('faltas · la ficha de un alumno de dos clases', () => {
  test.use({
    worldSpec: {
      courses: [
        {
          ...CLASS,
          lists: [
            { date: '2026-11-05', start: '10:20', marks: [{ student: 4, status: 'absent' }] },
            { date: '2026-11-06', start: '09:25', marks: [{ student: 4, status: 'justified', note: 'Médico' }] },
            { date: '2026-11-12', start: '10:20', marks: [{ student: 4, status: 'late' }] },
          ],
        },
        {
          subject: 'Física y Química', sameGroupAs: 0, room: 'Lab. 1',
          slots: [{ weekday: MON, start: '11:45', end: '12:40' }, { weekday: WED, start: '09:25', end: '10:20' }],
          lists: [{ date: '2026-11-16', start: '11:45', marks: [{ student: 4, status: 'absent' }] }],
        },
      ],
    },
  });

  test('faltas-16 · the file gives each class its absences of the term with the justified ones, and follows today\'s list and a justification', async ({ page, world }, info) => {
    const [math] = world.courses;
    await openFaltas(page, math.id);
    await todayRow(page, '10:20–11:15').getByRole('button', { name: 'Pasar lista' }).click();
    const sheet = await listSheet(page);
    await tapTo(sheet, 5, 'Falta');
    await sheet.getByRole('button', { name: 'Cerrar lista' }).click();
    await expect(toast(page, 'Lista pasada · 7 presentes · 1 falta')).toBeVisible();
    await closed(page, sheet);
    await expect(studentRow(page, 'Esteban Mora, Irene')).toContainText('2 faltas sin justificar · 1 justificada · 1 retraso');

    await studentRow(page, 'Esteban Mora, Irene').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Irene Esteban Mora' })).toBeVisible();
    const asis = section(page, 'Asistencia');
    await expect(asis).toContainText('3 faltas (1 justificada) · 1 retraso');
    await expect(asis).toContainText('1 falta');
    await shot(page, info, '16-file');

    // Today's absence justified from the file: counted among the justified ones.
    await page.getByRole('button', { name: 'jue 19 nov · 10:20, Falta sin justificar: justificar' }).click();
    await expect(toast(page, 'Falta justificada')).toBeVisible();
    await expect(page.getByRole('button', { name: 'jue 19 nov · 10:20, Falta justificada: quitar justificación' })).toBeVisible();
    await expect(asis).toContainText('3 faltas (2 justificadas) · 1 retraso');
  });
});

// ── Avisar a la familia ─────────────────────────────────────────────────────
test.describe('faltas · «Avisar a la familia» con las fechas de las faltas', () => {
  // Hugo: an absence 3 weeks ago (out of the 14 days), a justified one and one more within them, and a late arrival.
  test.use({
    permissions: ['clipboard-read', 'clipboard-write'],
    worldSpec: {
      courses: [{
        ...CLASS,
        lists: [
          { date: '2026-10-29', start: '10:20', marks: [{ student: 3, status: 'absent' }] },
          { date: '2026-11-06', start: '09:25', marks: [{ student: 3, status: 'justified' }] },
          { date: '2026-11-12', start: '10:20', marks: [{ student: 3, status: 'absent' }] },
          { date: '2026-11-13', start: '09:25', marks: [{ student: 3, status: 'absent' }, { student: 0, status: 'late' }] },
        ],
      }],
    },
  });

  test('faltas-17 · the third absence taken in Faltas puts him in «A vigilar»; the family message lists the dates of the 14 days and the justified one', async ({ page, world }, info) => {
    const c = world.courses[0];
    const hugo = c.students[3];
    const facts = '· Faltas sin justificar: 12, 13 y 19 de noviembre (y 1 justificada).';
    await page.goto(`/alumnos/${hugo.id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Hugo Díaz Soto' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^A vigilar/ })).toHaveCount(0);

    await openFaltas(page, c.id);
    await todayRow(page, '10:20–11:15').getByRole('button', { name: 'Pasar lista' }).click();
    const sheet = await listSheet(page);
    await tapTo(sheet, 4, 'Falta');
    await sheet.getByRole('button', { name: 'Cerrar lista' }).click();
    await expect(toast(page, 'Lista pasada · 7 presentes · 1 falta')).toBeVisible();
    await closed(page, sheet);

    await studentRow(page, 'Díaz Soto, Hugo').click();
    const watch = page.getByRole('button', { name: 'A vigilar: 4 faltas en 14 días, 3 sin justificar' });
    await watch.click();
    await dialog(page, 'Hugo Díaz Soto').getByRole('button', { name: 'Avisar a la familia' }).click();
    const family = dialog(page, 'Avisar a la familia');
    const text = family.getByRole('textbox', { name: 'Mensaje para la familia' });
    await expect(text).toHaveValue([
      'Buenos días:', '',
      'Les escribo sobre Hugo, de Matemáticas (2.º ESO C), para que estén al tanto:', '',
      facts, '',
      'Me gustaría comentarlo con ustedes. Pueden responder a este mensaje o pedir una tutoría.', '',
      'Un saludo,', 'Elena Prieto',
    ].join('\n'));
    await shot(page, info, '17-family');
    await family.getByRole('button', { name: 'Copiar y guardar' }).click();
    await expect(toast(page, 'Mensaje copiado y guardado en observaciones')).toBeVisible();
    await closed(page, family);
    expect(await clipboard(page)).toContain(facts);
    await expect(page.getByText('Aviso a la familia: Faltas sin justificar: 12, 13 y 19 de noviembre (y 1 justificada).', { exact: true })).toBeVisible();
  });
});

test.describe('faltas · «Avisar a la familia» con dos faltas el mismo día', () => {
  test.use({
    worldSpec: {
      courses: [{
        ...CLASS,
        lists: [
          { date: '2026-11-12', start: '10:20', marks: [{ student: 3, status: 'absent' }] },
          { date: '2026-11-12', start: '12:40', marks: [{ student: 3, status: 'absent' }] },
        ],
      }],
    },
  });

  test('faltas-19 · two classes missed on one day: the family message still tells the three absences the teacher sees', async ({ page, world }) => {
    bug('FALTAS-BUG-07', '«Avisar a la familia» lists each date once: «Faltas sin justificar: 12 y 19 de noviembre.» for the 3 absences of «A vigilar: 3 faltas sin justificar en 14 días»');
    const c = world.courses[0];
    await openFaltas(page, c.id);
    await todayRow(page, '10:20–11:15').getByRole('button', { name: 'Pasar lista' }).click();
    const sheet = await listSheet(page);
    await tapTo(sheet, 4, 'Falta');
    await sheet.getByRole('button', { name: 'Cerrar lista' }).click();
    await expect(toast(page, 'Lista pasada · 7 presentes · 1 falta')).toBeVisible();
    await closed(page, sheet);
    await expect(studentRow(page, 'Díaz Soto, Hugo')).toContainText('3 faltas sin justificar');

    await studentRow(page, 'Díaz Soto, Hugo').click();
    await page.getByRole('button', { name: 'A vigilar: 3 faltas sin justificar en 14 días' }).click();
    await dialog(page, 'Hugo Díaz Soto').getByRole('button', { name: 'Avisar a la familia' }).click();
    const text = dialog(page, 'Avisar a la familia').getByRole('textbox', { name: 'Mensaje para la familia' });
    await expect(text).toHaveValue(/· Faltas sin justificar: /);
    const facts = (await text.inputValue()).split('\n').find((l) => l.startsWith('· Faltas sin justificar: '))!;
    expect(facts, 'the three absences can be counted: a count, or the day of two of them said twice or with how many').toMatch(/\b3 faltas\b|\b(2|dos) (clases|sesiones|horas)\b|\b12\b.*\b12\b/);
  });
});
