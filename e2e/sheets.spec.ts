import { expect, test } from '@playwright/test';
import { shot, trackErrors } from './helpers';

// Sheets: back closes the open sheet (not the page), and typed text is never lost by a stray tap.
test('Anotar: back closes the sheet and asks before discarding what was typed', async ({ page }, info) => {
  const errors = trackErrors(page);
  await page.goto('/hoy');
  await page.getByRole('button', { name: 'Anotar' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Anotar' });
  const text = sheet.getByRole('textbox', { name: 'Texto' });
  await expect(text).toBeFocused(); // typing is the task, also on phones

  // Clean sheet: back closes it and stays on Hoy.
  await page.goBack();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/hoy/);

  // Typed text: the scrim does nothing, back asks first.
  await page.getByRole('button', { name: 'Anotar' }).first().click();
  await text.fill('Trae el cuaderno de laboratorio');
  if (info.project.name === 'mobile') {
    await page.locator('.sheet-scrim').click({ position: { x: 20, y: 20 } });
    await expect(sheet).toBeVisible();
  }
  await page.goBack();
  const ask = page.getByRole('dialog', { name: 'Descartar los cambios' });
  await expect(ask).toBeVisible();
  await shot(page, info, 'sheet-01-discard-ask');
  await ask.getByRole('button', { name: 'Cancelar' }).click();
  await expect(ask).toBeHidden();
  await expect(text).toHaveValue('Trae el cuaderno de laboratorio');

  // Back again, discard: the sheet closes and the page is still Hoy; one more back leaves nothing behind.
  // (The sheet takes its history entry back on the next tick after «Cancelar»; wait for it, a thumb always does.)
  await page.waitForFunction(() => Boolean((window.history.state as { sheet?: string } | null)?.sheet));
  await page.goBack();
  await ask.getByRole('button', { name: 'Descartar' }).click();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/hoy/);
  await page.getByRole('button', { name: 'Anotar' }).first().click();
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Cerrar' }).click();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/hoy/);
  expect(errors).toEqual([]);
});

test('Añadir evento: date and times in Spanish, 24 h; the keyboard stays down on phones', async ({ page }, info) => {
  await page.goto('/hoy');
  await page.getByRole('button', { name: 'Más acciones' }).click();
  await page.getByRole('menuitem', { name: 'Añadir evento' }).click();
  const sheet = page.getByRole('dialog', { name: 'Añadir evento' });
  await expect(sheet).toBeVisible();
  if (info.project.name === 'mobile') await expect(sheet.getByRole('textbox').first()).not.toBeFocused();
  await expect(sheet.getByText('jueves, 19 nov 2026')).toBeVisible();
  await sheet.getByLabel('Inicio').fill('16:00');
  await expect(sheet.getByText('16:00')).toBeVisible();
  await shot(page, info, 'sheet-02-event');
});
