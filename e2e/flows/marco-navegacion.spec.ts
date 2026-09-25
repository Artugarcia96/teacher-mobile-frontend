import { backButton, bug, demoIds, expect, heading, isDesktop, nav, shot, test } from './marco.helpers';

// Marco · navegación: the three destinations (Hoy, Clases, Evaluar) in the sidebar of a computer or the tab capsule
// of a phone, the Evaluar badge, «‹ Volver» naming where the screen was opened from, every deep address surviving a
// reload, unknown addresses and ids, the focus mode of Revisar and the room the capsule leaves at the end of a page.
// Demo teacher, read only. No AI.

test('marco-01 · «/» y una dirección que no existe llevan a Hoy sin dejarla en el historial', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/hoy$/);
  await expect(heading(page, 'Hoy')).toBeVisible();

  await page.goto('/clases');
  await expect(heading(page, 'Clases')).toBeVisible();
  await page.goto('/esto/no/existe');
  await expect(page).toHaveURL(/\/hoy$/);
  await expect(heading(page, 'Hoy')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/clases$/);
  await expect(heading(page, 'Clases')).toBeVisible();
});

test('marco-02 · escritorio: la barra lateral lleva a Hoy, Clases, Evaluar, cada clase y Ajustes, también con el teclado', async ({ page, demo }, info) => {
  test.skip(!isDesktop(info), 'the sidebar is the frame of a computer');
  const ids = await demoIds(demo);
  const me = await demo.get('/me');
  await page.goto('/hoy');
  const side = page.getByRole('complementary', { name: 'Navegación' });
  await expect(side).toBeVisible();
  await expect(page.locator('nav.tabcap')).toBeHidden();
  const hoy = side.getByRole('link', { name: 'Hoy', exact: true });
  const clases = side.getByRole('link', { name: 'Clases', exact: true });
  const evaluar = side.getByRole('link', { name: /Evaluar/ });
  await expect(hoy).toHaveAttribute('aria-current', 'page');
  await expect(clases).not.toHaveAttribute('aria-current', 'page');

  await clases.click();
  await expect(page).toHaveURL(/\/clases$/);
  await expect(heading(page, 'Clases')).toBeVisible();
  await expect(clases).toHaveAttribute('aria-current', 'page');
  await expect(hoy).not.toHaveAttribute('aria-current', 'page');

  await evaluar.click();
  await expect(page).toHaveURL(/\/evaluar$/);
  await expect(heading(page, 'Evaluar')).toBeVisible();
  await expect(evaluar).toHaveAttribute('aria-current', 'page');

  // «Mis clases»: every class with its group first, in the order of the class list; each one opens its class.
  const mine = side.locator('.sidebar__classes');
  await expect(mine.getByText('Mis clases')).toBeVisible();
  await expect(mine.getByRole('link')).toHaveText(ids.courses.map((c) => `${c.group} · ${c.short}`));
  const b = side.getByRole('link', { name: '2.º ESO B · Mates' });
  await b.click();
  await expect(page).toHaveURL(new RegExp(`/clases/${ids.course}$`));
  await expect(heading(page, '2.º ESO B')).toBeVisible();
  await expect(b).toHaveAttribute('aria-current', 'page');
  await expect(clases).toHaveAttribute('aria-current', 'page'); // a class is inside Clases

  // The teacher at the foot: name and school, opens Ajustes.
  const account = side.getByRole('link', { name: new RegExp(me.teacher.name) });
  await expect(account).toContainText(me.teacher.school);
  await account.click();
  await expect(page).toHaveURL(/\/ajustes$/);
  await expect(heading(page, 'Ajustes')).toBeVisible();
  await shot(page, info, 'nav-sidebar');

  // Keyboard: the destinations are links reached with Tab and opened with Enter.
  await hoy.focus();
  await page.keyboard.press('Tab');
  await expect(clases).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/clases$/);
  await expect(heading(page, 'Clases')).toBeVisible();
});

