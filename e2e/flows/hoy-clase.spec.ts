import {
  agendaRow, bug, CLASS, expect, LABEL, nowCard, openHoy, rosterRow, shot, tapTo, test, toast,
  TODAY, type World,
} from './hoy-helpers';

// One class from Hoy (docs/PRODUCT.md §4.2): «Revisar deberes» a toques (and the «Deberes (1.ª)» column it feeds),
// «Cerrar clase» (what the next session shows), «Anotar», the session sheet from the agenda and «No hay clase».
// Each test is a teacher of its own (a demo list cancelled and restored: hoy-58 in hoy.spec.ts).

/** The «Deberes (1.ª)» grades of the class, by «Apellidos, Nombre» (null = no grade). */
async function homeworkGrades(world: World): Promise<Record<string, number | null>> {
  const c = world.courses[0];
  const book = await world.api.get(`/courses/${c.id}/gradebook?term=1`);
  const act = book.activities.find((a: { kind: string }) => a.kind === 'homework');
  if (!act) return {};
  return Object.fromEntries(book.students.map((s: { student: { sort_name: string }; grades: Record<string, { score: number | null; status: string }> }) => {
    const g = s.grades[act.id];
    return [s.student.sort_name, g && g.status === 'confirmed' ? g.score : null];
  }));
}

