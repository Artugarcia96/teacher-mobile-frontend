import { request as newRequest } from '@playwright/test';
import { API, APP, bug, demoIds, expect, heading, shot, test, textPdf, toast } from './marco.helpers';

// Marco · ficheros: what the teacher opens through a signed link (an uploaded file, the exam's PDFs), what a signed
// link says once it has expired or was altered, and the public page of a material shared with the students
// (/api/s/{token}: no session, a link page that never redirects on its own, the file inline, gone after «Dejar de
// compartir»). The demo is only read; sharing runs as a teacher of its own. No AI.
// (Headless Chromium has no PDF viewer: what the browser would show is checked on the response it gets.)

test('marco-50 · abrir un archivo subido a la unidad lo muestra en una pestaña nueva por su enlace firmado', async ({ page, demo }) => {
  // BUG marco-B2: the server sends an uploaded file as an attachment, so «Abrir» leaves a blank tab and downloads it
  // instead of showing it (exam PDFs open inline in the browser's viewer).
  bug('marco-B2', '«Abrir» on an uploaded file leaves a blank tab and downloads it (served as an attachment)');
  const ids = await demoIds(demo);
  await page.goto(`/clases/${ids.course}/unidades/${ids.unit.id}`);
  await expect(heading(page, 'Fracciones')).toBeVisible();
  const served = page.context().waitForEvent('response', { predicate: (r) => r.url().includes('/api/files/') });
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: new RegExp(ids.upload.title) }).first().click();
  const tab = await popup;
  const r = await served;
  expect(r.status()).toBe(200);
  expect(r.url()).toMatch(/\/api\/files\/.+\?exp=\d+&sig=[0-9a-f]+/);
  expect(r.headers()['content-type']).toBe('application/pdf');
  expect(r.headers()['content-disposition']).toMatch(/^inline;/);
  await expect.poll(() => tab.url(), { timeout: 3_000 }).toContain('/api/files/');
});

test('marco-51 · «Soluciones» y «Examen para imprimir» se abren en el visor con un nombre legible', async ({ page, demo }) => {
  const ids = await demoIds(demo);
  await page.goto(`/clases/${ids.course}/actividades/${ids.exam.id}`);
  await expect(heading(page, ids.exam.title)).toBeVisible();
  for (const [item, name] of [['Soluciones', /^inline; filename="Soluciones - Examen U2 - Fracciones - 2o ESO B\.pdf"/],
    ['Examen para imprimir', /^inline; filename="Examen U2 - Fracciones - 2o ESO B\.pdf"/]] as const) {
    await test.step(item, async () => {
      const served = page.context().waitForEvent('response', { predicate: (r) => r.url().includes('/api/files/') });
      const popup = page.waitForEvent('popup');
      await page.getByRole('button', { name: 'Más opciones' }).click();
      await page.getByRole('menuitem', { name: item }).click();
      const r = await served;
      expect(r.status()).toBe(200);
      expect(r.headers()['content-type']).toBe('application/pdf');
      expect(r.headers()['content-disposition']).toMatch(name);
      await (await popup).close();
    });
  }
  await expect(toast(page, /No se ha podido/)).toHaveCount(0);
});

test('marco-52 · un enlace firmado caducado o alterado lo dice con una frase, no con datos técnicos', async ({ page, demo }) => {
  // BUG marco-B3: the server answers the browser with raw JSON: {"detail":{"message":"El enlace ha caducado…","code":…}}.
  bug('marco-B3', 'an expired or altered signed link shows raw JSON');
  const ids = await demoIds(demo);
  const { url } = await demo.get<{ url: string }>(`/materials/${ids.upload.id}/file`);
  const expired = url.replace(/exp=\d+/, 'exp=1000');
  const altered = url.replace(/sig=[0-9a-f]+/, 'sig=0000000000000000');
  for (const link of [expired, altered]) {
    const r = await page.goto(`${APP}${link}`);
    expect(r!.status()).toBe(403);
    await expect(page.locator('body')).toContainText('El enlace ha caducado. Vuelve a abrirlo desde la app.');
    await expect(page.locator('body')).not.toContainText('"detail"', { timeout: 1_000 });
  }
});

