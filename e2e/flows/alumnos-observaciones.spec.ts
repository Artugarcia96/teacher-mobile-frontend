import type { Locator, Page } from '@playwright/test';
import { bug, confirmSheet, expect, MATES_2C, openFile, section, settle, sheet, shot, test, toast } from './alumnos-helpers';

// Observaciones of the student file: «Anotar» (only her chip, «Añadir alumnos» for more, the four kinds), a student in
// two classes chooses the class first; edit (text, kind, date) and delete (confirmation; a shared note goes for
// everyone), the empty state. Every change is checked through the API. No AI. (The discard question when closing
// «Anotar» with text is in e2e/sheets.spec.ts.)

const notesOf = async (api: { get: (p: string) => Promise<any> }, studentId: string) =>
  (await api.get(`/notes?student_id=${studentId}`)) as { id: string; kind: string; date: string; text: string; students: { id: string }[]; course: { subject: string } | null }[];

const noteRow = (page: Page, text: string) => section(page, 'Observaciones').locator('.st-note').filter({ hasText: text });

async function noteMenu(page: Page, text: string, item: 'Editar' | 'Eliminar') {
  await noteRow(page, text).getByRole('button', { name: 'Opciones de la observación' }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

const chips = (s: Locator) => s.locator('.note-students .chip-row').getByRole('button');

test.describe('one class', () => {
  test.use({
    teacherSpec: {
      courses: [{
        ...MATES_2C,
        notes: [
          { students: [0], kind: 'observation', date: '2026-11-10', text: 'Pregunta mucho en clase.' },
          { students: [0, 1], kind: 'incident', date: '2026-11-12', text: 'Hablan durante el examen.' },
        ],
      }],
    },
  });

  test('alumnos-50 «Anotar» from the ficha: only her chip, the kind, «Guardar» when there is text', async ({ page, teacher }, info) => {
    const marta = teacher.courses[0].students[0];
    await openFile(page, marta.id, 'Marta Alonso Gil');
    await page.getByRole('button', { name: 'Anotar' }).click();
    const s = sheet(page, 'Anotar');
    await expect(s.getByText('Matemáticas · 2.º ESO C')).toBeVisible();
    const text = s.getByRole('textbox', { name: 'Texto' });
    await expect(text).toBeFocused();
    await expect(chips(s)).toHaveText(['Alonso, Marta', 'Añadir alumnos']);
    await expect(chips(s).first()).toHaveAttribute('aria-pressed', 'true');
    await expect(s.getByText('1 alumno', { exact: true })).toBeVisible();
    // Disabled, the button says why.
    await expect(s.getByRole('button', { name: 'Escribe la observación' })).toBeDisabled();

    await s.getByRole('group', { name: 'Tipo' }).getByRole('button', { name: 'Incidencia' }).click();
    await expect(text).toHaveAttribute('placeholder', 'Qué ha pasado');
    await text.fill('No trae el material por tercera vez.');
    await shot(page, info, 'obs-anotar');
    await s.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Incidencia guardada')).toBeVisible();
    await expect(s).toBeHidden();

    // First in the timeline (newest), today, as an incidence of her class only.
    const first = section(page, 'Observaciones').locator('.st-note').first();
    await expect(first).toContainText('No trae el material por tercera vez.');
    await expect(first.locator('.chip')).toHaveText('Incidencia');
    await expect(first).toContainText('19 nov');
    await expect(first).not.toContainText('Matemáticas'); // one class: not repeated in every row
    const saved = (await notesOf(teacher.api, marta.id))[0];
    expect(saved).toMatchObject({ kind: 'incident', date: '2026-11-19', text: 'No trae el material por tercera vez.' });
    expect(saved.students.map((x) => x.id)).toEqual([marta.id]);
  });

  test('alumnos-51 the four kinds are saved with their own word', async ({ page, teacher }) => {
    const marta = teacher.courses[0].students[0];
    await openFile(page, marta.id, 'Marta Alonso Gil');
    const s = sheet(page, 'Anotar');
    for (const [kind, placeholder, saved] of [
      ['Observación', 'Qué has observado', 'Observación guardada'], ['Positivo', 'Qué ha hecho bien', 'Positivo guardado'],
      ['Familia', 'Llamada, reunión, acuerdo…', 'Nota de familia guardada'],
    ]) {
      await page.getByRole('button', { name: 'Anotar' }).click();
      await s.getByRole('group', { name: 'Tipo' }).getByRole('button', { name: kind }).click();
      await expect(s.getByRole('textbox', { name: 'Texto' })).toHaveAttribute('placeholder', placeholder);
      await s.getByRole('textbox', { name: 'Texto' }).fill(`${kind} de prueba`);
      await s.getByRole('button', { name: 'Guardar' }).click();
      await expect(toast(page, saved)).toBeVisible();
      await expect(noteRow(page, `${kind} de prueba`).locator('.chip')).toHaveText(kind);
    }
    const kinds = (await notesOf(teacher.api, marta.id)).map((n) => n.kind);
    expect(kinds.slice(0, 3).sort()).toEqual(['family', 'observation', 'positive']);
  });

  test('alumnos-52 «Añadir alumnos» in «Anotar»: search the roster and note two students at once', async ({ page, teacher }) => {
    const [c] = teacher.courses;
    const [marta, pablo] = c.students;
    await openFile(page, marta.id, 'Marta Alonso Gil');
    await page.getByRole('button', { name: 'Anotar' }).click();
    const s = sheet(page, 'Anotar');
    await s.getByRole('textbox', { name: 'Texto' }).fill('Trabajan muy bien en pareja.');
    await s.getByRole('button', { name: 'Añadir alumnos' }).click();
    // The whole roster (12: with a search box); Marta stays chosen.
    await expect(chips(s)).toHaveCount(12);
    const search = s.getByRole('textbox', { name: 'Buscar alumno' });
    await search.fill('pablo');
    await expect(chips(s)).toHaveText(['Alonso, Marta', 'Benítez, Pablo']);
    await chips(s).filter({ hasText: 'Benítez, Pablo' }).click();
    await expect(s.getByText('2 alumnos', { exact: true })).toBeVisible();
    // «Quitar todos» clears the choice; then both again.
    await s.getByRole('button', { name: 'Quitar todos' }).click();
    await expect(s.getByText('Alumnos (opcional)')).toBeVisible();
    await expect(s.getByRole('button', { name: 'Quitar todos' })).toHaveCount(0);
    await expect(chips(s)).toHaveText(['Benítez, Pablo']); // the search still filters
    await search.fill('');
    await chips(s).filter({ hasText: 'Alonso, Marta' }).click();
    await chips(s).filter({ hasText: 'Benítez, Pablo' }).click();
    await expect(s.getByText('2 alumnos', { exact: true })).toBeVisible();
    await s.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Observación guardada')).toBeVisible();
    await expect(noteRow(page, 'Trabajan muy bien en pareja.')).toContainText('19 nov · con 1 alumno más');
    // It is in Pablo's file too.
    await openFile(page, pablo.id, 'Pablo Benítez Ruiz');
    await expect(noteRow(page, 'Trabajan muy bien en pareja.')).toBeVisible();
    const n = (await notesOf(teacher.api, pablo.id)).find((x) => x.text === 'Trabajan muy bien en pareja.')!;
    expect(n.students.map((x) => x.id).sort()).toEqual([marta.id, pablo.id].sort());
  });

  test('alumnos-53 the student search of «Anotar» does not mind accents («benitez»)', async ({ page, teacher }) => {
    bug('BUG-ALUMNOS-05', '«Buscar alumno» in «Anotar» is accent-sensitive: «benitez» does not find Benítez (the app search does)');
    const marta = teacher.courses[0].students[0];
    await openFile(page, marta.id, 'Marta Alonso Gil');
    await page.getByRole('button', { name: 'Anotar' }).click();
    const s = sheet(page, 'Anotar');
    await s.getByRole('button', { name: 'Añadir alumnos' }).click();
    await s.getByRole('textbox', { name: 'Buscar alumno' }).fill('benitez');
    await expect(chips(s).filter({ hasText: 'Benítez, Pablo' })).toBeVisible();
  });

  test('alumnos-54 edit an observation: text, kind and date; empty text cannot be saved', async ({ page, teacher }, info) => {
    const marta = teacher.courses[0].students[0];
    await openFile(page, marta.id, 'Marta Alonso Gil');
    await noteMenu(page, 'Pregunta mucho en clase.', 'Editar');
    const s = sheet(page, 'Editar observación');
    const text = s.getByLabel('Texto');
    await expect(text).toHaveValue('Pregunta mucho en clase.');
    await expect(s.getByRole('group', { name: 'Tipo' }).getByRole('button', { name: 'Observación' })).toHaveAttribute('aria-pressed', 'true');
    await expect(s.getByText('martes, 10 nov 2026')).toBeVisible();

    await text.fill('');
    await expect(s.getByRole('button', { name: 'Escribe la observación' })).toBeDisabled();
    await text.fill('Pregunta mucho y ayuda a sus compañeros.');
    await s.getByRole('group', { name: 'Tipo' }).getByRole('button', { name: 'Positivo' }).click();
    await s.locator('input[type=date]').fill('2026-11-16');
    await expect(s.getByText('lunes, 16 nov 2026')).toBeVisible();
    await shot(page, info, 'obs-editar');
    await s.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Observación guardada')).toBeVisible();
    await expect(s).toBeHidden();

    // Now the newest (16 nov, after the 12 nov incidence) and a «Positivo».
    const first = section(page, 'Observaciones').locator('.st-note').first();
    await expect(first).toContainText('Pregunta mucho y ayuda a sus compañeros.');
    await expect(first.locator('.chip')).toHaveText('Positivo');
    await expect(first).toContainText('16 nov');
    const n = (await notesOf(teacher.api, marta.id)).find((x) => x.text.startsWith('Pregunta mucho'))!;
    expect(n).toMatchObject({ kind: 'positive', date: '2026-11-16', text: 'Pregunta mucho y ayuda a sus compañeros.' });
  });

  test('alumnos-55 an edited observation is not lost by a stray tap: the scrim does nothing', async ({ page, teacher }) => {
    const marta = teacher.courses[0].students[0];
    await openFile(page, marta.id, 'Marta Alonso Gil');
    await noteMenu(page, 'Pregunta mucho en clase.', 'Editar');
    const s = sheet(page, 'Editar observación');
    await s.getByLabel('Texto').fill('Pregunta mucho en clase y en el recreo.');
    await page.locator('.sheet-scrim').click({ position: { x: 20, y: 20 } });
    await settle(page);
    await expect(s).toBeVisible();
  });

  test('alumnos-56 delete an observation: «Cancelar» keeps it, «Eliminar» removes it', async ({ page, teacher }) => {
    const marta = teacher.courses[0].students[0];
    await openFile(page, marta.id, 'Marta Alonso Gil');
    await noteMenu(page, 'Pregunta mucho en clase.', 'Eliminar');
    const ask = confirmSheet(page, 'Eliminar observación');
    await expect(ask).toBeVisible();
    await expect(ask.getByText('Se elimina para todos')).toHaveCount(0); // only hers
    await ask.getByRole('button', { name: 'Cancelar' }).click();
    await expect(ask).toBeHidden();
    await expect(noteRow(page, 'Pregunta mucho en clase.')).toBeVisible();

    await noteMenu(page, 'Pregunta mucho en clase.', 'Eliminar');
    await ask.getByRole('button', { name: 'Eliminar' }).click();
    await expect(toast(page, 'Observación eliminada')).toBeVisible();
    await expect(noteRow(page, 'Pregunta mucho en clase.')).toHaveCount(0);
    expect((await notesOf(teacher.api, marta.id)).map((n) => n.text)).toEqual(['Hablan durante el examen.']);
  });

  test('alumnos-57 a note of two students: deleting it warns it goes for both; then the empty state', async ({ page, teacher }, info) => {
    const [marta, pablo] = teacher.courses[0].students;
    await openFile(page, pablo.id, 'Pablo Benítez Ruiz');
    await expect(noteRow(page, 'Hablan durante el examen.')).toContainText('12 nov · con 1 alumno más');
    await noteMenu(page, 'Hablan durante el examen.', 'Eliminar');
    const ask = confirmSheet(page, 'Eliminar observación');
    await expect(ask.getByText('Se elimina para todos los alumnos a los que se refiere.')).toBeVisible();
    await ask.getByRole('button', { name: 'Eliminar' }).click();
    await expect(toast(page, 'Observación eliminada')).toBeVisible();
    // Pablo had only that one.
    const obs = section(page, 'Observaciones');
    await expect(obs.getByText('Sin observaciones')).toBeVisible();
    await expect(obs.getByText('Apunta lo que veas en clase con «Anotar»: te servirá en la evaluación y en las tutorías.')).toBeVisible();
    await shot(page, info, 'obs-vacio');
    expect(await notesOf(teacher.api, pablo.id)).toEqual([]);
    expect((await notesOf(teacher.api, marta.id)).map((n) => n.text)).toEqual(['Pregunta mucho en clase.']);
  });
});

test.describe('two classes', () => {
  test.use({
    teacherSpec: {
      courses: [MATES_2C, { subject: 'Física y Química', short: 'FyQ', sameGroupAs: 0, color: 'indigo', slots: [] }],
    },
  });

  test('alumnos-58 «Anotar» for a student of two classes asks the class first; «Cambiar» goes back', async ({ page, teacher }) => {
    const [, fyq] = teacher.courses;
    const marta = fyq.students[0];
    await openFile(page, marta.id, 'Marta Alonso Gil');
    await page.getByRole('button', { name: 'Anotar' }).click();
    const s = sheet(page, 'Anotar');
    await expect(s.getByText('Elige la clase')).toBeVisible();
    await s.getByRole('button', { name: /Matemáticas · 2\.º ESO C/ }).click();
    await expect(s.getByText('Matemáticas · 2.º ESO C')).toBeVisible();
    await s.getByRole('button', { name: 'Cambiar' }).click();
    await s.getByRole('button', { name: /Física y Química · 2\.º ESO C/ }).click();
    await expect(chips(s).first()).toHaveText('Alonso, Marta');
    await expect(chips(s).first()).toHaveAttribute('aria-pressed', 'true');
    await s.getByRole('textbox', { name: 'Texto' }).fill('Muy buen informe de laboratorio.');
    await s.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Observación guardada')).toBeVisible();
    await expect(noteRow(page, 'Muy buen informe de laboratorio.')).toContainText('19 nov · Física y Química · 2.º ESO C');
    const n = (await notesOf(teacher.api, marta.id))[0];
    expect(n.course?.subject).toBe('Física y Química');
  });
});
