import { readFileSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { bug, expect, isMobile, MATES_2C, openRoster, rosterRow, settle, sheet, shot, STUDENTS, test, toast } from './alumnos-helpers';

// «Añadir alumnos» (Clase › Alumnos): paste a list in any of the usual shapes, or pick a CSV/TXT/Excel file, check and
// correct the preview, add; or bring students from another group. What is added is checked in the roster and through
// the API. No AI. (A student added after the first list joins today: e2e/new-student.spec.ts checks Evaluar for that.)

const XLSX = new URL('./fixtures/alumnos-lista.xlsx', import.meta.url);

const addSheet = (page: Page) => sheet(page, 'Añadir alumnos');
const listField = (s: Locator) => s.getByLabel('Un alumno por línea');
/** The preview rows ("Apellidos, Nombre" + «Corregir»). */
const previewNames = (s: Locator) => s.locator('.add-st__preview .row .row__title');

async function openAdd(page: Page, courseId: string) {
  await page.goto(`/clases/${courseId}/alumnos?anadir=1`);
  await expect(addSheet(page)).toBeVisible();
  return addSheet(page);
}

async function names(api: { get: (p: string) => Promise<any> }, groupId: string): Promise<string[]> {
  return (await api.get(`/groups/${groupId}/students`)).map((s: { sort_name: string }) => s.sort_name);
}

test.describe('the first list of a new class', () => {
  test.use({ teacherSpec: { courses: [{ ...MATES_2C, students: [] }] } });

  test('alumnos-10 paste names written in several ways: preview, repeated once, «Añadir 5 alumnos»', async ({ page, teacher }, info) => {
    const [c] = teacher.courses;
    const s = await openAdd(page, c.id);
    // Nothing pasted: the button says why it is off.
    await expect(s.getByRole('button', { name: 'Pega al menos un nombre' })).toBeDisabled();
    await expect(s.getByText('Vale «Apellidos, Nombre» y «Nombre Apellidos», también copiado de Séneca, Raíces o un PDF.', { exact: false })).toBeVisible();

    await listField(s).fill('García López, Ana\nPablo Ruiz Serrano\nMaría del Carmen García López\nDE LA FUENTE, ANA\n1. Hugo Molina\nPablo Ruiz Serrano');
    await expect(s.getByRole('heading', { name: '5 alumnos · Apellidos, Nombre' })).toBeVisible();
    // Surname first; capitals recased; compound first names kept; the row number goes.
    await expect(previewNames(s)).toHaveText([
      'García López, Ana', 'Ruiz Serrano, Pablo', 'García López, María del Carmen', 'de la Fuente, Ana', 'Molina, Hugo',
    ]);
    await expect(s.getByText('«Pablo Ruiz Serrano» está repetido; se añade una vez.')).toBeVisible();
    await shot(page, info, 'anadir-pegar');

    await s.getByRole('button', { name: 'Añadir 5 alumnos' }).click();
    await expect(toast(page, '5 alumnos añadidos')).toBeVisible();
    await expect(s).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/clases/${c.id}/alumnos$`));
    await expect(page.locator('.students-roster').getByRole('heading', { name: '5 alumnos' })).toBeVisible();
    await expect(rosterRow(page, 'de la Fuente, Ana')).toBeVisible();
    // The class header counts them too.
    await expect(page.getByText(/^5 alumnos · Aula 112/)).toBeVisible();
    expect(await names(teacher.api, c.groupId)).toEqual([
      'de la Fuente, Ana', 'García López, Ana', 'García López, María del Carmen', 'Molina, Hugo', 'Ruiz Serrano, Pablo',
    ]);
  });

  test('alumnos-24 the preview shows each name whole on a phone, since the split is what the teacher checks', async ({ page, teacher }, info) => {
    bug('BUG-ALUMNOS-09', 'long names are cut with «…» in the preview («García López, María del Car…»), hiding the split to check');
    test.skip(!isMobile(info), 'a phone-width layout');
    const [c] = teacher.courses;
    const s = await openAdd(page, c.id);
    await listField(s).fill('María del Carmen García López\nJosé Antonio Fernández de la Vega');
    await expect(previewNames(s)).toHaveText(['García López, María del Carmen', 'Fernández de la Vega, José Antonio']);
    const cut = await previewNames(s).locator('span').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth).map((e) => e.textContent));
    expect(cut).toEqual([]);
  });

  test('alumnos-11 a list copied from a PDF: title lines are skipped with a warning', async ({ page, teacher }) => {
    const [c] = teacher.courses;
    const s = await openAdd(page, c.id);
    await listField(s).fill('Relación de alumnado por unidad\nCurso 2026/2027\nUnidad: 2º ESO C\nNº Alumno/a Fecha de nacimiento Repite\n'
      + '1 ABAD GARCÍA, ALEJANDRO 21/02/2014 No Ordinaria\n2 GARCÍA-LÓPEZ, JOSÉ LUIS 01/01/2014 Sí Repite');
    await expect(previewNames(s)).toHaveText(['Abad García, Alejandro', 'García-López, José Luis']);
    const warn = s.locator('.callout');
    await expect(warn).toContainText('Línea 1 ignorada: «Relación de alumnado por unidad»');
    await expect(warn).toContainText('Línea 4 ignorada: «Nº Alumno/a Fecha de nacimiento Repite»');
    await s.getByRole('button', { name: 'Añadir 2 alumnos' }).click();
    await expect(toast(page, '2 alumnos añadidos')).toBeVisible();
    expect(await names(teacher.api, c.groupId)).toEqual(['Abad García, Alejandro', 'García-López, José Luis']);
  });

  test('alumnos-12 rows copied from Séneca (number, date, «Repite»…) keep only the names', async ({ page, teacher }) => {
    const [c] = teacher.courses;
    const s = await openAdd(page, c.id);
    await listField(s).fill('1\tAbad García, Alejandro\t21/02/2014\tNo\tOrdinaria\n2\tBenítez Ruiz, Lucía\t03/05/2014\tSí\tRepite');
    await expect(previewNames(s)).toHaveText(['Abad García, Alejandro', 'Benítez Ruiz, Lucía']);
    await expect(s.getByRole('button', { name: 'Añadir 2 alumnos' })).toBeEnabled();
  });

  test('alumnos-13 a name typed after rows copied from Séneca is kept, or at least the teacher is told', async ({ page, teacher }) => {
    bug('BUG-ALUMNOS-01', 'a plain line after tab-separated rows is dropped from the preview without any warning');
    const [c] = teacher.courses;
    const s = await openAdd(page, c.id);
    await listField(s).fill('1\tAbad García, Alejandro\t21/02/2014\tNo\tOrdinaria\n2\tBenítez Ruiz, Lucía\t03/05/2014\tSí\tRepite\nCastro León, Marta');
    await expect(previewNames(s).first()).toHaveText('Abad García, Alejandro');
    const kept = previewNames(s).filter({ hasText: 'Castro León, Marta' });
    const told = s.locator('.callout').filter({ hasText: 'Castro León, Marta' });
    await expect(kept.or(told)).toBeVisible();
  });

  test('alumnos-14 correct the preview: fix a split, drop a line; «Hecho» needs the first name', async ({ page, teacher }, info) => {
    const [c] = teacher.courses;
    const s = await openAdd(page, c.id);
    await listField(s).fill('Ana García López\nMaría Pérez de Castro\nPablo Ruiz');
    await expect(previewNames(s)).toHaveCount(3);

    // «María Pérez de Castro» was read as «de Castro, María Pérez»: tap the row, fix both fields, «Hecho».
    await s.locator('.add-st__preview .row').filter({ hasText: 'de Castro, María Pérez' }).click();
    const last = s.getByLabel('Apellidos');
    const first = s.getByLabel('Nombre');
    await expect(last).toBeFocused();
    await expect(last).toHaveValue('de Castro');
    await expect(first).toHaveValue('María Pérez');
    await first.fill('');
    await expect(s.getByRole('button', { name: 'Hecho' })).toBeDisabled();
    await first.fill('María');
    await last.fill('Pérez de Castro');
    await shot(page, info, 'anadir-corregir');
    await s.getByRole('button', { name: 'Hecho' }).click();
    await expect(previewNames(s).nth(1)).toHaveText('Pérez de Castro, María');

    // Enter in «Nombre» also closes the editor.
    await s.locator('.add-st__preview .row').filter({ hasText: 'Ruiz, Pablo' }).click();
    await s.getByLabel('Nombre').fill('Pablo José');
    await s.getByLabel('Nombre').press('Enter');
    await expect(previewNames(s).nth(2)).toHaveText('Ruiz, Pablo José');

    // «Quitar» drops a line.
    await s.locator('.add-st__preview .row').filter({ hasText: 'García López, Ana' }).click();
    await s.getByRole('button', { name: 'Quitar' }).click();
    await expect(previewNames(s)).toHaveText(['Pérez de Castro, María', 'Ruiz, Pablo José']);
    await expect(s.getByRole('heading', { name: '2 alumnos · Apellidos, Nombre' })).toBeVisible();

    await s.getByRole('button', { name: 'Añadir 2 alumnos' }).click();
    await expect(toast(page, '2 alumnos añadidos')).toBeVisible();
    expect(await names(teacher.api, c.groupId)).toEqual(['Pérez de Castro, María', 'Ruiz, Pablo José']);
  });

  test('alumnos-15 «o elige un archivo»: a CSV fills the preview; typing again goes back to the pasted text', async ({ page, teacher }) => {
    const [c] = teacher.courses;
    const s = await openAdd(page, c.id);
    await listField(s).fill('Pablo Ruiz Serrano');
    await expect(previewNames(s)).toHaveText(['Ruiz Serrano, Pablo']);
    await expect(s.getByText('(CSV, TXT o Excel)')).toBeVisible();

    const chooser = page.waitForEvent('filechooser');
    await s.getByRole('button', { name: 'o elige un archivo' }).click();
    await (await chooser).setFiles({ name: 'lista 2C.csv', mimeType: 'text/csv', buffer: Buffer.from('Apellidos;Nombre\nOrtega Blanco;Jorge\nPrieto Sanz;Lucía\n') });
    await expect(s.getByText('· lista 2C.csv')).toBeVisible();
    await expect(previewNames(s)).toHaveText(['Ortega Blanco, Jorge', 'Prieto Sanz, Lucía']);
    await expect(s.getByRole('button', { name: 'Añadir 2 alumnos' })).toBeEnabled();

    // Typing takes the text back.
    await listField(s).fill('Pablo Ruiz Serrano\nAna Gil');
    await expect(s.getByText('· lista 2C.csv')).toHaveCount(0);
    await expect(previewNames(s)).toHaveText(['Ruiz Serrano, Pablo', 'Gil, Ana']);

    // The file again, and add from it: only the file's students go in.
    const again = page.waitForEvent('filechooser');
    await s.getByRole('button', { name: 'o elige un archivo' }).click();
    await (await again).setFiles({ name: 'lista 2C.csv', mimeType: 'text/csv', buffer: Buffer.from('Apellidos;Nombre\nOrtega Blanco;Jorge\nPrieto Sanz;Lucía\n') });
    await expect(previewNames(s)).toHaveText(['Ortega Blanco, Jorge', 'Prieto Sanz, Lucía']);
    await s.getByRole('button', { name: 'Añadir 2 alumnos' }).click();
    await expect(toast(page, '2 alumnos añadidos')).toBeVisible();
    expect(await names(teacher.api, c.groupId)).toEqual(['Ortega Blanco, Jorge', 'Prieto Sanz, Lucía']);
  });

  test('alumnos-16 an Excel sheet (.xlsx) with a title and a header row', async ({ page, teacher }, info) => {
    const [c] = teacher.courses;
    const s = await openAdd(page, c.id);
    const chooser = page.waitForEvent('filechooser');
    await s.getByRole('button', { name: 'o elige un archivo' }).click();
    await (await chooser).setFiles({
      name: 'Alumnado 2C.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: readFileSync(XLSX),
    });
    await expect(previewNames(s)).toHaveText(['Ortega Blanco, Jorge', 'Prieto Sanz, Lucía', 'Quintana Ríos, María José']);
    await shot(page, info, 'anadir-excel');
    await s.getByRole('button', { name: 'Añadir 3 alumnos' }).click();
    await expect(toast(page, '3 alumnos añadidos')).toBeVisible();
    expect(await names(teacher.api, c.groupId)).toEqual(['Ortega Blanco, Jorge', 'Prieto Sanz, Lucía', 'Quintana Ríos, María José']);
  });

  test('alumnos-17 an old Excel file (.xls) or a huge file says why it is refused; a .txt list works', async ({ page, teacher }) => {
    const [c] = teacher.courses;
    const s = await openAdd(page, c.id);
    const chooser = page.waitForEvent('filechooser');
    await s.getByRole('button', { name: 'o elige un archivo' }).click();
    await (await chooser).setFiles({ name: 'alumnos.xls', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from('D0CF11E0', 'hex') });
    await expect(s.getByRole('alert')).toHaveText('Guarda la hoja como .xlsx o CSV, o copia y pega la columna de nombres.');
    await expect(s.getByRole('button', { name: 'Pega al menos un nombre' })).toBeDisabled();
    // A file over 2 MB is refused too.
    const big = page.waitForEvent('filechooser');
    await s.getByRole('button', { name: 'o elige un archivo' }).click();
    await (await big).setFiles({ name: 'todo el centro.csv', mimeType: 'text/csv', buffer: Buffer.alloc(2_100_000, 'Ruiz Gil, Ana\n') });
    await expect(s.getByRole('alert')).toHaveText('El fichero es demasiado grande.');
    // A plain-text list works like the pasted one.
    const txt = page.waitForEvent('filechooser');
    await s.getByRole('button', { name: 'o elige un archivo' }).click();
    await (await txt).setFiles({ name: 'lista.txt', mimeType: 'text/plain', buffer: Buffer.from('Ana García López\nPablo Ruiz Serrano\n') });
    await expect(s.getByRole('alert')).toHaveCount(0);
    await expect(previewNames(s)).toHaveText(['García López, Ana', 'Ruiz Serrano, Pablo']);
    expect(await names(teacher.api, c.groupId)).toEqual([]);
  });

  test('alumnos-18 the server refuses: the error stays in the sheet with the list, then it goes in', async ({ page, teacher }) => {
    const [c] = teacher.courses;
    const s = await openAdd(page, c.id);
    await listField(s).fill('Pablo Ruiz Serrano');
    await expect(previewNames(s)).toHaveText(['Ruiz Serrano, Pablo']);
    await page.route(`**/api/groups/${c.groupId}/students`, (route) => (route.request().method() === 'POST'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"boom"}' }) : route.continue()), { times: 1 });
    await s.getByRole('button', { name: 'Añadir 1 alumno' }).click();
    await expect(s.getByRole('alert')).toHaveText('El servidor ha fallado. Inténtalo en un momento.');
    await expect(listField(s)).toHaveValue('Pablo Ruiz Serrano');
    await s.getByRole('button', { name: 'Añadir 1 alumno' }).click();
    await expect(toast(page, '1 alumno añadido')).toBeVisible();
    expect(await names(teacher.api, c.groupId)).toEqual(['Ruiz Serrano, Pablo']);
  });

  test('alumnos-19 a pasted list is not lost by a stray tap: the scrim does nothing and ✕ asks first', async ({ page, teacher }) => {
    bug('BUG-ALUMNOS-02', '«Añadir alumnos» does not mark the sheet dirty: a tap on the scrim, ✕, Esc or back discard a pasted list');
    const [c] = teacher.courses;
    const s = await openAdd(page, c.id);
    await listField(s).fill('García López, Ana\nPablo Ruiz Serrano');
    await expect(previewNames(s)).toHaveCount(2);
    await page.locator('.sheet-scrim').click({ position: { x: 20, y: 20 } });
    await settle(page);
    await expect(s).toBeVisible();
    await s.getByRole('button', { name: 'Cerrar' }).click({ timeout: 5000 });
    await expect(sheet(page, 'Descartar los cambios')).toBeVisible();
  });
});

test.describe('a class that already has its list', () => {
  test.use({
    teacherSpec: {
      courses: [
        MATES_2C,
        // Another group of the same teacher, with students of its own.
        { subject: 'Matemáticas', short: 'Mates', group: '2º ESO D', students: ['Navarro Gil, Iker', 'Ortiz Vela, Noa', 'Pardo Sanz, Lola'] },
        // A third group, still without students: not offered as a source.
        { subject: 'Matemáticas', short: 'Mates', group: '2º ESO E', students: [] },
      ],
    },
  });

  test('alumnos-20 one more student, one by one; a repeated name is not added twice', async ({ page, teacher }) => {
    const [c] = teacher.courses;
    await openRoster(page, c.id);
    await expect(page.locator('.students-roster').getByRole('heading', { name: '12 alumnos' })).toBeVisible();
    await page.locator('.students-roster').getByRole('button', { name: 'Añadir alumnos' }).click();
    const s = addSheet(page);
    // With other groups there is a choice; pasting is the default.
    await expect(s.getByRole('group', { name: 'Cómo añadir' }).getByRole('button', { name: 'Pegar lista' })).toHaveAttribute('aria-pressed', 'true');
    await listField(s).fill('Vidal Ruiz, Nuria');
    await s.getByRole('button', { name: 'Añadir 1 alumno' }).click();
    await expect(toast(page, '1 alumno añadido')).toBeVisible();
    await expect(page.locator('.students-roster').getByRole('heading', { name: '13 alumnos' })).toBeVisible();
    await expect(rosterRow(page, 'Vidal Ruiz, Nuria')).toBeVisible();

    // The same name again, and one new: only the new one goes in.
    await page.locator('.students-roster').getByRole('button', { name: 'Añadir alumnos' }).click();
    await expect(listField(s)).toHaveValue(''); // the sheet opens clean
    await listField(s).fill('Vidal Ruiz, Nuria\nZamora Gil, Leo');
    await s.getByRole('button', { name: 'Añadir 2 alumnos' }).click();
    await expect(toast(page, /^1 alumno añadido \(1 ya/)).toBeVisible();
    // Everybody already there.
    await page.locator('.students-roster').getByRole('button', { name: 'Añadir alumnos' }).click();
    await listField(s).fill('Alonso Gil, Marta');
    await s.getByRole('button', { name: 'Añadir 1 alumno' }).click();
    await expect(toast(page, 'Todos ya estaban en el grupo')).toBeVisible();
    const all = await names(teacher.api, c.groupId);
    expect(all.length).toBe(14);
    expect(all.filter((n) => n === 'Vidal Ruiz, Nuria')).toHaveLength(1);
  });

  test('alumnos-21 «(1 ya estaban)» agrees in number: «1 ya estaba»', async ({ page, teacher }) => {
    bug('BUG-ALUMNOS-03', 'the toast says «1 alumno añadido (1 ya estaban)»: plural verb for one student');
    const [c] = teacher.courses;
    const s = await openAdd(page, c.id);
    await listField(s).fill('Alonso Gil, Marta\nZamora Gil, Leo');
    await s.getByRole('button', { name: 'Añadir 2 alumnos' }).click();
    await expect(toast(page, '1 alumno añadido (1 ya estaba)')).toBeVisible();
  });

  test('alumnos-22 «De otro grupo»: pick students of 2.º ESO D; they keep their group and join this one', async ({ page, teacher }, info) => {
    const [c, d] = teacher.courses;
    const s = await openAdd(page, c.id);
    await s.getByRole('group', { name: 'Cómo añadir' }).getByRole('button', { name: 'De otro grupo' }).click();
    await expect(s.getByText('Elige el grupo del que vienen. Sus notas y observaciones siguen con ellos.')).toBeVisible();
    await expect(s.getByRole('button', { name: 'Elige alumnos' })).toBeDisabled();
    // Only groups with students are offered.
    await expect(s.locator('.chip-row').getByRole('button')).toHaveText(['2.º ESO D']);
    await s.getByRole('button', { name: '2.º ESO D' }).click();
    await expect(s.getByRole('heading', { name: '3 alumnos' })).toBeVisible();

    // «Todos» / «Ninguno», then a pick of two.
    await s.getByRole('button', { name: 'Todos' }).click();
    await expect(s.getByRole('button', { name: 'Añadir 3 alumnos' })).toBeEnabled();
    await s.getByRole('button', { name: 'Ninguno' }).click();
    await expect(s.getByRole('button', { name: 'Elige alumnos' })).toBeDisabled();
    await s.getByRole('button', { name: 'Navarro Gil, Iker' }).click();
    await s.getByRole('button', { name: 'Pardo Sanz, Lola' }).click();
    await shot(page, info, 'anadir-otro-grupo');
    await s.getByRole('button', { name: 'Añadir 2 alumnos' }).click();
    await expect(toast(page, '2 alumnos añadidos')).toBeVisible();
    await expect(rosterRow(page, 'Navarro Gil, Iker')).toBeVisible();
    await expect(rosterRow(page, 'Pardo Sanz, Lola')).toBeVisible();

    // Still in 2.º ESO D; the ficha names both groups (their order: BUG-ALUMNOS-04, alumnos-24).
    expect(await names(teacher.api, d.groupId)).toEqual(['Navarro Gil, Iker', 'Ortiz Vela, Noa', 'Pardo Sanz, Lola']);
    await rosterRow(page, 'Navarro Gil, Iker').click();
    await expect(page.locator('.page-head .eyebrow')).toHaveText(/^2\.º ESO [CD] · 2\.º ESO [CD]$/);
    await expect(page.locator('.page-head .eyebrow')).toContainText('2.º ESO C');
    await expect(page.locator('.page-head .eyebrow')).toContainText('2.º ESO D');

    // Back in the sheet, only Noa is left to bring; after her, nobody.
    await page.goto(`/clases/${c.id}/alumnos?anadir=1`);
    await s.getByRole('button', { name: 'De otro grupo' }).click();
    await s.getByRole('button', { name: '2.º ESO D' }).click();
    await expect(s.locator('.list .row')).toHaveText(['Ortiz Vela, Noa']);
    await s.getByRole('button', { name: 'Ortiz Vela, Noa' }).click();
    await s.getByRole('button', { name: 'Añadir 1 alumno' }).click();
    await expect(toast(page, '1 alumno añadido')).toBeVisible();
    await page.goto(`/clases/${c.id}/alumnos?anadir=1`);
    await s.getByRole('button', { name: 'De otro grupo' }).click();
    await s.getByRole('button', { name: '2.º ESO D' }).click();
    await expect(s.getByText('Ya están todos en esta clase')).toBeVisible();
    expect((await names(teacher.api, c.groupId)).length).toBe(STUDENTS.length + 3);
  });

  test('alumnos-23 back and Esc close the sheet; it opens clean the next time', async ({ page, teacher }, info) => {
    const [c] = teacher.courses;
    const s = await openAdd(page, c.id);
    await page.keyboard.press('Escape');
    await expect(s).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/clases/${c.id}/alumnos$`));
    await page.locator('.students-roster').getByRole('button', { name: 'Añadir alumnos' }).click();
    await s.getByRole('button', { name: 'De otro grupo' }).click();
    await s.getByRole('button', { name: '2.º ESO D' }).click();
    if (isMobile(info)) await page.goBack(); else await s.getByRole('button', { name: 'Cerrar' }).click();
    await expect(s).toBeHidden();
    await page.locator('.students-roster').getByRole('button', { name: 'Añadir alumnos' }).click();
    await expect(s.getByRole('button', { name: 'Pegar lista' })).toHaveAttribute('aria-pressed', 'true');
    await expect(listField(s)).toHaveValue('');
  });
});