test.describe('ficheros · compartir con alumnos', () => {
  test.use({ teacherSpec: { course: { units: [{ title: 'Fracciones', term: 1, status: 'current' }] } } });

  test('marco-53 · la página pública de un material compartido: enlace sin redirigir, archivo en línea y retirada', async ({ page, context, browser, teacher }, info) => {
    const unit = teacher.course!.units[0];
    const link = await teacher.api.post(`/units/${unit.id}/links`, { url: 'https://www.youtube.com/watch?v=abc123XYZ', title: 'Vídeo: suma de fracciones' });
    const [pdf] = await teacher.api.upload(`/units/${unit.id}/materials`, 'repaso.pdf', 'application/pdf', textPdf('Hoja de repaso de fracciones'));
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: APP });

    await page.goto(`/clases/${teacher.course!.id}/unidades/${unit.id}`);
    await expect(heading(page, 'Fracciones')).toBeVisible();
    await page.getByRole('button', { name: `Opciones de ${link.title}` }).click();
    await page.getByRole('menuitem', { name: 'Compartir con alumnos' }).click();
    const sheet = page.getByRole('dialog', { name: 'Compartir con alumnos' });
    await expect(sheet).toContainText('Se creará un enlace de solo lectura que tus alumnos abren sin iniciar sesión');
    await expect(sheet).toContainText('El material pasará a «Para alumnos».');
    await sheet.getByRole('button', { name: 'Crear enlace' }).click();
    await expect(toast(page, 'Enlace creado. Ahora está en «Para alumnos».')).toBeVisible();
    await expect(sheet.getByRole('img', { name: `Código QR de ${link.title}` })).toBeVisible();
    const anchor = sheet.locator('a.share__url');
    const url = (await anchor.getAttribute('href'))!;
    expect(url).toMatch(new RegExp(`^${APP.replace(/[.]/g, '\\.')}/api/s/[A-Za-z0-9]+$`));
    await expect(anchor).toHaveText(url.replace(/^https?:\/\//, ''));
    await shot(page, info, 'compartir');

    await sheet.getByRole('button', { name: 'Copiar enlace' }).click();
    await expect(toast(page, 'Enlace copiado')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);

    await sheet.getByRole('button', { name: 'Proyectar' }).click();
    const stage = page.getByRole('dialog', { name: `Proyectar ${link.title}` });
    await expect(stage.getByRole('img', { name: 'Código QR' })).toBeVisible();
    await expect(stage).toContainText(url.replace(/^https?:\/\//, ''));
    await stage.getByRole('button', { name: 'Cerrar' }).click();
    await expect(stage).toHaveCount(0);
    await expect(sheet).toBeVisible();

    // A student, without any session, opens it: where it goes and a button; never an automatic redirect.
    const student = await browser.newContext();
    const s = await student.newPage();
    const opened = await s.goto(url);
    expect(opened!.status()).toBe(200);
    expect(s.url()).toBe(url);
    await expect(s.getByText('Material compartido por tu profesor')).toBeVisible();
    await expect(s.getByRole('heading', { name: link.title })).toBeVisible();
    await expect(s.getByText('Este enlace lleva a youtube.com, una página que no es de Sepia.')).toBeVisible();
    await expect(s.getByRole('link', { name: 'Abrir enlace' })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=abc123XYZ');
    await expect(s.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    await shot(s, info, 'pagina-publica');

    // The row says it is shared; opening the sheet again shows the same link at once (no second «Crear enlace»).
    await sheet.getByRole('button', { name: 'Cerrar' }).click();
    await expect(page.locator('.mrow', { hasText: link.title })).toContainText('Compartido');
    await page.getByRole('button', { name: `Opciones de ${link.title}` }).click();
    await page.getByRole('menuitem', { name: 'Compartir con alumnos' }).click();
    await expect(sheet.locator('a.share__url')).toHaveAttribute('href', url);
    await expect(sheet.getByRole('button', { name: 'Crear enlace' })).toHaveCount(0);

    // «Dejar de compartir» asks, then the student's link is gone.
    await sheet.getByRole('button', { name: 'Dejar de compartir' }).click();
    const ask = page.getByRole('dialog', { name: 'Dejar de compartir' });
    await expect(ask).toContainText('El enlace y el código QR dejarán de funcionar para tus alumnos.');
    await ask.getByRole('button', { name: 'Dejar de compartir' }).click();
    await expect(toast(page, 'Ya no se comparte')).toBeVisible();
    await expect(sheet).toBeHidden();
    const gone = await s.reload();
    expect(gone!.status()).toBe(404);
    await expect(s.getByRole('heading', { name: 'Este enlace ya no está disponible' })).toBeVisible();
    await expect(s.getByText('Puede que haya caducado o que tu profesor lo haya retirado. Pídele uno nuevo.')).toBeVisible();

    // A shared file is served inline with its title as the name; an unknown code is «ya no está disponible».
    const shared = await teacher.api.post<{ path: string }>(`/materials/${pdf.id}/share`, { origin: APP });
    const anon = await newRequest.newContext();
    const file = await anon.get(`${API}${shared.path}`);
    expect(file.status()).toBe(200);
    expect(file.headers()['content-type']).toBe('application/pdf');
    expect(file.headers()['content-disposition']).toMatch(/^inline; filename="repaso\.pdf"/);
    expect((await file.body()).subarray(0, 5).toString()).toBe('%PDF-');
    const unknown = await s.goto(`${APP}/api/s/NOEXISTE12`);
    expect(unknown!.status()).toBe(404);
    await expect(s.getByRole('heading', { name: 'Este enlace ya no está disponible' })).toBeVisible();
    await anon.dispose();
    await student.close();
  });
});
