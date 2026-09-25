import { bug, classMenuPick, dialog, expect, MATES_2C, openClass, shot, test, toast, type Page } from './clases-helpers';

// «Importar temario» (docs/PRODUCT.md §4.1.4): paste the index of the book or the programación, the AI proposes units
// with their evaluación, the teacher corrects them and creates them. The @ai tests run the real AI (claude_cli in
// development): `npx playwright test --grep @ai`. The rest check what the sheet does when the server says no.

const AI_STEP = 4 * 60_000;

/** A programación as teachers paste it: a preamble, then the units. */
const PROGRAMACION = `IES Sepia de Ejemplo · Departamento de Matemáticas
Programación didáctica · Matemáticas 2.º ESO · Curso 2026-2027

1. Introducción
La programación sigue el currículo de la Comunidad de Madrid y se organiza en tres evaluaciones.

2. Secuenciación de contenidos
Primera evaluación
Unidad 1. Números enteros
Unidad 2. Fracciones y decimales
Unidad 3. Potencias y raíces
Segunda evaluación
Unidad 4. Proporcionalidad y porcentajes
Unidad 5. Expresiones algebraicas
Unidad 6. Ecuaciones de primer y segundo grado
Tercera evaluación
Unidad 7. Funciones
Unidad 8. Teorema de Pitágoras y semejanza
Unidad 9. Estadística y probabilidad

3. Evaluación
Exámenes 60 %, trabajos 30 %, observación 10 %.`;

async function openImport(page: Page, id: string) {
  await openClass(page, id, 'programacion', '2.º ESO C');
  await classMenuPick(page, 'Importar temario');
  const sheet = dialog(page, 'Importar temario');
  await expect(sheet).toBeVisible();
  return sheet;
}
const titles = (sheet: ReturnType<typeof dialog>) => sheet.getByRole('textbox', { name: /^Título de la unidad \d+$/ });

