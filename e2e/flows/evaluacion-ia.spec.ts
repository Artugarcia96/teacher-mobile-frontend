import {
  AI_STEP, commentBox, confirmDialog, evalMenu, evalRow, evaluarClass, evaluation, expect, NAMES, openEvaluation, press,
  sheetOf, shot, stepperValue, studentRow, STUDENTS, test, toast, type Api, type CourseSpec, type Page,
} from './evaluacion-helpers';

// Comentarios de boletín con la IA real (docs/PRODUCT.md §4.6), tagged @ai: `npx playwright test e2e/flows/evaluacion --grep @ai`.
// Each step waits up to four minutes on the job's progress; each test is a teacher of its own with a few students, so a
// job is one batch (one call to Claude). The AI proposes, the teacher decides: drafts are marked «Borrador IA», accepting
// one makes it final, and what the teacher wrote or accepted is never overwritten.

test.describe.configure({ timeout: 10 * 60_000 });

const ADAPTED = 'Calificación referida a su adaptación curricular.';
const words = (s: string) => s.trim().split(/\s+/).length;

/** Four students: Marta (all grades), Pablo (a task without grade), Lucía (missed the exam), Hugo (ACS). */
const FOUR: CourseSpec = {
  students: STUDENTS.slice(0, 4),
  activities: [
    { title: 'Examen U1 · Números enteros', date: '2026-10-29', grades: [8, 4.5, 6, 7] },
    { title: 'Ficha U1 · Operaciones', kind: 'worksheet', date: '2026-11-05', grades: [9, 5, 7, 6] },
    { title: 'Trabajo · Proyecto de estadística', kind: 'task', date: '2026-11-12', grades: [8, null, 6, 7] },
    { title: 'Examen U2 · Fracciones', date: '2026-11-17', grades: [7.5, 3, null, 6] },
  ],
  absences: [{ date: '2026-11-17', start: '11:45', student: 2 }],
  support: [{ student: 3, measures: ['acs'] }],
};
const TWO: CourseSpec = {
  students: STUDENTS.slice(0, 2),
  activities: [
    { title: 'Examen U1 · Números enteros', date: '2026-10-29', grades: [8, 4] },
    { title: 'Ficha U1 · Operaciones', kind: 'worksheet', date: '2026-11-05', grades: [7, 5] },
  ],
};

/** The progress callout of the comments job. */
const progress = (page: Page) => page.locator('.callout').filter({ hasText: 'Redactando comentarios' });

/** Waits (through the page) for the running comments job to finish. */
async function jobDone(page: Page) {
  await expect(progress(page)).toBeVisible();
  await expect(progress(page)).toHaveCount(0, { timeout: AI_STEP });
}

/** AI drafts for the whole class through the API (setup of a test), waiting for the job. */
async function draftAll(api: Api, courseId: string) {
  const { job } = await api.post(`/courses/${courseId}/evaluation/1/comments`, {});
  await expect.poll(async () => (await api.get(`/jobs/${job.id}`)).status, { timeout: AI_STEP, intervals: [2000] }).toMatch(/done|failed/);
  const done = await api.get(`/jobs/${job.id}`);
  expect(done.status, done.error ?? '').toBe('done');
}

