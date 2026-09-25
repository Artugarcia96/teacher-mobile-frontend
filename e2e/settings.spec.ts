import { expect, test } from '@playwright/test';
import { shot, trackErrors } from './helpers';

// Ajustes: a holiday is added, edited and removed in place; «Guardar cambios» saves it. No AI involved.
test('festivos: añadir, editar y quitar en el sitio', async ({ page }, info) => {
  const errors = trackErrors(page);
  const save = async () => {
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Cambios guardados').last()).toBeVisible();
    await expect(page.getByText('Sin guardar')).toHaveCount(0);
  };
  await page.goto('/ajustes');
  await expect(page.getByText('Festivos y vacaciones')).toBeVisible();
  await expect(page.getByText('Periodo lectivo')).toHaveCount(0);
  // The school year's name comes from the term dates; no grades platform is named
  await expect(page.getByLabel('Curso', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Plataforma de notas/)).toHaveCount(0);
  await expect(page.locator('button.btn--neutral', { hasText: 'Cerrar sesión' })).toBeVisible();

  await page.getByRole('button', { name: 'Añadir festivo' }).click();
  const editor = page.locator('.set-holiday');
  const bar = page.locator('.action-bar');
  await expect(editor.getByRole('button', { name: 'Pon la fecha' })).toBeDisabled();
  await expect(bar.getByRole('button', { name: 'Pon la fecha' })).toBeDisabled();
  // «Sin guardar» fits next to the buttons on a phone
  await expect(bar.getByText('Sin guardar')).toBeVisible();
  expect(await bar.locator('.action-bar__note').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  // At the end of the page the bar has its own room: it covers nothing
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const signOut = await page.getByRole('button', { name: 'Cerrar sesión' }).boundingBox();
  const barBox = await bar.boundingBox();
  expect(signOut!.y + signOut!.height).toBeLessThanOrEqual(barBox!.y);
  await editor.getByLabel('Motivo').fill('Día del centro');
  await editor.locator('input[type=date]').first().fill('2027-02-26');
  await shot(page, info, 'settings-holiday-editing');
  await save();

  const saved = page.getByRole('button', { name: 'Editar Día del centro' });
  await expect(saved).toContainText('26 feb');
  await saved.click();
  await editor.getByLabel('Motivo').fill('Día del centro y puente');
  await editor.locator('input[type=date]').nth(1).fill('2027-03-01');
  await editor.getByRole('button', { name: 'Listo' }).click();
  await save();
  await expect(page.getByRole('button', { name: 'Editar Día del centro y puente' })).toContainText('26 feb – 1 mar');
  await shot(page, info, 'settings-holiday-saved');

  await page.getByRole('button', { name: 'Editar Día del centro y puente' }).click();
  await editor.getByRole('button', { name: 'Quitar festivo' }).click();
  await save();
  await expect(page.getByRole('button', { name: /Editar Día del centro/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});
