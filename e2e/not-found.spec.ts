import { expect, test } from '@playwright/test';
import { shot, trackErrors } from './helpers';

// A link to an activity that no longer exists (deleted, or from another teacher) says so in a full sentence. No AI.
test('actividad que ya no existe: lo dice con una frase', async ({ page }, info) => {
  const errors = trackErrors(page);
  await page.goto('/clases');
  const href = await page.locator('a[href^="/clases/"]').first().getAttribute('href');
  const courseId = href!.split('/')[2];
  await page.goto(`/clases/${courseId}/actividades/borrada`);
  await expect(page.getByText('No se ha podido abrir la actividad')).toBeVisible();
  await expect(page.getByText('No se ha encontrado la actividad.')).toBeVisible();
  await shot(page, info, 'activity-not-found');
  await page.getByRole('link', { name: 'Volver al cuaderno' }).click();
  await expect(page).toHaveURL(new RegExp(`/clases/${courseId}/cuaderno$`));
  expect(errors).toEqual([]);
});