test.describe('redactar y revisar los comentarios de una clase', () => {
  test.use({ worldSpec: { courses: [FOUR] } });

  test('evaluacion-95 @ai redactar con IA, seguir trabajando mientras tanto y revisar: aceptar, editar y lo escrito a mano', async ({ page, world }, info) => {
    await openEvaluation(page, world.c.id);

    await test.step('pedir los comentarios: confirmación con las notas incompletas', async () => {
      await page.getByRole('button', { name: 'Redactar 4 comentarios con IA' }).click();
      const confirm = confirmDialog(page, 'Redactar 4 comentarios con IA');
      await expect(confirm).toContainText('2 alumnos tienen notas incompletas: la IA solo valora lo que ya tiene nota.');
      await confirm.getByRole('button', { name: 'Redactar' }).click();
      await expect(progress(page)).toContainText(/Redactando comentarios · \d+ de (4|…)/);
      await expect(progress(page).getByRole('progressbar')).toBeVisible();
      await expect(page.getByRole('button', { name: /Redactar \d comentarios con IA/ })).toHaveCount(0);
    });

    await test.step('mientras la IA redacta, el profesor escribe y acepta el de Hugo: no se pisa', async () => {
      await press(studentRow(page, NAMES[3]), info);
      const sheet = sheetOf(page, NAMES[3]);
      await commentBox(sheet).fill('Ha avanzado en su adaptación: trabaja con interés y pide ayuda cuando la necesita.');
      await sheet.getByRole('button', { name: 'Aceptar', exact: true }).click();
      await expect(toast(page, 'Aceptado: Hugo')).toBeVisible();
    });

    await test.step('salir y volver: el progreso sigue en la página de esa evaluación', async () => {
      await page.goto('/evaluar');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Evaluar');
      await evaluarClass(page, /^2\.º ESO C · Matemáticas/).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Primera evaluación');
      await shot(page, info, 'ia-progreso');
      await jobDone(page);
      await expect(toast(page, '1 comentario no se ha tocado porque lo editaste mientras tanto.')).toBeVisible();
    });

    await test.step('los borradores llegan marcados «Borrador IA»; el de Hugo sigue siendo suyo', async () => {
      for (const i of [0, 1, 2]) {
        await expect(studentRow(page, NAMES[i]).locator('.ev-row__comment')).toHaveText(/^Borrador IA \S/);
      }
      await expect(studentRow(page, NAMES[3]).getByText('Borrador IA')).toHaveCount(0);
      await expect(studentRow(page, NAMES[3]).locator('.ev-row__comment'))
        .toHaveText('Ha avanzado en su adaptación: trabaja con interés y pide ayuda cuando la necesita.');
      await expect(page.locator('.ev-count')).toHaveText('3 comentarios de la IA sin revisar');
      const ev = await evaluation(world.api, world.c.id);
      for (const r of ev.rows.slice(0, 3)) {
        expect(r).toMatchObject({ comment_source: 'ai', comment_status: 'draft', comment_grade: r.final });
        expect(words(r.comment!), r.comment!).toBeLessThanOrEqual(60);
        expect(r.comment, 'only the first name reaches the AI').not.toContain(r.student.last_name);
      }
      await shot(page, info, 'ia-borradores');
    });

    await test.step('Evaluar cuenta los borradores sin revisar', async () => {
      await page.goto('/evaluar');
      await expect(evaluarClass(page, /^2\.º ESO C · Matemáticas/)).toContainText('3 comentarios de la IA sin revisar');
      await evaluarClass(page, /^2\.º ESO C · Matemáticas/).click();
    });

    const before = await evaluation(world.api, world.c.id);
    await test.step('«Revisar 3 comentarios» abre el primer borrador; aceptarlo sin cambios pasa al siguiente', async () => {
      await page.getByRole('button', { name: 'Revisar 3 comentarios' }).click();
      const sheet = sheetOf(page, NAMES[0]);
      await expect(sheet.getByText('Borrador IA')).toBeVisible();
      await expect(commentBox(sheet)).toHaveValue(before.rows[0].comment!);
      await sheet.getByRole('button', { name: 'Aceptar y siguiente' }).click();
      await expect(sheetOf(page, NAMES[1])).toBeVisible();
    });

    await test.step('editar el borrador de Pablo y aceptarlo', async () => {
      const sheet = sheetOf(page, NAMES[1]);
      await expect(sheet.getByText('Borrador IA')).toBeVisible();
      await commentBox(sheet).fill(`${before.rows[1].comment} Revisaremos juntos el trabajo pendiente.`);
      await expect(sheet.getByText('Borrador IA')).toHaveCount(0); // edited: no longer the AI's
      await sheet.getByRole('button', { name: 'Aceptar y siguiente' }).click();
      await expect(sheetOf(page, NAMES[2])).toBeVisible();
    });

    await test.step('el de Lucía (faltó al examen); el de Hugo ya estaba aceptado', async () => {
      const lucia = sheetOf(page, NAMES[2]);
      await expect(lucia.locator('.ev-sheet__facts')).toContainText('Pendiente (faltó): Examen U2 · Fracciones');
      await lucia.getByRole('button', { name: 'Aceptar y siguiente' }).click();
      const hugo = sheetOf(page, NAMES[3]);
      await expect(commentBox(hugo)).toHaveValue('Ha avanzado en su adaptación: trabaja con interés y pide ayuda cuando la necesita.');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(toast(page, /^Aceptado/)).toHaveCount(0); // no toast covered the comments on the way
      await expect(page.getByText('Comentarios revisados', { exact: true })).toBeVisible();
      await expect(page.locator('.ev-list').getByText('Borrador IA')).toHaveCount(0);
    });

    const after = await evaluation(world.api, world.c.id);
    expect(after.rows.map((r) => [r.comment_source, r.comment_status])).toEqual([
      ['ai', 'final'], ['manual', 'final'], ['ai', 'final'], ['manual', 'final'],
    ]);
    expect(after.rows[0].comment).toBe(before.rows[0].comment);
    expect(after.rows[1].comment).toBe(`${before.rows[1].comment} Revisaremos juntos el trabajo pendiente.`);
    expect(after.comments_unreviewed).toBe(0);
  });
});

