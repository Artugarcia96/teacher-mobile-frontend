import {
  agendaRow, bug, CLASS, demoCourse, expect, extraSlot, FRI, homeworkSheet, hoyMenu, isMobile, listSheet, MON, nowCard,
  openHoy, section, SHORT, shot, test, THU, TODAY,
} from './hoy-helpers';

// Hoy (docs/PRODUCT.md §4.2): the day at a glance, other days, the header menu, Pendiente and its links, the materials
// of the unit in progress, empty and error states. Without AI. Every test that reads or changes the demo teacher lives
// in this file and puts back what it changes (they expect the config's single worker); the other hoy-*.spec.ts files
// only use teachers of their own, so they also run in parallel (--workers=4) and on a data copy already used.

test.describe('hoy · demo day (Thursday 19 Nov, 10:40)', () => {
  test('hoy-01 · the day at a glance: class in progress, agenda, pendiente, a vigilar, week strip', async ({ page, demo }, info) => {
    const day = await demo.get(`/today?date=${TODAY}`);
    await page.goto('/');
    await expect(page).toHaveURL(/\/hoy$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Hoy' })).toBeVisible();
    await expect(page.getByText('jueves, 19 de noviembre · 1.ª evaluación, semana 11')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Hoy', exact: true }).filter({ visible: true })).toHaveAttribute('aria-current', 'page');

    // Ahora: the class in progress with its unit, materials, what the last closing left, and the three actions.
    const card = nowCard(page);
    await expect(card).toHaveAccessibleName('Ahora · quedan 35 min');
    await expect(card.getByRole('link', { name: '2.º ESO B · Mates' })).toBeVisible();
    await expect(card.getByText('Aula 204 · 10:20–11:15 · Fracciones')).toBeVisible();
    const mats = card.getByLabel('Materiales de la unidad').getByRole('button');
    const now = day.sessions.find((s: { status: string }) => s.status === 'now');
    // Each chip says the material without the unit, which the card already names.
    await expect(mats).toHaveText(now.materials.map((m: { title: string }) => m.title.replace(/ · Fracciones$/, '')));
    await expect(mats.first()).toHaveText(/^Presentación/); // the presentation first
    await expect(card.getByText('Toca: Problemas de la p. 34')).toBeVisible();
    await expect(card.getByText('Deberes: p. 33, ej. 15-18')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Revisar' })).toBeVisible();
    await expect(card.getByText('El martes: Terminamos suma y resta de fracciones con distinto denominador.')).toBeVisible();
    for (const name of ['Pasar lista', 'Anotar', 'Cerrar clase']) await expect(card.getByRole('button', { name, exact: true })).toBeVisible();

    // Agenda: every session and event by time, with its state in the same place.
    const agenda = section(page, 'Agenda');
    await expect(agenda.getByRole('button')).toHaveCount(day.sessions.length + day.events.length);
    await expect(agendaRow(page, '08:30')).toContainText('3.º ESO A · FyQ');
    await expect(agendaRow(page, '08:30')).toContainText('Lista pasada');
    await expect(agendaRow(page, '09:25')).toContainText('Lista sin pasar');
    await expect(agendaRow(page, '10:20')).not.toContainText('Lista'); // on now: not owed yet
    await expect(agendaRow(page, '12:40')).not.toContainText('Lista');
    await expect(agendaRow(page, '16:00')).toContainText('Reunión de departamento');
    await expect(agendaRow(page, '16:00')).toContainText('Reunión');

    // Pendiente in the server's order of urgency, a vigilar (at most 4) with «Ver todos».
    const pending = section(page, 'Pendiente').getByRole('button');
    await expect(pending).toHaveCount(day.pending.length);
    for (const [i, p] of day.pending.entries()) {
      await expect(pending.nth(i)).toContainText(p.title);
      await expect(pending.nth(i)).toContainText(p.sub);
    }
    await expect(pending.first()).toContainText('Lista sin pasar · 1.º ESO A');
    const watch = section(page, 'A vigilar');
    await expect(watch.getByRole('button', { name: `Ver todos (${day.watch_total})` })).toBeVisible();
    const rows = watch.locator('.list').getByRole('button');
    await expect(rows).toHaveCount(Math.min(4, day.watchlist.length));
    for (const [i, w] of day.watchlist.slice(0, 4).entries()) await expect(rows.nth(i)).toContainText(w.student.name);

    // Week strip: today selected; a dot on days with an event or a list still due.
    await expect(page.getByRole('button', { name: 'jueves, 19 de noviembre' })).toHaveAttribute('aria-pressed', 'true');
    const dot = (d: string) => page.getByRole('button', { name: d }).locator('.weekstrip__dot--on');
    await expect(dot('jueves, 19 de noviembre')).toHaveCount(1);
    await expect(dot('viernes, 20 de noviembre')).toHaveCount(1);
    for (const d of ['lunes, 16 de noviembre', 'martes, 17 de noviembre', 'miércoles, 18 de noviembre']) await expect(dot(d)).toHaveCount(0);
    await shot(page, info, '01-today');
  });

  test('hoy-02 · other days from the week strip: titles, past agenda and a deep link', async ({ page }) => {
    await openHoy(page);
    const h1 = page.getByRole('heading', { level: 1 });
    await page.getByRole('button', { name: 'martes, 17 de noviembre' }).click();
    await expect(h1).toHaveText('Martes 17');
    await expect(page).toHaveURL(/\/hoy\?dia=2026-11-17$/);
    await expect(page.getByText('martes, 17 de noviembre · 1.ª evaluación, semana 11')).toBeVisible();
    await expect(nowCard(page)).toHaveCount(0); // no «Ahora» on another day
    await expect(section(page, 'Pendiente de hoy')).toBeVisible();
    for (const t of ['08:30', '10:20', '11:45']) await expect(agendaRow(page, t)).toContainText('Lista pasada');
    await expect(agendaRow(page, '11:45')).toContainText('Examen');

    await page.getByRole('button', { name: 'miércoles, 18 de noviembre' }).click();
    await expect(h1).toHaveText('Ayer');
    await page.getByRole('button', { name: 'viernes, 20 de noviembre' }).click();
    await expect(h1).toHaveText('Mañana');
    await page.getByRole('button', { name: 'jueves, 19 de noviembre' }).click();
    await expect(h1).toHaveText('Hoy');
    await expect(page).toHaveURL(/\/hoy$/);

    await openHoy(page, '2026-11-17');
    await expect(h1).toHaveText('Martes 17');
    await expect(page.getByRole('button', { name: 'martes, 17 de noviembre' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('hoy-03 · previous and next week', async ({ page }) => {
    await openHoy(page);
    const h1 = page.getByRole('heading', { level: 1 });
    await page.getByRole('button', { name: 'Semana siguiente' }).click();
    await expect(h1).toHaveText('Lunes 23');
    await expect(page).toHaveURL(/dia=2026-11-23/);
    await expect(page.getByRole('button', { name: 'viernes, 27 de noviembre' })).toBeVisible();
    await page.getByRole('button', { name: 'Semana anterior' }).click();
    await expect(h1).toHaveText('Hoy'); // back in this week: today, not its Monday
    await page.getByRole('button', { name: 'Semana anterior' }).click();
    await expect(h1).toHaveText('Lunes 9');
    await expect(page.getByRole('button', { name: 'lunes, 9 de noviembre' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('hoy-04 · «Ir a una fecha»: month grid, holidays faded, event dots, «Hoy» to come back', async ({ page }, info) => {
    await openHoy(page);
    await page.getByRole('button', { name: 'Ir a una fecha' }).click();
    const sheet = page.getByRole('dialog', { name: 'Ir a una fecha' });
    await expect(sheet.getByText('Noviembre 2026')).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'jueves, 19 de noviembre' })).toHaveAttribute('aria-pressed', 'true');
    for (const d of ['jueves, 19 de noviembre', 'viernes, 20 de noviembre', 'viernes, 27 de noviembre']) {
      await expect(sheet.getByRole('button', { name: d }).locator('.monthgrid__dot')).toHaveCount(1); // events that day
    }
    await sheet.getByRole('button', { name: 'Mes anterior' }).click();
    await expect(sheet.getByText('Octubre 2026')).toBeVisible();
    await sheet.getByRole('button', { name: 'Mes siguiente' }).click();
    await sheet.getByRole('button', { name: 'Mes siguiente' }).click();
    await expect(sheet.getByText('Diciembre 2026')).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'lunes, 7 de diciembre' })).toHaveClass(/monthgrid__day--muted/);
    await expect(sheet.getByRole('button', { name: 'miércoles, 9 de diciembre' })).not.toHaveClass(/monthgrid__day--muted/);
    await shot(page, info, '04-month');
    await sheet.getByRole('button', { name: 'miércoles, 9 de diciembre' }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Miércoles 9');
    await expect(page).toHaveURL(/dia=2026-12-09/);

    await page.getByRole('button', { name: 'Ir a una fecha' }).click();
    await expect(sheet.getByText('Diciembre 2026')).toBeVisible(); // opens on the day being shown
    await sheet.getByRole('button', { name: 'Hoy', exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hoy');
  });

  test('hoy-05 · a weekend day: «Fin de semana» and «Ver el lunes»', async ({ page, demo }, info) => {
    const { watch_total } = await demo.get(`/today?date=${TODAY}`);
    await openHoy(page);
    await page.getByRole('button', { name: 'Ir a una fecha' }).click();
    await page.getByRole('dialog', { name: 'Ir a una fecha' }).getByRole('button', { name: 'sábado, 21 de noviembre' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sábado 21');
    await expect(page.getByText('sábado, 21 de noviembre', { exact: true })).toBeVisible();
    await expect(page.getByText('Fin de semana')).toBeVisible();
    await expect(page.getByText('No hay clases.')).toBeVisible();
    await expect(section(page, 'Agenda')).toHaveCount(0);
    await expect(section(page, 'Pendiente de hoy').getByRole('button').first()).toContainText('Lista sin pasar'); // always today's
    // No class that day: A vigilar only offers the whole list.
    await expect(section(page, 'A vigilar').getByRole('button', { name: `Ver todos (${watch_total})` })).toBeVisible();
    await expect(section(page, 'A vigilar').locator('.list')).toHaveCount(0);
    await shot(page, info, '05-weekend');
    await page.getByRole('button', { name: 'Ver el lunes 23' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lunes 23');
  });

  test('hoy-06 · a holiday: its name and «Volver a hoy»', async ({ page }) => {
    await openHoy(page, '2026-12-07');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lunes 7');
    await expect(page.getByText('lunes, 7 de diciembre · Constitución e Inmaculada')).toBeVisible();
    await expect(page.getByText('Sin clases · Constitución e Inmaculada')).toBeVisible();
    await expect(page.getByText('Día no lectivo en tu calendario escolar.')).toBeVisible();
    await page.getByRole('button', { name: 'Volver a hoy' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hoy');
    await expect(page).toHaveURL(/\/hoy$/);
  });

  test('hoy-07 · tomorrow: «Primera clase», what is planned, no list to take yet', async ({ page, demo }) => {
    const day = await demo.get('/today?date=2026-11-20');
    await openHoy(page, '2026-11-20');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mañana');
    const card = nowCard(page);
    await expect(card).toHaveAccessibleName('Primera clase · 08:30');
    await expect(card.getByRole('link', { name: '2.º ESO B · Mates' })).toBeVisible();
    await expect(card.getByText('Toca: Problemas de la p. 34')).toBeVisible();
    await expect(card.getByText('Deberes: p. 33, ej. 15-18')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Revisar' })).toHaveCount(0); // homework is checked on the day
    await expect(card.getByRole('button', { name: 'Pasar lista' })).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Cerrar clase' })).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Anotar', exact: true })).toHaveCount(0);
    await expect(agendaRow(page, '08:30')).not.toContainText('Lista');
    await expect(agendaRow(page, '17:00')).toContainText('Tutoría con la familia de Gonzalo');
    const rows = section(page, 'A vigilar').locator('.list').getByRole('button');
    await expect(rows).toHaveCount(Math.min(4, day.watchlist.length));
  });

  test('hoy-08 · a past session: its list and its closing from the agenda, nothing saved by looking', async ({ page }) => {
    const writes: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/api/') && r.method() !== 'GET') writes.push(`${r.method()} ${r.url()}`); });
    await openHoy(page, '2026-11-18');
    await agendaRow(page, '10:20').click();
    const sheet = page.getByRole('dialog', { name: 'Matemáticas · 1.º ESO A' });
    await expect(sheet.getByText('miércoles, 18 de noviembre · 10:20–11:15 · Aula 105')).toBeVisible();
    await expect(sheet.getByRole('button', { name: /^Editar lista/ })).toContainText('Lista pasada · 2 faltas · 1 retraso');
    await expect(sheet.getByRole('button', { name: /^Clase cerrada/ })).toContainText('Para la próxima: Corregir los ejercicios 12 a 15');
    await sheet.getByRole('button', { name: /^Editar lista/ }).click();
    const list = listSheet(page);
    await expect(list.getByText('miércoles, 18 de noviembre · 10:20–11:15 · Aula 105')).toBeVisible();
    await expect(list.getByText('22 presentes · 1 falta · 1 retraso · 1 justificada')).toBeVisible();
    await list.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(list).toBeHidden();
    await expect(page.locator('.toasts .toast')).toHaveCount(0);
    expect(writes).toEqual([]);
  });

  test('hoy-09 · homework checked on a past day: its tally opens the check', async ({ page }) => {
    await openHoy(page, '2026-11-17');
    await agendaRow(page, '11:45').click();
    const sheet = page.getByRole('dialog', { name: 'Matemáticas · 2.º ESO B' });
    await expect(sheet.getByText('Deberes: p. 32, ej. 11-14')).toBeVisible();
    await sheet.getByRole('button', { name: '3 sin hacer · 1 incompleto' }).click();
    const check = homeworkSheet(page);
    await expect(check.getByText('p. 32, ej. 11-14')).toBeVisible();
    await expect(check.getByText(/hechos · 3 sin hacer · 1 incompleto/)).toBeVisible();
    await expect(check.getByRole('button', { name: /: Faltó$/ })).toHaveCount(2); // the two absent that day do not count
    await check.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(check).toBeHidden();
  });

  test('hoy-10 · a session’s activity chip opens the activity', async ({ page }) => {
    await openHoy(page, '2026-11-17');
    await agendaRow(page, '11:45').click();
    await page.getByRole('dialog', { name: 'Matemáticas · 2.º ESO B' }).getByRole('button', { name: 'Examen U2 · Fracciones' }).click();
    await expect(page).toHaveURL(/\/clases\/[^/]+\/actividades\/[^/]+$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Examen U2 · Fracciones' })).toBeVisible();
  });

  test('hoy-11 · the class name in «Ahora» opens the class, and back returns to Hoy', async ({ page }) => {
    await openHoy(page);
    await nowCard(page).getByRole('link', { name: '2.º ESO B · Mates' }).click();
    await expect(page).toHaveURL(/\/clases\/[^/]+$/);
    await expect(page.getByRole('heading', { level: 1, name: '2.º ESO B' })).toBeVisible();
    await page.getByRole('button', { name: 'Hoy', exact: true }).click();
    await expect(page).toHaveURL(/\/hoy$/);
  });

  test('hoy-12 · a material chip opens the material (from «Ahora» and from the session)', async ({ page }) => {
    await openHoy(page);
    await nowCard(page).getByRole('button', { name: 'Apuntes', exact: true }).click();
    await expect(page).toHaveURL(/\/unidades\/[^/]+\/materiales\/[^/?]+$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Apuntes' })).toBeVisible();
    await page.goBack();
    await agendaRow(page, '10:20').click();
    await page.getByRole('dialog', { name: 'Matemáticas · 2.º ESO B' }).getByRole('button', { name: 'Ficha de refuerzo', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Ficha de refuerzo' })).toBeVisible();
  });

  test('hoy-68 · back from an activity or a material opened in Hoy says «Hoy» and returns there', async ({ page }) => {
    await openHoy(page);
    await section(page, 'Pendiente').getByRole('button', { name: /Examen U2 · Fracciones/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Examen U2 · Fracciones' })).toBeVisible();
    await page.getByRole('button', { name: 'Hoy', exact: true }).click({ timeout: 3000 });
    await expect(page).toHaveURL(/\/hoy$/);
    await nowCard(page).getByRole('button', { name: 'Apuntes', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Apuntes' })).toBeVisible();
    await page.getByRole('button', { name: 'Hoy', exact: true }).click({ timeout: 3000 });
    await expect(page).toHaveURL(/\/hoy$/);
  });

  test('hoy-13 · the presentation chip opens straight in projection mode', async ({ page }) => {
    await openHoy(page);
    await nowCard(page).getByRole('button', { name: 'Presentación', exact: true }).click();
    await expect(page).toHaveURL(/\/materiales\/[^/]+\?presentar=1$/);
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 }); // full-screen presentation
  });

  test('hoy-14 · Pendiente opens what it names: the review, the gradebook, the list', async ({ page, demo }) => {
    const writes: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/api/') && r.method() !== 'GET') writes.push(`${r.method()} ${r.url()}`); });
    const day = await demo.get(`/today?date=${TODAY}`);
    const review = day.pending.find((p: { kind: string }) => p.kind === 'review');
    const grades = day.pending.find((p: { kind: string }) => p.kind === 'grades');
    await openHoy(page);
    const pending = section(page, 'Pendiente');

    await pending.getByRole('button', { name: new RegExp(review.title) }).click();
    await expect(page).toHaveURL(new RegExp(`/clases/${review.course_id}/actividades/${review.activity_id}$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Examen U2 · Fracciones' })).toBeVisible();
    await page.goBack();

    await pending.getByRole('button', { name: new RegExp(grades.title) }).click();
    await expect(page).toHaveURL(new RegExp(`/clases/${grades.course_id}/cuaderno$`));
    await expect(page.getByRole('heading', { level: 1, name: '1.º ESO A' })).toBeVisible();
    await page.goBack();

    await pending.getByRole('button', { name: /Lista sin pasar · 1\.º ESO A/ }).click();
    const list = listSheet(page);
    await expect(list.getByText('09:25–10:20 · Aula 105')).toBeVisible();
    await expect(list.getByText(/^\d+ presentes$/)).toBeVisible();
    await list.getByRole('button', { name: 'Cerrar', exact: true }).click(); // looked at, not taken
    await expect(list).toBeHidden();
    await expect(pending.getByRole('button', { name: /Lista sin pasar · 1\.º ESO A/ })).toBeVisible();
    expect(writes).toEqual([]);
  });

  test('hoy-15 · a list still due today and one of last Thursday: taken from Pendiente, they leave it', async ({ page, demo }, info) => {
    const fyq = await demoCourse(demo, 'Física y Química · 3.º ESO A');
    const slot = await extraSlot(demo, fyq);
    try {
      await openHoy(page);
      const pending = section(page, 'Pendiente').getByRole('button');
      const todays = pending.filter({ hasText: 'Lista sin pasar · 3.º ESO A' }).filter({ hasText: `hoy, ${slot.start}` });
      const older = pending.filter({ hasText: 'Lista sin pasar · 3.º ESO A' }).filter({ hasText: `jueves 12, ${slot.start}` });
      await expect(todays).toBeVisible();
      await expect(older).toBeVisible();
      // Today's lists come first; lists of other days after the exams to review or grade.
      const titles = await pending.allInnerTexts();
      const at = (re: RegExp) => titles.findIndex((t) => re.test(t));
      expect(at(/hoy, /)).toBe(0);
      expect(at(/jueves 12/)).toBeGreaterThan(at(/por revisar|sin nota/));
      await expect(agendaRow(page, slot.start)).toContainText('Lista sin pasar');
      await shot(page, info, '15-pending-lists');

      await todays.click();
      const list = listSheet(page);
      await expect(list.getByText(`${slot.start}–${slot.end} · Lab. 1`)).toBeVisible();
      await list.getByRole('button', { name: 'Cerrar lista' }).click();
      await expect(page.getByText(/^Lista pasada · \d+ presentes$/)).toBeVisible();
      await expect(todays).toHaveCount(0);
      await expect(agendaRow(page, slot.start)).toContainText('Lista pasada');

      await older.click();
      await expect(list.getByText(`jueves, 12 de noviembre · ${slot.start}–${slot.end} · Lab. 1`)).toBeVisible();
      await list.getByRole('button', { name: 'Cerrar lista' }).click();
      await expect(older).toHaveCount(0);
      const saved = await demo.get(`/courses/${fyq.id}/attendance?date=2026-11-12&start=${slot.start}`);
      expect(saved.taken).toBe(true);
    } finally {
      await slot.restore();
    }
  });

  test('hoy-58 · a demo list still due, cancelled, leaves Pendiente; restored, it comes back', async ({ page, demo }) => {
    const c = await demoCourse(demo, 'Matemáticas · 1.º ESO A');
    try {
      await openHoy(page);
      const pending = section(page, 'Pendiente').getByRole('button', { name: /Lista sin pasar · 1\.º ESO A/ });
      await expect(pending).toBeVisible();
      await agendaRow(page, '09:25').click();
      await page.getByRole('dialog', { name: 'Matemáticas · 1.º ESO A' }).getByRole('button', { name: 'No hay clase' }).click();
      await page.getByRole('dialog', { name: 'No hay clase' }).getByRole('textbox', { name: 'Motivo' }).fill('Huelga');
      await page.getByRole('dialog', { name: 'No hay clase' }).getByRole('button', { name: 'No hay clase' }).click();
      await expect(agendaRow(page, '09:25')).toContainText('Sin clase · Huelga');
      await expect(pending).toHaveCount(0);
      await agendaRow(page, '09:25').click();
      await page.getByRole('dialog', { name: 'Matemáticas · 1.º ESO A' }).getByRole('button', { name: 'Restaurar sesión' }).click();
      await expect(pending).toBeVisible();
    } finally {
      await demo.del(`/courses/${c.id}/sessions/cancel?date=${TODAY}&start=09:25`);
    }
  });

  test('hoy-78 · demo: a unit material goes with the task to the substitute', async ({ page, demo }) => {
    const maths = await demoCourse(demo, 'Matemáticas · 2.º ESO B');
    const FRIDAY = '2026-11-20'; // 2.º ESO B's first class, in «Fracciones» (a class already on cannot be left)
    try {
      await openHoy(page);
      await hoyMenu(page, 'Voy a faltar');
      const sheet = page.getByRole('dialog', { name: 'Voy a faltar' });
      await sheet.getByLabel('Desde').fill(FRIDAY);
      await expect(sheet.getByLabel('Hasta')).toHaveValue(FRIDAY);
      const mine = sheet.getByRole('switch', { name: 'Incluir Matemáticas · 2.º ESO B 08:30' });
      await expect(mine).toBeChecked();
      for (const other of await sheet.getByRole('switch').all()) {
        if (await other.getAttribute('aria-label') !== 'Incluir Matemáticas · 2.º ESO B 08:30' && await other.isChecked()) await other.click();
      }
      // Only what prints behind the sheet (a PDF) is offered: never the unit's link.
      await expect(sheet.getByText('Se imprime detrás · «Fracciones»')).toBeVisible();
      await expect(sheet.getByRole('button', { name: 'Khan Academy · Operaciones con fracciones' })).toHaveCount(0);
      const chip = sheet.getByRole('button', { name: 'Apuntes · Fracciones' });
      await chip.click();
      await expect(chip).toHaveAttribute('aria-pressed', 'true');
      await sheet.getByRole('button', { name: 'Crear hoja de guardia (1)' }).click();
      await expect(sheet.getByRole('link', { name: 'Descargar PDF' })).toBeVisible();
      const pdf = await page.request.get((await sheet.getByRole('link', { name: 'Descargar PDF' }).getAttribute('href'))!);
      expect(pdf.ok()).toBe(true);
    } finally {
      await demo.del(`/courses/${maths.id}/sessions/cancel?date=${FRIDAY}&start=08:30`);
    }
  });

  test('hoy-67 · demo: «Ver todos» lists the same students as the server, most serious first', async ({ page, demo }) => {
    const all: { student: { name: string } }[] = await demo.get('/watch');
    await openHoy(page);
    await section(page, 'A vigilar').getByRole('button', { name: `Ver todos (${all.length})` }).click();
    const sheet = page.getByRole('dialog', { name: 'A vigilar' });
    await expect(sheet.locator('.list').getByRole('button')).toHaveCount(all.length);
    for (const [i, w] of all.entries()) await expect(sheet.locator('.list').getByRole('button').nth(i)).toContainText(w.student.name);
  });

  test('hoy-16 · «Ajustes» from the header menu, back to Hoy', async ({ page }) => {
    await openHoy(page);
    await hoyMenu(page, 'Ajustes');
    await expect(page).toHaveURL(/\/ajustes$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Ajustes' })).toBeVisible();
    await page.getByRole('button', { name: 'Hoy', exact: true }).click();
    await expect(page).toHaveURL(/\/hoy$/);
  });

  test('hoy-17 · the day fails to load: the error and «Reintentar»', async ({ page }) => {
    await page.route('**/api/today?*', (route) => route.fulfill({ status: 503, contentType: 'application/json',
      body: JSON.stringify({ detail: { message: 'Servidor no disponible' } }) }));
    await page.goto('/hoy');
    await expect(page.getByText('No se ha podido cargar el día')).toBeVisible({ timeout: 15_000 }); // after the client's retries
    await page.unroute('**/api/today?*');
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(nowCard(page)).toBeVisible();
  });

  test('hoy-18 · layout: two columns on a computer, one on a phone with the tab capsule', async ({ page }, info) => {
    await openHoy(page);
    const card = await nowCard(page).boundingBox();
    const pending = await section(page, 'Pendiente').boundingBox();
    if (isMobile(info)) {
      expect(pending!.y).toBeGreaterThan(card!.y + card!.height); // below
      await expect(page.getByRole('navigation', { name: 'Navegación' }).getByRole('link', { name: 'Hoy' })).toBeVisible();
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width).toBeLessThanOrEqual(390);
    } else {
      expect(pending!.x).toBeGreaterThan(card!.x + card!.width); // beside
      expect(Math.abs(pending!.y - card!.y)).toBeLessThan(40);
      await expect(page.getByRole('complementary', { name: 'Navegación' }).getByRole('link', { name: 'Hoy' })).toBeVisible();
    }
  });

  test('hoy-28 · «Hoy» in the tab capsule or the sidebar brings back today from anywhere', async ({ page }, info) => {
    await openHoy(page, '2026-11-17');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Martes 17');
    const nav = isMobile(info) ? page.getByRole('navigation', { name: 'Navegación' }) : page.getByRole('complementary', { name: 'Navegación' });
    await nav.getByRole('link', { name: 'Clases' }).click();
    await expect(page).toHaveURL(/\/clases$/);
    await nav.getByRole('link', { name: 'Hoy' }).click();
    await expect(page).toHaveURL(/\/hoy$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hoy');
    await expect(nowCard(page)).toHaveAccessibleName('Ahora · quedan 35 min');
  });

  test('hoy-19 · the first paint is the server’s day, never the device’s', async ({ page }) => {
    // Before /api/me answers, Hoy asks for (and shows) the device's date — in the demo, «viernes, 25 de septiembre»
    // flashes before «jueves, 19 de noviembre»: useToday() (src/lib/auth.tsx) falls back to the device date.
    bug('BUG-HOY-02', 'Hoy loads the device day before the server day');
    const days: string[] = [];
    page.on('request', (r) => { const m = r.url().match(/\/api\/today\?date=([\d-]+)/); if (m) days.push(m[1]); });
    await page.route('**/api/me', async (route) => { await new Promise((r) => setTimeout(r, 800)); await route.continue(); });
    await page.goto('/hoy');
    await expect(page.getByText('jueves, 19 de noviembre · 1.ª evaluación, semana 11')).toBeVisible();
    expect(days).toEqual([TODAY]);
  });
});

// ── The card at each moment of the day: real sessions of a teacher of its own, around the frozen 10:40 ──────────
const at = (slots: [string, string][]) => ({ courses: [{ ...CLASS, slots: slots.map(([start, end]) => ({ weekday: THU, start, end })), logs: [] }] });
const MOMENTS: { name: string; slots: [string, string][]; eyebrow: string; close: boolean }[] = [
  { name: 'in class', slots: [['10:20', '11:15'], ['12:40', '13:35']], eyebrow: 'Ahora · quedan 35 min', close: true },
  { name: 'in a long class', slots: [['10:00', '11:50']], eyebrow: 'Ahora · quedan 1 h 10 min', close: true },
  { name: 'before the first class', slots: [['11:00', '11:55'], ['12:40', '13:35']], eyebrow: 'Primera clase · 11:00', close: false },
  { name: 'just after a class, another later', slots: [['09:35', '10:30'], ['12:00', '12:55']], eyebrow: 'Acaba de terminar', close: true },
  { name: 'in a free period', slots: [['08:30', '09:25'], ['12:00', '12:55']], eyebrow: 'Siguiente · 12:00', close: false },
  { name: 'after the last class', slots: [['08:30', '09:25'], ['09:25', '10:20']], eyebrow: 'Última clase · terminó a las 10:20', close: true },
];
for (const m of MOMENTS) {
  test.describe(() => {
    test.use({ worldSpec: at(m.slots) });
    test(`hoy-20 · the card ${m.name}: «${m.eyebrow}»`, async ({ page }, info) => {
      await openHoy(page);
      const card = nowCard(page);
      await expect(card).toHaveAccessibleName(m.eyebrow);
      await expect(card.getByRole('link', { name: SHORT })).toBeVisible();
      await expect(card.getByRole('button', { name: 'Pasar lista' })).toBeVisible();
      await expect(card.getByRole('button', { name: 'Cerrar clase' })).toHaveCount(m.close ? 1 : 0);
      await shot(page, info, `20-${m.name.replace(/\W+/g, '-')}`);
    });
  });
}

const LINK = 'https://www.youtube.com/watch?v=fracciones-e2e';
test.describe(() => {
  test.use({ worldSpec: { courses: [{ ...CLASS, links: [{ url: LINK, title: 'Vídeo · Fracciones equivalentes' }],
    files: [{ name: 'problemas-p34.txt', text: 'Problemas de la página 34: 1, 2, 5 y 7.' }] }] } });
  test('hoy-27 · a link chip opens its web page, a file chip opens the file, both in a new tab', async ({ page, context }) => {
    await context.route(`${LINK}*`, (route) => route.fulfill({ contentType: 'text/html', body: '<title>Vídeo</title>' }));
    await openHoy(page);
    const mats = nowCard(page).getByLabel('Materiales de la unidad').getByRole('button');
    await expect(mats).toHaveText([/problemas-p34/, /^Vídeo/]);

    const video = context.waitForEvent('page');
    await mats.filter({ hasText: /^Vídeo/ }).click();
    await expect.poll(async () => (await video).url()).toBe(LINK);
    await (await video).close();

    // The file opens in a new tab with its signed address (Chromium may download it rather than show it).
    const served = context.waitForEvent('response', (r) => r.url().includes('/api/files/'));
    const file = context.waitForEvent('page');
    await mats.filter({ hasText: 'problemas-p34' }).click();
    const response = await served;
    expect(response.status()).toBe(200);
    expect(await (await page.request.get(response.url())).text()).toBe('Problemas de la página 34: 1, 2, 5 y 7.');
    await (await file).close();
    await expect(page).toHaveURL(/\/hoy$/); // Hoy stays where it was
  });
});

test.describe(() => {
  test.use({ worldSpec: { courses: [{ ...CLASS, links: [{ url: LINK, title: 'Vídeo · Fracciones equivalentes' }] }] } });
  test('hoy-80 · a material chip keeps its own title: only the unit\'s name at its end is left out', async ({ page }) => {
    bug('BUG-HOY-08', 'shortTitle() removes « · <unit>» anywhere in the title: «Vídeo · Fracciones equivalentes» reads «Vídeo equivalentes»');
    await openHoy(page);
    await expect(nowCard(page).getByLabel('Materiales de la unidad').getByRole('button')).toHaveText(['Vídeo · Fracciones equivalentes']);
  });
});

test.describe(() => {
  test.use({ worldSpec: { courses: [] } });
  test('hoy-21 · a teacher without classes: «Aún no tienes clases» and «Crear clase»', async ({ page }, info) => {
    await openHoy(page);
    await expect(page.getByText('Aún no tienes clases')).toBeVisible();
    await expect(page.getByText('Crea tu primera clase con su horario y aparecerá aquí.')).toBeVisible();
    // Nothing else to say yet: no Pendiente, A vigilar or agenda.
    for (const title of ['Pendiente', 'A vigilar', 'Agenda']) await expect(section(page, title)).toHaveCount(0);
    await shot(page, info, '21-no-classes');
    await page.getByRole('button', { name: 'Crear clase' }).click();
    await expect(page).toHaveURL(/\/clases$/);
  });
});

test.describe(() => {
  test.use({ worldSpec: { courses: [{ ...CLASS, slots: [{ weekday: MON, start: '08:30', end: '09:25' }], logs: [] }] } });
  test('hoy-22 · a school day without classes of mine: «Sin clases este día», «Volver a hoy» from another day', async ({ page }) => {
    await openHoy(page);
    await expect(page.getByText('Sin clases este día')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Volver a hoy' })).toHaveCount(0);
    await expect(section(page, 'A vigilar')).toHaveCount(0); // nobody to watch, no class that day: nothing to say
    await page.getByRole('button', { name: 'viernes, 20 de noviembre' }).click();
    await expect(page.getByText('Sin clases este día')).toBeVisible();
    await page.getByRole('button', { name: 'Volver a hoy' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hoy');
    await page.getByRole('button', { name: 'lunes, 16 de noviembre' }).click();
    await expect(agendaRow(page, '08:30')).toContainText(SHORT);
  });
});

test.describe(() => {
  test.use({ worldSpec: { courses: [CLASS] } });
  test('hoy-23 · nothing pending: «Todo al día»; the week dot only for events or lists due', async ({ page }) => {
    await openHoy(page);
    await expect(section(page, 'Pendiente').getByText('Todo al día')).toBeVisible();
    await expect(section(page, 'A vigilar').getByText('Nadie a vigilar')).toBeVisible();
    await expect(section(page, 'A vigilar').getByText('Nada reciente en tus clases.')).toBeVisible();
    // A class created today has no lists due from before it existed: nothing in Pendiente, no dot.
    await expect(page.getByRole('button', { name: 'jueves, 19 de noviembre' }).locator('.weekstrip__dot--on')).toHaveCount(0);
  });

  test('hoy-26 · the agenda follows Pendiente’s rule: no «Lista sin pasar» for a session over before the class existed', async ({ page, world }) => {
    // The 08:30 class ended before the teacher created the class at 10:40: its list is not owed.
    const day = await world.api.get(`/today?date=${TODAY}`);
    expect(day.sessions[0].pending).toBe(false);
    await openHoy(page);
    await expect(agendaRow(page, '10:20')).toContainText(SHORT);
    await expect(agendaRow(page, '08:30')).not.toContainText('Lista sin pasar', { timeout: 2000 });
  });
});

// A class that cannot be used yet is never «Todo al día»: Pendiente ends in one line with the verb of its next step.
test.describe(() => {
  test.use({ worldSpec: { courses: [{ ...CLASS, slots: [], logs: [] }] } });
  test('hoy-81 · a class without a timetable: «Añadir horario» instead of «Todo al día», and it opens the class settings', async ({ page, world }) => {
    await openHoy(page);
    const pending = section(page, 'Pendiente');
    await expect(pending.getByText('Todo al día')).toHaveCount(0);
    const step = pending.getByRole('button', { name: /^Añadir horario/ });
    await expect(step).toContainText(`${SHORT} aún no tiene horario: no sale en Hoy ni se pasa lista.`);
    await step.click();
    await expect(page).toHaveURL(new RegExp(`/clases/${world.courses[0].id}/cuaderno\\?ajustes=1$`));
    await expect(page.getByRole('dialog', { name: 'Ajustes de la clase' })).toBeVisible();
  });
});

test.describe(() => {
  test.use({ worldSpec: { courses: [{ ...CLASS, students: [], logs: [] }] } });
  test('hoy-82 · a class without students: «Añadir alumnos» instead of «Todo al día», and it opens «Añadir alumnos»', async ({ page, world }) => {
    await openHoy(page);
    const pending = section(page, 'Pendiente');
    await expect(pending.getByText('Todo al día')).toHaveCount(0);
    const step = pending.getByRole('button', { name: /^Añadir alumnos/ });
    await expect(step).toContainText(`${SHORT} aún no tiene alumnos: no hay lista ni notas.`);
    await step.click();
    await expect(page).toHaveURL(new RegExp(`/clases/${world.courses[0].id}/alumnos\\?anadir=1$`));
    await expect(page.getByRole('dialog', { name: 'Añadir alumnos' })).toBeVisible();
  });
});

const pastExams = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-16']
  .map((date, i) => ({ title: `Control ${i + 1}`, date }));
test.describe(() => {
  test.use({ worldSpec: { courses: [{ ...CLASS, pastExams }] } });
  test('hoy-24 · a long Pendiente: «Ver todo (6)» and «Ver menos»; «sin nota» opens the gradebook', async ({ page, world }) => {
    await openHoy(page);
    const pending = section(page, 'Pendiente');
    const rows = pending.locator('.list').getByRole('button');
    await expect(rows).toHaveCount(5);
    await expect(rows.first()).toContainText('Control 1 · 2.º ESO C');
    await expect(rows.first()).toContainText('12 sin nota · examen del 9 nov'); // oldest first
    await pending.getByRole('button', { name: 'Ver todo (6)' }).click();
    await expect(rows).toHaveCount(6);
    await pending.getByRole('button', { name: 'Ver menos' }).click();
    await expect(rows).toHaveCount(5);
    await rows.first().click();
    await expect(page).toHaveURL(new RegExp(`/clases/${world.courses[0].id}/cuaderno$`));
  });
});

test.describe(() => {
  test.use({ worldSpec: { courses: [CLASS, { ...CLASS, subject: 'Física y Química', group: '3º ESO C', slots: [{ weekday: FRI, start: '12:40', end: '13:35' }], logs: [], units: [] }] } });
  test('hoy-25 · report comments due before the evaluation session: one row, to the class or to Evaluar', async ({ page, world }) => {
    const [maths] = world.courses;
    const one = await world.api.post('/events', { title: 'Sesión de evaluación', kind: 'evaluation', date: '2026-11-26', course_id: maths.id });
    await openHoy(page);
    const pending = section(page, 'Pendiente');
    const row = pending.getByRole('button', { name: /Comentarios de evaluación/ });
    await expect(row).toContainText('faltan 12 · 2.º ESO C · 26 nov');
    await row.click();
    await expect(page).toHaveURL(new RegExp(`/clases/${maths.id}/evaluacion/1$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Primera evaluación' })).toBeVisible();

    await world.api.patch(`/events/${one.id}`, { course_id: null });
    await openHoy(page);
    await expect(row).toContainText('faltan 24 en 2 clases · 26 nov');
    await row.click();
    await expect(page).toHaveURL(/\/evaluar$/);
  });
});
