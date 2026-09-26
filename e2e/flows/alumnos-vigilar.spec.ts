import type { Page } from '@playwright/test';
import {
  clipboard, denyClipboard, expect, MATES_2C, openFile, openRoster, rosterRow, section, sheet, shot, test, toast, type CourseSpec,
} from './alumnos-helpers';

// «A vigilar» in the student file: the warning under the actions opens the same sheet as in Hoy (without «Ver ficha»):
// «Ya lo sé» (out of Hoy until something new; the ficha keeps the reason) and «Avisar a la familia» (an editable
// message made of the facts; «Copiar y guardar» copies it, keeps the facts as a «Familia» observation and counts as
// «Ya lo sé»). No AI.

/** Marta (0): two incidents this week. Pablo (1): three unjustified absences in 14 days. */
const WATCHED: CourseSpec = {
  ...MATES_2C,
  notes: [
    { students: [0], kind: 'incident', date: '2026-11-16', text: 'Interrumpe la clase varias veces.' },
    { students: [0], kind: 'incident', date: '2026-11-18', text: 'No trae el material por tercera vez.' },
  ],
  marks: [
    { student: 1, date: '2026-11-10', start: '09:25', status: 'absent' },
    { student: 1, date: '2026-11-13', start: '12:40', status: 'absent' },
    { student: 1, date: '2026-11-16', start: '08:30', status: 'absent' },
  ],
};

const callout = (page: Page) => page.getByRole('button', { name: /^A vigilar/ });
const watchSheet = (page: Page) => sheet(page, 'Marta Alonso Gil');
const inHoy = async (api: { get: (p: string) => Promise<any> }, id: string) =>
  (await api.get('/watch')).some((w: { student: { id: string } }) => w.student.id === id);

test.describe('a class with students to watch', () => {
  test.use({ teacherSpec: { courses: [WATCHED] } });

  test('alumnos-90 the warning in the ficha and in the roster; it opens the watch sheet without «Ver ficha»', async ({ page, teacher }, info) => {
    const [c] = teacher.courses;
    const marta = c.students[0];
    await openRoster(page, c.id);
    await expect(rosterRow(page, 'Alonso Gil, Marta')).toContainText('2 incidencias en 7 días');
    await expect(rosterRow(page, 'Benítez Ruiz, Pablo')).toContainText('3 faltas sin justificar en 14 días');

    await rosterRow(page, 'Alonso Gil, Marta').click();
    await expect(callout(page)).toHaveAccessibleName('A vigilar: 2 incidencias en 7 días');
    await expect(callout(page)).toHaveText(/^A vigilar: 2 incidencias en 7 días/); // one class: not «en Matemáticas»
    await callout(page).click();
    const s = watchSheet(page);
    await expect(s.getByText('Matemáticas · 2.º ESO C · último hecho: 18 nov')).toBeVisible();
    await expect(s.getByText('2 incidencias en 7 días')).toBeVisible();
    await expect(s.getByText('Ver ficha')).toHaveCount(0);
    await expect(s.getByRole('button', { name: 'Ya lo sé' })).toBeVisible();
    await expect(s.getByRole('button', { name: 'Avisar a la familia' })).toBeVisible();
    await shot(page, info, 'vigilar-hoja');
    await s.getByRole('button', { name: 'Cerrar' }).click();
    await expect(s).toBeHidden();
    expect(await inHoy(teacher.api, marta.id)).toBe(true);
  });

  test('alumnos-91 «Ya lo sé»: out of Hoy until something new; the ficha keeps the reason', async ({ page, teacher }) => {
    const [c] = teacher.courses;
    const marta = c.students[0];
    await openFile(page, marta.id, 'Marta Alonso Gil');
    await callout(page).click();
    await watchSheet(page).getByRole('button', { name: 'Ya lo sé' }).click();
    await expect(toast(page, 'Marta no volverá a salir en Hoy hasta que haya algo nuevo')).toBeVisible();
    await expect(watchSheet(page)).toBeHidden();
    await expect(callout(page)).toBeVisible();
    expect(await inHoy(teacher.api, marta.id)).toBe(false);
    await page.reload();
    await expect(callout(page)).toHaveAccessibleName('A vigilar: 2 incidencias en 7 días. Ya lo sabes desde el 19 nov');

    // Something new (another incident, today) brings her back.
    await page.getByRole('button', { name: 'Anotar' }).click();
    const note = sheet(page, 'Anotar');
    await note.getByRole('group', { name: 'Tipo' }).getByRole('button', { name: 'Incidencia' }).click();
    await note.getByRole('textbox', { name: 'Texto' }).fill('Se levanta sin permiso.');
    await note.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Incidencia guardada')).toBeVisible();
    await expect(callout(page)).toHaveAccessibleName('A vigilar: 3 incidencias en 7 días');
    expect(await inHoy(teacher.api, marta.id)).toBe(true);
  });

  test('alumnos-92 «Avisar a la familia»: the message of the facts, edited, «Copiar y guardar»', async ({ page, teacher }, info) => {
    const [c] = teacher.courses;
    const pablo = c.students[1];
    const expected = (await teacher.api.get(`/watch/${pablo.id}/message?course_id=${c.id}`)).text as string;
    await openFile(page, pablo.id, 'Pablo Benítez Ruiz');
    await expect(callout(page)).toHaveAccessibleName('A vigilar: 3 faltas sin justificar en 14 días');
    await callout(page).click();
    await sheet(page, 'Pablo Benítez Ruiz').getByRole('button', { name: 'Avisar a la familia' }).click();
    const s = sheet(page, 'Avisar a la familia');
    await expect(s.getByText('Pablo Benítez Ruiz · Matemáticas · 2.º ESO C')).toBeVisible();
    const text = s.getByRole('textbox', { name: 'Mensaje para la familia' });
    await expect(text).toHaveValue(expected);
    expect(expected).toContain('Les escribo sobre Pablo, de Matemáticas (2.º ESO C)');
    expect(expected).toContain('· Faltas sin justificar: 10, 13 y 16 de noviembre.');
    expect(expected).toMatch(/Un saludo,\nElena Prieto$/);
    await expect(s.getByText('Pablo sale de «A vigilar» hasta que haya algo nuevo', { exact: false })).toBeVisible();
    await shot(page, info, 'vigilar-familia');

    // Empty: nothing to copy.
    await text.fill('');
    await expect(s.getByRole('button', { name: 'Copiar y guardar' })).toBeDisabled();
    await expect(s.getByRole('button', { name: 'Copiar y guardar' })).toHaveAttribute('title', 'Escribe el mensaje');
    const edited = expected.replace('Me gustaría comentarlo con ustedes.', 'Me gustaría comentarlo con ustedes esta semana.');
    await text.fill(edited);
    await s.getByRole('button', { name: 'Copiar y guardar' }).click();
    await expect(toast(page, 'Mensaje copiado y guardado en observaciones')).toBeVisible();
    await expect(s).toBeHidden();
    expect(await clipboard(page)).toBe(edited);

    // The facts, without greeting or signature, as a «Familia» observation; and he is out of Hoy.
    const first = section(page, 'Observaciones').locator('.st-note').first();
    await expect(first.locator('.chip')).toHaveText('Familia');
    await expect(first).toContainText('19 nov');
    await expect(first.locator('.st-note__text')).toHaveText('Aviso a la familia: Faltas sin justificar: 10, 13 y 16 de noviembre.');
    await expect(first).not.toContainText('Buenos días');
    await expect(first).not.toContainText('Elena Prieto');
    expect(await inHoy(teacher.api, pablo.id)).toBe(false);
  });

  test('alumnos-93 the clipboard refuses: the facts are saved anyway and the sheet stays to copy by hand', async ({ page, teacher }) => {
    const [c] = teacher.courses;
    const pablo = c.students[1];
    await openFile(page, pablo.id, 'Pablo Benítez Ruiz');
    await callout(page).click();
    await sheet(page, 'Pablo Benítez Ruiz').getByRole('button', { name: 'Avisar a la familia' }).click();
    const s = sheet(page, 'Avisar a la familia');
    await expect(s.getByRole('textbox', { name: 'Mensaje para la familia' })).not.toHaveValue('');
    await denyClipboard(page);
    await s.getByRole('button', { name: 'Copiar y guardar' }).click();
    await expect(toast(page, 'Guardado en observaciones. No se ha podido copiar: selecciona el texto y cópialo a mano.')).toBeVisible();
    await expect(s).toBeVisible();
    const notes = await teacher.api.get(`/notes?student_id=${pablo.id}`);
    expect(notes[0]).toMatchObject({ kind: 'family' });
    expect(await inHoy(teacher.api, pablo.id)).toBe(false);
  });
});