test.describe('clases · importar temario', () => {
  test.use({ teacherSpec: { courses: [MATES_2C] } });

  test('clases-63 · @ai paste the programación → AI proposals → correct them → create', async ({ page, teacher }, info) => {
    test.setTimeout(3 * AI_STEP);
    const [c] = teacher.courses;
    const sheet = await openImport(page, c.id);
    await expect(sheet.getByText('Sepia propone las unidades y reparte las evaluaciones. Podrás revisarlas antes de crearlas.')).toBeVisible();
    const propose = sheet.locator('.sheet__foot').getByRole('button');
    await expect(propose).toHaveText('Pega el índice para continuar');
    await expect(propose).toBeDisabled();
    await sheet.getByLabel('Pega el índice del libro o de tu programación').fill(PROGRAMACION);
    await expect(propose).toHaveText('Proponer unidades');
    await propose.click();
    await expect(propose).toHaveAttribute('aria-busy', 'true'); // the AI is working: the button says so
    const review = dialog(page, 'Revisa las unidades');
    await expect(review).toBeVisible({ timeout: AI_STEP });
    await expect(review.getByText('Corrige los títulos, elige la evaluación (1.ª, 2.ª, 3.ª) o quita las que sobren.')).toBeVisible();
    await expect(titles(review)).toHaveCount(9);
    await expect(titles(review).first()).toHaveValue(/enteros/i);
    await expect(titles(review).last()).toHaveValue(/estad/i);
    const terms = review.getByRole('combobox', { name: 'Evaluación' });
    expect(await terms.evaluateAll((els) => els.map((e) => (e as HTMLSelectElement).value))).toEqual(['1', '1', '1', '2', '2', '2', '3', '3', '3']);
    await shot(page, info, '63-propuestas');

    // «Volver al texto» keeps what was pasted; a second proposal comes from the same text.
    await review.getByRole('button', { name: 'Volver al texto' }).click();
    await expect(sheet.getByLabel('Pega el índice del libro o de tu programación')).toHaveValue(PROGRAMACION);
    await propose.click();
    await expect(review).toBeVisible({ timeout: AI_STEP });
    await expect(titles(review)).toHaveCount(9);

    // Correct: rename the first, move the second to the 2.ª, drop the third.
    await titles(review).nth(0).fill('Números enteros y divisibilidad');
    await terms.nth(1).selectOption('2');
    await review.getByRole('button', { name: 'Quitar' }).nth(2).click();
    await expect(titles(review)).toHaveCount(8);
    const expected = await review.locator('.proposal').evaluateAll((rows) => rows.map((r) => ({
      title: (r.querySelector('input') as HTMLInputElement).value.trim(),
      term: Number((r.querySelector('select') as HTMLSelectElement).value) || null,
    })));
    const create = review.locator('.sheet__foot').getByRole('button', { name: 'Crear 8 unidades' });
    await create.click();
    await expect(toast(page, '8 unidades creadas')).toBeVisible();
    await expect(review).toBeHidden();
    await expect(page.getByText('8 unidades', { exact: true })).toBeVisible();

    const units: { title: string; term: number | null; status: string }[] = await teacher.api.get(`/courses/${c.id}/units`);
    const byTerm = (t: number | null) => units.filter((u) => u.term === t).map((u) => u.title);
    for (const t of [1, 2, 3]) expect(byTerm(t)).toEqual(expected.filter((e) => e.term === t).map((e) => e.title));
    expect(units.map((u) => u.status).every((s) => s === 'pending')).toBe(true);
    expect(byTerm(1)[0]).toBe('Números enteros y divisibilidad');
    await shot(page, info, '63-temario-importado');
  });

  test('clases-65 · @ai a very long programación: the review says where the reading stopped', async ({ page, teacher }, info) => {
    test.setTimeout(2 * AI_STEP);
    const [c] = teacher.courses;
    const filler = Array.from({ length: 260 }, (_, i) =>
      `Criterio ${i + 1}. Se valorará el razonamiento, la claridad en la exposición de los procedimientos y la revisión de los resultados obtenidos en cada actividad de aula.`,
    ).join('\n');
    const text = `${PROGRAMACION}\n\n4. Criterios de calificación detallados\n${filler}\n\n5. Anexo final: atención a la diversidad.`;
    expect(text.length).toBeGreaterThan(40_000);
    const sheet = await openImport(page, c.id);
    await sheet.getByLabel('Pega el índice del libro o de tu programación').fill(text);
    await sheet.locator('.sheet__foot').getByRole('button', { name: 'Proponer unidades' }).click();
    const review = dialog(page, 'Revisa las unidades');
    await expect(review).toBeVisible({ timeout: AI_STEP });
    await expect(review.getByText(/^El texto es muy largo: se ha leído hasta «….+»\. Si falta alguna unidad, pega la parte que sigue\.$/)).toBeVisible();
    await expect(titles(review)).toHaveCount(9);
    await shot(page, info, '65-texto-largo');
  });

  test('clases-64 · the server says no: the message stays and so does the pasted text', async ({ page, teacher }) => {
    const [c] = teacher.courses;
    await page.route((url) => url.pathname === `/api/courses/${c.id}/units/import`, (route) => route.fulfill({
      status: 400, contentType: 'application/json',
      body: JSON.stringify({ detail: 'No se han encontrado unidades en el texto. Pega el índice con un tema por línea.' }),
    }));
    const sheet = await openImport(page, c.id);
    await sheet.getByLabel('Pega el índice del libro o de tu programación').fill('Hola, esto no es un índice');
    await sheet.locator('.sheet__foot').getByRole('button', { name: 'Proponer unidades' }).click();
    const error = toast(page, 'No se han encontrado unidades en el texto. Pega el índice con un tema por línea.');
    await expect(error).toBeVisible();
    await expect(sheet).toBeVisible();
    await expect(sheet.getByLabel('Pega el índice del libro o de tu programación')).toHaveValue('Hola, esto no es un índice');
    await expect(sheet.locator('.sheet__foot').getByRole('button', { name: 'Proponer unidades' })).toBeEnabled();
    // Errors stay until dismissed.
    await error.getByRole('button', { name: 'Cerrar el aviso' }).click();
    await expect(error).toBeHidden();
    expect(await teacher.api.get(`/courses/${c.id}/units`)).toEqual([]);
  });

  test('clases-66 · a server without AI says so before the teacher pastes anything', async ({ page, teacher }) => {
    bug('BUG-CLASES-05', 'ImportUnitsSheet ignores useAIUnavailable: «Proponer unidades» is enabled and only a 503 toast explains it');
    const [c] = teacher.courses;
    await page.route((url) => url.pathname === '/api/me', async (route) => {
      const r = await route.fetch();
      await route.fulfill({ response: r, json: { ...(await r.json()), ai_provider: 'none' } });
    });
    let sent = false;
    await page.route((url) => url.pathname === `/api/courses/${c.id}/units/import`, (route) => { sent = true; return route.fallback(); });
    await openClass(page, c.id, 'programacion', '2.º ESO C');
    await page.getByRole('button', { name: 'Importar temario' }).click();
    await expect(page.getByText('La IA no está configurada en este servidor.')).toBeVisible();
    const sheet = dialog(page, 'Importar temario');
    if (await sheet.isVisible()) {
      await sheet.getByLabel('Pega el índice del libro o de tu programación').fill(PROGRAMACION);
      await expect(sheet.locator('.sheet__foot').getByRole('button')).toBeDisabled();
    }
    expect(sent).toBe(false);
  });
});
