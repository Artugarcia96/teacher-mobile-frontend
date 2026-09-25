import { expect, test } from '@playwright/test';
import { shot, trackErrors } from './helpers';

// «Añadir alumnos» with a list pasted from a school PDF (no AI, nothing saved): headers and footers are left out with
// one line each, a repeated student is one warning with a count, and closing with the list typed asks first.

const PDF = [
  'IES LA ALBORADA - SEVILLA',
  'Relación de alumnado por unidad',
  '1 ABAD GARCÍA, ALEJANDRO 21/02/2014 No Ordinaria',
  '2 BENÍTEZ RUIZ, LUCÍA 03/05/2014 Sí Repite',
  '3 BENÍTEZ RUIZ, LUCÍA 03/05/2014 Sí Repite',
  'Página 1 de 2',
  '4 CANO PÉREZ, EVA 01/01/2014 No Ordinaria',
  '5 DÍAZ GIL, PABLO 02/02/2014 No Ordinaria',
  '6 BENÍTEZ RUIZ, LUCÍA 03/05/2014 Sí Repite',
].join('\n');

test('paste a school list: only students, one warning per repeated name, nothing lost on close', async ({ page }, info) => {
  const errors = trackErrors(page);
  await page.goto('/clases');
  await page.getByRole('link', { name: /Matemáticas.*2\.º ESO B|2\.º ESO B.*Matemáticas/ }).first().click();
  await expect(page).toHaveURL(/\/clases\/[^/]+/);
  await page.goto(`${page.url().match(/\/clases\/[^/#?]+/)![0]}/alumnos?anadir=1`);

  await page.getByLabel('Un alumno por línea').fill(PDF);
  const sheet = page.getByRole('dialog', { name: 'Añadir alumnos' });
  await expect(sheet.getByText('4 alumnos · Apellidos, Nombre')).toBeVisible();
  for (const warning of ['Línea 1 ignorada: «IES LA ALBORADA - SEVILLA»', 'Línea 2 ignorada: «Relación de alumnado por unidad»',
    'Línea 6 ignorada: «Página 1 de 2»', '«Lucía Benítez Ruiz» aparece 3 veces; se añade una.']) {
    await expect(sheet.getByText(warning, { exact: true })).toHaveCount(1);
  }
  await expect(sheet.getByRole('button', { name: 'Abad García, Alejandro' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Añadir 4 alumnos' })).toBeEnabled();
  await shot(page, info, 'add-students-pdf-preview');

  // Closing with the list typed asks first; «Cancelar» keeps everything
  await page.keyboard.press('Escape');
  const discard = page.getByRole('dialog', { name: 'Descartar los cambios' });
  await expect(discard).toBeVisible();
  await discard.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByLabel('Un alumno por línea')).toHaveValue(PDF);
  await sheet.getByRole('button', { name: 'Cerrar' }).click();
  await page.getByRole('dialog', { name: 'Descartar los cambios' }).getByRole('button', { name: 'Descartar' }).click();
  await expect(sheet).toHaveCount(0);
  expect(errors).toEqual([]);
});
