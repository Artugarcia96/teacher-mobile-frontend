import { expect, test, type Page } from '@playwright/test';
import { shot, trackErrors } from '../helpers';
import { apiAs, FIRST_RENDER, LOGGED_OUT, openAs, registerAccount, type Account } from './acceso.helpers';

// Acceso · primer día, segunda parte: con la clase ya creada, lo que una cuenta nueva hace después en ella. El temario
// vacío (importarlo con IA, añadir una unidad, «Copiar de…» la clase hermana) y las ponderaciones por defecto. Each
// test registers its own teacher. The @ai test runs the real AI (claude_cli): `npx playwright test --grep @ai`.
test.use({ storageState: LOGGED_OUT });

const AI_STEP = 4 * 60_000;
const NOW_SLOT = { weekday: 3, start: '10:20', end: '11:15' };

type Request = Parameters<typeof apiAs>[0];
interface Course { id: string; group: { id: string; name: string } }

async function newClass(request: Request, acc: Account, group: string, students = true): Promise<Course> {
  const api = apiAs(request, acc.access_token);
  const course: Course = await api.post('/courses', {
    subject: 'Matemáticas', short: 'Mates', color: 'teal', room: '204', schedule: [NOW_SLOT],
    new_group: { name: group, stage: 'eso', level: 2 },
  });
  if (students) {
    await api.post(`/groups/${course.group.id}/students`, {
      students: [['García López', 'Ana'], ['Ruiz Serrano', 'Pablo'], ['Núñez Castro', 'Iker']]
        .map(([last_name, first_name]) => ({ first_name, last_name })),
    });
  }
  return course;
}

async function openTab(page: Page, acc: Account, course: Course, tab: 'programacion' | 'cuaderno', group: string) {
  await openAs(page, acc, `/clases/${course.id}/${tab}`);
  await expect(page.getByRole('heading', { level: 1, name: group })).toBeVisible(FIRST_RENDER);
}

async function classMenuPick(page: Page, item: string) {
  await page.getByRole('button', { name: 'Más opciones de la clase' }).click();
  await page.getByRole('menu').getByRole('menuitem', { name: item, exact: true }).click();
}

const unitLink = (page: Page, title: string) => page.getByRole('link', { name: title }); // «Pendiente Números enteros Sin materiales»

