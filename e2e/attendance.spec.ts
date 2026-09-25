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

test('marking never moves the rows, and a class with its list taken cannot be cancelled', async ({ page }, info) => {
  const errors = trackErrors(page);
  await openList(page);
  const list = page.getByRole('list', { name: /Lista de la clase/ });
  const head = page.locator('.sheet__sub').last();
  const probe = page.getByRole('button', { name: /^8\. / });
  // Where row 8 sits in the list and how tall the header is: a tap must change neither (a second tap lands on the same student).
  const layout = async () => {
    const [p, l, h] = await Promise.all([probe.boundingBox(), list.boundingBox(), head.boundingBox()]);
    return [Math.round(p!.y - l!.y), Math.round(h!.height)];
  };
  const before = await layout();
  for (const n of [1, 2, 3, 4, 5]) await setStatus(page, n, 'Falta');
  await setStatus(page, 2, 'Retraso');
  expect(await layout()).toEqual(before);
  await shot(page, info, 'attendance-rows-still');
  for (const n of [1, 2, 3, 4, 5]) await setStatus(page, n, 'Presente');
  await page.getByRole('button', { name: 'Cerrar lista' }).click();
  await closed(page);

  // The session happened: its absences count, so the agenda offers «Editar lista» and no «No hay clase».
  const agenda = page.locator('section', { has: page.getByRole('heading', { name: 'Agenda' }) });
  await agenda.getByText('Lista pasada').first().click();
  const sheet = page.getByRole('dialog').last();
  await expect(sheet.getByText('Editar lista')).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'No hay clase' })).toHaveCount(0);
  await shot(page, info, 'session-taken-no-cancel');
  expect(errors).toEqual([]);
});
