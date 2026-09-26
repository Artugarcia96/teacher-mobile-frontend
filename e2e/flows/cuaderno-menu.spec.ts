import { readFileSync } from 'node:fs';
import {
  bug, classMenu, CLASS, column, expect, gradebook, isMobile, openCuaderno, press, test, toast, type CourseSpec, type Page,
} from './cuaderno-helpers';

// El menú «···» de la clase en el Cuaderno, la exportación CSV y los estados de la pestaña (docs/PRODUCT.md §4.5, §4.9):
// the tab adds «Evaluar la 1.ª», «Exportar cuaderno (CSV)» and «Ponderaciones» before the class actions; the CSV is
// Excel-ES (`;`, decimal comma, BOM; the average with one decimal, as on screen); a class without students, an
// empty term and a server error each say what to do; a link from Evaluar opens the Cuaderno on its column.
// Each test is a teacher of its own.

const TASK = 'Trabajo · Estadística';
const EXAM = 'Examen U1 · Números enteros';
const MENU: CourseSpec = {
  ...CLASS,
  activities: [
    { title: TASK, kind: 'task', date: '2026-11-05', max: 20, grades: [15, 12.5, null, 'NP', 'EX', 18] },
    { title: EXAM, kind: 'exam', date: '2026-11-12', grades: [6.5, 7, 8, 'NP', 5, 9] },
  ],
};

const menuItems = async (page: Page) => {
  await page.getByRole('button', { name: 'Más opciones de la clase' }).click();
  const items = await page.getByRole('menuitem').allTextContents();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
  return items;
};

