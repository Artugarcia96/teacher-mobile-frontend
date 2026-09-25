import type { Page } from '@playwright/test';
import {
  AI_STEP, bug, clipboard, demoCourse, DEMO_2B, demoStudent, denyClipboard, expect, MATES_2C, openFile, sheet, shot, test, toast,
} from './alumnos-helpers';

// «Preparar tutoría» (ficha): the AI writes 4-5 plain-text lines for a meeting with the family, today, from the
// student's grades, attendance and dated observations; it gets the measures but never the mark or the diagnosis, nor
// the name. The @ai flows run with the real AI (claude_cli) and wait on the sheet up to 4 minutes; the rest check the
// waiting, failed and AI-off states without any AI.

const briefSheet = (page: Page) => sheet(page, 'Preparar tutoría');
const bullets = (page: Page) => briefSheet(page).locator('.brief__list li');

/** Opens «Preparar tutoría» and waits for the AI draft (skeleton while it works). */
async function prepare(page: Page) {
  await page.getByRole('button', { name: 'Preparar tutoría' }).click();
  const s = briefSheet(page);
  await expect(s).toBeVisible();
  await expect(s.locator('.skel').first()).toBeVisible(); // working: the teacher sees it
  await expect(s.locator('.ai-badge')).toHaveText('Borrador IA', { timeout: AI_STEP });
  return s;
}

test.describe('real AI', () => {
  test.describe.configure({ timeout: 2 * AI_STEP + 60_000 });

  test('alumnos-100 @ai «Preparar tutoría» for Hugo: 4-5 plain lines from his facts; «Copiar»', async ({ page, demo }, info) => {
    const hugo = await demoStudent(demo, await demoCourse(demo, DEMO_2B), 'Domínguez Marín, Hugo');
    await openFile(page, hugo.id, 'Hugo Domínguez Marín');
    const s = await prepare(page);
    await expect(s.getByText('Hugo Domínguez Marín')).toBeVisible();
    await expect(s.getByText('Hecho con sus notas, asistencia y observaciones. Revísalo antes de la reunión.')).toBeVisible();
    const lines = await bullets(page).allInnerTexts();
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines.length).toBeLessThanOrEqual(6);
    const all = lines.join('\n');
    // Plain text (no Markdown, no LaTeX), and his real facts: 7 unjustified absences, the pending Examen U2.
    expect(all).not.toMatch(/\*\*|\$|^#/m);
    expect(all).toMatch(/falta/i);
    // The AI never gets his name; it does not propose another meeting (the meeting is today).
    expect(all).not.toContain('Domínguez');
    expect(all).not.toMatch(/(otra|nueva|próxima) (reunión|tutoría)/i);
    await shot(page, info, 'tutoria');

    await s.getByRole('button', { name: 'Copiar' }).click();
    await expect(toast(page, 'Copiado')).toBeVisible();
    expect(await clipboard(page)).toBe(`Tutoría · Hugo Domínguez Marín\n${lines.map((l) => `- ${l}`).join('\n')}`);
    // A browser that does not allow the clipboard: it says so.
    await denyClipboard(page);
    await s.getByRole('button', { name: 'Copiar' }).click();
    await expect(toast(page, 'No se ha podido copiar')).toBeVisible();
    await s.getByRole('button', { name: 'Cerrar' }).click();
    await expect(s).toBeHidden();
  });

  test('alumnos-101 @ai the AI gets the measures of a student with dyslexia, never the diagnosis', async ({ page, demo }) => {
    const ruben = await demoStudent(demo, await demoCourse(demo, DEMO_2B), 'López Vázquez, Rubén');
    await openFile(page, ruben.id, 'Rubén López Vázquez');
    await prepare(page);
    const all = (await bullets(page).allInnerTexts()).join('\n');
    expect(all.length).toBeGreaterThan(40);
    expect(all).not.toMatch(/dislexia|NEAE|ACNEE/i);
  });
});

test.describe('without AI', () => {
  test.use({ teacherSpec: { courses: [MATES_2C] } });

  test('alumnos-102 the AI fails: the reason and «Reintentar», which asks again', async ({ page, teacher }) => {
    const marta = teacher.courses[0].students[0];
    let calls = 0;
    await page.route(`**/api/students/${marta.id}/brief`, (route) => {
      calls += 1;
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: { message: 'La IA no responde ahora. Inténtalo en un momento.', code: 'ai_failed' } }) });
    });
    await openFile(page, marta.id, 'Marta Alonso Gil');
    await page.getByRole('button', { name: 'Preparar tutoría' }).click();
    const s = briefSheet(page);
    await expect(s.getByText('La IA no responde ahora. Inténtalo en un momento.')).toBeVisible();
    await expect(s.getByRole('button', { name: 'Copiar' })).toHaveCount(0);
    expect(calls).toBe(1);
    await s.getByRole('button', { name: 'Reintentar' }).click();
    await expect.poll(() => calls).toBe(2);
    await expect(s.getByText('La IA no responde ahora. Inténtalo en un momento.')).toBeVisible();
  });

  test('alumnos-103 closing while the AI works and opening again starts a fresh draft', async ({ page, teacher }) => {
    const marta = teacher.courses[0].students[0];
    let calls = 0;
    let release: () => void = () => {};
    await page.route(`**/api/students/${marta.id}/brief`, async (route) => {
      calls += 1;
      await new Promise<void>((r) => { release = r; });
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"La IA no responde ahora."}' }).catch(() => {});
    });
    await openFile(page, marta.id, 'Marta Alonso Gil');
    await page.getByRole('button', { name: 'Preparar tutoría' }).click();
    const s = briefSheet(page);
    await expect(s.locator('.skel').first()).toBeVisible();
    await s.getByRole('button', { name: 'Cerrar' }).click();
    await expect(s).toBeHidden();
    release();
    await page.getByRole('button', { name: 'Preparar tutoría' }).click();
    await expect(s.locator('.skel').first()).toBeVisible();
    await expect.poll(() => calls).toBe(2);
    release();
    await expect(s.getByText('La IA no responde ahora.')).toBeVisible();
  });

  test('alumnos-104 a server without AI: «Preparar tutoría» is off and says why', async ({ page, teacher }) => {
    bug('BUG-ALUMNOS-08', '«Preparar tutoría» ignores ai_provider "none": it stays enabled and only fails after the tap');
    const marta = teacher.courses[0].students[0];
    await page.route('**/api/me', async (route) => {
      const r = await route.fetch();
      await route.fulfill({ response: r, json: { ...(await r.json()), ai_provider: 'none' } });
    });
    await page.route(`**/api/students/${marta.id}/brief`, (route) => route.fulfill({
      status: 503, contentType: 'application/json', body: JSON.stringify({ detail: { message: 'La IA no está configurada en este servidor.', code: 'ai_unavailable' } }),
    }));
    await openFile(page, marta.id, 'Marta Alonso Gil');
    const btn = page.getByRole('button', { name: 'Preparar tutoría' });
    await expect(btn).toBeDisabled();
    await expect(btn).toHaveAttribute('title', 'La IA no está configurada en este servidor.');
  });
});