test('acceso-63 · cuenta nueva: el temario vacío explica qué es, se añade la primera unidad y la clase hermana la copia', async ({ page, request }, info) => {
  const errors = trackErrors(page);
  const acc = await registerAccount(request, info, 'temario');
  const b = await newClass(request, acc, '2º ESO B');
  await openTab(page, acc, b, 'programacion', '2.º ESO B');
  await expect(page.getByText('Organiza el curso por unidades')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Importar temario' })).toBeVisible();
  // The only class of the account: nothing to copy from.
  await expect(page.getByRole('button', { name: /^Copiar de/ })).toHaveCount(0);
  await shot(page, info, 'acceso-63-temario-vacio');

  await page.getByRole('button', { name: 'Añadir unidad' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nueva unidad' });
  await sheet.getByRole('textbox', { name: 'Título' }).fill('Números enteros');
  await sheet.getByRole('button', { name: 'Añadir unidad' }).click();
  await expect(page.getByText('Unidad añadida')).toBeVisible();
  await expect(unitLink(page, 'Números enteros')).toBeVisible();

  // The second group of the same subject and year, just created, offers to copy it first.
  const c = await newClass(request, acc, '2º ESO C', false);
  await openTab(page, acc, c, 'programacion', '2.º ESO C');
  const copy = page.getByRole('button', { name: /^Copiar de 2\.º ESO B \(1 unidad(es)?\)$/ });
  await expect(copy).toBeVisible();
  await copy.click();
  await expect(page.getByText(/^Temario copiado de 2\.º ESO B: 1 unidad/)).toBeVisible();
  await expect(unitLink(page, 'Números enteros')).toBeVisible();
  const units = await apiAs(request, acc.access_token).get(`/courses/${c.id}/units`);
  // With nothing «en curso», the first unit of the current evaluación becomes it (so Hoy can show it).
  expect(units.map((u: { title: string; term: number; status: string }) => [u.title, u.term, u.status])).toEqual([['Números enteros', 1, 'current']]);
  expect(errors).toEqual([]);
});

test('acceso-64 · @ai cuenta nueva: «Importar temario» desde el temario vacío propone las unidades y las crea', async ({ page, request }, info) => {
  test.setTimeout(2 * AI_STEP);
  const acc = await registerAccount(request, info, 'importar');
  const b = await newClass(request, acc, '2º ESO B');
  await openTab(page, acc, b, 'programacion', '2.º ESO B');
  await page.getByRole('button', { name: 'Importar temario' }).click();
  const sheet = page.getByRole('dialog', { name: 'Importar temario', exact: true });
  await sheet.getByLabel('Pega el índice del libro o de tu programación').fill([
    'Matemáticas 2.º ESO · índice del libro',
    'Primera evaluación: 1. Números enteros · 2. Fracciones',
    'Segunda evaluación: 3. Proporcionalidad · 4. Ecuaciones',
    'Tercera evaluación: 5. Funciones · 6. Estadística',
  ].join('\n'));
  await sheet.getByRole('button', { name: 'Proponer unidades' }).click();
  // While the AI reads, the button says it is working (its label gives way to the spinner).
  await expect(sheet.locator('button[aria-busy="true"]')).toBeVisible();
  const review = page.getByRole('dialog', { name: 'Revisa las unidades', exact: true });
  await expect(review).toBeVisible({ timeout: AI_STEP });
  const titles = review.getByRole('textbox', { name: /^Título de la unidad \d+$/ });
  await expect(titles).toHaveCount(6);
  await expect(titles.first()).toHaveValue(/enteros/i);
  await shot(page, info, 'acceso-64-propuestas');
  await review.getByRole('button', { name: 'Crear 6 unidades' }).click();
  await expect(page.getByText('6 unidades creadas')).toBeVisible();
  await expect(review).toBeHidden();
  const units: { title: string; term: number | null; status: string }[] = await apiAs(request, acc.access_token).get(`/courses/${b.id}/units`);
  expect(units.map((u) => [u.term, u.status])).toEqual([[1, 'current'], [1, 'pending'], [2, 'pending'], [2, 'pending'], [3, 'pending'], [3, 'pending']]);
  await expect(page.getByText('Organiza el curso por unidades')).toHaveCount(0);
});

test('acceso-65 · cuenta nueva: «Ponderaciones» trae 60/30/10 y guarda los pesos del departamento', async ({ page, request }, info) => {
  const acc = await registerAccount(request, info, 'pesos');
  const b = await newClass(request, acc, '2º ESO B');
  await openTab(page, acc, b, 'cuaderno', '2.º ESO B');
  await classMenuPick(page, 'Ponderaciones');
  const sheet = page.getByRole('dialog', { name: 'Ponderaciones', exact: true });
  await expect(sheet.getByText('Matemáticas · 2.º ESO B')).toBeVisible();
  const names = sheet.getByRole('textbox', { name: 'Categoría' });
  await expect(names).toHaveCount(3);
  for (const [n, w] of [['Exámenes', '60'], ['Trabajos y fichas', '30'], ['Observación', '10']]) {
    await expect(sheet.getByRole('spinbutton', { name: `Peso de ${n}` })).toHaveValue(w);
  }
  await expect(sheet.getByText('Total 100 %')).toBeVisible();
  await shot(page, info, 'acceso-65-ponderaciones');

  await sheet.getByRole('spinbutton', { name: 'Peso de Exámenes' }).fill('50');
  await sheet.getByRole('spinbutton', { name: 'Peso de Trabajos y fichas' }).fill('40');
  await expect(sheet.getByText('Total 100 %')).toBeVisible();
  await sheet.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Ponderaciones guardadas')).toBeVisible();
  await expect(sheet).toBeHidden();
  const course = await apiAs(request, acc.access_token).get(`/courses/${b.id}`);
  expect(course.categories.map((x: { label: string; weight: number }) => [x.label, x.weight]))
    .toEqual([['Exámenes', 50], ['Trabajos y fichas', 40], ['Observación', 10]]);
});
