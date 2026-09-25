import {
  average, bug, cell, CLASS, column, expect, gradebook, NAMES, openCuaderno, openEdit, press, sheet, STUDENTS, test, toast, typeGrade,
  type CourseSpec, type World,
} from './cuaderno-helpers';

// La columna «Deberes (1.ª)» (docs/PRODUCT.md §4.2 «Revisar deberes», §4.5): the homework checks give each student
// 10 × (hechos + 0,5·incompletos) / revisiones, counted at once (no confirmation step); whoever missed a session does
// not count for its check; a grade typed over it fixes it, and emptying the cell gives it back to the formula.
// «Deberes» is not a kind the teacher can pick. Each test is a teacher of its own; the checks go through the API
// (checking homework from Hoy: e2e/flows/hoy-*).

const HW = 'Deberes (1.ª)';
const [MARTA, PABLO, LUCIA, HUGO, IRENE] = NAMES;

// Three checks: Pablo did not do two, Lucía and Hugo did one half; Irene missed the second session.
const DEBERES: CourseSpec = {
  ...CLASS,
  homework: [
    { date: '2026-11-10', start: '11:45', notDone: [1], partial: [2] },
    { date: '2026-11-12', start: '09:25', notDone: [1] },
    { date: '2026-11-17', start: '11:45', partial: [3] },
  ],
  absences: [{ date: '2026-11-12', start: '09:25', student: 4 }],
};

const hwId = async (world: World) => (await gradebook(world.api, world.id)).activities.find((a) => a.kind === 'homework')!.id;

test.describe('cuaderno · deberes', () => {
  test.use({ worldSpec: DEBERES });

  test('cuaderno-90 · the checks fill «Deberes (1.ª)» and it counts in the average at once', async ({ page, world }, info) => {
    await openCuaderno(page, world.id);
    await expect(column(page, HW)).toContainText('10 nov'); // dated at the first check
    const expected: [string, string][] = [[MARTA, '10'], [PABLO, '3,33'], [LUCIA, '8,33'], [HUGO, '8,33'], [IRENE, '10']];
    for (const [who, text] of expected) await expect(cell(page, who, HW)).toHaveText(text);
    await expect(average(page, PABLO)).toHaveAccessibleName(`Media de ${PABLO}: 3,3`);
    await press(average(page, PABLO), info);
    await expect(page.getByRole('dialog', { name: PABLO }).locator('.row').filter({ hasText: 'Trabajos y fichas' })).toContainText('3,33');
    const gb = await gradebook(world.api, world.id);
    expect(gb.activities[0]).toMatchObject({ title: HW, kind: 'homework', category: 'work', suggested: 0 });
  });

  test('cuaderno-91 · a grade typed over it is the teacher\'s: later checks do not change it', async ({ page, world }, info) => {
    await openCuaderno(page, world.id);
    await typeGrade(page, info, PABLO, HW, '5');
    await page.keyboard.press('Escape');
    await expect(cell(page, PABLO, HW)).toHaveText('5');
    await expect.poll(async () => (await sheet(world.api, await hwId(world)))[STUDENTS[1]]).toEqual({ score: 5, status: 'confirmed' });
    // Today's check: Pablo and Lucía without homework
    await world.api.put(`/courses/${world.id}/homework`, {
      date: '2026-11-19', start: '09:25', marks: [1, 2].map((i) => ({ student_id: world.students[i].id, status: 'not_done' })),
    });
    await page.reload();
    await expect(cell(page, LUCIA, HW)).toHaveText('6,25'); // (0,5 + 1 + 1 + 0) / 4
    await expect(cell(page, PABLO, HW)).toHaveText('5');
  });

  test('cuaderno-92 · emptying a typed grade gives the cell back to the formula', async ({ page, world }, info) => {
    bug('CUA-04', 'emptying a «Deberes» cell leaves it empty («—») until the next homework check; PRODUCT §4.5 says it goes back to the formula');
    await world.api.put(`/activities/${await hwId(world)}/grades`, { grades: [{ student_id: world.students[1].id, score: 5 }] });
    await openCuaderno(page, world.id);
    await expect(cell(page, PABLO, HW)).toHaveText('5');
    await typeGrade(page, info, PABLO, HW, '');
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(cell(page, PABLO, HW)).toHaveText('3,33');
  });

  test('cuaderno-93 · its edit sheet has no kind nor date, explains the formula and saves the rest', async ({ page, world }, info) => {
    await openCuaderno(page, world.id);
    const s = await openEdit(page, info, HW);
    await expect(s.getByText('Nota calculada con las revisiones de deberes: 10 × (hechos + 0,5 · incompletos) / revisiones.')).toBeVisible();
    await expect(s.getByText('Tipo', { exact: true })).toHaveCount(0);
    await expect(s.getByRole('button', { name: 'Examen', exact: true })).toHaveCount(0);
    await expect(s.getByLabel('Fecha')).toHaveCount(0);
    await s.getByRole('group', { name: 'Peso' }).getByRole('button', { name: 'Más' }).click();
    await s.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Actividad guardada')).toBeVisible();
    const a = (await gradebook(world.api, world.id)).activities[0];
    expect(a).toMatchObject({ kind: 'homework', weight: 1.5 });
    expect((await world.api.get(`/activities/${a.id}`)).date).toBe('2026-11-10');
  });

  test('cuaderno-94 · its explanation does not ask to confirm grades that already count', async ({ page, world }, info) => {
    bug('CUA-05', 'the «Deberes» edit sheet says «Confírmala en el cuaderno» although its grades count at once (PRODUCT §4.2: sin paso de confirmación)');
    await openCuaderno(page, world.id);
    const s = await openEdit(page, info, HW);
    await expect(s.getByText(/Nota calculada con las revisiones de deberes/)).toBeVisible();
    await expect(s.getByText(/Confírmala/)).toHaveCount(0);
  });
});