test.describe('hoy · revisar deberes', () => {
  test.use({ worldSpec: { courses: [CLASS] } });

  test('hoy-40 · check homework by taps; the tally shows on the card and in the gradebook', async ({ page, world }, info) => {
    await openHoy(page);
    const card = nowCard(page);
    await expect(card.getByText('Deberes: p. 33, ej. 15-18')).toBeVisible();
    await card.getByRole('button', { name: 'Revisar' }).click();
    const sheet = page.getByRole('dialog', { name: `Deberes · ${LABEL}` });
    await expect(sheet.getByText('p. 33, ej. 15-18', { exact: true })).toBeVisible();
    await expect(sheet.getByText('12 hechos · 0 sin hacer')).toBeVisible();
    await expect(sheet.getByText('Toca a quien no los haya hecho. Otro toque: incompleto.')).toBeVisible();
    await expect(rosterRow(sheet, 1)).toHaveAccessibleName('1. Alonso Gil, Marta: Hecho. Toca para cambiar');
    await tapTo(sheet, 1, 'Sin hacer');
    await tapTo(sheet, 2, 'Incompleto');
    await tapTo(sheet, 3, 'Sin hacer');
    await tapTo(sheet, 3, 'Hecho'); // round again: undone
    await expect(sheet.getByText('10 hechos · 1 sin hacer · 1 incompleto')).toBeVisible();
    await expect(sheet.getByText('Sin hacer: Alonso Gil, Marta · Incompleto: Benítez Ruiz, Pablo')).toBeVisible();
    await shot(page, info, '40-homework');
    await sheet.getByRole('button', { name: 'Terminar revisión' }).click();
    await expect(toast(page, 'Deberes revisados · 10 hechos · 1 sin hacer · 1 incompleto')).toBeVisible();
    await expect(sheet).toBeHidden();

    // Counts at once in the gradebook: 10 × (done + 0,5 · partial) / checks.
    expect(await homeworkGrades(world)).toMatchObject({ 'Alonso Gil, Marta': 0, 'Benítez Ruiz, Pablo': 5, 'Castro León, Lucía': 10 });
    const tally = card.getByRole('button', { name: '1 sin hacer · 1 incompleto' });
    await expect(tally).toBeVisible();

    await tally.click();
    await expect(rosterRow(sheet, 1)).toHaveAccessibleName(/: Sin hacer\./);
    await expect(rosterRow(sheet, 2)).toHaveAccessibleName(/: Incompleto\./);
    await tapTo(sheet, 1, 'Hecho');
    await tapTo(sheet, 2, 'Hecho');
    await sheet.getByRole('button', { name: 'Terminar revisión' }).click();
    await expect(toast(page, 'Deberes revisados · 12 hechos · 0 sin hacer')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Todos hechos' })).toBeVisible();
    expect(await homeworkGrades(world)).toMatchObject({ 'Alonso Gil, Marta': 10, 'Benítez Ruiz, Pablo': 10 });
  });

  test('hoy-41 · who missed the class does not count, also when the list is taken after the check', async ({ page, world }) => {
    const [c] = world.courses;
    await world.api.put(`/courses/${c.id}/attendance`, { date: TODAY, start: '10:20', marks: [{ student_id: c.students[4].id, status: 'absent' }] });
    await openHoy(page);
    await nowCard(page).getByRole('button', { name: 'Revisar' }).click();
    const sheet = page.getByRole('dialog', { name: `Deberes · ${LABEL}` });
    await expect(rosterRow(sheet, 5)).toHaveAccessibleName('5. Esteban Mora, Irene: Faltó');
    await expect(rosterRow(sheet, 5)).toBeDisabled();
    await expect(sheet.getByText('11 hechos · 0 sin hacer')).toBeVisible();
    await tapTo(sheet, 6, 'Sin hacer');
    await sheet.getByRole('button', { name: 'Terminar revisión' }).click();
    await expect(toast(page, 'Deberes revisados · 10 hechos · 1 sin hacer')).toBeVisible();
    expect(await homeworkGrades(world)).toMatchObject({ 'Esteban Mora, Irene': null, 'Fuentes Vera, Adrián': 0 });

    // Adrián turns out to have been absent: the list says so and his homework mark stops counting.
    await nowCard(page).getByRole('button', { name: /Editar lista$/ }).click();
    const list = page.getByRole('dialog', { name: LABEL });
    await tapTo(list, 6, 'Falta');
    await list.getByRole('button', { name: 'Cerrar lista' }).click();
    await expect(toast(page, /^Lista pasada/)).toBeVisible();
    await expect.poll(async () => (await homeworkGrades(world))['Fuentes Vera, Adrián']).toBeNull();
    await nowCard(page).getByRole('button', { name: /sin hacer|Todos hechos/ }).click();
    await expect(rosterRow(sheet, 6)).toHaveAccessibleName('6. Fuentes Vera, Adrián: Faltó');
    await expect(sheet.getByText('10 hechos · 0 sin hacer')).toBeVisible();
  });

  test('hoy-59 · the tally on the card leaves out who missed the class too', async ({ page, world }) => {
    // The server's HomeworkState (app/api/today.py › homework_state) counts every stored mark, also those of students the
    // list marks absent, so the card says «1 sin hacer» while the check itself says «0 sin hacer» and the gradebook
    // ignores it («Quien faltó ese día no cuenta», docs/PRODUCT.md §4.2).
    bug('BUG-HOY-05', 'the homework tally counts absent students');
    const [c] = world.courses;
    const adrian = c.students[5];
    await world.api.put(`/courses/${c.id}/homework`, { date: TODAY, start: '10:20', marks: [{ student_id: adrian.id, status: 'not_done' }] });
    await world.api.put(`/courses/${c.id}/attendance`, { date: TODAY, start: '10:20', marks: [{ student_id: adrian.id, status: 'absent' }] });
    await openHoy(page);
    await nowCard(page).getByRole('button', { name: /sin hacer|Todos hechos/ }).click();
    await expect(page.getByRole('dialog', { name: `Deberes · ${LABEL}` }).getByText('11 hechos · 0 sin hacer')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(nowCard(page).getByRole('button', { name: 'Todos hechos' })).toBeVisible({ timeout: 2000 });
  });

  test('hoy-42 · a homework save that fails keeps the sheet open', async ({ page, world }) => {
    await openHoy(page);
    await nowCard(page).getByRole('button', { name: 'Revisar' }).click();
    const sheet = page.getByRole('dialog', { name: `Deberes · ${LABEL}` });
    await page.route('**/api/courses/*/homework', (route) => (route.request().method() === 'PUT'
      ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: { message: 'Servidor no disponible' } }) })
      : route.fallback()));
    await tapTo(sheet, 1, 'Sin hacer');
    await expect(sheet.getByText('No se ha podido guardar', { exact: true })).toBeVisible();
    await sheet.getByRole('button', { name: 'Terminar revisión' }).click();
    await expect(toast(page, 'No se ha podido guardar la revisión. Revisa la conexión y vuelve a intentarlo.')).toBeVisible();
    await expect(sheet).toBeVisible();
    await page.unroute('**/api/courses/*/homework');
    await sheet.getByRole('button', { name: 'Terminar revisión' }).click();
    await expect(toast(page, 'Deberes revisados · 11 hechos · 1 sin hacer')).toBeVisible();
    expect((await homeworkGrades(world))['Alonso Gil, Marta']).toBe(0);
  });
});

