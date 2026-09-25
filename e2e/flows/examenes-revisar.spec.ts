import {
  answer, correction, dialog, esc, expect, fitsTheScreen, isMobile, openActivity, shot, stepHead, stepRow, test, toast,
  type Api, type Page,
} from './examenes-helpers';

// Revisar (docs/PRODUCT.md §4.3 · 3) on a private copy of the demo's «Examen U2 · Fracciones», whose 24 papers the real
// AI graded when the demo was seeded (18 suggestions to review, 4 of them with the name to confirm): figures, frequent
// errors and «Crear ficha de refuerzo», the class list, and the focus mode student by student (first pending → last,
// accept, points per question, comment, NP, names to confirm or change, «Aceptar todas», keyboard on a computer, the
// whole sheet on a phone). The AI is not called: the drafts are the seeded ones.

interface Grade { status: string; score: number | null; ai_score: number | null; item_scores: Record<string, number> | null; comment?: string | null }
interface Row { student: { id: string; name: string; first_name: string; last_name: string; sort_name: string }; paper_id: string | null;
  match_status: string | null; detected_name: string | null; pages: unknown[]; flags: { code: string }[]; grade: Grade | null;
  missed: { absent: boolean; repeat_id: string | null } | null }
const ATTENTION = ['falta_pagina', 'pagina_duplicada', 'extra_sin_nombre', 'pagina_dudosa', 'nombre_distinto', 'nombre_repetido', 'version_distinta'];
const fmt = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

async function state(api: Api, id: string) {
  const c = await correction(api, id);
  const rows: Row[] = c.students;
  const drafts = rows.filter((s) => s.grade?.status === 'suggested');
  const plain = drafts.filter((s) => s.match_status !== 'suggested' && !s.flags.some((f) => ATTENTION.includes(f.code)));
  return {
    c, rows, drafts, plain,
    toConfirm: drafts.filter((s) => s.match_status === 'suggested'),
    confirmed: rows.filter((s) => s.grade?.status === 'confirmed' && s.paper_id),
    absent: rows.find((s) => s.missed?.absent && !s.paper_id),
    noPaper: rows.find((s) => !s.paper_id && !s.missed),
    by: (sid: string) => rows.find((s) => s.student.id === sid)!,
  };
}
const review = (api: Api, id: string, sid: string) => api.get(`/activities/${id}/review/${sid}`);

const accept = (page: Page) => page.locator('.review-accept');
const who = (page: Page) => page.locator('.review-bar__title strong');
const progress = (page: Page) => page.locator('.review-bar__title .num');
const points = (page: Page, n: string) => page.getByRole('group', { name: `Puntos de la pregunta ${n}` });
async function openReview(page: Page, url: string, sid?: string) {
  await page.goto(`${url}/revisar${sid ? `?alumno=${sid}` : ''}`);
  await expect(who(page)).toBeVisible();
}

