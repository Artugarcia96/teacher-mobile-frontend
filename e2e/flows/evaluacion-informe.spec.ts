import { readFileSync } from 'node:fs';
import {
  BASE, bug, csvRows, downloaded, evalMenu, expect, openEvaluation, pdfText, shot, STUDENTS, terms, test, toast, type Api,
  type CourseSpec, type Locator, type Page,
} from './evaluacion-helpers';

// Informe para el departamento (docs/PRODUCT.md §4.6): una tabla por materia y una fila por grupo (alumnos y cuántos con
// nota, % aprobados, media, distribución, unidades previstas e impartidas) con «Causas y propuestas», que se guarda al
// salir del campo, con Intro, al cambiar de evaluación, antes de descargar y al cerrar. Descargas en PDF y CSV.

/** 1.º ESO A: one exam with a grade missing, three units of the 1.ª (one taught, one in progress, one to start) and one of the 2.ª. */
const PRIMERO: CourseSpec = {
  group: '1º ESO A', color: 'ochre', students: ['Ruiz Mora, Ana', 'Sanz Gil, Bruno', 'Vidal Pons, Carla'],
  units: [
    { title: 'U1 · Números naturales', status: 'done' },
    { title: 'U2 · Divisibilidad', status: 'current' },
    { title: 'U3 · Fracciones', status: 'pending' },
    { title: 'U4 · Decimales', term: 2, status: 'pending' },
  ],
  activities: [{ title: 'Examen U1 · Números naturales', date: '2026-10-29', grades: [7, 4, null] }],
};
const FYQ: CourseSpec = {
  subject: 'Física y Química', group: '3º ESO A', color: 'indigo', students: ['León Díaz, Eva', 'Mora Gil, Iván'],
  activities: [{ title: 'Examen U1 · La materia', date: '2026-10-29', grades: [6, 9] }],
};
const BACH: CourseSpec = {
  subject: 'Matemáticas I', group: '1º Bach B', stage: 'bachillerato', color: 'rose', students: ['Nieto Sanz, Leo', 'Ortiz Gil, Sara'],
  activities: [{ title: 'Examen U1 · Números reales', date: '2026-10-29', grades: [4, 8] }],
};

const report = (page: Page) => page.getByRole('dialog', { name: 'Informe del departamento' });
/** The row of a class in the report: by its group, the subject is the table's (PRODUCT §4.6). */
const classRow = (sheet: Locator, group: string) => sheet.locator('.dept-row').filter({ has: sheet.page().getByText(group, { exact: true }) });
const notes = (row: Locator) => row.getByRole('textbox', { name: 'Causas y propuestas' });

async function openReport(page: Page) {
  await page.goto('/evaluar');
  await page.getByRole('button', { name: 'Informe del departamento' }).click();
  const sheet = report(page);
  await expect(sheet.locator('.dept-row').first()).toBeVisible();
  return sheet;
}

async function savedNotes(api: Api, term = 1): Promise<Record<string, string>> {
  const rep = await api.get(`/evaluation/department?term=${term}`);
  return Object.fromEntries(rep.subjects.flatMap((s: { rows: { course: { label: string }; notes: string }[] }) => s.rows)
    .map((r: { course: { label: string }; notes: string }) => [r.course.label, r.notes]));
}