test.describe('hoy · cerrar clase', () => {
  test.use({ worldSpec: { courses: [CLASS] } });

  test('hoy-43 · close the class: «Hecho hoy» comes from what was planned; the next class shows «Toca»', async ({ page, world }, info) => {
    const [c] = world.courses;
    await openHoy(page);
    await nowCard(page).getByRole('button', { name: 'Cerrar clase' }).click();
    const sheet = page.getByRole('dialog', { name: `Cerrar clase · ${LABEL}` });
    await expect(sheet.getByText('10:20–11:15', { exact: true })).toBeVisible();
    await expect(sheet.getByRole('textbox', { name: 'Hecho hoy' })).toHaveValue('Problemas de la p. 34');
    await expect(sheet.getByRole('textbox', { name: 'Para la próxima' })).toHaveValue('');
    await expect(sheet.getByText('Unidad terminada: Fracciones')).toBeVisible();
    await expect(sheet.getByText('Empezar la siguiente: Proporcionalidad')).toBeVisible();
    await expect(sheet.getByRole('switch', { name: 'Unidad terminada' })).toHaveAttribute('aria-checked', 'false');
    await sheet.getByRole('textbox', { name: 'Para la próxima' }).fill('Corregir los problemas de la p. 34');
    await sheet.getByRole('textbox', { name: 'Deberes' }).fill('p. 35, ej. 1-4');
    await shot(page, info, '43-close');
    await sheet.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Clase cerrada')).toBeVisible();
    await expect(sheet).toBeHidden();
    await expect(nowCard(page).getByRole('button', { name: 'Clase cerrada' })).toBeVisible();
    const log = await world.api.get(`/courses/${c.id}/sessions/log?date=${TODAY}&start=10:20`);
    expect(log).toMatchObject({ saved: true, done: 'Problemas de la p. 34', next: 'Corregir los problemas de la p. 34', homework: 'p. 35, ej. 1-4' });

    await page.getByRole('button', { name: 'viernes, 20 de noviembre' }).click();
    const next = nowCard(page);
    await expect(next).toHaveAccessibleName('Primera clase · 09:25');
    await expect(next.getByText('Toca: Corregir los problemas de la p. 34')).toBeVisible();
    await expect(next.getByText('Deberes: p. 35, ej. 1-4')).toBeVisible();
    await expect(next.getByText('Ayer: Problemas de la p. 34')).toBeVisible();
  });

  test('hoy-44 · edit a closing, then delete it (with confirmation)', async ({ page, world }) => {
    const [c] = world.courses;
    await world.api.put(`/courses/${c.id}/sessions/log`, { date: TODAY, start: '10:20', done: 'Problemas 1 a 5', next: 'Problemas 6 a 10', homework: 'p. 36' });
    await openHoy(page);
    await nowCard(page).getByRole('button', { name: 'Clase cerrada' }).click();
    const sheet = page.getByRole('dialog', { name: `Cerrar clase · ${LABEL}` });
    await expect(sheet.getByRole('textbox', { name: 'Hecho hoy' })).toHaveValue('Problemas 1 a 5');
    await expect(sheet.getByRole('textbox', { name: 'Para la próxima' })).toHaveValue('Problemas 6 a 10');
    await expect(sheet.getByRole('textbox', { name: 'Deberes' })).toHaveValue('p. 36');
    await sheet.getByRole('textbox', { name: 'Para la próxima' }).fill('Problemas 6 a 12');
    await sheet.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Cierre de clase actualizado')).toBeVisible();
    expect((await world.api.get(`/courses/${c.id}/sessions/log?date=${TODAY}&start=10:20`)).next).toBe('Problemas 6 a 12');

    await nowCard(page).getByRole('button', { name: 'Clase cerrada' }).click();
    for (const name of ['Hecho hoy', 'Para la próxima', 'Deberes']) await sheet.getByRole('textbox', { name }).fill('');
    const del = sheet.getByRole('button', { name: 'Borrar el cierre' });
    await del.click();
    const ask = page.getByRole('dialog', { name: 'Borrar el cierre de clase' });
    await expect(ask.getByText('La próxima clase ya no mostrará qué toca ni los deberes.')).toBeVisible();
    await ask.getByRole('button', { name: 'Cancelar' }).click();
    await expect(sheet).toBeVisible();
    expect((await world.api.get(`/courses/${c.id}/sessions/log?date=${TODAY}&start=10:20`)).saved).toBe(true);
    await del.click();
    await ask.getByRole('button', { name: 'Borrar' }).click();
    await expect(toast(page, 'Cierre de clase borrado')).toBeVisible();
    await expect(nowCard(page).getByRole('button', { name: 'Cerrar clase' })).toBeVisible();
    expect((await world.api.get(`/courses/${c.id}/sessions/log?date=${TODAY}&start=10:20`)).saved).toBe(false);
  });

  test('hoy-45 · nothing written: the button says why; something typed asks before being discarded', async ({ page, world }) => {
    await openHoy(page);
    await nowCard(page).getByRole('button', { name: 'Cerrar clase' }).click();
    const sheet = page.getByRole('dialog', { name: `Cerrar clase · ${LABEL}` });
    await sheet.getByRole('textbox', { name: 'Hecho hoy' }).fill('');
    await expect(sheet.getByRole('button', { name: 'Escribe qué habéis hecho' })).toBeDisabled();
    await sheet.getByRole('textbox', { name: 'Deberes' }).fill('Terminar la ficha');
    await expect(sheet.getByRole('button', { name: 'Guardar' })).toBeEnabled();
    await sheet.getByRole('button', { name: 'Cerrar', exact: true }).click();
    const ask = page.getByRole('dialog', { name: 'Descartar los cambios' });
    await ask.getByRole('button', { name: 'Cancelar' }).click();
    await expect(sheet.getByRole('textbox', { name: 'Deberes' })).toHaveValue('Terminar la ficha');
    await sheet.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await ask.getByRole('button', { name: 'Descartar' }).click();
    await expect(sheet).toBeHidden();
    expect((await world.api.get(`/courses/${world.courses[0].id}/sessions/log?date=${TODAY}&start=10:20`)).saved).toBe(false);
  });

  test('hoy-46 · «Unidad terminada»: the next unit starts', async ({ page, world }) => {
    const [c] = world.courses;
    await openHoy(page);
    await expect(nowCard(page).getByText('Aula 112 · 10:20–11:15 · Fracciones')).toBeVisible();
    await nowCard(page).getByRole('button', { name: 'Cerrar clase' }).click();
    const sheet = page.getByRole('dialog', { name: `Cerrar clase · ${LABEL}` });
    await sheet.getByRole('switch', { name: 'Unidad terminada' }).click();
    await expect(sheet.getByRole('switch', { name: 'Unidad terminada' })).toHaveAttribute('aria-checked', 'true');
    await sheet.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Clase cerrada · empieza «Proporcionalidad»')).toBeVisible();
    await expect(nowCard(page).getByText('Aula 112 · 10:20–11:15 · Proporcionalidad')).toBeVisible();
    const units = await world.api.get(`/courses/${c.id}/units`);
    expect(units.map((u: { title: string; status: string }) => [u.title, u.status])).toEqual([['Fracciones', 'done'], ['Proporcionalidad', 'current']]);
  });

  test('hoy-47 · from the agenda: a closed session says what it left, the running one offers to close', async ({ page }) => {
    await openHoy(page);
    await agendaRow(page, '08:30').click();
    const session = page.getByRole('dialog', { name: LABEL });
    const closed = session.getByRole('button', { name: /^Clase cerrada/ });
    await expect(closed).toContainText('Para la próxima: Problemas de la p. 34');
    await closed.click();
    const sheet = page.getByRole('dialog', { name: `Cerrar clase · ${LABEL}` });
    await expect(sheet.getByText('08:30–09:25', { exact: true })).toBeVisible();
    await expect(sheet.getByRole('textbox', { name: 'Hecho hoy' })).toHaveValue('Suma de fracciones con distinto denominador');
    await expect(sheet.getByRole('textbox', { name: 'Para la próxima' })).toHaveValue('Problemas de la p. 34');
    await sheet.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(sheet).toBeHidden();
    await agendaRow(page, '10:20').click();
    await expect(session.getByRole('button', { name: /^Cerrar clase/ })).toContainText('Qué habéis hecho, qué toca y deberes');
  });

  test('hoy-48 · a closing that cannot be saved keeps what was written', async ({ page }) => {
    await openHoy(page);
    await nowCard(page).getByRole('button', { name: 'Cerrar clase' }).click();
    const sheet = page.getByRole('dialog', { name: `Cerrar clase · ${LABEL}` });
    await sheet.getByRole('textbox', { name: 'Para la próxima' }).fill('Repaso');
    await page.route('**/api/courses/*/sessions/log', (route) => (route.request().method() === 'PUT'
      ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: { message: 'Servidor no disponible' } }) })
      : route.fallback()));
    await sheet.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Servidor no disponible')).toBeVisible();
    await expect(sheet.getByRole('textbox', { name: 'Para la próxima' })).toHaveValue('Repaso');
  });
});

