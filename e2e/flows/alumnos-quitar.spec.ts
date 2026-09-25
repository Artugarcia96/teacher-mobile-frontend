import type { Page } from '@playwright/test';
import {
  bug, confirmSheet, expect, fileMenu, MATES_2C, openFile, openRoster, rosterRow, section, sheet, shot, test, toast,
} from './alumnos-helpers';

// Quitar a un alumno de un grupo (ficha › «···»): it asks first, the student and his grades are kept, the roster and
// the counts follow; and moving a student to another group (bring him from «De otro grupo», then take him out of the
// old one). No AI.

const TWO_GROUPS = {
  courses: [
    {
      ...MATES_2C,
      activities: [{ title: 'Examen U1 · Fracciones', kind: 'exam', date: '2026-10-15', grades: [7.5, 6] }],
      notes: [{ students: [0], kind: 'positive' as const, date: '2026-11-10', text: 'Muy constante.' }],
    },
    { subject: 'Matemáticas', short: 'Mates', group: '2º ESO D', color: 'ochre', students: ['Navarro Gil, Iker'] },
  ],
};

const search = async (page: Page, q: string) => {
  await page.goto('/clases');
  await page.getByRole('searchbox', { name: 'Buscar alumno o clase' }).fill(q);
};

test.describe('two groups', () => {
  test.use({ teacherSpec: TWO_GROUPS });

  test('alumnos-70 «Quitar de 2.º ESO C»: «Cancelar» keeps her; «Quitar» takes her out and keeps her ficha and grades', async ({ page, teacher }, info) => {
    const [c] = teacher.courses;
    const marta = c.students[0];
    await openFile(page, marta.id, 'Marta Alonso Gil');
    await page.getByRole('button', { name: 'Más opciones', exact: true }).click();
    await expect(page.getByRole('menuitem')).toHaveText(['Editar datos y apoyos', 'Quitar de 2.º ESO C']);
    await page.getByRole('menuitem', { name: 'Quitar de 2.º ESO C' }).click();
    const ask = confirmSheet(page, 'Quitar a Marta de 2.º ESO C');
    await expect(ask.getByText('Se quita del grupo. Sus notas se conservan.')).toBeVisible();
    await shot(page, info, 'quitar-confirmar');
    await ask.getByRole('button', { name: 'Cancelar' }).click();
    await expect(ask).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/alumnos/${marta.id}$`));

    await fileMenu(page, 'Quitar de 2.º ESO C');
    await ask.getByRole('button', { name: 'Quitar' }).click();
    await expect(toast(page, 'Quitado de 2.º ESO C')).toBeVisible();
    // Back to the class roster, without her.
    await expect(page).toHaveURL(new RegExp(`/clases/${c.id}/alumnos$`));
    await expect(page.locator('.students-roster').getByRole('heading', { name: '11 alumnos' })).toBeVisible();
    await expect(rosterRow(page, 'Alonso Gil, Marta')).toHaveCount(0);
    await expect(page.getByText(/^11 alumnos · Aula 112/)).toBeVisible();
    const groupIds = (await teacher.api.get(`/groups/${c.groupId}/students`)).map((s: { id: string }) => s.id);
    expect(groupIds).not.toContain(marta.id);

    // She still exists: her ficha says she is in no class; the observation is kept.
    const file = await teacher.api.get(`/students/${marta.id}`);
    expect(file.groups).toEqual([]);
    await openFile(page, marta.id, 'Marta Alonso Gil');
    await expect(section(page, 'Notas').getByText('No está en ninguna clase')).toBeVisible();
    await expect(section(page, 'Notas').getByText('Añádelo desde la pestaña Alumnos de una clase.')).toBeVisible();
    await expect(section(page, 'Asistencia')).toHaveCount(0);
    await expect(section(page, 'Observaciones').getByText('Muy constante.')).toBeVisible();
    await page.getByRole('button', { name: 'Más opciones', exact: true }).click();
    await expect(page.getByRole('menuitem')).toHaveText(['Editar datos y apoyos']);
    await page.keyboard.press('Escape');
    await shot(page, info, 'quitar-sin-clase');
  });

  test('alumnos-71 move a student to another group: bring him from «De otro grupo», then take him out of the old one', async ({ page, teacher }) => {
    const [c, d] = teacher.courses;
    const marta = c.students[0];
    // In 2.º ESO D: «Añadir alumnos» › «De otro grupo» › 2.º ESO C › Marta.
    await page.goto(`/clases/${d.id}/alumnos?anadir=1`);
    const add = sheet(page, 'Añadir alumnos');
    await add.getByRole('button', { name: 'De otro grupo' }).click();
    await add.getByRole('button', { name: '2.º ESO C' }).click();
    await add.getByRole('button', { name: 'Alonso Gil, Marta' }).click();
    await add.getByRole('button', { name: 'Añadir 1 alumno' }).click();
    await expect(toast(page, '1 alumno añadido')).toBeVisible();
    await rosterRow(page, 'Alonso Gil, Marta').click();

    // Now in both: the menu offers both groups.
    await page.getByRole('button', { name: 'Más opciones', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: /^Quitar de/ })).toHaveCount(2);
    await page.getByRole('menuitem', { name: 'Quitar de 2.º ESO C' }).click();
    await confirmSheet(page, 'Quitar a Marta de 2.º ESO C').getByRole('button', { name: 'Quitar' }).click();
    await expect(toast(page, 'Quitado de 2.º ESO C')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/clases/${c.id}/alumnos$`));

    // Her ficha: 2.º ESO D only, with the observation.
    await openFile(page, marta.id, 'Marta Alonso Gil');
    await expect(page.locator('.page-head .eyebrow')).toHaveText('2.º ESO D');
    await expect(section(page, 'Observaciones').getByText('Muy constante.')).toBeVisible();
    const file = await teacher.api.get(`/students/${marta.id}`);
    expect(file.groups.map((g: { name: string }) => g.name)).toEqual(['2º ESO D']);
    await openRoster(page, d.id);
    await expect(rosterRow(page, 'Alonso Gil, Marta')).toBeVisible();

    // Nothing was lost: brought back to 2.º ESO C, her grade of Examen U1 is there again.
    await page.goto(`/clases/${c.id}/alumnos?anadir=1`);
    await add.getByRole('button', { name: 'De otro grupo' }).click();
    await add.getByRole('button', { name: '2.º ESO D' }).click();
    await add.getByRole('button', { name: 'Alonso Gil, Marta' }).click();
    await add.getByRole('button', { name: 'Añadir 1 alumno' }).click();
    await expect(toast(page, '1 alumno añadido')).toBeVisible();
    const back = (await teacher.api.get(`/students/${marta.id}`)).courses.find((x: { course: { id: string } }) => x.course.id === c.id);
    expect(back.grades.map((g: { title: string; score: number }) => [g.title, g.score])).toEqual([['Examen U1 · Fracciones', 7.5]]);
  });

  test('alumnos-72 the search knows at once that a removed student is in no class', async ({ page, teacher }) => {
    bug('BUG-ALUMNOS-06', 'removing (or adding) a student does not refresh the search: for 30 s the same search still shows the old classes');
    await search(page, 'marta');
    const hit = page.getByRole('button', { name: /Alonso Gil, Marta/ });
    await expect(hit).toContainText('2.º ESO C · Mates');
    await hit.click();
    await fileMenu(page, 'Quitar de 2.º ESO C');
    await confirmSheet(page, 'Quitar a Marta de 2.º ESO C').getByRole('button', { name: 'Quitar' }).click();
    await expect(toast(page, 'Quitado de 2.º ESO C')).toBeVisible();
    // Same search, in the same session (no reload), right away.
    await page.getByRole('link', { name: 'Clases' }).first().click();
    await page.getByRole('searchbox', { name: 'Buscar alumno o clase' }).fill('marta');
    await expect(page.getByRole('button', { name: /Alonso Gil, Marta/ })).toContainText('Sin clase');
    expect((await teacher.api.get(`/search?q=marta`)).students[0].courses).toEqual([]);
  });
});
