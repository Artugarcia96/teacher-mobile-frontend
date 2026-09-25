import { expect, test } from '@playwright/test';
import { shot, trackErrors } from './helpers';

// Review the AI's report comments of 2.º ESO B (the demo seeds them as unreviewed drafts): the page leads to them,
// the sheet explains the average, and «Aceptar y siguiente» accepts one and moves on. No AI call is made.
test('review report comments: see how the average is built and accept a draft', async ({ page }, info) => {
  const errors = trackErrors(page);
  await page.goto('/evaluar');
  await page.getByRole('link', { name: /Matemáticas · 2\.º ESO B/ }).last().click();
  await expect(page.getByRole('heading', { name: 'Primera evaluación' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Exportar notas (CSV)' })).toBeVisible();

  const count = page.locator('.ev-count');
  const before = Number((await count.innerText()).match(/(\d+) comentarios? de la IA sin revisar/)?.[1]);
  expect(before).toBeGreaterThan(0);
  await page.getByRole('button', { name: /Revisar \d+ comentarios?/ }).click();

  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText('Borrador IA')).toBeVisible();
  const position = async () => Number((await sheet.getByText(/^\d+ de \d+ · /).innerText()).split(' ')[0]);
  const first = await position();
  await sheet.getByRole('button', { name: 'Cómo se calcula' }).click();
  await expect(sheet.getByText(/\) \/ \d+ = \d+,\d\d →/)).toBeVisible(); // a formula that adds up to the average
  await shot(page, info, 'evaluation-breakdown');

  await sheet.getByRole('button', { name: 'Aceptar y siguiente' }).click();
  await expect(page.getByText(/^Aceptado: /)).toBeVisible();
  await expect.poll(position).toBe(first + 1); // moved on to the next student
  await page.keyboard.press('Escape');
  await expect(count).toContainText(`${before - 1} comentario`);
  expect(errors).toEqual([]);
});