test.describe('a group with two classes', () => {
  test.use({ teacherSpec: { courses: [MATES_2C, { subject: 'Física y Química', short: 'FyQ', sameGroupAs: 0, slots: [] }] } });

  test('alumnos-25 a student added from one class joins the group: both classes list him; removed from the group, neither does', async ({ page, teacher }) => {
    const [mates, fyq] = teacher.courses;
    const s = await openAdd(page, fyq.id);
    await listField(s).fill('Vidal Ruiz, Nuria');
    await s.getByRole('button', { name: 'Añadir 1 alumno' }).click();
    await expect(toast(page, '1 alumno añadido')).toBeVisible();
    await expect(rosterRow(page, 'Vidal Ruiz, Nuria')).toBeVisible();
    await openRoster(page, mates.id);
    await expect(page.locator('.students-roster').getByRole('heading', { name: '13 alumnos' })).toBeVisible();
    await rosterRow(page, 'Vidal Ruiz, Nuria').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Nuria Vidal Ruiz' })).toBeVisible();

    // «Quitar de 2.º ESO C» names the group: out of both classes.
    await page.getByRole('button', { name: 'Más opciones', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Quitar de 2.º ESO C' }).click();
    await sheet(page, 'Quitar a Nuria de 2.º ESO C').getByRole('button', { name: 'Quitar' }).click();
    await expect(toast(page, 'Quitado de 2.º ESO C')).toBeVisible();
    await expect(rosterRow(page, 'Vidal Ruiz, Nuria')).toHaveCount(0);
    await openRoster(page, fyq.id);
    await expect(page.locator('.students-roster').getByRole('heading', { name: '12 alumnos' })).toBeVisible();
    await expect(rosterRow(page, 'Vidal Ruiz, Nuria')).toHaveCount(0);
  });
});
