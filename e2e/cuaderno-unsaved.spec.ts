import { expect, test } from '@playwright/test';
import { shot, trackErrors } from './helpers';

// Cuaderno: a grade that fails to save stays on screen as «Sin guardar» (only that cell), later grades keep saving,
// and «Reintentar» sends it again. Uses the empty «Examen global» column of the demo 2.º ESO B and leaves it empty.
test('a failed grade stays as «Sin guardar» and is retried', async ({ page }, info) => {
  const errors = trackErrors(page);
  await page.goto('/clases');
  await page.getByRole('link', { name: /2\.º ESO B/ }).first().click();
  const col = page.locator('thead [data-col]').first();
  await expect(col).toContainText('Examen global');
  const cell = (r: number) => page.locator('tbody tr').nth(r).locator('td.gb-cell').first();
  const type = async (r: number, value: string) => {
    await cell(r).locator('button').click();
    await cell(r).locator('input').fill(value);
    await cell(r).locator('input').press('Enter');
  };

  await page.route('**/api/activities/*/grades', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Servidor no disponible' }) }));
  await type(0, '7');
  await page.keyboard.press('Escape');
  await expect(page.getByText('1 nota sin guardar')).toBeVisible();
  await expect(cell(0)).toContainText('Sin guardar');
  await shot(page, info, 'cuaderno-unsaved-00');

  // The next grade saves; the failed one is still there
  await page.unroute('**/api/activities/*/grades');
  await type(1, '8');
  await page.keyboard.press('Escape');
  await expect(cell(1)).toHaveText('8');
  await expect(cell(0)).toContainText('Sin guardar');

  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(page.getByText('1 nota sin guardar')).toHaveCount(0);
  await expect(cell(0)).toHaveText('7');
  await shot(page, info, 'cuaderno-unsaved-01-retried');

  for (const r of [0, 1]) {
    await type(r, '');
    await page.keyboard.press('Escape');
    await expect(cell(r)).toHaveText('—');
  }
  expect(errors).toEqual([]);
});
