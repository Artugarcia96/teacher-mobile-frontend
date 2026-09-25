import {
  agendaRow, CLASS, expect, hoyMenu, LABEL, nowCard, openHoy, section, shot, test, toast, TODAY,
} from './hoy-helpers';

// The agenda's own entries and «Voy a faltar» (docs/PRODUCT.md §4.2): events (add, edit, move, delete) and the hoja
// de guardia for jefatura (sessions marked «Faltas», its PDF, «Ya no falto»). The Spanish date and 24 h times of
// «Añadir evento» and back-to-close are in e2e/sheets.spec.ts. Each test is a teacher of its own (demo materials left
// to the substitute: hoy-78 in hoy.spec.ts).

const eventRow = (page: import('@playwright/test').Page, title: string) =>
  section(page, 'Agenda').getByRole('button').filter({ hasText: title });

test.describe('hoy · eventos', () => {
  test.use({ worldSpec: { courses: [CLASS] } });

  test('hoy-70 · add an event: title, times checked, kind and class; it takes its place in the agenda', async ({ page, world }, info) => {
    await openHoy(page);
    const dot = page.getByRole('button', { name: 'jueves, 19 de noviembre' }).locator('.weekstrip__dot--on');
    await expect(dot).toHaveCount(0);
    await hoyMenu(page, 'Añadir evento');
    const sheet = page.getByRole('dialog', { name: 'Añadir evento' });
    const add = sheet.getByRole('button', { name: 'Añadir' });
    await expect(add).toBeDisabled();
    await expect(add).toHaveAttribute('title', 'Escribe un título');
    await sheet.getByLabel('Título').fill('Claustro');
    await sheet.getByLabel('Inicio').fill('17:00');
    await sheet.getByLabel('Fin').fill('16:30');
    await expect(sheet.getByText('La hora de fin debe ser posterior a la de inicio')).toBeVisible();
    await expect(add).toBeDisabled();
    await sheet.getByLabel('Fin').fill('18:30');
    await expect(add).toBeEnabled();
    await sheet.getByLabel('Tipo').selectOption({ label: 'Otro' });
    await sheet.getByLabel('Clase').selectOption({ label: LABEL });
    await shot(page, info, '70-event');
    await add.click();
    await expect(toast(page, 'Evento añadido')).toBeVisible();
    await expect(sheet).toBeHidden();

    const rows = section(page, 'Agenda').getByRole('button');
    await expect(rows.last()).toContainText('Claustro');
    await expect(agendaRow(page, '17:00')).toContainText(`Otro · ${LABEL}`);
    await expect(dot).toHaveCount(1);
    const day = await world.api.get(`/today?date=${TODAY}`);
    expect(day.events).toMatchObject([{ title: 'Claustro', start: '17:00', end: '18:30', kind: 'other', course: { label: LABEL } }]);
  });

  test('hoy-71 · an event for the whole day goes first; one added from another day is dated that day', async ({ page, world }) => {
    await openHoy(page);
    await hoyMenu(page, 'Añadir evento');
    const sheet = page.getByRole('dialog', { name: 'Añadir evento' });
    await sheet.getByLabel('Título').fill('Salida al Museo de Ciencias');
    await sheet.getByLabel('Tipo').selectOption({ label: 'Salida' });
    await sheet.getByRole('button', { name: 'Añadir' }).click();
    await expect(toast(page, 'Evento añadido')).toBeVisible();
    const first = section(page, 'Agenda').getByRole('button').first();
    await expect(first).toContainText('Día');
    await expect(first).toContainText('Salida al Museo de Ciencias');
    await expect(first).toContainText('Salida');

    await page.getByRole('button', { name: 'viernes, 20 de noviembre' }).click();
    await hoyMenu(page, 'Añadir evento');
    await expect(sheet.getByText('viernes, 20 nov 2026')).toBeVisible();
    await sheet.getByLabel('Título').fill('Tutoría con la familia de Hugo');
    await sheet.getByLabel('Inicio').fill('16:00');
    await sheet.getByLabel('Tipo').selectOption({ label: 'Tutoría' });
    await sheet.getByRole('button', { name: 'Añadir' }).click();
    await expect(eventRow(page, 'Tutoría con la familia de Hugo')).toContainText('Tutoría');
    const friday = await world.api.get('/today?date=2026-11-20');
    expect(friday.events.map((e: { title: string }) => e.title)).toEqual(['Tutoría con la familia de Hugo']);
  });

  test('hoy-72 · edit an event, move it to another day', async ({ page, world }) => {
    await world.api.post('/events', { title: 'Reunión con orientación', kind: 'meeting', date: TODAY, start: '16:00', end: '17:00' });
    await openHoy(page);
    await eventRow(page, 'Reunión con orientación').click();
    const sheet = page.getByRole('dialog', { name: 'Editar evento' });
    await expect(sheet.getByLabel('Título')).toHaveValue('Reunión con orientación');
    await expect(sheet.getByLabel('Inicio')).toHaveValue('16:00');
    await expect(sheet.getByLabel('Fin')).toHaveValue('17:00');
    await expect(sheet.getByLabel('Tipo')).toHaveValue('meeting');
    await sheet.getByLabel('Título').fill('Reunión con orientación sobre Hugo');
    await sheet.getByLabel('Fecha').fill('2026-11-20');
    await sheet.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Evento actualizado')).toBeVisible();
    await expect(eventRow(page, 'Reunión con orientación')).toHaveCount(0);
    await page.getByRole('button', { name: 'viernes, 20 de noviembre' }).click();
    await expect(eventRow(page, 'Reunión con orientación sobre Hugo')).toContainText('16:00');
  });

  test('hoy-73 · delete an event, after confirming', async ({ page, world }) => {
    await world.api.post('/events', { title: 'Guardia de recreo', kind: 'other', date: TODAY, start: '11:15', end: '11:45' });
    await openHoy(page);
    await eventRow(page, 'Guardia de recreo').click();
    const sheet = page.getByRole('dialog', { name: 'Editar evento' });
    await sheet.getByRole('button', { name: 'Eliminar' }).click();
    const ask = page.getByRole('dialog', { name: 'Eliminar evento' });
    await expect(ask.getByText('«Guardia de recreo» desaparecerá de tu agenda.')).toBeVisible();
    await ask.getByRole('button', { name: 'Cancelar' }).click();
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Eliminar' }).click();
    await ask.getByRole('button', { name: 'Eliminar' }).click();
    await expect(toast(page, 'Evento eliminado')).toBeVisible();
    await expect(eventRow(page, 'Guardia de recreo')).toHaveCount(0);
    expect((await world.api.get(`/today?date=${TODAY}`)).events).toEqual([]);
  });
});

