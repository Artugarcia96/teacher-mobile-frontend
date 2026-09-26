import {
  bug, classRow, DEMO_1A, DEMO_1BACH, DEMO_2B, DEMO_3A, demoCourse, dialog, expect, isMobile, MATES_2C, shot, test, toast,
} from './clases-helpers';

// Clases (docs/PRODUCT.md §3, §4.9): the list with its facts and pending chips, the search (students and classes, Enter
// opens the first result), the archived classes, the first-class empty state, a load error and the desktop sidebar.

test.describe('clases · lista (demo)', () => {
  test('clases-01 · each class says students and next session; a row opens the class', async ({ page }, info) => {
    // Clases is one of the three destinations: the tab capsule on phones, the sidebar on desktop.
    await page.goto('/hoy');
    const nav = page.getByRole(isMobile(info) ? 'navigation' : 'complementary', { name: 'Navegación' }).filter({ visible: true });
    await nav.getByRole('link', { name: 'Clases', exact: true }).click();
    await expect(page).toHaveURL(/\/clases$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Clases' })).toBeVisible();
    const rows = page.locator('.courses__list').getByRole('link');
    await expect(rows).toHaveCount(4);
    // By group: 1.º ESO A, 2.º ESO B, 3.º ESO A, 1.º Bach B (Bachillerato after ESO).
    await expect(rows.nth(0)).toContainText(DEMO_1A);
    await expect(rows.nth(1)).toContainText(DEMO_2B);
    await expect(rows.nth(2)).toContainText(DEMO_3A);
    await expect(rows.nth(3)).toContainText(DEMO_1BACH);
    await expect(classRow(page, DEMO_1A)).toContainText('25 alumnos · Mañana 11:45');
    await expect(classRow(page, DEMO_2B)).toContainText('26 alumnos · En clase hasta 11:15');
    await expect(classRow(page, DEMO_3A)).toContainText('24 alumnos · Martes 24 nov, 08:30');
    await expect(classRow(page, DEMO_1BACH)).toContainText('22 alumnos · Hoy 12:40');
    // The room is not part of the list line (it is in the class header).
    await expect(classRow(page, DEMO_2B)).not.toContainText('204');
    await shot(page, info, '01-lista');

    await classRow(page, DEMO_2B).click();
    await expect(page).toHaveURL(/\/clases\/[0-9a-f-]+$/);
    await expect(page.getByRole('heading', { level: 1, name: '2.º ESO B' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Secciones de la clase' }).getByRole('button', { name: 'Cuaderno' }))
      .toHaveAttribute('aria-pressed', 'true');
  });

  test('clases-02 · pending chips carry the same counts as Hoy › Pendiente', async ({ page, demo }) => {
    const day = await demo.get('/today?date=2026-11-19');
    const [a1, b2] = [await demoCourse(demo, DEMO_1A), await demoCourse(demo, DEMO_2B)];
    const lists = day.pending.filter((p: { kind: string; course_id: string }) => p.kind === 'attendance' && p.course_id === a1.id).length;
    const review = day.pending.filter((p: { kind: string; course_id: string }) => p.kind === 'review' && p.course_id === b2.id)
      .reduce((s: number, p: { count: number }) => s + p.count, 0);
    expect(lists).toBe(1);
    expect(review).toBe(18);

    await page.goto('/clases');
    await expect(classRow(page, DEMO_1A).getByText('1 lista sin pasar', { exact: true })).toBeVisible();
    await expect(classRow(page, DEMO_2B).getByText('18 por revisar', { exact: true })).toBeVisible();
    // Nothing pending in the other two: no chip.
    await expect(classRow(page, DEMO_3A).locator('.chip')).toHaveCount(0);
    await expect(classRow(page, DEMO_1BACH).locator('.chip')).toHaveCount(0);
    // Exams without grades are Hoy's business, not a chip here.
    await expect(page.getByText(/sin nota/)).toHaveCount(0);
  });

  test('clases-04 · search a class by group or subject, without accents; a result opens it', async ({ page }, info) => {
    await page.goto('/clases');
    const box = page.getByRole('searchbox', { name: 'Buscar alumno o clase' });
    await box.fill('2 eso b');
    const classes = page.locator('section.section').filter({ has: page.getByRole('heading', { name: 'Clases', exact: true }) });
    await expect(classes.getByRole('button', { name: DEMO_2B })).toBeVisible();
    await expect(page.locator('.courses__list')).toHaveCount(0); // the results replace the list
    await shot(page, info, '04-buscar-clase');

    await box.fill('fisica');
    await expect(classes.getByRole('button', { name: DEMO_3A })).toBeVisible();
    await classes.getByRole('button', { name: DEMO_3A }).click();
    await expect(page.getByRole('heading', { level: 1, name: '3.º ESO A' })).toBeVisible();
    await expect(page.getByText('Física y Química', { exact: true }).first()).toBeVisible();
  });

  test('clases-05 · search a student by surname without accents; the row says where and opens the ficha', async ({ page }, info) => {
    await page.goto('/clases');
    await page.getByRole('searchbox', { name: 'Buscar alumno o clase' }).fill('nunez');
    const students = page.locator('section.section').filter({ has: page.getByRole('heading', { name: 'Alumnos', exact: true }) });
    const gonzalo = students.getByRole('button', { name: /^Núñez Cortés, Gonzalo/ });
    await expect(gonzalo).toContainText('1.º Bach B · Mates I');
    await expect(students.getByRole('button', { name: /^Núñez Ramos, Javier/ })).toContainText('1.º ESO A · Mates');
    await shot(page, info, '05-buscar-alumno');
    // Results are often projected in class: the mark («NEAE», «ACNEE»), never the diagnosis.
    await page.getByRole('searchbox', { name: 'Buscar alumno o clase' }).fill('vazquez delgado');
    const nerea = students.getByRole('button', { name: /^Vázquez Delgado, Nerea/ });
    await expect(nerea).toContainText('2.º ESO B · Mates · ACNEE');
    await expect(nerea).not.toContainText('Discapacidad');
    await expect(nerea).not.toContainText('ACS');
    await page.getByRole('searchbox', { name: 'Buscar alumno o clase' }).fill('nunez');
    await gonzalo.click();
    await expect(page).toHaveURL(/\/alumnos\/[0-9a-f-]+/);
    await expect(page.getByRole('heading', { level: 1, name: /Gonzalo/ })).toBeVisible();
  });

  test('clases-06 · Enter in the search box opens the first result', async ({ page }) => {
    await page.goto('/clases');
    const box = page.getByRole('searchbox', { name: 'Buscar alumno o clase' });
    // Enter once the results are on screen, as a person reads them first (an Enter pressed while the search is still
    // answering is lost: BUG-CLASES-01, clases-06b).
    const enterOpens = async (opened: ReturnType<typeof page.getByRole>) => expect(async () => {
      if (await box.isVisible()) await box.press('Enter');
      await expect(opened).toBeVisible({ timeout: 1000 });
    }).toPass();
    await box.fill('dominguez marin');
    await expect(page.getByRole('button', { name: /^Domínguez Marín, Hugo/ })).toBeVisible();
    await enterOpens(page.getByRole('heading', { level: 1, name: /Hugo/ }));
    await expect(page).toHaveURL(/\/alumnos\/[0-9a-f-]+/);

    await page.goto('/clases');
    await box.fill('3 eso a');
    await expect(page.getByRole('button', { name: DEMO_3A })).toBeVisible();
    await enterOpens(page.getByRole('heading', { level: 1, name: '3.º ESO A' }));
  });

  test('clases-06b · Enter pressed right after typing opens the first result of what was typed', async ({ page, demo }) => {
    bug('BUG-CLASES-01', 'Enter uses the debounced previous search: opens the previous first result, or nothing while it loads');
    const fyq = await demoCourse(demo, DEMO_3A);
    const hugo = (await demo.get('/search?q=dominguez%20marin')).students[0].student;
    // A school network: each search takes 0,8 s to answer. The teacher does not wait for the list to press Enter.
    await page.route((url) => url.pathname === '/api/search', async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.fallback();
    });
    await page.goto('/clases');
    const box = page.getByRole('searchbox', { name: 'Buscar alumno o clase' });
    await box.fill('2 eso b');
    await expect(page.getByRole('button', { name: DEMO_2B })).toBeVisible();
    // A new search, Enter at once: it must open Física y Química, never the 2.º ESO B of the previous search.
    await box.fill('fisica');
    await box.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/clases/${fyq.id}$`));

    // A fresh page: Enter before the first answer is not lost; the first result opens when it arrives.
    await page.goto('/clases');
    await box.fill('dominguez marin');
    await box.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/alumnos/${hugo.id}$`));
  });

  test('clases-07 · no results says so; clearing (✕ or Esc) brings the classes back', async ({ page }, info) => {
    await page.goto('/clases');
    const box = page.getByRole('searchbox', { name: 'Buscar alumno o clase' });
    await box.fill('zzqx');
    await expect(page.getByText('Sin resultados')).toBeVisible();
    await expect(page.getByText('No hay alumnos ni clases que coincidan con «zzqx».', { exact: false })).toBeVisible();
    await shot(page, info, '07-sin-resultados');
    await box.press('Enter'); // nothing to open: stays (the term is kept in the address)
    await expect(page).toHaveURL(/\/clases\?q=zzqx$/);

    await page.getByRole('button', { name: 'Borrar la búsqueda' }).click();
    await expect(box).toHaveValue('');
    await expect(page).toHaveURL(/\/clases$/);
    await expect(classRow(page, DEMO_2B)).toBeVisible();

    await box.fill('zzqx');
    await expect(page.getByText('Sin resultados')).toBeVisible();
    await box.press('Escape');
    await expect(box).toHaveValue('');
    await expect(classRow(page, DEMO_2B)).toBeVisible();
  });

  test('clases-11 · «Clases | Materiales» switches the view in the address and back', async ({ page }) => {
    await page.goto('/clases');
    const views = page.getByRole('group', { name: 'Vista' });
    await views.getByRole('button', { name: 'Materiales' }).click();
    await expect(page).toHaveURL(/\/clases\?vista=materiales$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Materiales' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nueva clase' })).toHaveCount(0);
    await views.getByRole('button', { name: 'Clases' }).click();
    await expect(page).toHaveURL(/\/clases$/);
    await expect(classRow(page, DEMO_2B)).toBeVisible();
    // Opened directly, the address keeps the view.
    await page.goto('/clases?vista=materiales');
    await expect(views.getByRole('button', { name: 'Materiales' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('clases-12 · a failed load says so and «Reintentar» loads the list', async ({ page }, info) => {
    let fail = true;
    await page.route((url) => url.pathname === '/api/courses', (route) => (fail
      ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Servidor no disponible' }) })
      : route.fallback()));
    await page.goto('/clases');
    await expect(page.getByText('No se han podido cargar las clases')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Servidor no disponible')).toBeVisible();
    await shot(page, info, '12-error');
    fail = false;
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(classRow(page, DEMO_2B)).toBeVisible();
  });

  test('clases-13 · desktop: the sidebar lists the classes («2.º ESO B · Mates») and opens them', async ({ page }, info) => {
    test.skip(isMobile(info), 'The sidebar is the desktop frame; phones reach classes through Clases.');
    await page.goto('/hoy');
    const side = page.getByRole('complementary', { name: 'Navegación' });
    await expect(side.getByText('Mis clases')).toBeVisible();
    const link = side.getByRole('link', { name: '2.º ESO B · Mates', exact: true });
    await expect(link).toHaveAttribute('title', DEMO_2B);
    await expect(side.getByRole('link', { name: '3.º ESO A · FyQ', exact: true })).toBeVisible();
    await link.click();
    await expect(page.getByRole('heading', { level: 1, name: '2.º ESO B' })).toBeVisible();
    await expect(link).toHaveAttribute('aria-current', 'page');
  });

  test('clases-14 · desktop: «/» and Ctrl+K open «Buscar»; Enter opens the class', async ({ page }, info) => {
    test.skip(isMobile(info), 'Keyboard shortcuts are a desktop path; phones search in Clases.');
    await page.goto('/hoy');
    await expect(page.getByRole('complementary', { name: 'Navegación' })).toBeVisible();
    await page.keyboard.press('/');
    const sheet = dialog(page, 'Buscar');
    await expect(sheet).toBeVisible();
    const box = sheet.getByRole('searchbox', { name: 'Buscar alumno o clase' });
    await expect(box).toBeFocused();
    await box.fill('1 bach b');
    await expect(sheet.getByRole('button', { name: DEMO_1BACH })).toBeVisible();
    // Enter once the results are on screen (one pressed while the search still answers is lost: clases-06b).
    await expect(async () => {
      if (await box.isVisible()) await box.press('Enter');
      await expect(page.getByRole('heading', { level: 1, name: '1.º Bach B' })).toBeVisible({ timeout: 1000 });
    }).toPass();
    await expect(sheet).toBeHidden();

    await page.keyboard.press('Control+k');
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
  });
});

test.describe('clases · sin horario', () => {
  test.use({ teacherSpec: { courses: [{ ...MATES_2C, slots: [] }] } });

  test('clases-03 · a class without timetable says «Sin horario»', async ({ page }) => {
    await page.goto('/clases');
    await expect(classRow(page, 'Matemáticas · 2.º ESO C')).toContainText('12 alumnos · Sin horario');
  });
});

test.describe('clases · archivadas', () => {
  test.use({
    teacherSpec: {
      courses: [
        MATES_2C,
        { subject: 'Matemáticas', short: 'Mates', group: '1º ESO D', color: 'ochre', students: ['Ruiz Paz, Ana', 'Soto Gil, Luis'], archived: true },
      ],
    },
  });

  test('clases-08/09 · the archived classes unfold at the end; one is recovered after asking', async ({ page, teacher }, info) => {
    await page.goto('/clases');
    await expect(classRow(page, 'Matemáticas · 2.º ESO C')).toBeVisible();
    await expect(page.locator('.courses__list').getByRole('link')).toHaveCount(1);
    const toggle = page.getByRole('button', { name: 'Ver clases archivadas' });
    await toggle.click();
    const archived = page.getByRole('button', { name: /^Matemáticas · 1\.º ESO D/ });
    await expect(archived).toContainText('2 alumnos');
    await expect(archived).toContainText('Recuperar');
    await expect(page.getByRole('button', { name: 'Ocultar clases archivadas' })).toBeVisible();
    await shot(page, info, '08-archivadas');

    // Cancel: nothing changes.
    await archived.click();
    const ask = dialog(page, 'Recuperar Matemáticas · 1.º ESO D');
    await expect(ask.getByText('Vuelve a aparecer en Hoy y en Clases con todas sus notas.')).toBeVisible();
    await ask.getByRole('button', { name: 'Cancelar' }).click();
    await expect(ask).toBeHidden();
    expect((await teacher.api.get('/courses?archived=true')).length).toBe(1);

    await archived.click();
    await ask.getByRole('button', { name: 'Recuperar' }).click();
    await expect(toast(page, 'Clase recuperada')).toBeVisible();
    await expect(classRow(page, 'Matemáticas · 1.º ESO D')).toBeVisible();
    await expect(page.getByText('No hay clases archivadas.')).toBeVisible();
    expect((await teacher.api.get('/courses?archived=true')).length).toBe(0);
    expect((await teacher.api.get('/courses')).map((c: { label: string }) => c.label)).toContain('Matemáticas · 1.º ESO D');

    await page.getByRole('button', { name: 'Ocultar clases archivadas' }).click();
    await expect(page.getByText('No hay clases archivadas.')).toBeHidden();
  });
});

test.describe('clases · archivadas sin conexión', () => {
  test.use({ teacherSpec: { courses: [MATES_2C] } });

  test('clases-09b · the archived list failing to load says so in its row', async ({ page }) => {
    await page.route((url) => url.pathname === '/api/courses' && url.searchParams.get('archived') === 'true', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Servidor no disponible' }) }));
    await page.goto('/clases');
    await page.getByRole('button', { name: 'Ver clases archivadas' }).click();
    await expect(page.getByText('No se han podido cargar.')).toBeVisible({ timeout: 15_000 });
    await expect(classRow(page, 'Matemáticas · 2.º ESO C')).toBeVisible(); // the active classes stay
  });
});

test.describe('clases · primera clase', () => {
  test.use({ teacherSpec: { courses: [] } });

  test('clases-10 · with no classes: the steps and «Crear clase»; no search nor «Nueva clase»', async ({ page }, info) => {
    await page.goto('/clases');
    await expect(page.getByText('Crea tu primera clase')).toBeVisible();
    await expect(page.getByText('Materia y grupo, por ejemplo «Matemáticas · 2.º ESO B».')).toBeVisible();
    await expect(page.getByText('Pega la lista de alumnos.')).toBeVisible();
    await expect(page.getByText('Marca el horario y la verás cada día en Hoy.')).toBeVisible();
    await expect(page.getByRole('searchbox')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Nueva clase' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Ver clases archivadas' })).toHaveCount(0);
    await shot(page, info, '10-primera-clase');

    await page.getByRole('button', { name: 'Crear clase' }).click();
    const sheet = dialog(page, 'Nueva clase');
    await expect(sheet).toBeVisible();
    await expect(page).toHaveURL(/\?nueva=1$/);
    // No groups yet: the group name is asked at once, without chips.
    await expect(sheet.getByRole('textbox', { name: 'Nombre del grupo' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Nuevo grupo' })).toHaveCount(0);
  });
});
