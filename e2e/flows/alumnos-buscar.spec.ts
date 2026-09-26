import type { Locator, Page } from '@playwright/test';
import { bug, expect, isMobile, MATES_2C, sheet, shot, test } from './alumnos-helpers';

// The student search: in Clases (phone and computer) and, on a computer, from any screen with «/», Ctrl+K or «Buscar»
// in the sidebar. Accents do not matter («nunez» finds Núñez), classes are found by subject or group («2 eso b»),
// Enter opens the first result, and a result never shows a diagnosis (lists are projected in class). No AI.

const box = (page: Page) => page.getByRole('searchbox', { name: 'Buscar alumno o clase' });
const results = (page: Page, title: 'Alumnos' | 'Clases') =>
  page.locator('section.section').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

/** Writes the search and presses Enter once the results are on screen, as a person reads them first. (Enter pressed
 *  in the same breath as the typing is dropped: BUG-ALUMNOS-07, alumnos-88; letters typed fast are lost in Clases:
 *  BUG-ALUMNOS-11, alumnos-112.) */
async function typeAndEnter(page: Page, input: Locator, text: string, first: RegExp, opened: Locator) {
  // The Clases box can take back an older value from the address right after it was cleared (BUG-ALUMNOS-11): write
  // until the box holds the text.
  await expect(async () => {
    await input.fill(text);
    await expect(input).toHaveValue(text, { timeout: 1000 });
  }).toPass();
  await expect(page.getByRole('button', { name: first }).first()).toBeVisible();
  await expect(async () => {
    if (await input.isVisible()) await input.press('Enter');
    await expect(opened).toBeVisible({ timeout: 1000 });
  }).toPass();
}