test.describe('un alumno con otra ficha: la IA escribe para su adaptación', () => {
  test.use({ worldSpec: { courses: [{ ...TWO, support: [{ student: 1, measures: ['acs'] }] }] } });

  test('evaluacion-96 @ai el comentario de un alumno con ACS se cierra con «Calificación referida a su adaptación curricular.»', async ({ page, world }) => {
    await openEvaluation(page, world.c.id);
    await page.getByRole('button', { name: 'Redactar 2 comentarios con IA' }).click();
    await confirmDialog(page, 'Redactar 2 comentarios con IA').getByRole('button', { name: 'Redactar' }).click();
    await jobDone(page);
    const pablo = await evalRow(world.api, world.c.id, STUDENTS[1]);
    expect(pablo.adapted).toBe(true);
    expect(pablo.comment!.endsWith(ADAPTED), pablo.comment!).toBe(true);
    expect(pablo.comment!.split(ADAPTED)).toHaveLength(2); // exactly once
    const marta = await evalRow(world.api, world.c.id, STUDENTS[0]);
    expect(marta.comment).not.toContain(ADAPTED);
    await expect(studentRow(page, NAMES[1]).locator('.ev-row__comment')).toHaveText(`Borrador IA ${pablo.comment}`);
  });
});

test.describe('cambiar la nota de un borrador de la IA', () => {
  test.use({ worldSpec: { courses: [TWO] } });

  test('evaluacion-97 @ai al aceptar con otra nota, la IA redacta de nuevo el borrador con la nota nueva', async ({ page, world }, info) => {
    await draftAll(world.api, world.c.id);
    const old = await evalRow(world.api, world.c.id, STUDENTS[0]); // Marta: propuesta 8
    expect(old).toMatchObject({ comment_source: 'ai', comment_status: 'draft', proposed: 8 });

    await openEvaluation(page, world.c.id);
    await press(studentRow(page, NAMES[0]), info);
    const sheet = sheetOf(page, NAMES[0]);
    await press(sheet.getByRole('button', { name: 'Más' }), info);
    await expect(stepperValue(sheet)).toHaveText('9');
    await expect(sheet.getByText('Al aceptar, la IA redacta de nuevo este borrador con la nota 9.')).toBeVisible();
    await sheet.getByRole('button', { name: 'Aceptar y siguiente' }).click();
    await expect(sheetOf(page, NAMES[1])).toBeVisible(); // moved on, while the AI redrafts Marta's
    await page.keyboard.press('Escape');
    await jobDone(page);

    const now = await evalRow(world.api, world.c.id, STUDENTS[0]);
    expect(now).toMatchObject({ final_grade: 9, comment_source: 'ai', comment_status: 'draft', comment_grade: 9 });
    expect(now.comment).not.toBe(old.comment);
    await expect(studentRow(page, NAMES[0]).locator('.ev-row__comment')).toHaveText(`Borrador IA ${now.comment}`);
  });
});

