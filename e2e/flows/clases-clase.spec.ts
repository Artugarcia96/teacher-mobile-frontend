import { readFileSync } from 'node:fs';
import {
  classMenu, classMenuPick, classRow, DEMO_1A, DEMO_1BACH, DEMO_2B, DEMO_3A, demoCourse, dialog, expect, MATES_2C, openClass,
  shot, tab, test, THU, toast, TODAY,
} from './clases-helpers';

// The class page (docs/PRODUCT.md §4.9): header facts (the same text as in Clases), «Pasar lista» while the class is on,
// the four tabs, «‹ back» naming where it came from, the one «···» menu with the open tab's actions, and the error
// states. The demo teacher is only looked at; what changes data runs as a teacher of its own.

test.describe('clases · cabecera y menú (demo)', () => {
  test('clases-24 · header: subject, group and one line of facts; «Pasar lista» only while the class is on', async ({ page, demo }, info) => {
    const b2 = await demoCourse(demo, DEMO_2B);
    await openClass(page, b2.id, '', '2.º ESO B');
    await expect(page.locator('.page-head__eyebrow')).toHaveText('Matemáticas');
    await expect(page.locator('.course-facts')).toHaveText('26 alumnos · Aula 204 · En clase hasta 11:15');
    // Offered while the list of the class on now is still to take (taking it: clases-25, a teacher of its own).
    const now = await demo.get(`/courses/${b2.id}/attendance?date=${TODAY}&start=10:20`);
    await expect(page.getByRole('button', { name: 'Pasar lista' })).toHaveCount(now.taken ? 0 : 1);
    await shot(page, info, '24-cabecera');

    for (const [label, group, facts] of [
      [DEMO_3A, '3.º ESO A', '24 alumnos · Lab. 1 · Martes 24 nov, 08:30'], // a room that is not a number stays as written
      [DEMO_1BACH, '1.º Bach B', '22 alumnos · Aula 301 · Hoy 12:40'],
      [DEMO_1A, '1.º ESO A', '25 alumnos · Aula 105 · Mañana 11:45'],
    ]) {
      await openClass(page, (await demoCourse(demo, label)).id, '', group);
      await expect(page.locator('.course-facts')).toHaveText(facts);
      await expect(page.getByRole('button', { name: 'Pasar lista' })).toHaveCount(0);
    }
  });

  test('clases-26 · the four tabs change the address without piling up history; an unknown one is Cuaderno', async ({ page, demo }) => {
    const b2 = await demoCourse(demo, DEMO_2B);
    await page.goto('/clases');
    await classRow(page, DEMO_2B).click();
    await expect(tab(page, 'Cuaderno')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Actividad' })).toBeVisible();

    await tab(page, 'Alumnos').click();
    await expect(page).toHaveURL(new RegExp(`/clases/${b2.id}/alumnos$`));
    await expect(tab(page, 'Alumnos')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Cano Álvarez, Jorge')).toBeVisible();
    await tab(page, 'Temario').click();
    await expect(page).toHaveURL(new RegExp(`/clases/${b2.id}/programacion$`));
    await expect(page.getByRole('heading', { name: '1.ª evaluación' })).toBeVisible();
    await tab(page, 'Faltas').click();
    await expect(page).toHaveURL(new RegExp(`/clases/${b2.id}/asistencia$`));
    await tab(page, 'Cuaderno').click();
    await expect(page).toHaveURL(new RegExp(`/clases/${b2.id}/cuaderno$`));

    // Tabs replace the entry: back leaves the class.
    await page.goBack();
    await expect(page).toHaveURL(/\/clases$/);

    await page.goto(`/clases/${b2.id}/lo-que-sea`);
    await expect(tab(page, 'Cuaderno')).toHaveAttribute('aria-pressed', 'true');
  });

  test('clases-27 · «‹» names where the class was opened from: Clases, Hoy, or Clases when opened directly', async ({ page, demo }) => {
    const b2 = await demoCourse(demo, DEMO_2B);
    const back = (name: string) => page.locator('.back-btn').filter({ hasText: name });

    await page.goto('/clases');
    await classRow(page, DEMO_2B).click();
    await expect(back('Clases')).toBeVisible();
    await back('Clases').click();
    await expect(page).toHaveURL(/\/clases$/);

    await page.goto('/hoy');
    await page.getByRole('region', { name: /^Ahora/ }).getByRole('link', { name: '2.º ESO B · Mates' }).click();
    await expect(page.getByRole('heading', { level: 1, name: '2.º ESO B' })).toBeVisible();
    await expect(back('Hoy')).toBeVisible();
    await back('Hoy').click();
    await expect(page).toHaveURL(/\/hoy/);

    await page.goto(`/clases/${b2.id}/alumnos`);
    await expect(back('Clases')).toBeVisible();
    await back('Clases').click();
    await expect(page).toHaveURL(/\/clases$/);
  });

  test('clases-28 · one «···» menu: the open tab\'s actions first, then Añadir alumnos and Ajustes de la clase', async ({ page, demo }, info) => {
    const b2 = await demoCourse(demo, DEMO_2B);
    const items = async () => {
      const menu = await classMenu(page);
      const labels = await menu.getByRole('menuitem').allInnerTexts();
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
      return labels.map((l) => l.trim());
    };
    await openClass(page, b2.id, 'cuaderno', '2.º ESO B');
    await expect(page.getByRole('button', { name: 'Actividad' })).toBeVisible();
    expect(await items()).toEqual(['Evaluar la 1.ª', 'Exportar cuaderno (CSV)', 'Ponderaciones', 'Añadir alumnos', 'Ajustes de la clase']);
    await tab(page, 'Temario').click();
    await expect(page.getByRole('heading', { name: '1.ª evaluación' })).toBeVisible();
    expect(await items()).toEqual(['Importar temario', 'Copiar de otra clase', 'Añadir alumnos', 'Ajustes de la clase']);
    await tab(page, 'Alumnos').click();
    expect(await items()).toEqual(['Añadir alumnos', 'Ajustes de la clase']);
    await tab(page, 'Faltas').click();
    expect(await items()).toEqual(['Añadir alumnos', 'Ajustes de la clase']);
    await classMenu(page);
    await shot(page, info, '28-menu');
  });

  test('clases-29 · «Evaluar la 1.ª» opens the evaluation of the term on screen («Evaluación final» in Final)', async ({ page, demo }) => {
    const b2 = await demoCourse(demo, DEMO_2B);
    await openClass(page, b2.id, 'cuaderno', '2.º ESO B');
    await classMenuPick(page, 'Evaluar la 1.ª');
    await expect(page).toHaveURL(new RegExp(`/clases/${b2.id}/evaluacion/1$`));
    await expect(page.getByRole('heading', { name: 'Primera evaluación' })).toBeVisible();

    await page.goto(`/clases/${b2.id}/cuaderno?term=4`);
    await expect(page.getByRole('group', { name: 'Evaluación' }).getByRole('button', { name: 'Final' })).toHaveAttribute('aria-pressed', 'true');
    await classMenuPick(page, 'Evaluación final');
    await expect(page).toHaveURL(new RegExp(`/clases/${b2.id}/evaluacion/4$`));
  });

  test('clases-30 · «Exportar cuaderno (CSV)»: Excel-ready file with the averages shown on screen', async ({ page, demo }) => {
    const b2 = await demoCourse(demo, DEMO_2B);
    const book = await demo.get(`/courses/${b2.id}/gradebook?term=1`);
    await openClass(page, b2.id, 'cuaderno', '2.º ESO B');
    const download = page.waitForEvent('download');
    await classMenuPick(page, 'Exportar cuaderno (CSV)');
    const file = await download;
    expect(file.suggestedFilename()).toBe('Cuaderno - Matematicas - 2o ESO B - 1a evaluacion.csv');
    await expect(toast(page, 'CSV descargado')).toBeVisible();
    const text = readFileSync(await file.path(), 'utf8');
    expect(text.charCodeAt(0)).toBe(0xfeff); // BOM: Excel reads the accents
    const lines = text.slice(1).trim().split(/\r?\n/);
    const header = lines[0].split(';');
    expect(header.slice(0, 2)).toEqual(['Apellidos', 'Nombre']);
    expect(header.slice(-2)).toEqual(['Media', 'Nota']);
    expect(lines).toHaveLength(book.students.length + 1);
    // Same average as the Media column (one decimal, decimal comma), student by student.
    for (const row of book.students.slice(0, 5)) {
      const line = lines.find((l) => l.startsWith(`${row.student.last_name};${row.student.first_name};`))!;
      const average = line.split(';').at(-2);
      await expect(page.getByRole('button', { name: `Media de ${row.student.name}: ${average}`, exact: false })).toBeVisible();
    }
  });

  test('clases-30b · a failed export says so and downloads nothing', async ({ page, demo }) => {
    const b2 = await demoCourse(demo, DEMO_2B);
    await page.route((url) => url.pathname === `/api/courses/${b2.id}/gradebook.csv`, (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
    let downloaded = false;
    page.on('download', () => { downloaded = true; });
    await openClass(page, b2.id, 'cuaderno', '2.º ESO B');
    await classMenuPick(page, 'Exportar cuaderno (CSV)');
    const error = toast(page, 'El servidor ha fallado. Inténtalo en un momento.');
    await expect(error).toBeVisible();
    await expect(toast(page, 'CSV descargado')).toHaveCount(0);
    expect(downloaded).toBe(false);
  });

  test('clases-31 · «Añadir alumnos» opens the roster\'s add sheet; closing it leaves the roster', async ({ page, demo }) => {
    const b2 = await demoCourse(demo, DEMO_2B);
    await openClass(page, b2.id, 'cuaderno', '2.º ESO B');
    await classMenuPick(page, 'Añadir alumnos');
    await expect(page).toHaveURL(new RegExp(`/clases/${b2.id}/alumnos\\?anadir=1$`));
    const sheet = dialog(page, 'Añadir alumnos');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByLabel('Un alumno por línea')).toBeVisible();
    await sheet.getByRole('button', { name: 'Cerrar' }).click();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/clases/${b2.id}/alumnos$`));
    await expect(tab(page, 'Alumnos')).toHaveAttribute('aria-pressed', 'true');
  });

  test('clases-32 · «Ajustes de la clase» opens with the class as it is', async ({ page, demo }, info) => {
    const b2 = await demoCourse(demo, DEMO_2B);
    await openClass(page, b2.id, 'alumnos', '2.º ESO B');
    await classMenuPick(page, 'Ajustes de la clase');
    const sheet = dialog(page, 'Ajustes de la clase');
    await expect(sheet.getByText(DEMO_2B, { exact: true })).toBeVisible();
    await expect(sheet.getByRole('textbox', { name: 'Materia' })).toHaveValue('Matemáticas');
    await expect(sheet.getByRole('textbox', { name: 'Abreviatura' })).toHaveValue('Mates');
    await expect(sheet.getByRole('textbox', { name: 'Aula' })).toHaveValue('204');
    await expect(sheet.getByRole('radio', { name: 'Verde azulado' })).toHaveAttribute('aria-checked', 'true');
    for (const s of b2.schedule) {
      const day = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'][s.weekday];
      await expect(sheet.getByRole('gridcell', { name: `${day} de ${s.start} a ${s.end}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
    }
    await expect(sheet.getByText(`${b2.schedule.length} sesiones a la semana`)).toBeVisible();
    await expect(sheet.getByText('Cambiar el horario no borra las listas ni las sesiones pasadas.')).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Archivar clase' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Eliminar definitivamente' })).toBeVisible();
    await shot(page, info, '32-ajustes');
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
  });

  test('clases-33 · a class that does not exist: «No se ha encontrado la clase» and «Ir a Clases»', async ({ page }) => {
    await page.goto('/clases/00000000-0000-0000-0000-000000000000');
    await expect(page.getByText('No se ha encontrado la clase')).toBeVisible();
    await expect(page.getByText('Puede que se haya eliminado.')).toBeVisible();
    await page.getByRole('link', { name: 'Ir a Clases' }).click();
    await expect(page).toHaveURL(/\/clases$/);
  });

  test('clases-34 · a server failure: «No se ha podido cargar la clase» and «Reintentar»', async ({ page, demo }, info) => {
    const b2 = await demoCourse(demo, DEMO_2B);
    let fail = true;
    await page.route((url) => url.pathname === `/api/courses/${b2.id}`, (route) => (fail
      ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Servidor en mantenimiento' }) })
      : route.fallback()));
    await page.goto(`/clases/${b2.id}`);
    await expect(page.getByText('No se ha podido cargar la clase')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Servidor en mantenimiento')).toBeVisible();
    await expect(page.getByText('No se ha encontrado la clase')).toHaveCount(0);
    await shot(page, info, '34-error');
    fail = false;
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.getByRole('heading', { level: 1, name: '2.º ESO B' })).toBeVisible();
  });
});

