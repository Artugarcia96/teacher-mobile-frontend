import { expect, test } from '@playwright/test';
import { shot, trackErrors } from './helpers';

// Cuaderno: a grade that fails to save stays on screen as «Sin guardar» (only that cell, no error toast), later grades
// keep saving and «Reintentar» sends it again. Unsaved grades survive a reload and go out on their own when the
// connection returns or the Cuaderno opens again. Uses the «Examen global» column of the demo 2.º ESO B (upcoming and
// without grades: the right end of the grid) and leaves it empty.
test('a failed grade stays as «Sin guardar», survives a reload and is resent', async ({ page }, info) => {
  const errors = trackErrors(page);
  const prompts: string[] = [];
  page.on('dialog', (d) => { prompts.push(d.type()); void d.accept(); });
  const failSaves = () => page.route('**/api/activities/*/grades', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Servidor no disponible' }) }));

  await page.goto('/clases');
  await page.getByRole('link', { name: /2\.º ESO B/ }).first().click();
  const heads = page.locator('thead [data-col]');
  await expect(heads.last()).toContainText('Examen global');
  await expect(heads.first()).not.toContainText('Examen global');
  const cell = (r: number) => page.locator('tbody tr').nth(r).locator('td.gb-cell').last();
  const type = async (r: number, value: string) => {
    await cell(r).locator('button').click();
    await cell(r).locator('input').fill(value);
    await cell(r).locator('input').press('Enter');
    await page.keyboard.press('Escape');
  };

  await failSaves();
  await type(0, '7');
  await expect(page.getByText('1 nota sin guardar')).toBeVisible();
  await expect(cell(0)).toContainText('Sin guardar');
  await expect(page.getByText(/No se ha guardado/)).toHaveCount(0);
  await shot(page, info, 'cuaderno-unsaved-00');

  // The next grade saves; the failed one is still there, and «Reintentar» sends it
  await page.unroute('**/api/activities/*/grades');
  await type(1, '8');
  await expect(cell(1)).toHaveText('8');
  await expect(cell(0)).toContainText('Sin guardar');
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(page.getByText('1 nota sin guardar')).toHaveCount(0);
  await expect(cell(0)).toHaveText('7');

  // A reload keeps it (leaving asks first); it goes out when the connection returns
  await failSaves();
  await type(2, '6,5');
  await expect(cell(2)).toContainText('Sin guardar');
  await page.reload();
  expect(prompts).toContain('beforeunload');
  await expect(cell(2)).toContainText('Sin guardar');
  await expect(page.getByText('1 nota sin guardar')).toBeVisible();
  await shot(page, info, 'cuaderno-unsaved-01-after-reload');
  await page.unroute('**/api/activities/*/grades');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(cell(2)).toHaveText('6,5');
  await expect(page.getByText('1 nota sin guardar')).toHaveCount(0);

  // Or when the Cuaderno opens again
  await failSaves();
  await type(3, '9');
  await expect(cell(3)).toContainText('Sin guardar');
  await page.unroute('**/api/activities/*/grades');
  await page.reload();
  await expect(cell(3)).toHaveText('9');
  await expect(page.getByText(/sin guardar/i)).toHaveCount(0);
  await shot(page, info, 'cuaderno-unsaved-02-resent');

  for (const r of [0, 1, 2, 3]) {
    await type(r, '');
    await expect(cell(r)).toHaveText('—');
  }
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('sepia.unsaved.')))).toEqual([]);
  expect(errors).toEqual([]);
});
