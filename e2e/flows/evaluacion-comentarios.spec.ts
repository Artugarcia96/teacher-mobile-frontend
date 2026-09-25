import {
  BASE, confirmDialog, DETAILS, evaluarClass, expect, NAMES, openEvaluation, sheetOf, studentRow, test, toast, type Page,
} from './evaluacion-helpers';

// Redactar los comentarios de boletín con IA, sin llamar a la IA (docs/PRODUCT.md §4.6): la confirmación (qué recibe la
// IA, notas incompletas), cancelar, un fallo al pedirlo, un trabajo que falló («Volver a intentar»), alumnos que la IA
// dejó sin comentario y el progreso de un trabajo que ya estaba en marcha al abrir la página. The real AI runs in evaluacion-ia.spec.ts (@ai).

/** Every request to draft comments, recorded and dropped (the AI never runs from this file). */
async function blockDrafts(page: Page): Promise<string[]> {
  const posts: string[] = [];
  await page.route('**/api/courses/*/evaluation/*/comments', (r) => { posts.push(r.request().postData() ?? ''); return r.abort(); });
  return posts;
}

const TEXT = 'La IA redacta un borrador para 6 alumnos con la nota que irá al boletín, las actividades de la evaluación, '
  + 'lo que peor les ha salido, la asistencia y tus observaciones. Solo recibe el nombre de pila.';