test.describe('demo teacher (read only)', () => {
  test('alumnos-80 in Clases: «nunez» finds Núñez with his class; a tap opens his ficha', async ({ page }, info) => {
    await page.goto('/clases');
    await box(page).fill('nunez');
    const hit = results(page, 'Alumnos').getByRole('button', { name: /Núñez Ramos, Javier/ });
    await expect(hit).toContainText('1.º ESO A · Mates');
    await shot(page, info, 'buscar-clases');
    await hit.click();
    await expect(page.getByRole('heading', { level: 1, name: 'Javier Núñez Ramos' })).toBeVisible();
  });

  test('alumnos-81 Enter opens the first result; surname and name in any order', async ({ page }) => {
    await page.goto('/clases');
    await box(page).fill('marin dominguez');
    await expect(results(page, 'Alumnos').getByRole('button')).toHaveText([/^Domínguez Marín, Hugo/]);
    await box(page).fill('');
    await expect(page).toHaveURL(/\/clases$/); // the cleared box has reached the address
    await typeAndEnter(page, box(page), 'marin dominguez', /Domínguez Marín, Hugo/,
      page.getByRole('heading', { level: 1, name: 'Hugo Domínguez Marín' }));
  });

  test('alumnos-88 a name and Enter in one go opens the student, also on a slow network (Enter is not lost while the search answers)', async ({ page }) => {
    bug('BUG-ALUMNOS-07', 'Enter pressed before the search has answered (160 ms debounce + the request) is dropped: nothing opens');
    // A school network: every search takes a second to answer.
    await page.route('**/api/search**', async (route) => {
      await new Promise((r) => setTimeout(r, 1000));
      await route.continue().catch(() => {});
    });
    await page.goto('/clases');
    await box(page).fill('dominguez marin');
    await box(page).press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: 'Hugo Domínguez Marín' })).toBeVisible();
  });

  test('alumnos-112 letters typed quickly in the Clases search are all kept', async ({ page }) => {
    bug('BUG-ALUMNOS-11', 'the Clases search box takes its value from the address (?q=): letters typed faster than a render are lost («hugo dominguez» → «hgo domingez»), and a term written right after clearing the box can be replaced by the older one');
    await page.goto('/clases');
    await box(page).click();
    await page.keyboard.type('hugo dominguez'); // key after key with no pause, as a fast thumb or a paste-like burst
    await expect(box(page)).toHaveValue('hugo dominguez');
    await expect(results(page, 'Alumnos').getByRole('button', { name: /Domínguez Marín, Hugo/ })).toBeVisible();
  });

  test('alumnos-82 classes by group or subject («2 eso b», «fisica»)', async ({ page }) => {
    await page.goto('/clases');
    await box(page).fill('2 eso b');
    const cls = results(page, 'Clases').getByRole('button', { name: 'Matemáticas · 2.º ESO B' });
    await expect(cls).toBeVisible();
    await box(page).fill('fisica');
    await expect(results(page, 'Clases').getByRole('button')).toHaveText(['Física y Química · 3.º ESO A']);
    await box(page).fill('2 eso b');
    await cls.click();
    await expect(page).toHaveURL(/\/clases\/[0-9a-f-]+$/);
    await expect(page.getByRole('heading', { level: 1, name: '2.º ESO B' })).toBeVisible();
  });

  test('alumnos-83 no match says what to try; clearing the box brings the classes back', async ({ page }) => {
    await page.goto('/clases');
    await box(page).fill('zzzz');
    await expect(page.getByText('Sin resultados')).toBeVisible();
    await expect(page.getByText('No hay alumnos ni clases que coincidan con «zzzz». Prueba con el apellido o el grupo («2 ESO B»).')).toBeVisible();
    // Enter with nothing found does nothing (the term stays in the address, so a reload keeps it).
    await box(page).press('Enter');
    await expect(page).toHaveURL(/\/clases\?q=zzzz$/);
    await page.getByRole('button', { name: 'Borrar la búsqueda' }).click();
    await expect(box(page)).toHaveValue('');
    await expect(page).toHaveURL(/\/clases$/);
    await expect(page.getByRole('link', { name: /Matemáticas · 2\.º ESO B/ })).toBeVisible();
    // Esc in the box clears it too.
    await box(page).fill('hugo');
    await expect(results(page, 'Alumnos')).toBeVisible();
    await box(page).press('Escape');
    await expect(box(page)).toHaveValue('');
    await expect(page.getByRole('link', { name: /Matemáticas · 2\.º ESO B/ })).toBeVisible();
  });

  test('alumnos-89 the search fails: it says so, and works again when the server answers', async ({ page }) => {
    let fail = true;
    await page.route('**/api/search**', (route) => (fail
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"boom"}' }) : route.continue()));
    await page.goto('/clases');
    await box(page).fill('hugo');
    await expect(page.getByText('No se ha podido buscar.')).toBeVisible({ timeout: 15_000 });
    fail = false;
    await box(page).fill('hugo d');
    await expect(results(page, 'Alumnos').getByRole('button', { name: /Domínguez Marín, Hugo/ })).toBeVisible();
    await expect(page.getByText('No se ha podido buscar.')).toHaveCount(0);
  });

  test('alumnos-84 a result shows «ACNEE»/«NEAE», never the diagnosis', async ({ page }) => {
    await page.goto('/clases');
    await box(page).fill('vazquez delgado');
    const nerea = results(page, 'Alumnos').getByRole('button', { name: /Vázquez Delgado, Nerea/ });
    await expect(nerea).toContainText('2.º ESO B · Mates · ACNEE');
    await expect(nerea).not.toContainText('Discapacidad');
    await box(page).fill('lopez vazquez');
    const ruben = results(page, 'Alumnos').getByRole('button', { name: /López Vázquez, Rubén/ });
    await expect(ruben).toContainText('2.º ESO B · Mates · NEAE');
    await expect(ruben).not.toContainText('Dislexia');
  });

  test('alumnos-85 computer: «/», Ctrl+K and «Buscar» open the search anywhere; Enter opens the first result', async ({ page }, info) => {
    test.skip(isMobile(info), 'keyboard shortcuts and the sidebar are for computers; on a phone the search is in Clases');
    await page.goto('/hoy');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await page.keyboard.press('/');
    const s = sheet(page, 'Buscar');
    await expect(s).toBeVisible();
    const input = s.getByRole('searchbox', { name: 'Buscar alumno o clase' });
    await expect(input).toBeFocused();
    await expect(s.getByText('Escribe el nombre o el apellido (sin tildes también vale) o el grupo, como «2 ESO B».')).toBeVisible();
    await input.fill('sanchez rodriguez');
    await expect(s.getByRole('button', { name: /Sánchez Rodríguez, Nicolás/ })).toContainText('1.º ESO A · Mates');
    await shot(page, info, 'buscar-hoja');
    await input.fill('');
    await typeAndEnter(page, input, 'sanchez rodriguez', /Sánchez Rodríguez, Nicolás/,
      page.getByRole('heading', { level: 1, name: 'Nicolás Sánchez Rodríguez' }));
    await expect(s).toBeHidden();

    // Ctrl+K from the ficha; Esc clears the text first, then closes.
    await page.keyboard.press('Control+k');
    await expect(s).toBeVisible();
    await input.fill('hugo');
    await expect(s.getByRole('heading', { name: 'Alumnos' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(input).toHaveValue('');
    await expect(s).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(s).toBeHidden();

    // The sidebar button; a tap on a result opens it.
    await page.getByRole('button', { name: /^Buscar/ }).click();
    await expect(s).toBeVisible();
    await input.fill('2 eso b');
    await s.getByRole('button', { name: 'Matemáticas · 2.º ESO B' }).click();
    await expect(s).toBeHidden();
    await expect(page.getByRole('heading', { level: 1, name: '2.º ESO B' })).toBeVisible();
  });

  test('alumnos-86 computer: «/» typed in a text field, or with a sheet open, does not open the search', async ({ page }, info) => {
    test.skip(isMobile(info), 'keyboard shortcuts are for computers');
    await page.goto('/clases');
    await box(page).fill('a');
    // Key by key, each one once the box has the one before (fast typing loses letters: alumnos-112).
    await page.keyboard.press('/');
    await expect(box(page)).toHaveValue('a/');
    await page.keyboard.press('b');
    await expect(box(page)).toHaveValue('a/b');
    await expect(sheet(page, 'Buscar')).toHaveCount(0);
    // With «Anotar» open (from a ficha), «/» and Ctrl+K do nothing.
    await box(page).fill('hugo dominguez');
    await results(page, 'Alumnos').getByRole('button', { name: /Domínguez Marín, Hugo/ }).click();
    await page.getByRole('button', { name: 'Anotar' }).click();
    await expect(sheet(page, 'Anotar')).toBeVisible();
    await page.getByRole('textbox', { name: 'Texto' }).blur();
    await page.keyboard.press('/');
    await page.keyboard.press('Control+k');
    await expect(sheet(page, 'Buscar')).toHaveCount(0);
  });
});

test.describe('a student in two classes', () => {
  test.use({ teacherSpec: { courses: [MATES_2C, { subject: 'Física y Química', short: 'FyQ', sameGroupAs: 0, slots: [] }] } });

  test('alumnos-87 the result names the group once with both subjects, in the order of the class list', async ({ page, teacher }) => {
    const shorts: string[] = (await teacher.api.get('/courses')).map((c: { short: string }) => c.short);
    expect([...shorts].sort()).toEqual(['FyQ', 'Mates']);
    await page.goto('/clases');
    await box(page).fill('alonso');
    await expect(results(page, 'Alumnos').getByRole('button', { name: /Alonso Gil, Marta/ })).toContainText(`2.º ESO C · ${shorts.join(', ')}`);
  });
});
