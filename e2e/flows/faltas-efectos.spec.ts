import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import {
  bug, CLASS, closed, dialog, expect, FRI, LABEL, list, listSheet, openFaltas, rosterRow, section, shot, studentRow, tapTo, test,
  THU, toast, todayRow, TODAY,
} from './faltas-helpers';

// What a list changes elsewhere (docs/PRODUCT.md): a session without class or left to the substitute (§4.2 «No hay
// clase», «Voy a faltar») and the Faltas tab; «A vigilar» (≥ 3 unjustified absences in 14 days) and the justification
// from the student file (§4.8); the roster's «N faltas» (§4.9); Evaluación and its acta (§4.6); «Faltó» in the
// Cuaderno on the day of an exam (§4.5). Homework checks that leave out who was absent: e2e/flows/hoy-clase.spec.ts.

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
    await world.api.post('/absences', { reason: 'Médico', sessions: [{ course_id: c.id, date: TODAY, start: '12:40', task: 'Problemas de la p. 34.' }] });
    await openFaltas(page, c.id);
    await expect(todayTimes(page)).toHaveText(['10:20–11:15']);

    await page.goto('/hoy');
    await expect(agendaRow(page, '12:40')).toContainText('Faltas');
    await agendaRow(page, '12:40').click();
    await dialog(page, LABEL).getByRole('button', { name: /^Pasar lista.*Con la hoja de la guardia/ }).click();
    const sheet = await listSheet(page, LABEL);
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
    await expect(section(page, 'Por alumno')).toContainText('Nadie ha faltado ni llegado tarde');
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
    const sheet = await listSheet(page, LABEL);
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
    await expect(page.getByRole('button', { name: 'Irene Esteban Mora: editar nota final y comentario' })).toContainText(/\b3 faltas|4 faltas/);
    await expect(page.getByRole('button', { name: 'Marta Alonso Gil: editar nota final y comentario' })).toContainText('1 falta');
    await expect(page.getByRole('button', { name: 'Hugo Díaz Soto: editar nota final y comentario' })).not.toContainText('falta');
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Acta (PDF)' }).click()]);
    expect(file.suggestedFilename()).toBe('Acta - Matematicas - 2o ESO C - 1a evaluacion.pdf');
    expect(readFileSync(await file.path()).subarray(0, 5).toString()).toBe('%PDF-');
    await expect(toast(page, 'Acta descargada')).toBeVisible();
  });

  test('faltas-13 · Evaluación counts the justified absences the file counts, or says they are only the unjustified ones', async ({ page, world }) => {
    bug('FALTAS-BUG-05', 'Evaluación (and the acta\'s «Faltas» column) says «3 faltas» for a student whose file says «4 faltas (1 justificada)» in the same term');
    const c = world.courses[0];
    await page.goto(`/alumnos/${c.students[4].id}`);
    await expect(page.getByRole('button', { name: /^4 faltas \(1 justificada\) en la 1\.ª evaluación/ })).toBeVisible();
    await page.goto(`/clases/${c.id}/evaluacion/1`);
    await expect(page.getByRole('button', { name: 'Irene Esteban Mora: editar nota final y comentario' })).toContainText(/4 faltas|3 faltas sin justificar/);
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
    let sheet = await listSheet(page, LABEL);
    await tapTo(sheet, 2, 'Falta');
    await sheet.getByRole('button', { name: 'Cerrar lista' }).click();
    await expect(toast(page, 'Lista pasada · 7 presentes · 1 falta')).toBeVisible();
    await closed(page, sheet);
    await page.goto(`/clases/${c.id}/cuaderno`);
    await expect(cell).toHaveText('Faltó');

    await openFaltas(page, c.id);
    await todayRow(page, '10:20–11:15').getByRole('button', { name: 'Editar lista' }).click();
    sheet = await listSheet(page, LABEL);
    await expect(rosterRow(sheet, 2)).toHaveAccessibleName(/: Falta\./);
    await tapTo(sheet, 2, 'Presente');
    await sheet.getByRole('button', { name: 'Cerrar lista' }).click();
    await expect(toast(page, 'Lista pasada · 8 presentes')).toBeVisible();
    await closed(page, sheet);
    await page.goto(`/clases/${c.id}/cuaderno`);
    await expect(cell).toHaveText('—');
  });
});
