import { writeFileSync } from 'node:fs';
import {
  average, bug, cell, cellInput, column, expect, openCuaderno, press, shot, test, type Api, type Gb, type Page, type TestInfo,
} from './cuaderno-helpers';

// Borradores de la IA en el Cuaderno (docs/PRODUCT.md §4.3, §4.5), on the demo's 2.º ESO B: «Examen U2 · Fracciones» was
// scanned and corrected by the real AI when the demo was seeded, and 18 of its grades are unreviewed drafts. The column
// says «Borrador IA», drafts show in a secondary tone and do not count in the averages (the line under the grid says
// so), «N por revisar» leads to the activity and its review, and only what the teacher types becomes a grade.
// Tests that touch a draft put it back in a `finally`.

const LABEL = 'Matemáticas · 2.º ESO B';
const U2 = 'Examen U2 · Fracciones';
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function demoClass(demo: Api) {
  const c = (await demo.get<{ id: string; label: string }[]>('/courses')).find((x) => x.label === LABEL);
  if (!c) throw new Error(`No demo class «${LABEL}»: reset the data copy`);
  const gb = await demo.get<Gb>(`/courses/${c.id}/gradebook?term=1`);
  const u2 = gb.activities.find((a) => a.title === U2)!;
  return { id: c.id, gb, u2 };
}
/** A student whose U2 grade is still an AI draft (and whose paper has no warnings), by "Apellidos, Nombre". */
function draftOf(gb: Gb, u2Id: string, sortName: string) {
  const row = gb.students.find((r) => r.student.sort_name === sortName)!;
  const g = row.grades[u2Id];
  if (g?.status !== 'suggested') throw new Error(`${sortName} has no draft in ${U2}: reset the data copy`);
  return { student: row.student, score: g.score! };
}
const putBack = (demo: Api, u2Id: string, studentId: string, score: number) =>
  demo.put(`/activities/${u2Id}/grades`, { grades: [{ student_id: studentId, score, status: 'suggested' }] });
const fmt = (n: number) => String(n).replace('.', ',');
/** "6,7" (or "—"): one decimal, half up, the way the app prints the server's averages. */
const oneDecimal = (v: number | null) => (v == null ? '—' : (Math.round(v * 10 + 1e-9) / 10).toFixed(1).replace('.', ','));
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The summary of «Pendiente» the grid shows for this gradebook: "18 por revisar · 1 falta en exámenes · 2 avisos de lista". */
function summaryOf(gb: Gb) {
  const drafts = gb.activities.reduce((s, a) => s + a.suggested, 0);
  const missed = gb.students.reduce((s, r) => s + Object.values(r.grades).filter((c) => c.status === 'pending_absent' && !c.activity_id).length, 0);
  const conflicts = gb.activities.reduce((s, a) => s + a.attendance_conflicts, 0);
  return [drafts > 0 && `${drafts} por revisar`, missed > 0 && `${plural(missed, 'falta', 'faltas')} en exámenes`,
    conflicts > 0 && plural(conflicts, 'aviso de lista', 'avisos de lista')].filter(Boolean).join(' · ');
}
const pendingSheet = (page: Page) => page.getByRole('dialog', { name: 'Pendiente en esta evaluación' });
async function openPending(page: Page, info: TestInfo, summary: string) {
  await press(page.getByRole('button', { name: `Pendiente en esta evaluación: ${summary}` }), info);
  await expect(pendingSheet(page).getByText(summary)).toBeVisible();
  return pendingSheet(page);
}