test('marco-03 · móvil: la cápsula lleva a Hoy, Clases y Evaluar; Ajustes está en el «···» de Hoy', async ({ page }, info) => {
  test.skip(isDesktop(info), 'the tab capsule is the frame of a phone');
  await page.goto('/hoy');
  const cap = page.getByRole('navigation', { name: 'Navegación' });
  await expect(cap).toBeVisible();
  await expect(page.locator('aside.sidebar')).toBeHidden();
  const hoy = cap.getByRole('link', { name: 'Hoy', exact: true });
  const clases = cap.getByRole('link', { name: 'Clases', exact: true });
  const evaluar = cap.getByRole('link', { name: /Evaluar/ });
  await expect(hoy).toHaveAttribute('aria-current', 'page');
  // Thumb-sized targets
  for (const l of [hoy, clases, evaluar]) {
    const box = await l.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }

  await clases.click();
  await expect(page).toHaveURL(/\/clases$/);
  await expect(heading(page, 'Clases')).toBeVisible();
  await expect(clases).toHaveAttribute('aria-current', 'page');
  await evaluar.click();
  await expect(page).toHaveURL(/\/evaluar$/);
  await expect(heading(page, 'Evaluar')).toBeVisible();
  await expect(evaluar).toHaveAttribute('aria-current', 'page');
  await hoy.click();
  await expect(page).toHaveURL(/\/hoy$/);

  // Ajustes: Hoy › «···» › Ajustes, and «‹ Hoy» comes back.
  await page.getByRole('button', { name: 'Más acciones' }).click();
  await page.getByRole('menuitem', { name: 'Ajustes' }).click();
  await expect(page).toHaveURL(/\/ajustes$/);
  await expect(heading(page, 'Ajustes')).toBeVisible();
  await expect(cap).toBeVisible();
  await shot(page, info, 'nav-capsule-ajustes');
  await expect(backButton(page)).toHaveText('Hoy');
  await backButton(page).click();
  await expect(page).toHaveURL(/\/hoy$/);
  await expect(heading(page, 'Hoy')).toBeVisible();
});

test('marco-04 · la insignia de Evaluar cuenta los exámenes con borradores de la IA por revisar', async ({ page, demo }, info) => {
  const { inboxCount } = await demoIds(demo);
  expect(inboxCount).toBeGreaterThan(0);
  await page.goto('/hoy');
  const evaluar = nav(page, info).getByRole('link', { name: /Evaluar/ });
  await expect(evaluar.locator('.nav-badge')).toHaveText(String(inboxCount));
  // The same count as the «Por revisar» rows with drafts in Evaluar.
  await evaluar.click();
  await expect(heading(page, 'Evaluar')).toBeVisible();
  await expect(page.getByText(/\d+ por revisar/)).toHaveCount(inboxCount);
});