test.describe('clases · pasar lista desde la cabecera', () => {
  test.use({
    teacherSpec: {
      courses: [
        MATES_2C,
        { subject: 'Refuerzo de Matemáticas', group: '2º ESO R', color: 'olive', slots: [{ weekday: THU, start: '10:20', end: '11:15' }] },
      ],
    },
  });

  test('clases-25 · «Pasar lista» takes today\'s list and goes away once it is saved; a class without students has none', async ({ page, teacher }, info) => {
    const [c, empty] = teacher.courses;
    await openClass(page, c.id, 'alumnos', '2.º ESO C');
    await expect(page.locator('.course-facts')).toHaveText('12 alumnos · Aula 112 · En clase hasta 11:15');
    await page.getByRole('button', { name: 'Pasar lista' }).click();
    // The list's sheet has no accessible name (BUG-HOY-07, hoy-79): found by what it says.
    const sheet = page.getByRole('dialog').filter({ hasText: 'Toca a quien falte. Otro toque: retraso.' });
    await expect(sheet.getByRole('button', { name: /^1\. Alonso Gil, Marta/ })).toBeVisible();
    await shot(page, info, '25-pasar-lista');
    await sheet.getByRole('button', { name: /^2\. / }).click(); // Falta
    await sheet.getByRole('button', { name: 'Cerrar lista' }).click();
    await expect(toast(page, 'Lista pasada')).toBeVisible();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole('button', { name: 'Pasar lista' })).toHaveCount(0);
    const list = await teacher.api.get(`/courses/${c.id}/attendance?date=${TODAY}&start=10:20`);
    expect(list.taken).toBe(true);

    await openClass(page, empty.id, '', '2.º ESO R');
    await expect(page.locator('.course-facts')).toHaveText('0 alumnos · En clase hasta 11:15');
    await expect(page.getByRole('button', { name: 'Pasar lista' })).toHaveCount(0);
  });

  test('clases-35 · the next session skips one that was cancelled', async ({ page, teacher }) => {
    const [c] = teacher.courses;
    await teacher.api.post(`/courses/${c.id}/sessions/cancel`, { date: TODAY, start: '10:20', note: 'Excursión' });
    await openClass(page, c.id, '', '2.º ESO C');
    // Thursday 10:20 does not happen: next is Friday 12:40, and there is no list to take now.
    await expect(page.locator('.course-facts')).toHaveText('12 alumnos · Aula 112 · Mañana 12:40');
    await expect(page.getByRole('button', { name: 'Pasar lista' })).toHaveCount(0);
    await page.goto('/clases');
    await expect(classRow(page, 'Matemáticas · 2.º ESO C')).toContainText('12 alumnos · Mañana 12:40');
  });
});
