import { expect, test } from '@playwright/test';
import { shot, trackErrors } from './helpers';

// The frame and the kit in daily use (no AI): a day that does not load on a hung connection says so after one
// wait (20 s), not after a minute of retries; justifying several absences in a row leaves one toast, not a pile
// over the rows being tapped; sheets are paper (nothing behind them shows through).

test('a hung connection offers «Reintentar» after one wait', async ({ page }, info) => {
  test.setTimeout(90_000);
  const asked: string[] = [];
  const today = /\/api\/today\?/;
  await page.route(today, (route) => { asked.push(route.request().url()); });  // never answered: a Wi-Fi that hangs
  await page.goto('/hoy');
  await expect(page.getByText('El servidor no responde. Revisa la conexión y vuelve a intentarlo.')).toBeVisible({ timeout: 30_000 });
  expect(asked.length).toBeGreaterThan(0);
  expect(new Set(asked).size).toBe(asked.length);  // no day asked twice: the timeout is not retried
  await shot(page, info, 'frame-hung-day');

  await page.unroute(today);
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByRole('button', { name: 'Pasar lista' }).first()).toBeVisible();
});

test('justifying several absences leaves one toast', async ({ page }, info) => {
  const errors = trackErrors(page);
  await page.goto('/clases');
  await page.getByRole('link', { name: /Matemáticas.*2\.º ESO B|2\.º ESO B.*Matemáticas/ }).first().click();
  await expect(page).toHaveURL(/\/clases\/[^/]+/);
  await page.goto(`${page.url().match(/\/clases\/[^/#?]+/)![0]}/asistencia`);
  await page.getByRole('link', { name: /Domínguez Marín, Hugo/ }).click();
  await expect(page).toHaveURL(/#asistencia$/);

  const pending = page.getByRole('button', { name: /, Falta sin justificar: justificar$/ });
  await expect(pending.first()).toBeVisible();
  const days = (await pending.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')!.split(', Falta')[0]))).slice(0, 3);
  expect(days).toHaveLength(3);
  for (const day of days) {
    await page.getByRole('button', { name: `${day}, Falta sin justificar: justificar` }).click();
    await expect(page.getByRole('button', { name: `${day}, Falta justificada: quitar justificación` })).toBeVisible();
  }
  await expect(page.locator('.toast', { hasText: 'Falta justificada' })).toHaveCount(1);
  await shot(page, info, 'frame-one-toast');

  // Back as it was: the same three, one toast again
  for (const day of days) {
    await page.getByRole('button', { name: `${day}, Falta justificada: quitar justificación` }).click();
    await expect(page.getByRole('button', { name: `${day}, Falta sin justificar: justificar` })).toBeVisible();
  }
  await expect(page.locator('.toast', { hasText: 'Justificación quitada' })).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('sheets are paper', async ({ page }, info) => {
  await page.goto('/hoy');
  await page.getByRole('button', { name: 'Ir a una fecha' }).click();
  const sheet = page.locator('.sheet');
  await expect(sheet).toBeVisible();
  const look = await sheet.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { filter: cs.backdropFilter, alpha: cs.backgroundColor.startsWith('rgba') ? Number(cs.backgroundColor.split(',')[3].replace(')', '')) : 1 };
  });
  expect(look).toEqual({ filter: 'none', alpha: 1 });
  await shot(page, info, 'frame-sheet-paper');
});