test.describe('un comentario aceptado con la nota anterior', () => {
  test.use({
    worldSpec: {
      courses: [{
        ...TWO,
        evaluation: [
          { student: 1, comment: 'Ha mejorado en las fichas, pero debe estudiar más para los exámenes.', accept: true },
          { student: 1, final: 5 },
        ],
      }],
    },
  });

  test('evaluacion-98 @ai «Escrito para un 4 · nota 5» → «Redactar de nuevo»: un borrador nuevo con la nota que cuenta', async ({ page, world }, info) => {
    const old = await evalRow(world.api, world.c.id, STUDENTS[1]); // Pablo: propuesta 4, ajustada 5
    expect(old).toMatchObject({ comment_grade: 4, final: 5, comment_status: 'final', comment_stale: true });
    await openEvaluation(page, world.c.id);
    await expect(studentRow(page, NAMES[1]).locator('.ev-row__comment')).toHaveText('Escrito para un 4 · nota 5');
    await press(studentRow(page, NAMES[1]), info);
    const sheet = sheetOf(page, NAMES[1]);
    await expect(sheet.getByText('Escrito para un 4 · nota 5. Corrígelo o redáctalo de nuevo.')).toBeVisible();
    await sheet.getByRole('button', { name: 'Redactar de nuevo' }).click();
    const confirm = confirmDialog(page, 'Redactar de nuevo el comentario');
    await expect(confirm).toContainText('La IA escribe un borrador nuevo con la nota 5. El comentario actual se sustituye.');
    await confirm.getByRole('button', { name: 'Redactar' }).click();
    await expect(toast(page, 'La IA redacta el comentario de Pablo')).toBeVisible();
    await page.keyboard.press('Escape');
    await jobDone(page);

    const now = await evalRow(world.api, world.c.id, STUDENTS[1]);
    expect(now).toMatchObject({ comment_source: 'ai', comment_status: 'draft', comment_grade: 5, final_grade: 5 });
    expect(now.comment).not.toBe(old.comment);
    await expect(studentRow(page, NAMES[1]).locator('.ev-row__comment')).toHaveText(`Borrador IA ${now.comment}`);
    await press(studentRow(page, NAMES[1]), info);
    await expect(sheetOf(page, NAMES[1]).getByText('Borrador IA')).toBeVisible();
    await expect(sheetOf(page, NAMES[1]).getByText(/Corrígelo o redáctalo de nuevo/)).toHaveCount(0);
  });
});

test.describe('redactar de nuevo los borradores', () => {
  test.use({ worldSpec: { courses: [{ ...TWO, students: STUDENTS.slice(0, 3), activities: TWO.activities!.map((a) => ({ ...a, grades: [...a.grades!, 6] })) }] } });

  test('evaluacion-99 @ai «Redactar de nuevo 1 borrador» solo sustituye los borradores sin revisar: lo aceptado y lo escrito no se tocan', async ({ page, world }) => {
    await draftAll(world.api, world.c.id);
    const [marta, pablo] = world.c.students;
    await world.api.put(`/courses/${world.c.id}/evaluation/1/students/${marta.id}`, { comment_status: 'final' });
    await world.api.put(`/courses/${world.c.id}/evaluation/1/students/${pablo.id}`, { comment: 'Escrito por la profesora.' });
    const before = await evaluation(world.api, world.c.id);
    expect(before.rows.map((r) => [r.comment_source, r.comment_status])).toEqual([['ai', 'final'], ['manual', 'draft'], ['ai', 'draft']]);

    await openEvaluation(page, world.c.id);
    await expect(page.getByRole('button', { name: 'Revisar 1 comentario' })).toBeVisible();
    await evalMenu(page, 'Redactar de nuevo 1 borrador');
    const confirm = confirmDialog(page, 'Redactar de nuevo los borradores');
    await expect(confirm).toContainText('La IA redacta un borrador para 1 alumno');
    await confirm.getByRole('button', { name: 'Redactar' }).click();
    await expect(progress(page)).toBeVisible();
    // While it runs, the menu says why it cannot start another one.
    await page.getByRole('button', { name: 'Más acciones' }).click();
    const item = page.getByRole('menuitem', { name: /Redactar de nuevo 1 borrador/ });
    if (await progress(page).count()) {
      await expect(item).toBeDisabled();
      await expect(item).toContainText('La IA está redactando comentarios');
    }
    await page.keyboard.press('Escape');
    await expect(progress(page)).toHaveCount(0, { timeout: AI_STEP });

    const after = await evaluation(world.api, world.c.id);
    expect(after.rows[0]).toMatchObject({ comment: before.rows[0].comment, comment_source: 'ai', comment_status: 'final' });
    expect(after.rows[1]).toMatchObject({ comment: 'Escrito por la profesora.', comment_source: 'manual' });
    expect(after.rows[2]).toMatchObject({ comment_source: 'ai', comment_status: 'draft' });
    expect(after.rows[2].comment).not.toBe(before.rows[2].comment);
  });
});