test.describe('cuaderno · borradores de la IA (demo)', () => {
  test('cuaderno-100 · drafts: tagged column, secondary tone, not counted, and said so under the grid', async ({ page, demo }, info) => {
    const { id, gb, u2 } = await demoClass(demo);
    const adrian = draftOf(gb, u2.id, 'Castillo Medina, Adrián');
    await openCuaderno(page, id);
    await expect(column(page, U2).locator('.ai-badge')).toHaveText('Borrador IA');
    const draft = cell(page, adrian.student.name, U2);
    await expect(draft).toHaveAccessibleName(`${adrian.student.name} · ${U2}: ${fmt(adrian.score)}, borrador de la IA sin revisar`);
    await expect(draft.locator('.gb-sug')).toHaveText(fmt(adrian.score));
    const drafts = gb.students.reduce((s, r) => s + (r.grades[u2.id]?.status === 'suggested' ? 1 : 0), 0);
    await expect(page.getByText(`Las medias no cuentan ${drafts} borradores de la IA hasta que los revises.`)).toBeVisible();
    await press(average(page, adrian.student.name), info);
    await expect(page.getByRole('dialog', { name: adrian.student.name }).getByText(`${U2}: borrador IA`)).toBeVisible();
    await shot(page, info, '100-drafts');
  });

  test('cuaderno-101 · four things pending fold into one row on phone and desktop; its sheet leads to each', async ({ page, demo }, info) => {
    const { id, gb, u2 } = await demoClass(demo);
    const summary = summaryOf(gb);
    expect(summary).toMatch(/^\d+ por revisar · /);
    await openCuaderno(page, id);
    const row = page.getByRole('button', { name: `Pendiente en esta evaluación: ${summary}` });
    await expect(row).toContainText(summary.split(' · ')[0]);
    await expect(page.locator('.gb-pending').getByRole('link', { name: new RegExp(`^Borrador IA ${u2.suggested} por revisar`) })).toBeHidden();
    let s = await openPending(page, info, summary);
    await expect(s.getByRole('link', { name: new RegExp(`^Borrador IA ${u2.suggested} por revisar`) })).toContainText(`${U2} · no cuentan en la media hasta que los revises`);
    await expect(s.getByRole('button', { name: new RegExp(`^Faltó 1 alumno a ${esc(U2)}`) })).toBeVisible();
    await expect(s.getByRole('button', { name: new RegExp(`^${esc(U2)}: ausente con nota`) })).toBeVisible();
    await expect(s.getByRole('button', { name: /^Examen U1: ausente con nota/ })).toBeVisible();
    await shot(page, info, '101-pending');

    // A missed exam: the pending sheet gives way to the absences sheet
    await press(s.getByRole('button', { name: new RegExp(`^Faltó 1 alumno a ${esc(U2)}`) }), info);
    await expect(s).toBeHidden();
    await expect(page.getByRole('dialog', { name: `Faltaron a ${U2}` })).toBeVisible();
    await page.keyboard.press('Escape');

    // «N por revisar»: the activity, whose main action is the review
    s = await openPending(page, info, summary);
    await press(s.getByRole('link', { name: new RegExp(`^Borrador IA ${u2.suggested} por revisar`) }), info);
    await expect(page).toHaveURL(new RegExp(`/actividades/${u2.id}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(U2);
    const review = page.getByRole('link', { name: new RegExp(`^Revisar alumno a alumno · faltan ${u2.suggested}`) })
      .or(page.getByRole('button', { name: new RegExp(`^Revisar alumno a alumno · faltan ${u2.suggested}`) }));
    await press(review.first(), info);
    await expect(page).toHaveURL(new RegExp(`/actividades/${u2.id}/revisar`));
    await expect(page.getByText(new RegExp(`de \\d+ · faltan ${u2.suggested}`))).toBeVisible();
  });

  test('cuaderno-102 · typing over a draft makes it the teacher\'s grade, which counts', async ({ page, demo }, info) => {
    const { id, gb, u2 } = await demoClass(demo);
    const adrian = draftOf(gb, u2.id, 'Castillo Medina, Adrián');
    try {
      await openCuaderno(page, id);
      await press(cell(page, adrian.student.name, U2), info);
      const input = cellInput(page, adrian.student.name, U2);
      await expect(input).toHaveValue(fmt(adrian.score)); // the AI's grade, ready to be overwritten
      await input.fill('8,5');
      await input.press('Escape'); // Escape: nothing
      await expect(cell(page, adrian.student.name, U2)).toHaveAccessibleName(new RegExp('borrador de la IA sin revisar$'));
      await press(cell(page, adrian.student.name, U2), info);
      await input.fill('8,5');
      await input.press('Enter');
      await page.keyboard.press('Escape');
      await expect(cell(page, adrian.student.name, U2)).toHaveAccessibleName(`${adrian.student.name} · ${U2}: 8,5`);
      await expect(page.getByText(`Las medias no cuentan ${u2.suggested - 1} borradores de la IA`)).toBeVisible();
      await press(average(page, adrian.student.name), info);
      await expect(page.getByRole('dialog', { name: adrian.student.name }).getByText(`${U2}: borrador IA`)).toHaveCount(0);
      await expect.poll(async () => (await demo.get<Gb>(`/courses/${id}/gradebook?term=1`)).activities.find((a) => a.id === u2.id)!.suggested)
        .toBe(u2.suggested - 1);
    } finally {
      await putBack(demo, u2.id, adrian.student.id, adrian.score);
    }
  });

  test('cuaderno-103 · looking at a draft and leaving the cell keeps it a draft', async ({ page, demo }, info) => {
    bug('CUA-03', 'opening an AI-draft cell and tapping elsewhere confirms the AI grade (blur saves the pre-filled value): the AI writes a definitive grade');
    const { id, gb, u2 } = await demoClass(demo);
    const ainhoa = draftOf(gb, u2.id, 'Díaz Serrano, Ainhoa');
    try {
      await openCuaderno(page, id);
      await press(cell(page, ainhoa.student.name, U2), info);
      await expect(cellInput(page, ainhoa.student.name, U2)).toHaveValue(fmt(ainhoa.score));
      await press(page.getByRole('heading', { level: 1 }), info);
      await expect(page.locator('.gb-input')).toHaveCount(0);
      await page.waitForLoadState('networkidle');
      const now = await demo.get<Gb>(`/courses/${id}/gradebook?term=1`);
      expect(now.students.find((r) => r.student.id === ainhoa.student.id)!.grades[u2.id].status).toBe('suggested');
      await expect(cell(page, ainhoa.student.name, U2)).toHaveAccessibleName(new RegExp('borrador de la IA sin revisar$'));
    } finally {
      await putBack(demo, u2.id, ainhoa.student.id, ainhoa.score);
    }
  });
});

// ── With the real AI ─────────────────────────────────────────────────────────
// `npx playwright test --grep @ai`. Photos of two papers of the demo's «Examen U2 · Fracciones» (the pages the seed
// scanned) go into a new exam of 2.º ESO B with the same rubric; the AI reads the pages (vision), matches the written
// names with the class list and suggests the grades; the Cuaderno shows them as drafts that do not count. The new
// exam is deleted at the end. Desktop only: the real AI costs time and money, and the drafts on a phone are
// cuaderno-100 above.
test.describe('cuaderno · borradores recién corregidos por la IA', () => {
  test('cuaderno-104 @ai · photos corrected by the AI arrive in the Cuaderno as drafts that do not count until reviewed', async ({ page, demo }, info) => {
    test.skip(info.project.name !== 'desktop', 'real AI: once is enough');
    test.setTimeout(12 * 60_000);
    const { id, gb, u2 } = await demoClass(demo);
    const TITLE = 'Examen U2 · Fracciones (fotos)';
    const corr = await demo.get(`/activities/${u2.id}/correction`);
    const who = ['Castillo Medina, Adrián', 'Cortés Ortiz, Nicolás'];
    const picked = corr.students.filter((s: { student: { sort_name: string } }) => who.includes(s.student.sort_name));
    expect(picked).toHaveLength(2);
    const photos: string[] = [];
    for (const [n, s] of picked.entries()) {
      for (const p of s.pages as { url: string; page_number: number }[]) {
        // ASCII names: Chromium drops files whose path has accents from setInputFiles
        const path = info.outputPath(`foto-${n + 1}-${p.page_number}.jpg`);
        writeFileSync(path, await demo.file(p.url));
        photos.push(path);
      }
    }
    const exam = await demo.post(`/courses/${id}/activities`, { title: TITLE, kind: 'exam', date: '2026-11-17' });
    try {
      await demo.put(`/activities/${exam.id}/rubric`, { items: corr.rubric.items });
      const before = Object.fromEntries(gb.students.map((r) => [r.student.id, r.average]));

      await page.goto(`/clases/${id}/actividades/${exam.id}`);
      await expect(page.getByText('Arrastra aquí el PDF del escáner o las fotos')).toBeVisible();
      await page.locator('input[type="file"]').first().setInputFiles(photos);
      const progress = page.getByRole('status').filter({ has: page.locator('.job-line__msg') });
      await expect(progress).toBeVisible();
      await shot(page, info, '104-reading');
      // Reading the pages, then suggesting the grades: up to 4 minutes each with the real AI
      // (a reset connection while the server is busy is retried, not a failure: every 3 s, under uvicorn's 5 s keep-alive)
      await expect.poll(async () => {
        const c = await demo.get(`/activities/${exam.id}/correction`).catch(() => null);
        return c ? c.stats.suggested + c.stats.confirmed : -1;
      }, { timeout: 8 * 60_000, intervals: [3000] }).toBe(2);
      await expect(progress).toBeHidden({ timeout: 4 * 60_000 });

      await openCuaderno(page, id);
      await expect(column(page, TITLE).locator('.ai-badge')).toHaveText('Borrador IA');
      for (const s of picked) {
        await expect(cell(page, s.student.name, TITLE)).toHaveAccessibleName(new RegExp(`^${esc(s.student.name)} · ${esc(TITLE)}: \\d+(,\\d+)?, borrador de la IA sin revisar$`));
        // The draft does not count: the average is the one before the photos
        await expect(average(page, s.student.name)).toHaveAccessibleName(`Media de ${s.student.name}: ${oneDecimal(before[s.student.id])}`);
      }
      await expect(page.getByText(`Las medias no cuentan ${gb.students.reduce((n, r) => n + r.drafts, 0) + 2} borradores de la IA hasta que los revises.`)).toBeVisible();
      await shot(page, info, '104-new-drafts');
    } finally {
      await demo.del(`/activities/${exam.id}`);
    }
  });
});