test.describe('una evaluación sin comentarios', () => {
  test.use({ worldSpec: { courses: [BASE] } });

  test('evaluacion-90 «Redactar 6 comentarios con IA» pide confirmación y dice qué recibe la IA; cancelar no pide nada', async ({ page }) => {
    const posts = await blockDrafts(page);
    await page.goto('/evaluar');
    await evaluarClass(page, /^2\.º ESO C · Matemáticas/).click();
    await page.getByRole('button', { name: 'Redactar 6 comentarios con IA' }).click();
    const confirm = confirmDialog(page, 'Redactar 6 comentarios con IA');
    await expect(confirm.locator('p')).toHaveText(TEXT);
    await confirm.getByRole('button', { name: 'Cancelar' }).click();
    await expect(confirm).toBeHidden();
    // Esc is a «no» too.
    await page.getByRole('button', { name: 'Redactar 6 comentarios con IA' }).click();
    await expect(confirm).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(confirm).toBeHidden();
    expect(posts).toEqual([]);
    await expect(page.getByText(/Redactando comentarios/)).toHaveCount(0);
  });

  test('evaluacion-91 si no se puede pedir a la IA, lo dice y el botón sigue ahí', async ({ page, world }) => {
    await page.route('**/api/courses/*/evaluation/1/comments', (r) => r.fulfill({
      status: 503, contentType: 'application/json',
      body: JSON.stringify({ detail: { message: 'La IA no está disponible en este momento.', code: 'ai_unavailable' } }),
    }));
    await openEvaluation(page, world.c.id);
    await page.getByRole('button', { name: 'Redactar 6 comentarios con IA' }).click();
    await confirmDialog(page, 'Redactar 6 comentarios con IA').getByRole('button', { name: 'Redactar' }).click();
    await expect(toast(page, 'La IA no está disponible en este momento.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Redactar 6 comentarios con IA' })).toBeEnabled();
    await expect(page.getByText(/Redactando comentarios/)).toHaveCount(0);
    expect((await world.api.get(`/courses/${world.c.id}/evaluation/1`)).job).toBeNull();
  });

  test('evaluacion-92 un trabajo que falló: lo dice en la página, con «Volver a intentar»', async ({ page, world }) => {
    const posts = await blockDrafts(page);
    await page.route(`**/api/courses/${world.c.id}/evaluation/1`, async (r) => {
      const res = await r.fetch();
      const body = await res.json();
      await r.fulfill({ response: res, json: { ...body, job: { id: 'job-fallido', kind: 'report_comments', status: 'failed', progress: 0, total: 6, error: 'La IA no ha respondido a tiempo.' } } });
    });
    await openEvaluation(page, world.c.id);
    const callout = page.locator('.callout').filter({ hasText: 'No se han podido redactar los comentarios.' });
    await expect(callout).toHaveText('No se han podido redactar los comentarios. La IA no ha respondido a tiempo. Volver a intentar');
    await expect(page.getByRole('button', { name: 'Redactar 6 comentarios con IA' })).toHaveCount(0);
    await callout.getByRole('button', { name: 'Volver a intentar' }).click();
    const confirm = confirmDialog(page, 'Redactar 6 comentarios con IA');
    await expect(confirm.locator('p')).toHaveText(TEXT);
    await confirm.getByRole('button', { name: 'Cancelar' }).click();
    expect(posts).toEqual([]);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('evaluacion-93 un trabajo que ya estaba en marcha: la página sigue su progreso hasta que termina', async ({ page, world }) => {
    let job = { id: 'job-en-marcha', kind: 'report_comments', status: 'running', progress: 2, total: 6, error: null as string | null, result: { term: 1 } };
    let served = false;
    await page.route(`**/api/courses/${world.c.id}/evaluation/1`, async (r) => {
      const res = await r.fetch();
      const body = await res.json();
      await r.fulfill({ response: res, json: { ...body, job: served && job.status === 'done' ? null : job } });
      served = true;
    });
    await page.route('**/api/jobs/job-en-marcha', (r) => r.fulfill({ json: job }));
    await openEvaluation(page, world.c.id);
    const progress = page.locator('.callout').filter({ hasText: 'Redactando comentarios' });
    await expect(progress).toContainText('Redactando comentarios · 2 de 6');
    await expect(progress.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33');
    await expect(progress).toContainText('Van apareciendo en la lista según se terminan. Puedes seguir trabajando.');
    await expect(page.getByRole('button', { name: 'Redactar 6 comentarios con IA' })).toHaveCount(0);
    // The rows can still be opened meanwhile.
    await studentRow(page, NAMES[0]).click();
    await expect(sheetOf(page, NAMES[0])).toBeVisible();
    await page.keyboard.press('Escape');

    job = { ...job, progress: 5 };
    await expect(progress).toContainText('Redactando comentarios · 5 de 6');
    job = { ...job, status: 'done', progress: 6, result: { term: 1, updated: 6, skipped: 0 } as never };
    await expect(progress).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Redactar 6 comentarios con IA' })).toBeVisible();
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });
});

test.describe('la IA deja alumnos sin comentario', () => {
  test.use({ worldSpec: { courses: [BASE] } });

  test('evaluacion-17 si la IA deja alumnos sin comentario, la página lo dice con «Volver a intentar»', async ({ page, world }) => {
    const posts: string[] = [];
    let job = { id: 'job-incompleto', kind: 'report_comments', status: 'running', progress: 0, total: 6, error: null as string | null, result: { term: 1 } as Record<string, number> };
    // The request to draft reaches no AI: the job it answers with ends leaving two students without a comment.
    await page.route('**/api/courses/*/evaluation/1/comments', (r) => { posts.push(r.request().postData() ?? ''); return r.fulfill({ json: { job } }); });
    await page.route('**/api/jobs/job-incompleto', (r) => r.fulfill({ json: job }));
    await openEvaluation(page, world.c.id);
    await page.getByRole('button', { name: 'Redactar 6 comentarios con IA' }).click();
    await confirmDialog(page, 'Redactar 6 comentarios con IA').getByRole('button', { name: 'Redactar' }).click();
    const progress = page.locator('.callout').filter({ hasText: 'Redactando comentarios' });
    await expect(progress).toBeVisible();
    job = { ...job, status: 'done', progress: 6, result: { term: 1, updated: 4, skipped: 0, missing: 2 } };
    await expect(progress).toHaveCount(0);
    const left = page.locator('.callout').filter({ hasText: 'no se han podido redactar' });
    await expect(left).toHaveText('2 comentarios no se han podido redactar. Volver a intentar');
    await expect(page.getByRole('button', { name: /Redactar \d+ comentarios con IA/ })).toHaveCount(0);
    await left.getByRole('button', { name: 'Volver a intentar' }).click();
    await expect(confirmDialog(page, 'Redactar 6 comentarios con IA')).toBeVisible();
    await confirmDialog(page, 'Redactar 6 comentarios con IA').getByRole('button', { name: 'Cancelar' }).click();
    expect(posts).toHaveLength(1);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });
});

test.describe('una evaluación con notas incompletas', () => {
  test.use({ worldSpec: { courses: [DETAILS] } });

  test('evaluacion-94 con notas incompletas, la confirmación avisa de que la IA solo valora lo que ya tiene nota', async ({ page, world }) => {
    const posts = await blockDrafts(page);
    await openEvaluation(page, world.c.id);
    // Marta already has her comment: only the 5 missing ones are drafted.
    await page.getByRole('button', { name: 'Redactar 5 comentarios con IA' }).click();
    const confirm = confirmDialog(page, 'Redactar 5 comentarios con IA');
    await expect(confirm.locator('p')).toHaveText(
      '3 alumnos tienen notas incompletas: la IA solo valora lo que ya tiene nota. La IA redacta un borrador para 5 alumnos con la nota '
      + 'que irá al boletín, las actividades de la evaluación, lo que peor les ha salido, la asistencia y tus observaciones. Solo recibe el nombre de pila.');
    await confirm.getByRole('button', { name: 'Cancelar' }).click();
    expect(posts).toEqual([]);
  });
});