test.describe('el informe de un profesor de Matemáticas y Física y Química', () => {
  test.use({ worldSpec: { courses: [BASE, PRIMERO, FYQ, BACH] } });

  test('evaluacion-80 una tabla por materia y una fila por clase con resultados y unidades', async ({ page }, info) => {
    const sheet = await openReport(page);
    await expect(sheet.locator('.sheet__sub')).toHaveText('Una tabla por materia y una fila por clase: resultados, unidades previstas e impartidas, causas y propuestas.');
    await expect(terms(sheet).getByRole('button', { name: '1.ª', exact: true })).toHaveAttribute('aria-pressed', 'true');
    // Matemáticas does not include Física y Química; Matemáticas I is its own subject. In class-list order.
    await expect(sheet.getByRole('heading', { level: 2 })).toHaveText(['Matemáticas', 'Física y Química', 'Matemáticas I']);
    // One row per group: the subject is the table's.
    await expect(sheet.locator('.dept-row__head')).toHaveText(['1.º ESO A', '2.º ESO C', '3.º ESO A', '1.º Bach B']);
    const primero = classRow(sheet, '1.º ESO A');
    await expect(primero.locator('.dept-row__stats')).toHaveText('3 alumnos (2 con nota) · 50 % aprobados · media 5,5 · IN 1 · SU 0 · BI 0 · NT 1 · SB 0');
    await expect(primero.locator('.dept-row__units')).toHaveText('1 de 3 unidades impartidas · en curso: U2 · Divisibilidad · sin empezar: U3 · Fracciones');
    const segundo = classRow(sheet, '2.º ESO C');
    await expect(segundo.locator('.dept-row__stats')).toHaveText('6 alumnos · 67 % aprobados · media 6,4 · IN 2 · SU 0 · BI 1 · NT 2 · SB 1');
    await expect(segundo.locator('.dept-row__units')).toHaveText('Sin unidades en esta evaluación');
    await expect(classRow(sheet, '3.º ESO A').locator('.dept-row__stats'))
      .toHaveText('2 alumnos · 100 % aprobados · media 7,5 · IN 0 · SU 0 · BI 1 · NT 0 · SB 1');
    // Bachillerato: numeric bands.
    await expect(classRow(sheet, '1.º Bach B').locator('.dept-row__stats'))
      .toHaveText('2 alumnos · 50 % aprobados · media 6,0 · <5: 1 · 5: 0 · 6: 0 · 7-8: 1 · 9-10: 0');
    for (const row of await sheet.locator('.dept-row').all()) await expect(notes(row)).toHaveValue('');
    await shot(page, info, 'informe');
  });

  test('evaluacion-81 «Causas y propuestas» se guarda al salir del campo y con Intro', async ({ page, world }) => {
    const sheet = await openReport(page);
    const segundo = notes(classRow(sheet, '2.º ESO C'));
    await segundo.fill('Dos alumnos no entregan las tareas. Proponemos   un refuerzo semanal.');
    await segundo.press('Tab');
    await expect(toast(page, 'Guardado: Matemáticas · 2.º ESO C')).toBeVisible();

    const fyq = notes(classRow(sheet, '3.º ESO A'));
    await fyq.fill('Buenos resultados en el laboratorio.');
    await fyq.press('Enter');
    await expect(toast(page, 'Guardado: Física y Química · 3.º ESO A')).toBeVisible();
    await expect(fyq).toHaveValue('Buenos resultados en el laboratorio.'); // Enter saves, it does not break the line

    expect(await savedNotes(world.api)).toMatchObject({
      'Matemáticas · 2.º ESO C': 'Dos alumnos no entregan las tareas. Proponemos un refuerzo semanal.',
      'Física y Química · 3.º ESO A': 'Buenos resultados en el laboratorio.',
    });
    // Reopened, the report keeps them.
    await sheet.getByRole('button', { name: 'Cerrar' }).click();
    await page.getByRole('button', { name: 'Informe del departamento' }).click();
    await expect(notes(classRow(report(page), '3.º ESO A'))).toHaveValue('Buenos resultados en el laboratorio.');
  });

  test('evaluacion-82 cerrar con Esc mientras se escribe guarda la línea igualmente', async ({ page, world }) => {
    const sheet = await openReport(page);
    await notes(classRow(sheet, '1.º ESO A')).fill('Falta terminar la unidad de divisibilidad.');
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect.poll(async () => (await savedNotes(world.api))['Matemáticas · 1.º ESO A']).toBe('Falta terminar la unidad de divisibilidad.');
  });

  test('evaluacion-83 cada evaluación tiene sus líneas de causas y propuestas', async ({ page, world }) => {
    const sheet = await openReport(page);
    await notes(classRow(sheet, '2.º ESO C')).fill('Resultados dentro de lo previsto.');
    await notes(classRow(sheet, '2.º ESO C')).press('Tab');
    await expect(toast(page, 'Guardado: Matemáticas · 2.º ESO C')).toBeVisible();
    // (Tapping another term straight from the field saves the line twice at once: EVA-04, evaluacion-89.)
    await terms(sheet).getByRole('button', { name: '2.ª', exact: true }).click();
    await expect(terms(sheet).getByRole('button', { name: '2.ª', exact: true })).toHaveAttribute('aria-pressed', 'true');

    const primero = classRow(sheet, '1.º ESO A');
    await expect(primero.locator('.dept-row__stats')).toHaveText('3 alumnos (0 con nota) · — aprobados · media — · IN 0 · SU 0 · BI 0 · NT 0 · SB 0');
    await expect(primero.locator('.dept-row__units')).toHaveText('0 de 1 unidad impartida · sin empezar: U4 · Decimales');
    await expect(notes(classRow(sheet, '2.º ESO C'))).toHaveValue('');

    await terms(sheet).getByRole('button', { name: '1.ª', exact: true }).click();
    await expect(notes(classRow(sheet, '2.º ESO C'))).toHaveValue('Resultados dentro de lo previsto.');
    expect((await savedNotes(world.api, 1))['Matemáticas · 2.º ESO C']).toBe('Resultados dentro de lo previsto.');
    expect((await savedNotes(world.api, 2))['Matemáticas · 2.º ESO C']).toBe('');
  });

  test('evaluacion-84 descargar el CSV: una tabla por materia, con las causas escritas', async ({ page }) => {
    const sheet = await openReport(page);
    await notes(classRow(sheet, '1.º ESO A')).fill('Refuerzo en divisibilidad.');
    await notes(classRow(sheet, '1.º ESO A')).press('Tab');
    await expect(toast(page, 'Guardado: Matemáticas · 1.º ESO A')).toBeVisible();
    const { name, body } = await downloaded(page, () => sheet.getByRole('button', { name: 'Descargar CSV' }).click());
    expect(name).toBe('Informe del departamento - 1a evaluacion.csv');
    await expect(toast(page, 'Informe descargado')).toBeVisible();
    const header = (bands: string[]) => ['Grupo', 'Alumnos', 'Con nota', 'Aprobados (%)', 'Media', ...bands,
      'Unidades previstas', 'Unidades impartidas', 'Causas y propuestas'];
    const eso = header(['IN (<5)', 'SU (5)', 'BI (6)', 'NT (7-8)', 'SB (9-10)']);
    expect(csvRows(body)).toEqual([
      ['Matemáticas'], eso,
      ['1.º ESO A', '3', '2', '50', '5,5', '1', '0', '0', '1', '0', '3', '1', 'Refuerzo en divisibilidad.'],
      ['2.º ESO C', '6', '6', '67', '6,4', '2', '0', '1', '2', '1', '0', '0', ''],
      [''],
      ['Física y Química'], eso,
      ['3.º ESO A', '2', '2', '100', '7,5', '0', '0', '1', '0', '1', '0', '0', ''],
      [''],
      // Bachillerato: numeric bands.
      ['Matemáticas I'], header(['<5', '5', '6', '7-8', '9-10']),
      ['1.º Bach B', '2', '2', '50', '6,0', '1', '0', '0', '1', '0', '0', '0', ''],
    ]);
  });

  test('evaluacion-85 descargar el PDF: resultados por clase, unidades sin terminar y causas', async ({ page }) => {
    const sheet = await openReport(page);
    await notes(classRow(sheet, '2.º ESO C')).fill('Se propone un taller de fracciones.');
    await notes(classRow(sheet, '2.º ESO C')).press('Enter');
    await expect(toast(page, 'Guardado: Matemáticas · 2.º ESO C')).toBeVisible();
    const { name, body } = await downloaded(page, () => sheet.getByRole('button', { name: 'Descargar PDF' }).click());
    expect(name).toBe('Informe del departamento - 1a evaluacion.pdf');
    await expect(toast(page, 'Informe descargado')).toBeVisible();
    const text = pdfText(body);
    expect(text).toContain('Informe para el departamento');
    expect(text).toContain('Informe de la 1.ª evaluación');
    expect(text).toContain('Unidades previstas sin terminar. Matemáticas · 1.º ESO A: U2 · Divisibilidad (en curso), U3 · Fracciones.');
    for (const group of ['1.º ESO A', '2.º ESO C', '3.º ESO A', '1.º Bach B']) expect(text).toContain(group);
    for (const subject of ['Matemáticas', 'Física y Química', 'Matemáticas I']) expect(text).toContain(subject);
    expect(text).toContain('3 (2 con nota)');
    expect(text).toContain('Se propone un taller de fracciones.');
  });

  test('evaluacion-89 escribir y descargar sin salir del campo: la línea se guarda una vez y entra en el archivo', async ({ page }) => {
    bug('EVA-04', 'leaving the field by pressing «Descargar» (or a term) saves the same new line twice at once; the second save can fail with a 500 (UNIQUE department_notes) and then no file is downloaded');
    const puts: string[] = [];
    // A save that takes a moment to answer (a phone on the school's Wi-Fi): the download must not save the line again.
    await page.route('**/api/courses/*/evaluation/1/department-note', async (r) => {
      puts.push(r.request().postData() ?? '');
      const res = await r.fetch();
      await new Promise((ok) => setTimeout(ok, 400));
      await r.fulfill({ response: res });
    });
    const sheet = await openReport(page);
    await notes(classRow(sheet, '3.º ESO A')).fill('Se repasará la tabla periódica.');
    const file = page.waitForEvent('download', { timeout: 15_000 }).catch(() => null);
    await sheet.getByRole('button', { name: 'Descargar CSV' }).click();
    // Whatever happens, the sheet answers: the file, or the error of the second save.
    await expect(toast(page, /Informe descargado|El servidor ha fallado/).first()).toBeVisible({ timeout: 15_000 });
    expect(puts, 'one save for one edit').toHaveLength(1);
    await expect(toast(page, 'El servidor ha fallado. Inténtalo en un momento.')).toHaveCount(0);
    const download = await file;
    expect(download, 'the report is downloaded').not.toBeNull();
    const body = readFileSync((await download!.path())!);
    expect(csvRows(body).find((r) => r[0] === '3.º ESO A')?.at(-1)).toBe('Se repasará la tabla periódica.');
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('evaluacion-86 si una descarga falla, lo dice y el informe sigue abierto', async ({ page }) => {
    const sheet = await openReport(page);
    await page.route('**/api/evaluation/department.pdf?*', (r) => r.fulfill({
      status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Internal Server Error' }),
    }));
    await sheet.getByRole('button', { name: 'Descargar PDF' }).click();
    await expect(toast(page, 'El servidor ha fallado. Inténtalo en un momento.')).toBeVisible();
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Descargar PDF' })).toBeEnabled();
    await expect(sheet.getByRole('button', { name: 'Descargar CSV' })).toBeEnabled();
  });
});

test.describe('si el informe no carga', () => {
  test.use({ worldSpec: { courses: [BASE] } });

  test('evaluacion-87 «No se ha podido cargar el informe»', async ({ page }) => {
    await page.route('**/api/evaluation/department?*', (r) => r.fulfill({
      status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Internal Server Error' }),
    }));
    await page.goto('/evaluar');
    await page.getByRole('button', { name: 'Informe del departamento' }).click();
    await expect(report(page).getByText('No se ha podido cargar el informe.')).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('un profesor con la única clase archivada', () => {
  test.use({ worldSpec: { courses: [{ ...BASE, students: STUDENTS.slice(0, 2), activities: [] }] } });

  test('evaluacion-88 sin clases activas, el informe lo dice', async ({ page, world }) => {
    await world.api.patch(`/courses/${world.c.id}`, { archived: true });
    await openEvaluation(page, world.c.id);
    await evalMenu(page, 'Informe del departamento');
    await expect(report(page).getByText('No tienes clases activas.')).toBeVisible();
  });
});
