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

  await page.getByRole('button', { name: 'Añadir festivo' }).click();
  const editor = page.locator('.set-holiday');
  await expect(editor.getByRole('button', { name: 'Pon la fecha' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Pon la fecha del festivo' })).toBeDisabled();
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
