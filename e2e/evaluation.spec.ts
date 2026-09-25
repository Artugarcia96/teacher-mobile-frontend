import { expect, test } from '@playwright/test';
import { shot, trackErrors } from './helpers';

// Review the AI's report comments of 2.º ESO B (the demo seeds them as unreviewed drafts): the page leads to them,
// the sheet explains the average, and «Aceptar y siguiente» accepts one and moves on, without a toast over the next
// comment and without taking a second tap meant for the previous one. Then a grade changed after accepting: the
// comment says another grade, so it cannot be accepted until it is rewritten, and closing asks before discarding.
// No AI call is made.
test('review report comments: accept a draft, then a grade that no longer matches its comment', async ({ page }, info) => {
  const errors = trackErrors(page);
  await page.goto('/evaluar');
  await page.getByRole('link', { name: /2\.º ESO B/ }).last().click();
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
  const name = (await sheet.locator('.sheet__title').innerText()).trim();
  await sheet.getByRole('button', { name: 'Cómo se calcula' }).click();
  await expect(sheet.getByText(/\) \/ \d+ = \d+,\d\d →/)).toBeVisible(); // a formula that adds up to the average
  await shot(page, info, 'evaluation-breakdown');

  const accept = sheet.getByRole('button', { name: 'Aceptar y siguiente' });
  await accept.click();
  await expect(sheet.locator('.sheet__title')).not.toHaveText(name); // moved on to the next student…
  await expect(accept).toBeDisabled(); // …which a second tap cannot accept unseen
  await expect(accept).toBeEnabled();
  expect(await position()).toBe(first + 1);
  await expect(page.getByText(/^Aceptado: /)).toHaveCount(0); // no toast over the next comment
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(count).toContainText(`${before - 1} comentario`);

  // The accepted comment was written for its grade; raise the grade here and it no longer matches.
  await page.getByRole('button', { name: `${name}: editar nota y comentario` }).click();
  const stepper = sheet.getByRole('group', { name: 'Nota' });
  const grade = Number(await stepper.locator('output').innerText());
  await stepper.getByRole('button', { name: grade < 10 ? 'Más' : 'Menos' }).click();
  await expect(sheet.getByText(/^Escrito para un \d+ · nota \d+/)).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'El comentario dice otra nota' })).toBeDisabled();
  await expect(sheet.getByRole('button', { name: 'Redactar de nuevo' })).toBeEnabled();
  await shot(page, info, 'evaluation-stale-comment');
  await sheet.getByRole('textbox', { name: /Comentario de boletín/ }).fill('Ha trabajado con constancia durante la evaluación.');
  await expect(sheet.getByRole('button', { name: /^Aceptar/ })).toBeEnabled(); // rewritten: it can be accepted again

  // Closing with changes asks first; discarding keeps what was saved.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Descartar' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole('button', { name: `${name}: editar nota y comentario` }).locator('.grade-pill'))
    .toContainText(String(grade));
  expect(errors).toEqual([]);
});