test('marco-05 · «‹ Volver» nombra la pantalla de origen; abierta directamente, su pantalla madre', async ({ page, demo }, info) => {
  const ids = await demoIds(demo);
  // Hoy → Ajustes: «‹ Hoy».
  await page.goto('/hoy');
  if (isDesktop(info)) await page.getByRole('complementary', { name: 'Navegación' }).getByRole('link', { name: /Lucía Martín/ }).click();
  else {
    await page.getByRole('button', { name: 'Más acciones' }).click();
    await page.getByRole('menuitem', { name: 'Ajustes' }).click();
  }
  await expect(heading(page, 'Ajustes')).toBeVisible();
  await expect(backButton(page)).toHaveText('Hoy');

  // Clases → a class → its student: «‹ 2.º ESO B», then «‹ Clases».
  await page.goto('/clases');
  await page.getByRole('link', { name: /Matemáticas · 2\.º ESO B/ }).click();
  await expect(heading(page, '2.º ESO B')).toBeVisible();
  await expect(backButton(page)).toHaveText('Clases');
  await page.getByRole('group', { name: 'Secciones de la clase' }).getByRole('button', { name: 'Alumnos' }).click();
  await page.getByRole('link', { name: /Domínguez Marín, Hugo/ }).first().click();
  await expect(heading(page, ids.student.name)).toBeVisible();
  await expect(backButton(page)).toHaveText('2.º ESO B');
  await backButton(page).click();
  await expect(page).toHaveURL(new RegExp(`/clases/${ids.course}/alumnos$`));
  await backButton(page).click();
  await expect(page).toHaveURL(/\/clases$/);

  // «‹» went back in the history, so the browser's forward walks the same way again, and back returns.
  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`/clases/${ids.course}/alumnos$`));
  await page.goForward();
  await expect(heading(page, ids.student.name)).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/clases/${ids.course}/alumnos$`));
  await expect(heading(page, '2.º ESO B')).toBeVisible();

  // Opened directly (a link, a reload): no origin, so «‹» names the mother screen and goes there.
  await page.goto(`/alumnos/${ids.student.id}`);
  await expect(heading(page, ids.student.name)).toBeVisible();
  await expect(backButton(page)).toHaveText('2.º ESO B');
  await backButton(page).click();
  await expect(page).toHaveURL(new RegExp(`/clases/${ids.course}/alumnos$`));
});

test('marco-06 · cada dirección profunda sobrevive a recargar y su «‹» lleva a la pantalla madre', async ({ page, demo }) => {
  test.setTimeout(120_000);
  const ids = await demoIds(demo);
  const c = `/clases/${ids.course}`;
  const routes: { path: string; see: () => ReturnType<typeof heading> | ReturnType<typeof page.getByText>; back?: [string, RegExp] }[] = [
    { path: '/hoy?dia=2026-11-20', see: () => heading(page, 'Mañana') },
    { path: '/clases?vista=materiales', see: () => heading(page, 'Materiales') },
    { path: '/clases?q=nunez', see: () => page.getByRole('button', { name: /Núñez/ }).first() },
    { path: `${c}/cuaderno`, see: () => heading(page, '2.º ESO B'), back: ['Clases', /\/clases$/] },
    { path: `${c}/alumnos`, see: () => page.getByRole('link', { name: /Domínguez Marín, Hugo/ }).first(), back: ['Clases', /\/clases$/] },
    { path: `${c}/programacion`, see: () => page.getByRole('link', { name: /Fracciones/ }).first(), back: ['Clases', /\/clases$/] },
    { path: `${c}/asistencia`, see: () => heading(page, '2.º ESO B'), back: ['Clases', /\/clases$/] },
    { path: `${c}/unidades/${ids.unit.id}`, see: () => heading(page, 'Fracciones'), back: ['2.º ESO B', new RegExp(`${c}/programacion$`)] },
    { path: `${c}/unidades/${ids.unit.id}/materiales/${ids.notes.id}`, see: () => heading(page, 'Apuntes'), back: ['Fracciones', new RegExp(`${c}/unidades/${ids.unit.id}$`)] },
    { path: `${c}/actividades/${ids.exam.id}`, see: () => heading(page, ids.exam.title), back: ['Cuaderno', new RegExp(`${c}/cuaderno$`)] },
    { path: `${c}/evaluacion/1`, see: () => heading(page, 'Primera evaluación'), back: ['Cuaderno', new RegExp(`${c}/cuaderno\\?term=1$`)] },
    { path: `/alumnos/${ids.student.id}`, see: () => heading(page, ids.student.name), back: ['2.º ESO B', new RegExp(`${c}/alumnos$`)] },
    { path: '/evaluar', see: () => heading(page, 'Evaluar') },
    { path: '/ajustes', see: () => heading(page, 'Ajustes'), back: ['Hoy', /\/hoy$/] },
  ];
  for (const r of routes) {
    await test.step(r.path, async () => {
      await page.goto(r.path);
      await expect(r.see()).toBeVisible();
      await page.reload();
      expect(page.url()).toContain(r.path);
      await expect(r.see()).toBeVisible();
      if (r.back) {
        await expect(backButton(page)).toHaveText(r.back[0]);
        await backButton(page).click();
        await expect(page).toHaveURL(r.back[1]);
      } else {
        await expect(backButton(page)).toHaveCount(0);
      }
    });
  }
});

test('marco-07 · direcciones con ids que no existen (o de otro profesor) lo dicen con una frase y dan una salida', async ({ page, demo }, info) => {
  const ids = await demoIds(demo);
  const c = `/clases/${ids.course}`;
  const cases: { path: string; title: string; action: string; to: RegExp }[] = [
    { path: '/alumnos/no-existe', title: 'No se ha encontrado el alumno', action: 'Ir a Clases', to: /\/clases$/ },
    { path: '/clases/no-existe/alumnos', title: 'No se ha encontrado la clase', action: 'Ir a Clases', to: /\/clases$/ },
    { path: '/clases/no-existe/evaluacion/1', title: 'No se ha encontrado la clase', action: 'Ir a Clases', to: /\/clases$/ },
    { path: `${c}/unidades/no-existe`, title: 'No se ha encontrado la unidad', action: 'Volver al temario', to: new RegExp(`${c}/programacion$`) },
    { path: `${c}/unidades/${ids.unit.id}/materiales/no-existe`, title: 'No se ha encontrado el material', action: 'Volver a la unidad', to: new RegExp(`${c}/unidades/${ids.unit.id}$`) },
  ];
  for (const k of cases) {
    await test.step(k.path, async () => {
      await page.goto(k.path);
      await expect(page.getByText(k.title, { exact: true })).toBeVisible();
      const way = page.getByRole('link', { name: k.action }).or(page.getByRole('button', { name: k.action }));
      await way.click();
      await expect(page).toHaveURL(k.to);
    });
  }
  await shot(page, info, 'not-found');

  // Another teacher's class is not found either (ownership): same sentence, nothing of the class shows.
  const other = await demo.ctx.post(`${process.env.API || 'http://127.0.0.1:8000'}/api/auth/register`, {
    data: { name: 'Otra Profesora', email: `marco-otra-${Date.now().toString(36)}@e2e.sepia.es`, password: 'sepia1234' },
  });
  const t = await other.json();
  await page.evaluate((v) => localStorage.setItem('sepia.tokens', v), JSON.stringify({ access_token: t.access_token, refresh_token: t.refresh_token }));
  await page.goto(`${c}/cuaderno`);
  await expect(page.getByText('No se ha encontrado la clase', { exact: true })).toBeVisible();
  await expect(page.getByText('Domínguez')).toHaveCount(0);
  await page.goto(`/alumnos/${ids.student.id}`);
  await expect(page.getByText('No se ha encontrado el alumno', { exact: true })).toBeVisible();
});

test('marco-11 · la revisión de un examen que ya no existe lo dice con una frase y vuelve al examen', async ({ page, demo }) => {
  // BUG marco-B5: the review asks for the activity, gets «No se ha encontrado la actividad.» (404) and never says so:
  // the page stays on its loading placeholder under «‹ Examen» for good.
  bug('marco-B5', 'the review of an activity that does not exist stays on its loading placeholder forever');
  const ids = await demoIds(demo);
  const c = `/clases/${ids.course}`;
  await page.goto(`${c}/actividades/borrada/revisar`);
  await expect(page.getByText('No se ha encontrado la actividad.')).toBeVisible();
  await page.getByRole('button', { name: 'Volver al examen' }).click();
  await expect(page).toHaveURL(new RegExp(`${c}/actividades/borrada$`));
  await expect(page.getByText('No se ha podido abrir la actividad')).toBeVisible();
});

test('marco-12 · un enlace a Hoy con una fecha mal escrita abre hoy, sin «NaN» ni «undefined»', async ({ page }) => {
  // BUG marco-B7: ?dia= is used as it comes: «garbage» titles the page «undefined NaN» with a week of «NaN» and the
  // server's «Revisa el campo «date».» with a «Reintentar» that can never work; «2026-13-45» is shown as Sunday 14
  // February 2027 while the server refuses it.
  bug('marco-B7', 'Hoy with a malformed ?dia= shows «undefined NaN» and an error that «Reintentar» cannot fix');
  for (const bad of ['garbage', '2026-13-45']) {
    await page.goto(`/hoy?dia=${bad}`);
    await expect(page.getByRole('main')).not.toContainText(/NaN|undefined/, { timeout: 3_000 });
    await expect(page.getByText('No se ha podido cargar el día')).toHaveCount(0);
    await expect(heading(page, 'Hoy')).toBeVisible({ timeout: 3_000 });
  }
});

test('marco-13 · un enlace al Cuaderno con una evaluación que no existe abre la evaluación actual', async ({ page, demo }) => {
  // BUG marco-B8: /cuaderno?term=9 shows «No se ha podido cargar el cuaderno. La evaluación debe ser 1, 2, 3 o final.»
  // with a «Reintentar» that repeats the same request; Evaluación (/evaluacion/abc) falls back to the 1.ª instead.
  bug('marco-B8', 'the Cuaderno with an unknown ?term= shows an error instead of the current evaluación');
  const ids = await demoIds(demo);
  await page.goto(`/clases/${ids.course}/cuaderno?term=9`);
  await expect(heading(page, '2.º ESO B')).toBeVisible();
  await expect(page.getByText('No se ha podido cargar el cuaderno.')).toHaveCount(0, { timeout: 3_000 });
  await expect(page.getByRole('button', { name: '1.ª', exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 3_000 });
});

test.describe('navegación · sin sesión', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('marco-14 · sin sesión, cualquier dirección lleva a «Entrar» sin marco; al entrar se abre Hoy', async ({ page, demo }, info) => {
    const ids = await demoIds(demo);
    for (const path of ['/hoy', `/clases/${ids.course}/cuaderno`, `/alumnos/${ids.student.id}`, '/ajustes', '/esto/no/existe']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/entrar$/);
      await expect(page.getByLabel('Correo')).toBeVisible();
    }
    await expect(page.locator('aside.sidebar')).toHaveCount(0);
    await expect(page.locator('nav.tabcap')).toHaveCount(0);
    await page.getByLabel('Correo').fill('demo@sepia.es');
    await page.getByLabel('Contraseña').fill('sepia1234');
    await page.locator('form').getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/hoy$/);
    await expect(heading(page, 'Hoy')).toBeVisible();
    await expect(nav(page, info)).toBeVisible();
  });
});

test('marco-08 · Revisar es modo foco: sin barra lateral ni cápsula, también al recargar; al salir vuelven', async ({ page, demo }, info) => {
  const ids = await demoIds(demo);
  const c = `/clases/${ids.course}`;
  await page.goto(`${c}/actividades/${ids.exam.id}`);
  await expect(heading(page, ids.exam.title)).toBeVisible();
  await expect(nav(page, info)).toBeVisible();

  await page.getByRole('link', { name: /^Revisar alumno a alumno/ }).click();
  await expect(page).toHaveURL(new RegExp(`${c}/actividades/${ids.exam.id}/revisar`));
  const bar = page.locator('header.review-bar');
  await expect(bar).toBeVisible();
  await expect(bar.locator('.review-bar__title strong')).not.toBeEmpty();
  await expect(page.locator('aside.sidebar')).toBeHidden();
  await expect(page.locator('nav.tabcap')).toBeHidden();
  await shot(page, info, 'focus-mode');

  await page.reload();
  await expect(bar.locator('.review-bar__title strong')).not.toBeEmpty();
  await expect(page.locator('aside.sidebar')).toBeHidden();
  await expect(page.locator('nav.tabcap')).toBeHidden();

  await bar.getByRole('button', { name: /^Volver a / }).click();
  await expect(page).toHaveURL(new RegExp(`${c}/actividades/${ids.exam.id}(\\?.*)?$`));
  await expect(heading(page, ids.exam.title)).toBeVisible();
  await expect(nav(page, info)).toBeVisible();
});

test('marco-09 · la pestaña del navegador dice la pantalla y la barra superior muestra el título al bajar', async ({ page, demo }) => {
  const ids = await demoIds(demo);
  for (const [path, title] of [['/hoy', 'Hoy'], ['/clases', 'Clases'], ['/evaluar', 'Evaluar'], ['/ajustes', 'Ajustes'],
    [`/clases/${ids.course}/alumnos`, '2.º ESO B'], [`/alumnos/${ids.student.id}`, ids.student.name]] as const) {
    await page.goto(path);
    await expect(heading(page, title)).toBeVisible();
    await expect(page).toHaveTitle(`${title} · Sepia`);
  }

  // A long page: the small title appears in the glass bar once the big one has gone under it.
  await page.goto(`/clases/${ids.course}/alumnos`);
  await expect(page.getByRole('link', { name: /Domínguez Marín, Hugo/ }).first()).toBeVisible();
  const bar = page.locator('header.topbar');
  await expect(bar.locator('.topbar__title')).toHaveAttribute('aria-hidden', 'true');
  await expect(bar).not.toHaveClass(/topbar--scrolled/);
  await page.mouse.wheel(0, 900);
  await expect(bar).toHaveClass(/topbar--scrolled/);
  await expect(bar.locator('.topbar__title')).toHaveAttribute('aria-hidden', 'false');
  await expect(bar.locator('.topbar__title')).toHaveText('2.º ESO B');
  await page.mouse.wheel(0, -5000);
  await expect(bar).not.toHaveClass(/topbar--scrolled/);
});

test('marco-10 · móvil: la última fila de una página larga se lee por encima de la cápsula', async ({ page, demo }, info) => {
  test.skip(isDesktop(info), 'the capsule is the frame of a phone');
  const ids = await demoIds(demo);
  const cap = page.locator('nav.tabcap');
  for (const path of [`/clases/${ids.course}/alumnos`, '/ajustes', '/evaluar', '/clases']) {
    await test.step(path, async () => {
      await page.goto(path);
      await expect(page.locator('.page-body').locator('.row, button').last()).toBeVisible();
      await expect(async () => {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const last = await page.locator('.page-body').evaluate((body) => {
          const els = [...body.querySelectorAll<HTMLElement>('.row, .btn, .empty, .callout')].filter((e) => e.offsetParent);
          return els[els.length - 1].getBoundingClientRect().bottom;
        });
        const capTop = (await cap.boundingBox())!.y;
        expect(last).toBeLessThanOrEqual(capTop);
      }).toPass();
    });
  }
});
