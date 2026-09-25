import { expect, test } from '@playwright/test';
import { shot, trackErrors } from './helpers';

// Ficha del alumno (no AI): from Faltas › Por alumno to the dated absences, justified in place and undone; the
// «A vigilar» callout opens the watch sheet without «Ver ficha».

test('justify an absence from the student file', async ({ page }, info) => {
  const errors = trackErrors(page);
  await page.goto('/clases');
  await page.getByRole('link', { name: /Matemáticas.*2\.º ESO B|2\.º ESO B.*Matemáticas/ }).first().click();
  await expect(page).toHaveURL(/\/clases\/[^/]+/);
  await page.goto(`${page.url().match(/\/clases\/[^/#?]+/)![0]}/asistencia`);
  await page.getByRole('link', { name: /Domínguez Marín, Hugo/ }).click();
  await expect(page).toHaveURL(/#asistencia$/);

  const first = page.getByRole('button', { name: 'mar 17 nov · 11:45, Falta sin justificar: justificar' });
  await expect(first).toBeVisible();
  await expect(page.locator('a[href$="/asistencia"]')).toHaveCount(0);  // the ficha no longer links back to Faltas
  await shot(page, info, 'student-absences');

  await first.click();
  await expect(page.locator('.toast', { hasText: 'Falta justificada' })).toBeVisible();
  const justified = page.getByRole('button', { name: 'mar 17 nov · 11:45, Falta justificada: quitar justificación' });
  await shot(page, info, 'student-absence-justified');
  await justified.click();
  await expect(page.locator('.toast', { hasText: 'Justificación quitada' })).toBeVisible();
  await expect(first).toBeVisible();
  await page.waitForTimeout(5000);  // the toasts go away

  await page.getByRole('button', { name: /^A vigilar/ }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText(/faltas sin justificar en 14 días/)).toBeVisible();
  await expect(sheet.getByText('Ver ficha')).toHaveCount(0);
  await shot(page, info, 'student-watch-sheet');
  expect(errors).toEqual([]);
});