test.describe('cuaderno · menú y exportación', () => {
  test.use({ worldSpec: MENU });

  test('cuaderno-110 · the class «···»: the Cuaderno\'s actions first, then the class\'s; other tabs drop them', async ({ page, world }) => {
    await openCuaderno(page, world.id);
    expect(await menuItems(page)).toEqual(['Evaluar la 1.ª', 'Exportar cuaderno (CSV)', 'Ponderaciones', 'Añadir alumnos', 'Ajustes de la clase']);
    await page.getByRole('group', { name: 'Secciones de la clase' }).getByRole('button', { name: 'Alumnos' }).click();
    await expect(page).toHaveURL(/\/alumnos$/);
    const others = await menuItems(page);
    expect(others).not.toContain('Exportar cuaderno (CSV)');
    expect(others).not.toContain('Ponderaciones');
    expect(others).toEqual(expect.arrayContaining(['Añadir alumnos', 'Ajustes de la clase']));
    await openCuaderno(page, world.id, 4);
    expect((await menuItems(page))[0]).toBe('Evaluación final');
  });

  test('cuaderno-111 · «Exportar cuaderno (CSV)»: Excel-ES file with every grade as it was typed', async ({ page, world }) => {
    await openCuaderno(page, world.id);
    const [file] = await Promise.all([page.waitForEvent('download'), classMenu(page, 'Exportar cuaderno (CSV)')]);
    await expect(toast(page, 'CSV descargado')).toBeVisible();
    expect(file.suggestedFilename()).toBe('Cuaderno - Matematicas - 2o ESO C - 1a evaluacion.csv');
    const bytes = readFileSync(await file.path());
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM, so Excel reads the accents
    const lines = bytes.toString('utf8').slice(1).split('\r\n').filter(Boolean);
    const gb = await gradebook(world.api, world.id);
    const avg = (i: number) => {
      const a = gb.students[i].average;
      return a == null ? '' : (Math.round(a * 10 + 1e-9) / 10).toFixed(1).replace('.', ',');
    };
    expect(lines).toEqual([
      'Apellidos;Nombre;Trabajo · Estadística (/20);Examen U1 · Números enteros;Media;Nota', // oldest first, like paper
      `Alonso Gil;Marta;15;6,5;${avg(0)};7`,
      `Benítez Ruiz;Pablo;12,5;7;${avg(1)};7`,
      'Castro León;Lucía;;8;8,0;8',
      'Díaz Soto;Hugo;NP;NP;;',
      'Esteban Mora;Irene;Exento;5;5,0;5',
      'Fuentes Vera;Adrián;18;9;9,0;9',
    ]);
    expect(avg(0)).toBe('6,8'); // the same one decimal as the Media column
  });

  test('cuaderno-112 · the CSV of «Final» has one column per evaluación', async ({ page, world }) => {
    await openCuaderno(page, world.id, 4);
    const [file] = await Promise.all([page.waitForEvent('download'), classMenu(page, 'Exportar cuaderno (CSV)')]);
    expect(file.suggestedFilename()).toBe('Cuaderno - Matematicas - 2o ESO C - Final.csv');
    const lines = readFileSync(await file.path(), 'utf8').slice(1).split('\r\n');
    expect(lines[0]).toBe('Apellidos;Nombre;1.ª evaluación;2.ª evaluación;3.ª evaluación;Media;Nota');
    expect(lines[3]).toBe('Castro León;Lucía;8,0;;;8,0;8');
  });

  test('cuaderno-113 · a failed export says so', async ({ page, world }) => {
    await openCuaderno(page, world.id);
    await page.route('**/gradebook.csv*', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"x"}' }));
    await classMenu(page, 'Exportar cuaderno (CSV)');
    await expect(toast(page, 'El servidor ha fallado. Inténtalo en un momento.')).toBeVisible();
    await expect(page.locator('.toast--error')).toBeVisible();
  });

  test('cuaderno-114 · the Cuaderno does not load: it says so and «Reintentar» brings it back', async ({ page, world }) => {
    let fail = true;
    await page.route('**/api/courses/*/gradebook?*', (route) => fail
      ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Servidor no disponible' }) })
      : route.fallback());
    await page.goto(`/clases/${world.id}/cuaderno`);
    await expect(page.getByText('No se ha podido cargar el cuaderno.')).toBeVisible({ timeout: 15_000 }); // after the query's retries
    await expect(page.getByText('Servidor no disponible')).toBeVisible();
    fail = false;
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(column(page, EXAM)).toBeVisible();
  });

  test('cuaderno-115 · a link from Evaluar › «Por calificar» opens the Cuaderno on that column, highlighted', async ({ page, world }, info) => {
    await page.goto('/evaluar');
    const row = page.getByRole('link', { name: `${TASK} Matemáticas · 2.º ESO C · 5 nov 1 sin nota` });
    await expect(row).toBeVisible();
    await press(row, info);
    await expect(page).toHaveURL(new RegExp(`/clases/${world.id}/cuaderno\\?term=1&a=${world.act[TASK]}`));
    await expect(column(page, TASK)).toHaveClass(/gb-flash/);
    await expect(column(page, TASK)).toBeInViewport();
  });

  test('cuaderno-117 · the highlight of a column opened from a link fades after a moment', async ({ page, world }) => {
    bug('CUA-07', 'the column highlight (gb-flash) never clears: GradebookTab\'s focus effect calls onFocusDone(), re-runs and its cleanup cancels the 2,4 s timer');
    await page.goto(`/clases/${world.id}/cuaderno?term=1&a=${world.act[TASK]}`);
    await expect(column(page, TASK)).toHaveClass(/gb-flash/);
    await expect(column(page, TASK)).not.toHaveClass(/gb-flash/, { timeout: 6000 });
  });
});

test.describe('cuaderno · clase sin alumnos', () => {
  test.use({ worldSpec: { ...CLASS, students: [] } });

  test('cuaderno-116 · a class without students says so and leads to add them', async ({ page, world }, info) => {
    await openCuaderno(page, world.id);
    await expect(page.getByText('Esta clase aún no tiene alumnos')).toBeVisible();
    await expect(page.locator('table.gb')).toHaveCount(0);
    await press(page.getByRole('link', { name: 'Añadir alumnos' }), info);
    await expect(page).toHaveURL(new RegExp(`/clases/${world.id}/alumnos`));
    if (isMobile(info)) await expect(page.getByRole('button', { name: 'Más opciones de la clase' })).toBeVisible();
  });
});