test.describe('hoy · anotar', () => {
  test.use({ worldSpec: { courses: [CLASS] } });

  test('hoy-49 · an incident for two students, found by the search, from «Ahora»', async ({ page, world }, info) => {
    const [c] = world.courses;
    const hugo = c.students[3];
    await openHoy(page);
    await nowCard(page).getByRole('button', { name: 'Anotar', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Anotar' });
    await expect(sheet.getByText(LABEL)).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Cambiar' })).toHaveCount(0); // the class comes from the session
    const text = sheet.getByRole('textbox', { name: 'Texto' });
    await expect(text).toBeFocused();
    await expect(sheet.getByRole('button', { name: 'Guardar' })).toBeDisabled();
    await expect(sheet.getByRole('button', { name: 'Guardar' })).toHaveAttribute('title', 'Escribe la observación');
    const kind = sheet.getByRole('group', { name: 'Tipo' });
    await expect(kind.getByRole('button', { name: 'Observación' })).toHaveAttribute('aria-pressed', 'true');
    await kind.getByRole('button', { name: 'Incidencia' }).click();
    await expect(text).toHaveAttribute('placeholder', 'Qué ha pasado');

    await expect(sheet.getByText('Alumnos (opcional)')).toBeVisible();
    await sheet.getByRole('textbox', { name: 'Buscar alumno' }).fill('Díaz');
    await expect(sheet.locator('.chip-row').getByRole('button')).toHaveText(['Hugo Díaz']);
    await sheet.getByRole('button', { name: 'Hugo Díaz' }).click();
    await sheet.getByRole('textbox', { name: 'Buscar alumno' }).fill('zzz');
    await expect(sheet.getByText('Ningún alumno coincide.')).toHaveCount(0); // the selected one stays in view
    await sheet.getByRole('textbox', { name: 'Buscar alumno' }).fill('');
    await sheet.getByRole('button', { name: 'Marta Alonso' }).click();
    await expect(sheet.getByText('2 alumnos')).toBeVisible();
    await sheet.getByRole('button', { name: 'Quitar todos' }).click();
    await expect(sheet.getByText('Alumnos (opcional)')).toBeVisible();
    await sheet.getByRole('button', { name: 'Hugo Díaz' }).click();
    await sheet.getByRole('button', { name: 'Marta Alonso' }).click();
    await text.fill('Ha tirado el estuche de un compañero');
    await shot(page, info, '49-note');
    await sheet.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Incidencia guardada')).toBeVisible();
    await expect(sheet).toBeHidden();
    const notes = await world.api.get(`/notes?student_id=${hugo.id}`);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ kind: 'incident', text: 'Ha tirado el estuche de un compañero', date: TODAY });
    expect(notes[0].students.map((s: { id: string }) => s.id).sort()).toEqual([hugo.id, c.students[0].id].sort());
  });

  test('hoy-50 · each kind of note, with its own hint and message', async ({ page, world }) => {
    const kinds = [
      { kind: 'Observación', hint: 'Qué has observado', saved: 'Observación guardada', api: 'observation' },
      { kind: 'Positivo', hint: 'Qué ha hecho bien', saved: 'Positivo guardado', api: 'positive' },
      { kind: 'Familia', hint: 'Llamada, reunión, acuerdo…', saved: 'Nota de familia guardada', api: 'family' },
    ];
    await openHoy(page);
    for (const k of kinds) {
      await nowCard(page).getByRole('button', { name: 'Anotar', exact: true }).click();
      const sheet = page.getByRole('dialog', { name: 'Anotar' });
      await sheet.getByRole('group', { name: 'Tipo' }).getByRole('button', { name: k.kind }).click();
      await expect(sheet.getByRole('textbox', { name: 'Texto' })).toHaveAttribute('placeholder', k.hint);
      await sheet.getByRole('textbox', { name: 'Texto' }).fill(`${k.kind} de la clase`);
      await sheet.getByRole('button', { name: 'Guardar' }).click();
      await expect(toast(page, k.saved)).toBeVisible();
      await expect(sheet).toBeHidden();
    }
    const notes = await world.api.get(`/notes?course_id=${world.courses[0].id}`);
    expect(notes.map((n: { kind: string }) => n.kind).sort()).toEqual(kinds.map((k) => k.api).sort());
  });

  test('hoy-51 · «Anotar» from a session of the agenda keeps its class', async ({ page, world }) => {
    await openHoy(page);
    await agendaRow(page, '12:40').click();
    await page.getByRole('dialog', { name: LABEL }).getByRole('button', { name: /^Anotar/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Anotar' });
    await expect(sheet.getByText(LABEL)).toBeVisible();
    await sheet.getByRole('textbox', { name: 'Texto' }).fill('Traer el compás el lunes');
    await sheet.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Observación guardada')).toBeVisible();
    const notes = await world.api.get(`/notes?course_id=${world.courses[0].id}`);
    expect(notes[0]).toMatchObject({ kind: 'observation', text: 'Traer el compás el lunes' });
  });

  test('hoy-52 · a note that cannot be saved stays in the sheet', async ({ page }) => {
    await openHoy(page);
    await nowCard(page).getByRole('button', { name: 'Anotar', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Anotar' });
    await sheet.getByRole('textbox', { name: 'Texto' }).fill('Muy participativo hoy');
    await page.route('**/api/notes', (route) => route.fulfill({ status: 503, contentType: 'application/json',
      body: JSON.stringify({ detail: { message: 'Servidor no disponible' } }) }));
    await sheet.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Servidor no disponible')).toBeVisible();
    await expect(sheet.getByRole('textbox', { name: 'Texto' })).toHaveValue('Muy participativo hoy');
  });

  test('hoy-53 · the student search ignores accents, as everywhere else', async ({ page }) => {
    // QuickNoteSheet filters with a plain toLowerCase().includes(): «diaz» does not find Díaz nor «alvaro» Álvaro,
    // while the app's search finds «nunez» → Núñez (docs/PRODUCT.md §3). Typing accents on a phone between classes is slow.
    bug('BUG-HOY-04', 'Anotar’s student search needs the accents');
    await openHoy(page);
    await nowCard(page).getByRole('button', { name: 'Anotar', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Anotar' });
    await sheet.getByRole('textbox', { name: 'Buscar alumno' }).fill('diaz');
    await expect(sheet.getByRole('button', { name: 'Hugo Díaz' })).toBeVisible({ timeout: 2000 });
  });
});

test.describe('hoy · la sesión desde la agenda', () => {
  test.use({ worldSpec: { courses: [CLASS] } });

  test('hoy-54 · the class in progress: plan, actions, «Abrir clase»', async ({ page, world }, info) => {
    await openHoy(page);
    await agendaRow(page, '10:20').click();
    const sheet = page.getByRole('dialog', { name: LABEL });
    await expect(sheet.getByText('jueves, 19 de noviembre · 10:20–11:15 · Aula 112')).toBeVisible();
    await expect(sheet.getByText('Toca: Problemas de la p. 34')).toBeVisible();
    await expect(sheet.getByText('A las 08:30: Suma de fracciones con distinto denominador')).toBeVisible();
    const rows = sheet.locator('.list').getByRole('button').or(sheet.locator('.list').getByRole('link'));
    await expect(rows).toHaveText([/^Pasar lista/, /^Cerrar clase/, /^Anotar/, /^Abrir clase/]);
    await expect(sheet.getByRole('button', { name: 'No hay clase' })).toBeVisible();
    await shot(page, info, '54-session');
    await sheet.getByRole('button', { name: 'Revisar' }).click();
    await expect(page.getByRole('dialog', { name: `Deberes · ${LABEL}` })).toBeVisible();
    await page.keyboard.press('Escape');
    await agendaRow(page, '10:20').click();
    await sheet.getByRole('link', { name: 'Abrir clase' }).click();
    await expect(page).toHaveURL(new RegExp(`/clases/${world.courses[0].id}$`));
    await expect(page.getByRole('heading', { level: 1, name: '2.º ESO C' })).toBeVisible();
  });

  test('hoy-55 · a later session today and one of tomorrow offer only what fits their time', async ({ page }) => {
    await openHoy(page);
    await agendaRow(page, '12:40').click();
    const sheet = page.getByRole('dialog', { name: LABEL });
    const rows = sheet.locator('.list').getByRole('button').or(sheet.locator('.list').getByRole('link'));
    await expect(rows).toHaveText([/^Pasar lista/, /^Anotar/, /^Abrir clase/]); // not closed before it starts
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'viernes, 20 de noviembre' }).click();
    await agendaRow(page, '09:25').click();
    await expect(sheet.getByText('viernes, 20 de noviembre · 09:25–10:20 · Aula 112')).toBeVisible();
    await expect(rows).toHaveText([/^Anotar/, /^Abrir clase/]); // no list of a day still to come
    await expect(sheet.getByRole('button', { name: 'No hay clase' })).toBeVisible();
  });

  test('hoy-56 · «No hay clase» with a reason, back to the session with «Volver», undone with «Restaurar sesión»', async ({ page, world }, info) => {
    const session = async () => (await world.api.get(`/today?date=${TODAY}`)).sessions.find((s: { start: string }) => s.start === '12:40');
    await openHoy(page);
    await agendaRow(page, '12:40').click();
    const sheet = page.getByRole('dialog', { name: LABEL });
    await sheet.getByRole('button', { name: 'No hay clase' }).click();
    const cancel = page.getByRole('dialog', { name: 'No hay clase' });
    await expect(cancel.getByText(`${LABEL} · jueves, 19 de noviembre · 12:40–13:35 · Aula 112`)).toBeVisible();
    await expect(cancel.getByText('No contará como lista sin pasar. Se puede deshacer desde la agenda.')).toBeVisible();
    await cancel.getByRole('button', { name: 'Volver' }).click();
    await expect(sheet.getByRole('button', { name: /^Pasar lista/ })).toBeVisible();
    await sheet.getByRole('button', { name: 'No hay clase' }).click();
    await cancel.getByRole('textbox', { name: 'Motivo' }).fill('Excursión al museo');
    await shot(page, info, '56-no-class');
    await cancel.getByRole('button', { name: 'No hay clase' }).click();
    await expect(toast(page, 'Sin clase')).toBeVisible();
    await expect(agendaRow(page, '12:40')).toContainText('Sin clase · Excursión al museo');
    expect(await session()).toMatchObject({ cancelled: true, cancel_note: 'Excursión al museo', guardia: false });

    await agendaRow(page, '12:40').click();
    await expect(sheet.getByText('Sin clase · Excursión al museo')).toBeVisible();
    await expect(sheet.getByRole('button', { name: /^Pasar lista/ })).toHaveCount(0);
    await sheet.getByRole('button', { name: 'Restaurar sesión' }).click();
    await expect(toast(page, 'Sesión restaurada')).toBeVisible();
    await expect(agendaRow(page, '12:40')).not.toContainText('Sin clase');
    expect((await session()).cancelled).toBe(false);
  });

  test('hoy-57 · the class in progress cancelled: «Ahora» moves on to the next one', async ({ page }) => {
    await openHoy(page);
    await agendaRow(page, '10:20').click();
    await page.getByRole('dialog', { name: LABEL }).getByRole('button', { name: 'No hay clase' }).click();
    await page.getByRole('dialog', { name: 'No hay clase' }).getByRole('button', { name: 'No hay clase' }).click();
    await expect(agendaRow(page, '10:20')).toContainText('Sin clase');
    await expect(nowCard(page)).toHaveAccessibleName('Siguiente · 12:40');
    await agendaRow(page, '10:20').click();
    await page.getByRole('dialog', { name: LABEL }).getByRole('button', { name: 'Restaurar sesión' }).click();
    await expect(nowCard(page)).toHaveAccessibleName('Ahora · quedan 35 min');
  });
});