test.describe('the message cannot be made', () => {
  test.use({ teacherSpec: { courses: [WATCHED] } });

  test('alumnos-95 the family message fails to load: the reason, and nothing to copy', async ({ page, teacher }) => {
    const pablo = teacher.courses[0].students[1];
    await page.route(`**/api/watch/${pablo.id}/message**`, (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"boom"}' }));
    await openFile(page, pablo.id, 'Pablo Benítez Ruiz');
    await callout(page).click();
    await sheet(page, 'Pablo Benítez Ruiz').getByRole('button', { name: 'Avisar a la familia' }).click();
    const s = sheet(page, 'Avisar a la familia');
    await expect(s.getByText('El servidor ha fallado. Inténtalo en un momento.')).toBeVisible({ timeout: 15_000 });
    await expect(s.getByRole('button', { name: 'Copiar y guardar' })).toBeDisabled();
  });
});

test.describe('a student in two classes', () => {
  test.use({
    teacherSpec: {
      courses: [
        { ...MATES_2C, marks: WATCHED.marks!.map((m) => ({ ...m, student: 0 })) },
        { subject: 'Física y Química', short: 'FyQ', sameGroupAs: 0, slots: [] },
      ],
    },
  });

  test('alumnos-94 the warning names the class it comes from', async ({ page, teacher }) => {
    const marta = teacher.courses[0].students[0];
    await openFile(page, marta.id, 'Marta Alonso Gil');
    await expect(callout(page)).toHaveCount(1);
    await expect(callout(page)).toHaveText(/^A vigilar en Matemáticas: 3 faltas sin justificar en 14 días/);
    await callout(page).click();
    await expect(watchSheet(page).getByText('Matemáticas · 2.º ESO C · último hecho: 16 nov')).toBeVisible();
  });
});
