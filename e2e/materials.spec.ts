import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { shot, trackErrors } from './helpers';

// Materials of the seeded demo (Matemáticas 2.º ESO B · Fracciones): edit an exercise by hand, project the
// presentación, and the choices of «Preparar el trimestre». Nothing here calls the AI.
const API = process.env.API || 'http://127.0.0.1:8000';

interface MaterialRef { id: string; title: string }
interface SlideRef { notes: string; question: { answer: string; explanation: string } | null; image: { description: string } | null }

async function fractions(request: APIRequestContext) {
  const r = await request.post(`${API}/api/auth/login`, { data: { email: 'demo@sepia.es', password: 'sepia1234' } });
  const headers = { Authorization: `Bearer ${(await r.json()).access_token}` };
  const get = async (path: string) => (await request.get(`${API}/api${path}`, { headers })).json();
  const courses: { id: string; subject: string; group: { name: string } }[] = await get('/courses');
  const course = courses.find((c) => c.subject === 'Matemáticas' && c.group.name.includes('2º ESO B'))!;
  const units: { id: string; title: string }[] = await get(`/courses/${course.id}/units`);
  const unit = units.find((u) => u.title === 'Fracciones')!;
  const { materials }: { materials: MaterialRef[] } = await get(`/units/${unit.id}`);
  const material = (title: string) => `/clases/${course.id}/unidades/${unit.id}/materiales/${materials.find((m) => m.title === title)!.id}`;
  const slides = async (title: string): Promise<SlideRef[]> =>
    (await get(`/materials/${materials.find((m) => m.title === title)!.id}`)).content.slides;
  return { course, material, slides };
}

async function editStatement(page: Page, text: (old: string) => string) {
  await page.locator('#ex-1').getByRole('button', { name: 'Opciones del apartado' }).click();
  await page.getByRole('menuitem', { name: 'Editar texto' }).click();
  const field = page.getByRole('dialog', { name: 'Editar ejercicio' }).getByLabel('Enunciado');
  const old = await field.inputValue();
  await field.fill(text(old));
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Cambios guardados').last()).toBeVisible();
  return old;
}

test('ficha: editar el enunciado de un ejercicio la deja como borrador', async ({ page, request }, info) => {
  const errors = trackErrors(page);
  const { material } = await fractions(request);
  await page.goto(material('Ficha de refuerzo · Fracciones'));
  await expect(page.locator('#ex-1')).toBeVisible();
  await page.getByRole('button', { name: 'Editar', exact: true }).click();

  const added = ' Trabaja con tu compañero.';
  const old = await editStatement(page, (t) => t + added);
  try {
    await expect(page.locator('#ex-1')).toContainText(added.trim());
    await expect(page.getByText('Borrador IA').first()).toBeVisible();
    await shot(page, info, 'material-edited');
  } finally {
    await editStatement(page, () => old);
  }
  await expect(page.locator('#ex-1')).not.toContainText(added.trim());
  expect(errors).toEqual([]);
});

// Text of a note without its formulas and bold marks: what would show if it were projected.
const said = (t: string) => t.replace(/\$[^$]*\$/g, ' ').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);

test('presentación: proyectar y pasar con el teclado, sin notas del orador en la pantalla', async ({ page, request }, info) => {
  const errors = trackErrors(page);
  const { material, slides } = await fractions(request);
  const deck = await slides('Presentación · Fracciones');
  await page.goto(material('Presentación · Fracciones'));
  await page.getByRole('button', { name: 'Proyectar' }).click();
  const presenter = page.getByRole('dialog', { name: /^Proyectar:/ });
  await expect(presenter).toBeVisible();
  const count = presenter.locator('.presenter__count');
  await expect(count).toHaveText(/^1 \/ \d+$/);
  await expect(presenter.getByRole('button', { name: /notas del orador/i })).toHaveCount(0);
  for (const [k, slide] of deck.entries()) {  // every slide: what the class sees never carries notes, answers or reminders
    await page.keyboard.press('ArrowRight');
    await expect(count).toHaveText(new RegExp(`^${k + 2} / \\d+$`));
    await page.keyboard.press('n');  // no key shows the notes
    const shown = (await presenter.innerText()).replace(/\s+/g, ' ');
    for (const note of [slide.notes, slide.question?.explanation ?? '', slide.image?.description ?? '']) {
      if (said(note).length >= 12) expect(shown, `diapositiva ${k + 2}`).not.toContain(said(note));
    }
    if (k === 0) await shot(page, info, 'material-presenter');
  }
  await page.keyboard.press('Escape');
  await expect(presenter).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('preparar el trimestre: el botón cuenta los materiales y dice por qué no se puede', async ({ page, request }, info) => {
  const errors = trackErrors(page);
  const { course } = await fractions(request);
  await page.goto(`/clases/${course.id}/programacion`);
  await page.getByRole('button', { name: 'Preparar el trimestre' }).click();
  const sheet = page.getByRole('dialog', { name: 'Preparar el trimestre' });
  const submit = sheet.getByRole('button', { name: /^Crear \d+ materiales?$|^Elige como mucho 15 materiales a la vez$/ });
  await expect(submit).toBeVisible();
  await shot(page, info, 'prepare-term');

  for (const kind of ['Apuntes', 'Ficha', 'Presentación']) await sheet.getByRole('button', { name: kind, exact: true }).click();
  await expect(sheet.getByRole('button', { name: 'Elige al menos un tipo de material' })).toBeDisabled();
  await sheet.getByRole('button', { name: 'Resumen', exact: true }).click();
  await expect(sheet.getByRole('button', { name: /^Crear \d+ materiales?$|^Esas unidades ya tienen esos materiales$/ })).toBeVisible();
  expect(errors).toEqual([]);
});