test.describe('hoy · voy a faltar', () => {
  test.use({ worldSpec: { courses: [CLASS] } });

  test('hoy-74 · leave the task of today’s remaining classes: «Faltas» in the agenda, the PDF, «Ya no falto»', async ({ page, context, world }, info) => {
    await openHoy(page);
    await hoyMenu(page, 'Voy a faltar');
    const sheet = page.getByRole('dialog', { name: 'Voy a faltar' });
    await expect(sheet.getByText('Deja la tarea de cada clase para el profesorado de guardia.')).toBeVisible();
    await expect(sheet.getByText('19 nov 2026')).toHaveCount(2); // Desde and Hasta: today
    await expect(sheet.getByRole('heading', { name: 'Sesiones · 2 de 2' })).toBeVisible(); // the 08:30 class is over
    await expect(sheet.getByText('Jue 19 nov, 10:20–11:15 · Aula 112')).toBeVisible();
    await expect(sheet.getByText('Jue 19 nov, 12:40–13:35 · Aula 112')).toBeVisible();
    const tasks = sheet.getByRole('textbox', { name: 'Tarea' });
    await expect(tasks).toHaveCount(2);
    for (const i of [0, 1]) await expect(tasks.nth(i)).toHaveValue('Problemas de la p. 34. Deberes: p. 33, ej. 15-18.'); // what the last closing planned
    await sheet.getByLabel('Motivo').fill('Formación del profesorado');
    await sheet.getByRole('switch', { name: `Incluir ${LABEL} 12:40` }).click();
    await expect(sheet.getByRole('heading', { name: 'Sesiones · 1 de 2' })).toBeVisible();
    await expect(tasks).toHaveCount(1);
    await tasks.first().fill('Ficha de repaso de fracciones, ejercicios 1 a 10.');
    await shot(page, info, '74-absence');
    await sheet.getByRole('button', { name: 'Crear hoja de guardia (1)' }).click();
    await expect(toast(page, '1 sesión con hoja de guardia')).toBeVisible();
    await expect(sheet.getByText('1 sesión con hoja de guardia')).toBeVisible();
    const href = await sheet.getByRole('link', { name: 'Descargar PDF' }).getAttribute('href');
    const pdf = await page.request.get(href!);
    expect(pdf.ok()).toBe(true);
    expect((await pdf.body()).subarray(0, 4).toString()).toBe('%PDF');
    await sheet.getByRole('button', { name: 'Cerrar', exact: true }).click();

    await expect(agendaRow(page, '10:20')).toContainText('Faltas');
    await expect(nowCard(page)).toHaveAccessibleName('Siguiente · 12:40');
    await agendaRow(page, '10:20').click();
    const session = page.getByRole('dialog', { name: LABEL });
    await expect(session.getByText('Faltas · tarea: Ficha de repaso de fracciones, ejercicios 1 a 10.')).toBeVisible();
    await expect(session.getByRole('button', { name: /^Pasar lista/ })).toContainText('Con la hoja de la guardia');
    await expect(session.getByRole('button', { name: /^Cerrar clase/ })).toHaveCount(0);
    // A new tab loads the PDF (headless Chromium downloads it instead of showing it: look at the response).
    const pdfResponse = context.waitForEvent('response', (r) => r.url().includes('/api/files/'));
    const opened = context.waitForEvent('page');
    await session.getByRole('button', { name: /^Hoja de guardia \(PDF\)/ }).click();
    const response = await pdfResponse;
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/pdf');
    await (await opened).close();

    await session.getByRole('button', { name: 'Ya no falto' }).click();
    const ask = page.getByRole('dialog', { name: 'Ya no faltas' });
    await expect(ask.getByText(/La sesión vuelve a ser una clase normal/)).toBeVisible();
    await ask.getByRole('button', { name: 'Ya no falto' }).click();
    await expect(toast(page, 'Vuelves a tener esta clase')).toBeVisible();
    await expect(agendaRow(page, '10:20')).not.toContainText('Faltas');
    await expect(nowCard(page)).toHaveAccessibleName('Ahora · quedan 35 min');
    const day = await world.api.get(`/today?date=${TODAY}`);
    expect(day.sessions.map((s: { guardia: boolean }) => s.guardia)).toEqual([false, false, false]);
  });

  test('hoy-75 · the sheet says why it cannot create the hoja yet', async ({ page }) => {
    await openHoy(page);
    await hoyMenu(page, 'Voy a faltar');
    const sheet = page.getByRole('dialog', { name: 'Voy a faltar' });
    const create = sheet.getByRole('button', { name: /^Crear hoja de guardia/ });
    await expect(create).toBeEnabled();
    await sheet.getByRole('textbox', { name: 'Tarea' }).first().fill('');
    await expect(create).toBeDisabled();
    await expect(create).toHaveAttribute('title', 'Escribe la tarea de cada sesión');
    for (const start of ['10:20', '12:40']) await sheet.getByRole('switch', { name: `Incluir ${LABEL} ${start}` }).click();
    await expect(create).toHaveAttribute('title', 'Elige al menos una sesión');
    await expect(create).toHaveText('Crear hoja de guardia');

    await sheet.getByLabel('Hasta').fill('2026-11-18');
    await expect(sheet.getByText('La fecha final debe ser posterior')).toBeVisible();
    await expect(create).toBeDisabled();
    await sheet.getByLabel('Desde').fill('2026-11-21');
    await expect(sheet.getByText('Sin clases esos días')).toBeVisible();
    await expect(sheet.getByText('Elige otras fechas.')).toBeVisible();
    await sheet.getByLabel('Hasta').fill('2026-11-27'); // a week: Thursday's three classes and Friday's
    await expect(sheet.getByRole('heading', { name: 'Sesiones · 4 de 4' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Crear hoja de guardia (4)' })).toBeEnabled();
  });

  test('hoy-76 · from a day to come: that day is proposed, and it shows as «Faltas»', async ({ page, world }) => {
    await openHoy(page);
    await page.getByRole('button', { name: 'viernes, 20 de noviembre' }).click();
    await hoyMenu(page, 'Voy a faltar');
    const sheet = page.getByRole('dialog', { name: 'Voy a faltar' });
    await expect(sheet.getByText('20 nov 2026')).toHaveCount(2);
    await expect(sheet.getByText('Vie 20 nov, 09:25–10:20 · Aula 112')).toBeVisible();
    await sheet.getByRole('button', { name: 'Crear hoja de guardia (1)' }).click();
    await expect(sheet.getByText('1 sesión con hoja de guardia')).toBeVisible();
    await sheet.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(agendaRow(page, '09:25')).toContainText('Faltas');
    await expect(nowCard(page)).toHaveCount(0);
    const friday = await world.api.get('/today?date=2026-11-20');
    expect(friday.sessions[0]).toMatchObject({ guardia: true, cancel_note: 'Problemas de la p. 34. Deberes: p. 33, ej. 15-18.' });
  });

  test('hoy-77 · a server refusal is shown and the sheet keeps what was written', async ({ page }) => {
    await openHoy(page);
    await hoyMenu(page, 'Voy a faltar');
    const sheet = page.getByRole('dialog', { name: 'Voy a faltar' });
    await sheet.getByLabel('Motivo').fill('Médico');
    await page.route('**/api/absences', (route) => route.fulfill({ status: 400, contentType: 'application/json',
      body: JSON.stringify({ detail: { message: 'La sesión de las 10:20 ya ha terminado.' } }) }));
    await sheet.getByRole('button', { name: /^Crear hoja de guardia/ }).click();
    await expect(toast(page, 'La sesión de las 10:20 ya ha terminado.')).toBeVisible();
    await expect(sheet.getByLabel('Motivo')).toHaveValue('Médico');
  });
});
