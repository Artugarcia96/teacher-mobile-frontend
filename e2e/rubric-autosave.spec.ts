import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { shot, trackErrors } from './helpers';

// Preparar an exam, without AI: every rubric change is saved at once (points after a short pause, a question with
// «Hecho»), so there is never an unsaved rubric for Modelo B or the print to start from.
const API = process.env.API || 'http://127.0.0.1:8000';
const auth = () => {
  const state = JSON.parse(readFileSync('e2e/.results/auth.json', 'utf8'));
  const tokens = JSON.parse(state.origins[0].localStorage[0].value);
  return { authorization: `Bearer ${tokens.access_token}` };
};
const ITEMS = [
  { id: '1', label: '1', text: 'Calcula $\\frac{1}{2} + \\frac{1}{4}$.', points: 5, answer: '$\\frac{3}{4}$', steps: [] },
  { id: '2', label: '2', text: 'Ordena de menor a mayor: 2/3, 1/2 y 3/4.', points: 5, answer: '1/2 < 2/3 < 3/4', steps: [] },
];

test('rubric changes are saved at once, with no bar to save them', async ({ page, request }, info) => {
  const errors = trackErrors(page);
  const headers = auth();
  const course = (await (await request.get(`${API}/api/courses`, { headers })).json())[0];
  const a = await (await request.post(`${API}/api/courses/${course.id}/activities`, {
    headers, data: { title: 'Examen e2e · rúbrica', kind: 'exam', date: '2026-11-30' },
  })).json();
  await request.put(`${API}/api/activities/${a.id}/rubric`, { headers, data: { items: ITEMS } });
  const rubric = async () => (await (await request.get(`${API}/api/activities/${a.id}/correction`, { headers })).json()).rubric.items;
  try {
    await page.goto(`/clases/${course.id}/actividades/${a.id}`);
    await page.getByRole('group', { name: 'Puntos de la pregunta 1' }).getByRole('button', { name: 'Más' }).click();
    await expect(page.getByText('Pregunta 1 guardada')).toBeVisible();
    await expect.poll(async () => (await rubric())[0].points).toBe(5.25);
    await expect(page.getByRole('button', { name: /Guardar/ })).toHaveCount(0);
    await shot(page, info, 'rubric-01-points-saved');

    await page.getByRole('button', { name: 'Editar pregunta 2' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Enunciado').fill('Ordena de menor a mayor: 3/4, 1/2 y 2/3.');
    await sheet.getByRole('button', { name: 'Hecho' }).click();
    await expect(page.getByText('Pregunta 2 guardada')).toBeVisible();
    await expect.poll(async () => (await rubric())[1].text).toBe('Ordena de menor a mayor: 3/4, 1/2 y 2/3.');

    // closing a question with something typed asks first
    await page.getByRole('button', { name: 'Editar pregunta 1' }).click();
    await page.getByRole('dialog').getByLabel('Solución').fill('3/4');
    await page.keyboard.press('Escape');
    await expect(page.getByText('Descartar los cambios')).toBeVisible();
    await shot(page, info, 'rubric-02-discard');
    expect(errors).toEqual([]);
  } finally {
    await request.delete(`${API}/api/activities/${a.id}`, { headers });
  }
});
