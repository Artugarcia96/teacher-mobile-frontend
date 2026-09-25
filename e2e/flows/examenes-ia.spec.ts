import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AI_STEP, answer, correction, dialog, esc, expect, openActivity, opensPdf, pdfText, python, shot, stepHead, test, toast,
  type Api, type Page,
} from './examenes-helpers';

// The exam flows that call the real AI (claude_cli in development, the same prompts and schemas as production), tagged
// @ai: `npx playwright test e2e/flows/examenes --grep @ai`. Each AI step waits up to AI_STEP (4 min) on the job the
// page follows (its progress line, then its toast). The scanned piles are built like the demo's seed, with the
// backend's app/services/handwriting.py: the real printed exam and each student's handwriting (answers written by a
// real model, with typical mistakes), blank backs, extra sheets, a page of another exam.

const jobLine = (page: Page) => page.locator('.job-line');
const TIMEOUT = 10 * 60_000;

/** A pile of scanned papers for an exam (handwriting.py, real AI for the answers) → the PDF's path. */
function scannedPile(activityId: string, students: number, named = false): string {
  const out = join(mkdtempSync(join(tmpdir(), 'sepia-pila-')), 'pila.pdf');
  python(['-m', 'app.services.handwriting', '--activity', activityId, '--students', String(students), '--out', out,
    ...(named ? ['--named'] : [])], 6 * 60_000);
  return out;
}

async function waitJobs(api: Api, id: string) {
  await expect.poll(async () => (await correction(api, id)).job?.status ?? 'none', { timeout: AI_STEP })
    .not.toMatch(/^(queued|running)$/);
}

