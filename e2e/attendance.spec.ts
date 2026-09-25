import { expect, test, type Page } from '@playwright/test';
import { shot, trackErrors } from './helpers';

// Pasar lista (no AI): two devices with the same list keep each other's marks, and «Lista pasada» only after the save.

async function openList(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /^Pasar lista$|Editar lista$/ }).first().click();
  await expect(page.getByRole('list', { name: /Lista de la clase/ })).toBeVisible();
}

/** Taps a student (tap cycles Presente → Falta → Retraso → Presente) until the row shows `status`. */
async function setStatus(page: Page, n: number, status: string) {
  const row = page.getByRole('button', { name: new RegExp(`^${n}\\. `) });
  for (let i = 0; i < 3 && !(await row.getAttribute('aria-label'))?.includes(`: ${status}`); i++) await row.click();
  await expect(row).toHaveAttribute('aria-label', new RegExp(`: ${status}`));
}

const closed = (page: Page) => expect(page.locator('.toast', { hasText: 'Lista pasada' })).toBeVisible();

test('two devices taking the same list keep both absences', async ({ page, context }, info) => {
  const errors = trackErrors(page);
  const other = await context.newPage();
  await openList(page);
  await openList(other);
  await setStatus(page, 1, 'Presente');
  await setStatus(page, 2, 'Presente');
  await page.getByRole('button', { name: 'Cerrar lista' }).click();
  await closed(page);
  await openList(page);
  await openList(other);

  await setStatus(page, 1, 'Falta');
  await setStatus(other, 2, 'Falta');
  await shot(page, info, 'attendance-device-a');
  await page.getByRole('button', { name: 'Cerrar lista' }).click();
  await closed(page);
  await other.getByRole('button', { name: 'Cerrar lista' }).click();
  await closed(other);

  await openList(page);
  await expect(page.getByRole('button', { name: /^1\. .*: Falta/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^2\. .*: Falta/ })).toBeVisible();
  await shot(page, info, 'attendance-both-kept');

  await setStatus(page, 1, 'Presente');
  await setStatus(page, 2, 'Presente');
  await page.getByRole('button', { name: 'Cerrar lista' }).click();
  await closed(page);
  expect(errors).toEqual([]);
});
