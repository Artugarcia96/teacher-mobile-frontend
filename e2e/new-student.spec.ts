import { expect, test, type APIRequestContext } from '@playwright/test';
import { shot, trackErrors } from './helpers';

// A student who joins 2.º ESO B today: nothing before today is missing for him (Evaluar stays the same). No AI.
const API = process.env.API || 'http://127.0.0.1:8000';

async function login(request: APIRequestContext) {
  const r = await request.post(`${API}/api/auth/login`, { data: { email: 'demo@sepia.es', password: 'sepia1234' } });
  const { access_token } = await r.json();
  const headers = { Authorization: `Bearer ${access_token}` };
  return {
    get: async (path: string) => (await request.get(`${API}/api${path}`, { headers })).json(),
    del: (path: string) => request.delete(`${API}/api${path}`, { headers }),
  };
}

const toGrade = (inbox: { to_grade: { activity: { id: string }; missing: number }[] }) =>
  inbox.to_grade.map((x) => [x.activity.id, x.missing]);

test('a student added today leaves Evaluar and his pending exams alone', async ({ page, request }, info) => {
  const errors = trackErrors(page);
  const api = await login(request);
  const courses: { id: string; subject: string; group: { id: string; name: string } }[] = await api.get('/courses');
  const course = courses.find((c) => c.subject === 'Matemáticas' && c.group.name.includes('2º ESO B'))!;
  const before = await api.get('/inbox');

  await page.goto(`/clases/${course.id}/alumnos?anadir=1`);
  await page.getByLabel('Un alumno por línea').fill('Vidal Ruiz, Nuria');
  await page.getByRole('button', { name: 'Añadir 1 alumno' }).click();
  await expect(page.getByText('1 alumno añadido')).toBeVisible();
  const roster: { id: string; first_name: string; last_name: string }[] = await api.get(`/groups/${course.group.id}/students`);
  const nuria = roster.find((s) => s.first_name === 'Nuria' && s.last_name === 'Vidal Ruiz')!;
  try {
    expect(toGrade(await api.get('/inbox'))).toEqual(toGrade(before));
    await page.goto('/evaluar');
    await expect(page.getByRole('heading', { name: 'Evaluar' }).first()).toBeVisible();
    await shot(page, info, 'new-student-evaluar');

    const file = await api.get(`/students/${nuria.id}`);
    expect(file.courses.flatMap((c: { pending_exams: unknown[] }) => c.pending_exams)).toEqual([]);
    await page.goto(`/alumnos/${nuria.id}`);
    await expect(page.getByText('Nuria').first()).toBeVisible();
    await shot(page, info, 'new-student-file');
  } finally {
    await api.del(`/groups/${course.group.id}/students/${nuria.id}`);
  }
  expect(errors).toEqual([]);
});