test.describe('examenes · con IA real @ai', () => {
  test.describe.configure({ timeout: TIMEOUT });

  test.describe('examen de un profesor nuevo', () => {
    test.use({
      worldSpec: {
        units: [{ title: 'Números enteros', status: 'done' }, { title: 'Fracciones', status: 'current' }],
        activities: [{ title: 'Examen U2 · Fracciones', date: '2026-11-26' }, { title: 'Examen de repaso', date: '2026-11-26' }],
      },
    });

    test('examenes-70 @ai · «Generar con IA»: progress while it writes, then the rubric and the PDF to print, in Preparar', async ({ page, world }, info) => {
      const id = world.act['Examen U2 · Fracciones'];
      await openActivity(page, `/clases/${world.id}/actividades/${id}?generar=1`, 'Examen U2 · Fracciones');
      const sheet = dialog(page, 'Generar examen con IA');
      const n = sheet.getByRole('group', { name: 'Número de preguntas' });
      await n.getByRole('button', { name: 'Menos' }).click();
      await n.getByRole('button', { name: 'Menos' }).click();
      await sheet.getByRole('group', { name: 'Dificultad' }).getByRole('button', { name: 'Fácil' }).click();
      await sheet.getByLabel('Indicaciones (opcional)').fill('Sin calculadora; incluye un problema de recetas de cocina.');
      await sheet.getByRole('button', { name: 'Generar examen' }).click();
      await expect(sheet).toBeHidden();
      await expect(jobLine(page)).toBeVisible();
      await shot(page, info, '70-generating');
      await expect(toast(page, 'Examen generado. Revisa las preguntas antes de imprimir.')).toBeVisible({ timeout: AI_STEP });
      await expect(stepHead(page, 1, 'Preparar')).toBeVisible(); // stays open to review the questions
      await expect(page.getByRole('heading', { level: 2, name: 'Rúbrica · 4 preguntas' })).toBeVisible();
      await expect(page.getByText('Total 10 / 10')).toBeVisible();
      const c = await correction(world.api, id);
      expect(c.generated).toBe(true);
      expect(c.rubric.items).toHaveLength(4);
      expect(c.rubric.items.map((i: { label: string }) => i.label)).toEqual(['1', '2', '3', '4']);
      expect(c.rubric.items.every((i: { answer: string; points: number }) => i.answer && i.points > 0 && (i.points * 4) % 1 === 0)).toBe(true);
      await expect(page.getByRole('button', { name: new RegExp(`^Examen para imprimir .*cada página lleva la marca ${esc(c.exam_code)}`) })).toBeVisible();
      const pdf = await opensPdf(page, () => page.getByRole('button', { name: /^Examen para imprimir/ }).click());
      const text = pdfText(pdf.body).join('\n');
      expect(text).toContain('Nombre y apellidos');
      expect(text).toMatch(new RegExp(`Sepia · ${esc(c.exam_code)} · Pág\\. 1/`));
      expect((await world.api.get(`/activities/${id}`)).unit_ids).toEqual([world.units[1].id]);
      await shot(page, info, '70-generated');
    });

    test('examenes-71 @ai · «Subir mi examen» (the teacher\'s own PDF): the AI reads questions, points and solutions; printing stamps the marker', async ({ page, world, browser }, info) => {
      const id = world.act['Examen de repaso'];
      const maker = await browser.newPage();
      await maker.setContent(`<html><body style="font-family: serif; margin: 40px">
        <h2>IES Río Tajo · Matemáticas 2.º ESO · Examen de repaso</h2>
        <p>Nombre y apellidos: ______________________________________</p>
        <p><b>1.</b> (3 puntos) Simplifica la fracción 18/24 hasta hacerla irreducible.</p><div style="height: 120px"></div>
        <p><b>2.</b> (3 puntos) Calcula 2/3 + 1/4 y simplifica el resultado.</p><div style="height: 120px"></div>
        <p><b>3.</b> (4 puntos) Un depósito de 600 litros está lleno en sus 3/4 partes. ¿Cuántos litros contiene?</p>
      </body></html>`);
      const pdf = await maker.pdf({ format: 'A4' });
      await maker.close();
      const file = join(mkdtempSync(join(tmpdir(), 'sepia-examen-')), 'mi-examen.pdf');
      writeFileSync(file, pdf);

      await openActivity(page, `/clases/${world.id}/actividades/${id}`, 'Examen de repaso');
      const chooser = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: /^Subir mi examen/ }).click();
      await (await chooser).setFiles(file);
      await expect(jobLine(page)).toBeVisible();
      await expect(toast(page, 'Preguntas leídas. Revisa puntos y soluciones antes de imprimir.')).toBeVisible({ timeout: AI_STEP });
      await expect(page.getByRole('heading', { level: 2, name: 'Rúbrica · 3 preguntas' })).toBeVisible();
      const c = await correction(world.api, id);
      expect(c.generated).toBe(false);
      expect(c.rubric.items.map((i: { points: number }) => i.points)).toEqual([3, 3, 4]);
      expect(c.rubric.items[2].answer).toMatch(/450/);
      await shot(page, info, '71-uploaded');
      // Its own questions are saved as the rubric (no PDF to lay out again).
      await page.getByRole('group', { name: 'Puntos de la pregunta 3' }).getByRole('button', { name: 'Más' }).click();
      await page.getByRole('group', { name: 'Puntos de la pregunta 3' }).getByRole('button', { name: 'Menos' }).click();
      await expect(page.getByRole('button', { name: /^Guardar y actualizar el PDF$/ })).toHaveCount(0);
      // Printing it stamps «Sepia · CODE · Pág. 1/1» on a copy; the original is kept as it was.
      const printed = await opensPdf(page, () => page.getByRole('button', { name: /^Examen para imprimir/ }).click());
      expect(pdfText(printed.body)[0]).toMatch(new RegExp(`Sepia · ${esc(c.exam_code)} · Pág\\. 1/1`));
      const original = await world.api.file(c.document_url);
      expect(pdfText(await original.body())[0]).not.toContain('Sepia ·');
    });
  });

  test('examenes-72 @ai · «Añadir modelo B»: the AI writes a parallel exam, A, B, A, B… by list; «Rehacer» writes it again', async ({ page, cloneExam, demo }, info) => {
    const exam = await cloneExam('global', { noVersions: true });
    await openActivity(page, exam.url, exam.title);
    await page.getByRole('button', { name: /^Añadir modelo B/ }).click();
    await expect(jobLine(page)).toBeVisible();
    await shot(page, info, '72-writing-b');
    await expect(toast(page, 'Versiones preparadas. Revísalas antes de imprimir.')).toBeVisible({ timeout: AI_STEP });
    const row = page.getByRole('button', { name: /^Modelo B / });
    await expect(row).toContainText('Borrador IA');
    const vs = await demo.get(`/activities/${exam.id}/versions`);
    const b = vs.versions.find((v: { key: string }) => v.key === 'B');
    expect([b.status, b.items, b.draft]).toEqual(['ready', 6, true]);
    const c = await correction(demo, exam.id);
    const byList = c.students.map((s: { student: { id: string } }) => s.student.id);
    expect(b.student_ids).toEqual(byList.filter((_: string, k: number) => k % 2 === 1)); // A, B, A, B… by list order
    const bDetail = await demo.get(`/activities/${exam.id}/versions/B`);
    expect(bDetail.rubric.items.map((i: { points: number }) => i.points)).toEqual(c.rubric.items.map((i: { points: number }) => i.points));
    expect(bDetail.rubric.items.map((i: { text: string }) => i.text)).not.toEqual(c.rubric.items.map((i: { text: string }) => i.text));

    await row.click();
    const sheet = dialog(page, 'Modelo B');
    await sheet.getByRole('button', { name: 'Rehacer' }).click();
    const ask = dialog(page, 'Rehacer «Modelo B»');
    await expect(ask.getByText('La IA vuelve a escribir esta versión a partir del modelo A. Se pierden los cambios que le hayas hecho.')).toBeVisible();
    await answer(page, 'Rehacer «Modelo B»', 'Rehacer');
    await expect(sheet).toBeHidden();
    await expect(jobLine(page)).toBeVisible();
    await expect(toast(page, 'Versiones preparadas. Revísalas antes de imprimir.')).toBeVisible({ timeout: AI_STEP });
    const again = await demo.get(`/activities/${exam.id}/versions/B`);
    expect(again.rubric.items).toHaveLength(6);
    expect(again.student_ids).toEqual(b.student_ids); // its students stay
  });

  test('examenes-73 @ai · «Preparar versiones adaptadas»: por pasos and ACS written by the AI for whoever lacks theirs', async ({ page, cloneExam, demo }, info) => {
    const exam = await cloneExam('global');
    await demo.del(`/activities/${exam.id}/versions/P`);
    await demo.del(`/activities/${exam.id}/versions/C`);
    await openActivity(page, exam.url, exam.title);
    await expect(page.getByText(/^Sofía y Nerea aún no tienen la versión que piden sus medidas\.$/)).toBeVisible();
    await page.getByRole('button', { name: 'Preparar versiones adaptadas' }).click();
    await expect(jobLine(page)).toBeVisible();
    // Each version shows up at once as «Escribiendo…»; printing waits for them.
    await expect(page.getByText('Escribiendo…').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Imprimir para la clase' })).toBeDisabled();
    await expect(page.getByText('Espera a que terminen las versiones', { exact: true })).toBeVisible();
    await expect(toast(page, /^Versiones preparadas\. Revísalas antes de imprimir\.$|no se ha podido preparar/)).toBeVisible({ timeout: 2 * AI_STEP });
    await expect(page.getByRole('button', { name: /^Adaptado · por pasos Borrador IA 1 alumno · Sofía/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Adaptado · ACS 5\.º Primaria Borrador IA 1 alumno · Nerea V\./ })).toBeVisible();
    await expect(page.getByText(/aún no tienen? la versión que piden sus medidas/)).toHaveCount(0);
    await shot(page, info, '73-adapted');
    const vs = await demo.get(`/activities/${exam.id}/versions`);
    for (const key of ['P', 'C']) expect(vs.versions.find((v: { key: string }) => v.key === key)).toMatchObject({ status: 'ready', draft: true });
    const pasos = await demo.get(`/activities/${exam.id}/versions/P`);
    expect(pasos.rubric.items.length).toBe(6); // the same questions, in steps
  });

  test('examenes-74 @ai · a scanned pile: uploaded with progress, papers sorted and matched, then the AI grades them; the teacher accepts one', async ({ page, cloneExam, demo }, info) => {
    const exam = await cloneExam('fracciones', { noPapers: true });
    const pile = scannedPile(exam.id, 5);
    await openActivity(page, exam.url, exam.title);
    await expect(stepHead(page, 2, 'Recoger')).toBeVisible(); // the exam day has come
    await expect(page.getByText('Arrastra aquí el PDF del escáner o las fotos')).toBeVisible();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Subir hojas' }).click();
    await (await chooser).setFiles(pile);
    await expect(jobLine(page)).toBeVisible();
    await shot(page, info, '74-reading');
    await expect(toast(page, /hojas emparejadas/)).toBeVisible({ timeout: AI_STEP });
    await expect(toast(page, /^Sugerencias de la IA listas|^La IA no ha sugerido ninguna nota nueva/)).toBeVisible({ timeout: AI_STEP });
    await waitJobs(demo, exam.id);
    const c = await correction(demo, exam.id);
    const withPaper = c.students.filter((s: { paper_id: string | null }) => s.paper_id);
    expect(withPaper.length).toBeGreaterThanOrEqual(4);
    expect(c.discarded.length).toBeGreaterThan(0); // blank backs of the double-sided ones
    expect(c.unplaced.length + c.unmatched.length).toBeGreaterThan(0); // the page of another exam
    const drafts = c.students.filter((s: { grade: { status: string } | null }) => s.grade?.status === 'suggested');
    expect(drafts.length).toBeGreaterThan(0);
    await shot(page, info, '74-read');

    // Revisar: the AI's suggestion, with its summary line, accepted as it is.
    await page.getByRole('link', { name: /^Revisar alumno a alumno · faltan \d+$/ }).click();
    const first = page.locator('.review-bar__title strong');
    await expect(first).toBeVisible();
    const name = await first.innerText();
    const sid = c.students.find((s: { student: { name: string } }) => s.student.name === name).student.id;
    const r = await demo.get(`/activities/${exam.id}/review/${sid}`);
    if (r.match_status === 'suggested') await page.getByRole('button', { name: 'Es correcto' }).click();
    if (r.ai) await expect(page.locator('.review-summary')).toContainText(r.ai.summary.slice(0, 15));
    await page.locator('.review-accept').click();
    await expect(first).not.toHaveText(name, { timeout: 30_000 });
    const after = (await correction(demo, exam.id)).students.find((s: { student: { id: string } }) => s.student.id === sid);
    expect(after.grade.status).toBe('confirmed');
  });

  test('examenes-75 @ai · «Volver a leer» a page the AI could not read: read again, it leaves «No se ha podido leer»', async ({ page, cloneExam, demo }, info) => {
    const exam = await cloneExam('fracciones', { unread: true });
    await openActivity(page, `${exam.url}?paso=recoger`, exam.title);
    await expect(page.getByText('No se ha podido leer')).toBeVisible();
    await shot(page, info, '75-unread');
    await page.getByRole('button', { name: 'Volver a leer' }).click();
    await expect(jobLine(page)).toBeVisible();
    await expect(toast(page, /hojas emparejadas|página|No había páginas nuevas/)).toBeVisible({ timeout: AI_STEP });
    await waitJobs(demo, exam.id);
    const c = await correction(demo, exam.id);
    expect(c.unplaced.filter((p: { reason: string }) => p.reason === 'sin_leer')).toEqual([]);
    await expect(page.getByText('No se ha podido leer')).toHaveCount(0);
  });

  test('examenes-76 @ai · a paper left without suggestion (its pages changed): «Sugerir notas» asks the AI again', async ({ page, cloneExam, demo }) => {
    const exam = await cloneExam('fracciones');
    const c = await correction(demo, exam.id);
    const vega = c.students.find((s: { flags: { code: string }[] }) => s.flags.some((f) => f.code === 'extra_sin_nombre'));
    const extra = vega.pages.find((p: { kind: string }) => p.kind === 'extra_sheet');
    await demo.post(`/papers/${vega.paper_id}/pages/move`, { page_id: extra.id, to: 'discarded' }); // «Quitar»: suggestion dropped
    await openActivity(page, `${exam.url}?paso=recoger`, exam.title);
    const callout = page.locator('.callout').filter({ hasText: 'no tiene sugerencia de la IA' });
    await expect(callout).toContainText('1 hoja no tiene sugerencia de la IA.');
    await callout.getByRole('button', { name: 'Sugerir notas' }).click();
    await expect(toast(page, /^Sugerencias de la IA listas/)).toBeVisible({ timeout: AI_STEP });
    await expect(callout).toHaveCount(0);
    const after = (await correction(demo, exam.id)).students.find((s: { student: { id: string } }) => s.student.id === vega.student.id);
    expect(after.grade.status).toBe('suggested');
  });

  test('examenes-77 @ai · «Crear ficha de refuerzo» from the frequent errors: the AI writes it in the exam\'s unit', async ({ page, cloneExam, demo }) => {
    const exam = await cloneExam('fracciones');
    await openActivity(page, exam.url, exam.title);
    await page.getByRole('link', { name: /^Crear ficha de refuerzo con / }).click();
    const unit = page.url().match(/unidades\/([^/?]+)/)![1];
    const before: string[] = (await demo.get(`/units/${unit}`)).materials.map((m: { id: string }) => m.id);
    const sheet = dialog(page, 'Crear con IA');
    await sheet.getByRole('button', { name: 'Crear ficha', exact: true }).click();
    await expect(toast(page, /^Creando .*ficha/)).toBeVisible();
    let made: { id: string; kind: string; status: string; title: string } | undefined;
    try {
      await expect.poll(async () => {
        made = (await demo.get(`/units/${unit}`)).materials.find((m: { id: string }) => !before.includes(m.id));
        return made?.status;
      }, { timeout: 2 * AI_STEP }).toBe('ready'); // the content pipeline writes and checks it: a few minutes
      expect(made!.kind).toBe('worksheet');
      // In the unit, among the materials for students, made today and still a draft to review.
      await expect(page.getByRole('button', { name: /^Ficha.* Hoy Borrador IA$/ })).toBeVisible();
    } finally {
      if (made) await demo.fetch('DELETE', `/materials/${made.id}`);
    }
  });

  test('examenes-78 @ai · the pile of copies printed for the class: each paper back to its student and version by the printed number; the review says the version', async ({ page, cloneExam, demo }, info) => {
    const exam = await cloneExam('global', { date: '2026-11-18' });
    for (const key of ['B', 'PL', 'P', 'C']) await demo.get(`/activities/${exam.id}/versions/${key}`); // reviewed
    await demo.get(`/activities/${exam.id}/class-print.pdf`); // «Imprimir para la clase»
    const pile = scannedPile(exam.id, 3, true);
    await openActivity(page, exam.url, exam.title);
    await expect(stepHead(page, 2, 'Recoger')).toBeVisible();
    await expect(page.getByText('Cada copia lleva impreso el nombre del alumno y vuelve sola a su hoja.', { exact: false })).toBeVisible();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Subir hojas' }).click();
    await (await chooser).setFiles(pile);
    await expect(toast(page, /hojas emparejadas/)).toBeVisible({ timeout: AI_STEP });
    await waitJobs(demo, exam.id);
    const c = await correction(demo, exam.id);
    const papers = c.students.filter((s: { paper_id: string | null }) => s.paper_id);
    expect(papers.length).toBe(3);
    const vs = await demo.get(`/activities/${exam.id}/versions`);
    const keyOf = (sid: string) => [vs.base, ...vs.versions].find((v: { student_ids: string[] }) => v.student_ids.includes(sid)).key;
    for (const s of papers) expect(s.version?.key ?? 'A').toBe(keyOf(s.student.id)); // the version printed on it
    const other = papers.find((s: { version: { key: string } | null }) => s.version && s.version.key !== 'A');
    if (other) {
      await page.goto(`${exam.url}/revisar?alumno=${other.student.id}`);
      await expect(page.locator('.review-bar__title .num')).toContainText(`· ${other.version.label}`);
      await shot(page, info, '78-version-in-review');
    }
  });
});