test.describe('examenes · revisar', () => {
  test('examenes-43 · the review step: figures (provisional while drafts remain), the class list with what is left for each', async ({ page, cloneExam, demo }, info) => {
    const exam = await cloneExam('fracciones');
    const s = await state(demo, exam.id);
    const { stats } = s.c;
    await openActivity(page, exam.url, exam.title);
    await expect(stepHead(page, 3, 'Revisar')).toBeVisible();
    await expect(page.getByRole('link', { name: `Revisar alumno a alumno · faltan ${stats.pending}` })).toBeVisible();
    const figures = page.locator('.review-stats');
    await expect(figures).toContainText(`${String(Math.round(stats.average * 10) / 10).replace('.', ',')}Media`);
    await expect(figures).toContainText(`${stats.pass_rate} %Aprobados`);
    await expect(figures).toContainText(`${stats.confirmed} / ${stats.matched}Revisados`);
    await expect(page.getByText(`Provisional: incluye ${stats.provisional} notas sin revisar`)).toBeVisible();
    await expect(page.getByText(`${s.drafts.length} borradores de la IA`)).toBeVisible();
    await expect(page.getByText('en gris, hasta que los revises')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: `Clase · ${s.rows.length}` })).toBeVisible();
    const line = (r: Row) => page.getByRole(r.missed ? 'button' : 'link', { name: new RegExp(`^${esc(r.student.sort_name)} `) });
    await expect(line(s.toConfirm[0])).toContainText('Nombre por confirmar');
    await expect(line(s.noPaper!)).toContainText('Sin hoja');
    await expect(line(s.absent!)).toContainText('Faltó');
    const flagged = s.rows.find((r) => r.match_status === 'confirmed' && r.flags.some((f) => ATTENTION.includes(f.code)) && r.grade?.status !== 'confirmed');
    if (flagged) await expect(line(flagged)).toContainText('Revisa las páginas');
    // Drafts in grey, validated grades as a pill.
    await expect(line(s.plain[0]).locator('.draft-score')).toHaveText(fmt(s.plain[0].grade!.ai_score ?? s.plain[0].grade!.score!));
    await expect(line(s.confirmed[0]).locator('.draft-score')).toHaveCount(0);
    if (isMobile(info)) await fitsTheScreen(page);
    await shot(page, info, '43-review-step');
    // Collapsed.
    await stepRow(page, 1, 'Preparar').click();
    await expect(stepRow(page, 3, 'Revisar')).toContainText(`${stats.suggested} por revisar · ${stats.confirmed + (s.rows.filter((r) => r.grade?.status === 'absent').length)} revisados`);
    // «Faltó» opens the sheet to put NP or schedule a repeat exam.
    await stepRow(page, 3, 'Revisar').click();
    await line(s.absent!).click();
    await expect(dialog(page, `Sin hoja en ${exam.title}`)).toBeVisible();
  });

  test('examenes-44 · «Errores frecuentes»: each row unfolds who; «Crear ficha de refuerzo» opens «Crear con IA» in the exam\'s unit with those questions', async ({ page, cloneExam, demo }, info) => {
    const exam = await cloneExam('fracciones');
    const { c, by } = await state(demo, exam.id);
    const errors = c.stats.frequent_errors;
    expect(errors.length).toBeGreaterThan(0);
    await openActivity(page, exam.url, exam.title);
    const e = errors[0];
    const row = page.getByRole('button', { name: new RegExp(`^P${e.label} · `) });
    const avg = String(Math.round(e.avg_points * 10) / 10).replace('.', ',');
    await expect(row).toContainText(`${avg} de ${fmt(e.points)} de media · ${e.below_half} por debajo de la mitad`);
    await expect(row).toHaveAttribute('aria-expanded', 'false');
    await row.click();
    await expect(row).toHaveAttribute('aria-expanded', 'true');
    const first = by(e.below_half_ids[0]).student;
    await expect(row).toContainText(`${first.first_name} ${first.last_name.split(' ')[0]}`);
    await shot(page, info, '44-errors');
    const labels = errors.map((x: { label: string }) => `P${x.label}`);
    const list = labels.length > 1 ? `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}` : labels[0];
    await page.getByRole('link', { name: `Crear ficha de refuerzo con ${list}` }).click();
    await expect(page).toHaveURL(/\/unidades\/[^/?]+\?crear=ficha&indicaciones=/);
    const sheet = dialog(page, 'Crear con IA');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Ficha', exact: true })).toHaveClass(/kind-row--on/);
    await expect(sheet.getByLabel('Indicaciones (opcional)')).toHaveValue(new RegExp(`^Refuerzo de lo que peor salió en «${esc(exam.title)}»: ${esc(e.title)}`));
    await expect(sheet.getByRole('button', { name: 'Refuerzo', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  test('examenes-45 · «Revisar alumno a alumno» opens the first pending student; leaving goes back to the exam and says what was saved', async ({ page, cloneExam, demo }, info) => {
    const exam = await cloneExam('fracciones');
    const s = await state(demo, exam.id);
    const first = s.by(s.c.next_pending_id);
    const r = await review(demo, exam.id, first.student.id);
    await openActivity(page, exam.url, exam.title);
    await page.getByRole('link', { name: /^Revisar alumno a alumno/ }).click();
    await expect(page).toHaveURL(new RegExp(`/revisar\\?alumno=${first.student.id}$`));
    await expect(who(page)).toHaveText(first.student.name);
    await expect(progress(page)).toHaveText(`${r.position} de ${r.total} · faltan ${r.pending}`);
    const back = page.getByRole('button', { name: `Volver a ${exam.title}` });
    await expect(back).toHaveText(isMobile(info) ? 'Examen' : exam.title);
    await expect(page).toHaveTitle(`${first.student.name} · Revisar · Sepia`);
    await shot(page, info, '45-focus-first');
    await back.click();
    await expect(toast(page, `Revisión guardada · ${r.total - r.pending} de ${r.total}`)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/actividades/${exam.id}$`));
    await expect(stepHead(page, 3, 'Revisar')).toBeVisible();
  });

  test('examenes-46 · «Aceptar y siguiente» passes the AI\'s points to the Cuaderno and moves on to the next pending student', async ({ page, cloneExam, demo }) => {
    const exam = await cloneExam('fracciones');
    const s = await state(demo, exam.id);
    const one = s.plain[0];
    const r = await review(demo, exam.id, one.student.id);
    await openReview(page, exam.url, one.student.id);
    await expect(page.getByText('Borrador IA').first()).toBeVisible();
    await expect(page.locator('.review-summary')).toContainText(r.ai.summary.slice(0, 20));
    await expect(page.locator('.review-total__value')).toHaveText(fmt(r.ai.items.reduce((a: number, i: { points: number }) => a + i.points, 0)));
    await expect(accept(page)).toHaveText('Aceptar y siguiente');
    await accept(page).click();
    await expect(who(page)).toHaveText(s.by(r.next_pending_id).student.name);
    const g = (await state(demo, exam.id)).by(one.student.id).grade!;
    expect(g.status).toBe('confirmed');
    expect(g.score).toBe(one.grade!.score);
    expect(g.item_scores).toEqual(Object.fromEntries(r.ai.items.map((i: { id: string; points: number }) => [i.id, i.points])));
    // In the Cuaderno, at once.
    const gb = await demo.get(`/courses/${exam.courseId}/gradebook?term=1`);
    const cell = gb.students.find((x: { student: { id: string } }) => x.student.id === one.student.id).grades[exam.id];
    expect([cell.status, cell.score]).toEqual(['confirmed', one.grade!.score]);
  });

  test('examenes-47 · changing a question\'s points shows what the AI said («IA: …») and the new total; the grade is the sum', async ({ page, cloneExam, demo }, info) => {
    const exam = await cloneExam('fracciones');
    const s = await state(demo, exam.id);
    const one = s.plain.find((x) => (x.grade?.score ?? 0) >= 1)!;
    const r = await review(demo, exam.id, one.student.id);
    const item = r.ai.items.find((i: { points: number }) => i.points >= 0.5);
    await openReview(page, exam.url, one.student.id);
    const q = points(page, item.id);
    await expect(q.getByRole('status')).toHaveText(fmt(item.points));
    await q.getByRole('button', { name: 'Menos' }).click();
    await q.getByRole('button', { name: 'Menos' }).click();
    await expect(q.getByRole('status')).toHaveText(fmt(item.points - 0.5));
    const was = page.locator('.ritem').filter({ has: q }).locator('.ritem__was');
    await expect(was).toHaveText(`IA: ${fmt(item.points)}`);
    const sum = r.ai.items.reduce((a: number, i: { points: number }) => a + i.points, 0) - 0.5;
    await expect(page.locator('.review-total__value')).toHaveText(fmt(sum));
    await shot(page, info, '47-points');
    await accept(page).click();
    await expect(who(page)).not.toHaveText(one.student.name);
    const g = (await state(demo, exam.id)).by(one.student.id).grade!;
    expect(g.item_scores![item.id]).toBe(item.points - 0.5);
    expect(g.score).toBeCloseTo(sum * 10 / r.rubric_total, 2);
    // Back on that student: «Revisado», with the teacher's points.
    await openReview(page, exam.url, one.student.id);
    await expect(page.locator('.review-total')).toContainText('Revisado');
    await expect(points(page, item.id).getByRole('status')).toHaveText(fmt(item.points - 0.5));
  });

  test('examenes-48 · a comment goes with the grade and shows in the student\'s file', async ({ page, cloneExam, demo }, info) => {
    const exam = await cloneExam('fracciones');
    const s = await state(demo, exam.id);
    const one = s.plain[1];
    await openReview(page, exam.url, one.student.id);
    await page.getByLabel('Comentario (opcional)').fill('Repasa la división de fracciones: invierte la segunda.');
    await accept(page).click();
    await expect(who(page)).not.toHaveText(one.student.name);
    expect((await state(demo, exam.id)).by(one.student.id).grade!.comment).toBe('Repasa la división de fracciones: invierte la segunda.');
    await page.goto(`/alumnos/${one.student.id}`);
    const more = page.getByRole('button', { name: /^Ver \d+ notas$/ });
    if (isMobile(info)) await more.click();
    await expect(page.locator('.row').filter({ hasText: exam.title }).getByText('«Repasa la división de fracciones: invierte la segunda.»')).toBeVisible();
  });

  test('examenes-49 · «Marcar NP» (menu) asks first, saying the scanned pages will not be graded; then the next student', async ({ page, cloneExam, demo }) => {
    const exam = await cloneExam('fracciones');
    const s = await state(demo, exam.id);
    const one = s.plain[2];
    await openReview(page, exam.url, one.student.id);
    await page.getByRole('button', { name: 'Más acciones' }).click();
    await page.getByRole('menuitem', { name: 'Marcar NP' }).click();
    const ask = dialog(page, `Marcar NP a ${one.student.first_name}`);
    await expect(ask.getByText(`Tiene ${one.pages.length} páginas escaneadas que no se corregirán. El NP no cuenta en la media.`)).toBeVisible();
    await answer(page, `Marcar NP a ${one.student.first_name}`, 'Marcar NP');
    await expect(toast(page, `${one.student.first_name}: NP`)).toBeVisible();
    await expect(who(page)).not.toHaveText(one.student.name);
    expect((await state(demo, exam.id)).by(one.student.id).grade!.status).toBe('absent');
    await openReview(page, exam.url, one.student.id);
    await expect(page.locator('.review-total')).toContainText('Marcado NP');
    await page.getByRole('button', { name: 'Más acciones' }).click();
    await expect(page.getByRole('menuitem', { name: /^Marcar NP/ })).toHaveCount(0);
  });

  test('examenes-50 · a name to confirm blocks the grade and NP until «Es correcto»', async ({ page, cloneExam, demo }, info) => {
    const exam = await cloneExam('fracciones');
    const s = await state(demo, exam.id);
    const one = s.toConfirm[0];
    await openReview(page, exam.url, one.student.id);
    await expect(page.getByText(`Nombre por confirmar: se lee «${one.detected_name}»`)).toBeVisible();
    await expect(accept(page)).toHaveText('Confirma el nombre');
    await expect(accept(page)).toBeDisabled();
    await page.getByRole('button', { name: 'Más acciones' }).click();
    await expect(page.getByRole('menuitem', { name: /^Marcar NP/ })).toBeDisabled();
    await expect(page.getByRole('menuitem', { name: /^Marcar NP/ })).toContainText('Confirma antes el nombre');
    await page.keyboard.press('Escape');
    if (!isMobile(info)) { // Enter does not accept either
      await who(page).click();
      await page.keyboard.press('Enter');
      await expect(who(page)).toHaveText(one.student.name);
    }
    await shot(page, info, '50-name-to-confirm');
    await page.getByRole('button', { name: 'Es correcto' }).click();
    await expect(toast(page, 'Nombre confirmado')).toBeVisible();
    await expect(page.getByText(/^Nombre por confirmar/)).toHaveCount(0);
    await expect(accept(page)).toHaveText('Aceptar y siguiente');
    await expect(accept(page)).toBeEnabled();
    expect((await state(demo, exam.id)).by(one.student.id).match_status).toBe('confirmed');
  });

  test('examenes-51 · «Cambiar» a name to a student without a paper: the paper and the AI\'s grading go to them', async ({ page, cloneExam, demo }) => {
    const exam = await cloneExam('fracciones');
    const s = await state(demo, exam.id);
    const one = s.toConfirm[0];
    const to = s.noPaper!;
    await openReview(page, exam.url, one.student.id);
    await page.getByRole('button', { name: 'Cambiar' }).click();
    const picker = dialog(page, '¿De quién es esta hoja?');
    await expect(picker.getByText(`Se lee «${one.detected_name}».`)).toBeVisible();
    await expect(picker.getByRole('button', { name: one.student.sort_name })).toHaveCount(0); // not the same student
    await picker.getByRole('button', { name: to.student.sort_name }).click();
    await expect(toast(page, `Hoja asignada a ${to.student.name}`)).toBeVisible();
    await expect(who(page)).toHaveText(to.student.name);
    await expect(page).toHaveURL(new RegExp(`alumno=${to.student.id}`));
    await expect(accept(page)).toHaveText(/^Aceptar y /);
    const after = await state(demo, exam.id);
    expect([after.by(one.student.id).paper_id, after.by(to.student.id).paper_id]).toEqual([null, one.paper_id]);
    expect(after.by(to.student.id).grade).toMatchObject({ status: 'suggested', score: one.grade!.score });
  });

  test('examenes-52 · «Cambiar» to a student already reviewed joins the papers; the warnings lead to «Ordenar páginas»', async ({ page, cloneExam, demo }, info) => {
    const exam = await cloneExam('fracciones');
    const s = await state(demo, exam.id);
    const one = s.toConfirm[0];
    const to = s.confirmed.find((x) => x.flags.length === 0)!;
    await openReview(page, exam.url, one.student.id);
    await page.getByRole('button', { name: 'Cambiar' }).click();
    await dialog(page, '¿De quién es esta hoja?').getByRole('button', { name: to.student.sort_name }).click();
    await expect(toast(page, `Hoja unida a la de ${to.student.name}. Ordena sus páginas.`)).toBeVisible();
    await expect(who(page)).toHaveText(to.student.name);
    const warn = page.locator('.callout').filter({ hasText: 'Ordenar páginas' });
    await expect(warn).toContainText(/repetidas|Páginas nuevas tras la nota/);
    await shot(page, info, '52-joined');
    await warn.getByRole('link', { name: 'Ordenar páginas' }).click();
    await expect(page).toHaveURL(new RegExp(`/actividades/${exam.id}\\?paso=recoger$`));
    await expect(stepHead(page, 2, 'Recoger')).toBeVisible();
    const after = await state(demo, exam.id);
    expect(after.by(to.student.id).pages.length).toBe(to.pages.length + one.pages.length);
    expect(after.by(to.student.id).grade!.status).toBe('confirmed'); // a confirmed grade is never touched
  });

  test('examenes-53 · the last pending student: «Aceptar y terminar» goes back to the exam, everyone reviewed', async ({ page, cloneExam, demo }, info) => {
    const exam = await cloneExam('fracciones');
    const s = await state(demo, exam.id);
    for (const r of s.toConfirm) await demo.patch(`/papers/${r.paper_id}`, { student_id: r.student.id }); // names confirmed
    await demo.post(`/activities/${exam.id}/accept-all`);
    const last = s.plain[0];
    await demo.put(`/activities/${exam.id}/grades`, { grades: [{ student_id: last.student.id, score: last.grade!.score, status: 'suggested' }] });
    const r = await review(demo, exam.id, last.student.id);
    await openActivity(page, exam.url, exam.title);
    await page.getByRole('link', { name: 'Revisar alumno a alumno · faltan 1' }).click();
    await expect(who(page)).toHaveText(last.student.name);
    await expect(progress(page)).toHaveText(`${r.position} de ${r.total} · faltan 1`);
    await expect(accept(page)).toHaveText('Aceptar y terminar');
    await accept(page).click();
    await expect(toast(page, `${r.total} de ${r.total} revisados`)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/actividades/${exam.id}$`));
    await expect(page.getByText('Todas las hojas están revisadas.')).toBeVisible();
    await expect(page.getByRole('link', { name: /^Revisar alumno a alumno/ })).toHaveCount(0);
    await expect(page.getByText(/Provisional: incluye/)).toHaveCount(0);
    await shot(page, info, '53-all-reviewed');
    expect((await correction(demo, exam.id)).stats.pending).toBe(0);
  });

  test('examenes-54 · «Aceptar todas las sugerencias» (step menu) leaves out the names to confirm and says so', async ({ page, cloneExam, demo }) => {
    const exam = await cloneExam('fracciones');
    const s = await state(demo, exam.id);
    const ready = s.drafts.length - s.toConfirm.length;
    const held = s.toConfirm.length;
    await openActivity(page, exam.url, exam.title);
    await stepHead(page, 3, 'Revisar').locator('..').getByRole('button', { name: 'Más acciones' }).click();
    await page.getByRole('menuitem', { name: 'Aceptar todas las sugerencias' }).click();
    const ask = dialog(page, `Aceptar ${ready} sugerencias`);
    await expect(ask.getByText(`Las notas de la IA pasan al cuaderno tal cual. Podrás cambiarlas después alumno a alumno. Quedan fuera ${held} hojas con el nombre por confirmar.`)).toBeVisible();
    await answer(page, `Aceptar ${ready} sugerencias`, 'Aceptar todas');
    await expect(toast(page, `${ready} notas pasadas al cuaderno · quedan ${held} hojas con el nombre por confirmar`)).toBeVisible();
    await expect(page.getByRole('link', { name: `Revisar alumno a alumno · faltan ${held}` })).toBeVisible();
    const after = await state(demo, exam.id);
    expect([after.drafts.length, after.toConfirm.length]).toEqual([held, held]);

    // Only names to confirm left: it says what to do instead.
    await stepHead(page, 3, 'Revisar').locator('..').getByRole('button', { name: 'Más acciones' }).click();
    await page.getByRole('menuitem', { name: 'Aceptar todas las sugerencias' }).click();
    await expect(toast(page, `Confirma antes ${held} nombres: son hojas con el nombre por confirmar.`)).toBeVisible();
  });

  test('examenes-55 · a student marked absent that day: only NP here (or a repeat exam from the exam page)', async ({ page, cloneExam, demo }) => {
    const exam = await cloneExam('fracciones');
    const s = await state(demo, exam.id);
    const hugo = s.absent!;
    await openReview(page, exam.url, hugo.student.id);
    await expect(page.getByText('Faltó a este examen. Ponle NP o prográmale una repesca desde el examen.')).toBeVisible();
    await expect(page.getByRole('group', { name: /^Puntos de la pregunta/ })).toHaveCount(0);
    await expect(page.getByLabel('Comentario (opcional)')).toHaveCount(0);
    await expect(accept(page)).toHaveText('Marcar NP');
    await accept(page).click();
    const ask = dialog(page, `Marcar NP a ${hugo.student.first_name}`);
    await expect(ask.getByText('El NP no cuenta en la media. Puedes cambiarlo después.')).toBeVisible();
    await answer(page, `Marcar NP a ${hugo.student.first_name}`, 'Marcar NP');
    await expect(toast(page, `${hugo.student.first_name}: NP`)).toBeVisible();
    expect((await state(demo, exam.id)).by(hugo.student.id).grade!.status).toBe('absent');
  });

  test('examenes-56 · a student without a paper is graded from the paper exam: «Poner 0 y siguiente» until a point is given', async ({ page, cloneExam, demo }) => {
    const exam = await cloneExam('fracciones');
    const s = await state(demo, exam.id);
    const carmen = s.noPaper!;
    await openReview(page, exam.url, carmen.student.id);
    await expect(page.getByText('Sin hojas escaneadas. Corrige con el examen en papel.').first()).toBeVisible();
    await expect(accept(page)).toHaveText(/^Poner 0 y (siguiente|terminar)$/);
    await points(page, '1').getByRole('button', { name: 'Más' }).click();
    await points(page, '1').getByRole('button', { name: 'Más' }).click();
    await points(page, '4').getByRole('button', { name: 'Más' }).click();
    await expect(page.locator('.review-total__value')).toHaveText('0,75');
    await expect(accept(page)).toHaveText(/^Aceptar y (siguiente|terminar)$/);
    await accept(page).click();
    await expect.poll(async () => (await state(demo, exam.id)).by(carmen.student.id).grade).toMatchObject({ status: 'confirmed', score: 0.75 });
  });

  test('examenes-57 · the whole sheet and the solution: «Ver hoja» on a phone, the sheet beside the questions on a computer', async ({ page, cloneExam, demo }, info) => {
    const exam = await cloneExam('fracciones');
    const s = await state(demo, exam.id);
    const one = s.plain[0];
    const r = await review(demo, exam.id, one.student.id);
    await openReview(page, exam.url, one.student.id);
    // A statement opens in full; the solution unfolds under the question.
    const text = page.locator('.ritem__text').first();
    await expect(text).toHaveAttribute('aria-expanded', 'false');
    await text.click();
    await expect(text).toHaveAttribute('aria-expanded', 'true');
    const item = page.locator('.ritem').first();
    await item.getByRole('button', { name: 'Solución' }).click();
    await expect(item.locator('.ritem__answer')).toBeVisible();
    await item.getByRole('button', { name: 'Ocultar solución' }).click();
    await expect(item.locator('.ritem__answer')).toHaveCount(0);
    if (isMobile(info)) {
      await fitsTheScreen(page);
      await page.getByRole('button', { name: 'Ver hoja' }).first().click();
      const viewer = page.getByRole('dialog', { name: `Hoja de ${one.student.name}` });
      await expect(viewer.getByText(`${one.student.name} · Pág. 1 de 2`)).toBeVisible();
      await expect(viewer.getByText(`1 / ${r.pages.length}`)).toBeVisible();
      await viewer.getByRole('button', { name: 'Cerrar' }).click();
      // Each answer's crop opens its page.
      await page.getByRole('button', { name: /^Respuesta a la pregunta \d+ · Pág\. 2 de 2$/ }).first().click();
      await expect(page.getByRole('dialog', { name: `Hoja de ${one.student.name}` }).getByText(`${one.student.name} · Pág. 2 de 2`)).toBeVisible();
      await page.keyboard.press('Escape');
    } else {
      const sheet = page.getByRole('region', { name: 'Hoja escaneada' });
      await expect(sheet.getByRole('img', { name: 'Pág. 1 de 2' })).toBeVisible();
      await expect(sheet.getByRole('button', { name: 'Ir a pág. 2 de 2' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Ver hoja' })).toHaveCount(0);
      // The question in focus is framed on the sheet.
      await page.locator('.ritem').nth(1).click();
      await expect(page.locator('.ritem').nth(1)).toHaveClass(/ritem--focus/);
      await expect(sheet.locator('.review-page__band')).toBeVisible();
      await sheet.getByRole('img', { name: 'Pág. 1 de 2' }).click();
      await expect(page.getByRole('dialog', { name: `Hoja de ${one.student.name}` })).toBeVisible();
      await page.keyboard.press('Escape');
    }
    await shot(page, info, '57-sheet');
  });

  test('examenes-58 · moving between students without accepting: arrows and the keyboard on a computer, the bottom bar on a phone', async ({ page, cloneExam, demo }, info) => {
    const exam = await cloneExam('fracciones');
    const s = await state(demo, exam.id);
    const one = s.plain[0];
    const r = await review(demo, exam.id, one.student.id);
    const next = s.by(r.next_student_id).student.name;
    const prev = s.by(r.prev_student_id).student.name;
    await openReview(page, exam.url, one.student.id);
    if (isMobile(info)) {
      await page.getByRole('button', { name: 'Alumno siguiente, sin aceptar' }).click();
      await expect(who(page)).toHaveText(next);
      await page.getByRole('button', { name: 'Alumno anterior' }).click();
      await page.getByRole('button', { name: 'Alumno anterior' }).click();
      await expect(who(page)).toHaveText(prev);
    } else {
      await page.getByRole('button', { name: 'Alumno siguiente' }).click();
      await expect(who(page)).toHaveText(next);
      await page.getByRole('button', { name: 'Alumno anterior' }).click();
      await expect(who(page)).toHaveText(one.student.name);
      await who(page).click();
      await page.keyboard.press('ArrowLeft');
      await expect(who(page)).toHaveText(prev);
      await page.keyboard.press('ArrowRight');
      await expect(who(page)).toHaveText(one.student.name);
      // Enter accepts (from the comment field too), never while on a button.
      await page.locator('.ritem__controls').first().getByRole('button', { name: 'Solución' }).focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('.ritem__answer').first()).toBeVisible();
      await expect(who(page)).toHaveText(one.student.name);
      await page.getByLabel('Comentario (opcional)').fill('Bien planteado.');
      await page.getByLabel('Comentario (opcional)').press('Enter');
      await expect(who(page)).not.toHaveText(one.student.name);
      await expect.poll(async () => (await state(demo, exam.id)).by(one.student.id).grade).toMatchObject({ status: 'confirmed', comment: 'Bien planteado.' });
    }
    expect((await state(demo, exam.id)).by(s.by(r.next_student_id).student.id).grade?.status).toBe(s.by(r.next_student_id).grade?.status);
  });

  test('examenes-59 · from the class list to one student and back: the exam at the same row; history back never reopens the review', async ({ page, cloneExam, demo }) => {
    const exam = await cloneExam('fracciones');
    const s = await state(demo, exam.id);
    await page.goto(`/clases/${exam.courseId}/cuaderno`);
    await page.goto(exam.url);
    const link = page.getByRole('link', { name: new RegExp(`^${esc(s.rows[s.rows.length - 1].student.sort_name)} `) });
    await link.scrollIntoViewIfNeeded();
    const y = await page.evaluate(() => window.scrollY);
    expect(y).toBeGreaterThan(200);
    await link.click();
    await expect(who(page)).toHaveText(s.rows[s.rows.length - 1].student.name);
    await page.getByRole('button', { name: `Volver a ${exam.title}` }).click();
    await expect(page).toHaveURL(new RegExp(`/actividades/${exam.id}$`));
    // Back on the same row of the list.
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(y - 60);
    await expect(link).toBeInViewport();
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/clases/${exam.courseId}/cuaderno$`));
  });

  test('examenes-60 · «Ordenar páginas» (menu) opens Recoger; a review that cannot open leads back to the exam', async ({ page, cloneExam, demo }) => {
    const exam = await cloneExam('fracciones');
    const s = await state(demo, exam.id);
    await openReview(page, exam.url, s.plain[0].student.id);
    await page.getByRole('button', { name: 'Más acciones' }).click();
    await page.getByRole('menuitem', { name: 'Ordenar páginas' }).click();
    await expect(page).toHaveURL(new RegExp(`/actividades/${exam.id}\\?paso=recoger$`));
    await expect(stepHead(page, 2, 'Recoger')).toBeVisible();

    await page.goto(`${exam.url}/revisar?alumno=00000000-0000-0000-0000-000000000000`);
    await expect(page.getByText('No se ha podido abrir la revisión')).toBeVisible();
    await page.getByRole('button', { name: 'Volver al examen' }).click();
    await expect(page).toHaveURL(new RegExp(`/actividades/${exam.id}$`));
  });
});

test.describe('examenes · revisar sin rúbrica', () => {
  test.use({ worldSpec: { activities: [{ title: 'Examen oral · Fracciones', date: '2026-11-17' }] } });

  test('examenes-61 · an exam without questions is graded with one mark in the focus mode; empty, it says what to type', async ({ page, world }) => {
    const id = world.act['Examen oral · Fracciones'];
    const [marta] = world.students;
    await page.goto(`/clases/${world.id}/actividades/${id}/revisar?alumno=${marta.id}`);
    await expect(who(page)).toHaveText(marta.name);
    const mark = page.getByLabel('Nota sobre 10');
    await expect(mark).toBeVisible();
    await accept(page).click();
    await expect(toast(page, 'Escribe la nota (0 a 10).')).toBeVisible();
    await mark.fill('7,5');
    await accept(page).click();
    await expect(who(page)).not.toHaveText(marta.name);
    const a = await world.api.get(`/activities/${id}`);
    expect(a.sheet[0]).toMatchObject({ score: 7.5, status: 'confirmed' });
  });
});

