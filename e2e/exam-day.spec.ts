import { expect, test, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { shot, trackErrors } from './helpers';

// The days around an exam, without AI: before its day it opens on «Preparar»; a student who missed it and has a
// repeat exam («repesca») is not graded in it (no 0 by mistake), only NP.
const API = process.env.API || 'http://127.0.0.1:8000';
const auth = () => {
  const state = JSON.parse(readFileSync('e2e/.results/auth.json', 'utf8'));
  const tokens = JSON.parse(state.origins[0].localStorage[0].value);
  return { authorization: `Bearer ${tokens.access_token}` };
};
const ITEMS = [{ id: '1', label: '1', text: 'Calcula $\\frac{1}{2} + \\frac{1}{4}$.', points: 10, answer: '$\\frac{3}{4}$', steps: [] }];

async function exam(request: APIRequestContext, courseId: string, date: string, title: string): Promise<string> {
  const headers = auth();
  const a = await (await request.post(`${API}/api/courses/${courseId}/activities`, { headers, data: { title, kind: 'exam', date } })).json();
  await request.put(`${API}/api/activities/${a.id}/rubric`, { headers, data: { items: ITEMS } });
  return a.id;
}

test('an exam opens on Preparar before its day; a student with a repeat exam only gets NP', async ({ page, request }, info) => {
  const errors = trackErrors(page);
  const headers = auth();
  const course = (await (await request.get(`${API}/api/courses`, { headers })).json())[0];
  const student = (await (await request.get(`${API}/api/courses/${course.id}/students`, { headers })).json())[0];
  const next = await exam(request, course.id, '2026-11-30', 'Examen e2e · la semana que viene');
  const past = await exam(request, course.id, '2026-11-18', 'Examen e2e · ayer');
  const repeat = await (await request.post(`${API}/api/activities/${past}/repeat`, {
    headers, data: { date: '2026-12-01', student_ids: [student.id] },
  })).json();
  try {
    await page.goto(`/clases/${course.id}/actividades/${next}`);
    await expect(page.getByText('1 · Preparar')).toBeVisible();
    await shot(page, info, 'exam-day-01-before');

    await page.goto(`/clases/${course.id}/actividades/${past}/revisar?alumno=${student.id}`);
    await expect(page.getByText('Faltó a este examen.')).toBeVisible();
    await expect(page.getByText('Su nota llegará con la repesca del 1 dic.')).toBeVisible();
    await shot(page, info, 'exam-day-02-missed');
    await page.locator('.review-accept').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Marcar NP' }).click();
    await expect.poll(async () => {
      const c = await (await request.get(`${API}/api/activities/${past}/correction`, { headers })).json();
      return c.students.find((s: { student: { id: string } }) => s.student.id === student.id)?.grade?.status;
    }).toBe('absent');
    expect(errors).toEqual([]);
  } finally {
    for (const id of [repeat.id, past, next]) await request.delete(`${API}/api/activities/${id}`, { headers });
  }
});
