import {
  agendaRow, bug, CLASS, expect, isMobile, LABEL, listSheet, nowCard, openHoy, rosterRow, rowOptions, section, SHORT, shot, tapTo,
  test, toast, TODAY, type World,
} from './hoy-helpers';

// Pasar lista from Hoy (docs/PRODUCT.md §4.2): all present by default, tap = falta, another = retraso, another = presente;
// long-press / right-click to justify or add a note; autosave of only what changes; «Cerrar lista» says «Lista pasada»
// only once the server has it. Each test is a teacher of its own (a taken list cannot be un-taken).
// Two devices on the same list: e2e/attendance.spec.ts.

const marks = async (world: World, start = '10:20') => {
  const c = world.courses[0];
  const a = await world.api.get(`/courses/${c.id}/attendance?date=${TODAY}&start=${start}`);
  return { taken: a.taken as boolean, by: Object.fromEntries(a.students.map((r: { student: { sort_name: string }; status: string; note: string | null }) =>
    [r.student.sort_name, r.note ? `${r.status} · ${r.note}` : r.status])) as Record<string, string> };
};
const openList = async (page: import('@playwright/test').Page) => {
  await nowCard(page).getByRole('button', { name: /Pasar lista|Editar lista$/ }).click();
  const sheet = listSheet(page);
  await expect(sheet.getByRole('list', { name: /Lista de la clase/ })).toBeVisible();
  return sheet;
};

test.describe('hoy · pasar lista', () => {
  test.use({ worldSpec: { courses: [CLASS] } });

  test('hoy-30 · everyone present: «Cerrar lista» and the list is taken', async ({ page, world }, info) => {
    await openHoy(page);
    const sheet = await openList(page);
    await expect(sheet.getByText('10:20–11:15 · Aula 112')).toBeVisible();
    await expect(sheet.getByText('12 presentes', { exact: true })).toBeVisible();
    await expect(sheet.getByText('Toca a quien falte. Otro toque: retraso.')).toBeVisible();
    await expect(sheet.getByText(isMobile(info) ? 'Mantén pulsado un nombre: justificar o anotar.' : 'Clic derecho en un nombre: justificar o anotar.')).toBeVisible();
    await expect(sheet.getByRole('listitem')).toHaveCount(12);
    await expect(rosterRow(sheet, 1)).toHaveAccessibleName('1. Alonso Gil, Marta: Presente. Toca para cambiar');
    await expect(rosterRow(sheet, 12)).toHaveAccessibleName('12. Martín Sanz, Álvaro: Presente. Toca para cambiar');
    await shot(page, info, '30-list');
    await sheet.getByRole('button', { name: 'Cerrar lista' }).click();
    await expect(toast(page, 'Lista pasada · 12 presentes')).toBeVisible();
    await expect(sheet).toBeHidden();

    const done = nowCard(page).getByRole('button', { name: 'Lista pasada. Editar lista' });
    await expect(done).toHaveText('Lista pasada');
    await expect(agendaRow(page, '10:20')).toContainText('Lista pasada');
    const saved = await marks(world);
    expect(saved.taken).toBe(true);
    expect(Object.values(saved.by).every((s) => s === 'present')).toBe(true);
    await page.reload();
    await expect(done).toBeVisible();
  });

  test('hoy-31 · absences, a late arrival, a justified absence with its note, a tap undone', async ({ page, world }, info) => {
    await openHoy(page);
    const sheet = await openList(page);
    await tapTo(sheet, 1, 'Falta');
    await tapTo(sheet, 2, 'Retraso');
    await tapTo(sheet, 3, 'Falta');
    await tapTo(sheet, 4, 'Falta');
    await tapTo(sheet, 4, 'Presente'); // one tap too many goes round to present
    const three = await rowOptions(page, info, rosterRow(sheet, 3));
    await expect(three.getByRole('menuitem')).toHaveText(['Justificar falta', 'Añadir nota']);
    await three.getByRole('menuitem', { name: 'Justificar falta' }).click();
    await expect(rosterRow(sheet, 3)).toHaveAccessibleName(/: Justificada\./);
    const one = await rowOptions(page, info, rosterRow(sheet, 1));
    await one.getByRole('menuitem', { name: 'Añadir nota' }).click();
    const note = sheet.getByRole('textbox', { name: 'Nota' });
    await expect(note).toBeFocused();
    await note.fill('Médico, avisó la familia');
    await note.press('Enter');
    await expect(note).toBeHidden();
    await expect(rosterRow(sheet, 1)).toContainText('Médico, avisó la familia');
    await expect(sheet.getByText('9 presentes · 1 falta · 1 retraso · 1 justificada')).toBeVisible();
    await shot(page, info, '31-marks');

    // Saved on the way, before closing.
    await expect(sheet.getByText('Guardado', { exact: true })).toBeVisible();
    await expect.poll(async () => (await marks(world)).by).toMatchObject({
      'Alonso Gil, Marta': 'absent · Médico, avisó la familia', 'Benítez Ruiz, Pablo': 'late', 'Castro León, Lucía': 'justified',
      'Díaz Soto, Hugo': 'present',
    });
    await sheet.getByRole('button', { name: 'Cerrar lista' }).click();
    await expect(toast(page, 'Lista pasada · 9 presentes · 1 falta · 1 retraso · 1 justificada')).toBeVisible();
    await expect(nowCard(page).getByRole('button', { name: /Editar lista$/ })).toHaveText('Lista pasada · 2 faltas · 1 retraso');
    await expect(agendaRow(page, '10:20')).toContainText('Lista pasada');
  });

  test('hoy-32 · a list already taken: edit it, unjustify, close with ✕ or Esc and it is saved', async ({ page, world }, info) => {
    const [c] = world.courses;
    const s = c.students;
    await world.api.put(`/courses/${c.id}/attendance`, { date: TODAY, start: '10:20', marks: [
      { student_id: s[0].id, status: 'absent' }, { student_id: s[2].id, status: 'justified', note: 'Justificante médico' },
    ] });
    await openHoy(page);
    await expect(nowCard(page).getByRole('button', { name: /Editar lista$/ })).toHaveText('Lista pasada · 2 faltas');
    let sheet = await openList(page);
    await expect(rosterRow(sheet, 1)).toHaveAccessibleName(/: Falta\./);
    await expect(rosterRow(sheet, 3)).toHaveAccessibleName(/: Justificada\./);
    await expect(rosterRow(sheet, 3)).toContainText('Justificante médico');
    const menu = await rowOptions(page, info, rosterRow(sheet, 3));
    await expect(menu.getByRole('menuitem')).toHaveText(['Quitar justificación', 'Editar nota']);
    await menu.getByRole('menuitem', { name: 'Quitar justificación' }).click();
    await expect(rosterRow(sheet, 3)).toHaveAccessibleName(/: Falta\./);
    await tapTo(sheet, 1, 'Retraso');
    await sheet.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(toast(page, 'Lista pasada · 10 presentes · 1 falta · 1 retraso')).toBeVisible();
    await expect(sheet).toBeHidden();
    expect((await marks(world)).by).toMatchObject({ 'Alonso Gil, Marta': 'late', 'Castro León, Lucía': 'absent · Justificante médico' });

    sheet = await openList(page);
    await tapTo(sheet, 5, 'Falta');
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(toast(page, 'Lista pasada · 9 presentes · 2 faltas · 1 retraso')).toBeVisible();
    expect((await marks(world)).by['Esteban Mora, Irene']).toBe('absent');
  });

  test('hoy-33 · a save that fails keeps the sheet open with the taps, and goes through on retry', async ({ page, world }) => {
    await openHoy(page);
    const sheet = await openList(page);
    await page.route('**/api/courses/*/attendance', (route) => (route.request().method() === 'PUT'
      ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: { message: 'Servidor no disponible' } }) })
      : route.fallback()));
    await tapTo(sheet, 1, 'Falta');
    await expect(sheet.getByText('No se ha podido guardar', { exact: true })).toBeVisible();
    await sheet.getByRole('button', { name: 'Cerrar lista' }).click();
    await expect(toast(page, 'No se ha podido guardar la lista. Revisa la conexión y vuelve a intentarlo.')).toBeVisible();
    await expect(sheet).toBeVisible();
    await expect(rosterRow(sheet, 1)).toHaveAccessibleName(/: Falta\./);
    expect((await marks(world)).taken).toBe(false);

    await page.unroute('**/api/courses/*/attendance');
    await sheet.getByRole('button', { name: 'Cerrar lista' }).click();
    await expect(toast(page, 'Lista pasada · 11 presentes · 1 falta')).toBeVisible();
    await expect(sheet).toBeHidden();
    expect((await marks(world)).by['Alonso Gil, Marta']).toBe('absent');
  });

  test('hoy-29 · the back gesture closes the list and keeps the taps', async ({ page, world }) => {
    await openHoy(page);
    const sheet = await openList(page);
    await tapTo(sheet, 9, 'Retraso');
    await page.goBack();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\/hoy$/);
    await expect(toast(page, 'Lista pasada · 11 presentes · 1 retraso')).toBeVisible();
    expect((await marks(world)).by['Iglesias Lara, Nerea']).toBe('late');
  });

  test('hoy-34 · leaving in the middle still sends the last taps', async ({ page, world }) => {
    await openHoy(page);
    const sheet = await openList(page);
    await rosterRow(sheet, 6).click();
    await page.goto('/clases'); // before the autosave fires
    await expect.poll(async () => (await marks(world)).by['Fuentes Vera, Adrián']).toBe('absent');
  });

  test('hoy-35 · the list opens as a side panel on a computer and as a bottom sheet on a phone', async ({ page }, info) => {
    await openHoy(page);
    const sheet = await openList(page);
    if (isMobile(info)) {
      await expect(sheet).toHaveAttribute('aria-modal', 'true');
      const box = (await sheet.boundingBox())!;
      expect(box.width).toBeLessThanOrEqual(390);
    } else {
      await expect(sheet).toHaveAttribute('aria-modal', 'false');
      const box = (await sheet.boundingBox())!;
      expect(box.x).toBeGreaterThan(700); // on the right, Hoy stays in view and usable
      await expect(nowCard(page)).toBeInViewport();
      await section(page, 'Agenda').scrollIntoViewIfNeeded();
      await expect(sheet).toBeVisible();
    }
    await shot(page, info, '35-list-panel');
  });

  test('hoy-36 · keyboard: Enter and Space on a name, the context-menu key for the options, Esc saves', async ({ page, world }, info) => {
    test.skip(isMobile(info), 'keyboard path of the computer');
    await openHoy(page);
    const sheet = await openList(page);
    await rosterRow(sheet, 7).focus();
    await page.keyboard.press('Enter');
    await expect(rosterRow(sheet, 7)).toHaveAccessibleName(/: Falta\./);
    await page.keyboard.press('Space');
    await expect(rosterRow(sheet, 7)).toHaveAccessibleName(/: Retraso\./);
    await page.keyboard.press('Tab');
    await expect(rosterRow(sheet, 8)).toBeFocused();
    await page.keyboard.press('Enter');
    await rosterRow(sheet, 8).focus();
    await page.keyboard.press('Shift+F10');
    await expect(page.getByRole('menuitem', { name: 'Justificar falta' })).toBeVisible();
    await page.keyboard.press('Escape'); // closes only the menu
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(toast(page, 'Lista pasada · 10 presentes · 1 falta · 1 retraso')).toBeVisible();
    expect((await marks(world)).by).toMatchObject({ 'García Peña, Sara': 'late', 'Herrero Ibáñez, Daniel': 'absent' });
  });

  test('hoy-37 · a past session of today from the agenda: «Pasar lista», then «Editar lista» with its tally', async ({ page, world }) => {
    await openHoy(page);
    await agendaRow(page, '08:30').click();
    const session = page.getByRole('dialog', { name: LABEL });
    await expect(session.getByRole('button', { name: /^Pasar lista/ })).toContainText('Todos presentes por defecto');
    await session.getByRole('button', { name: /^Pasar lista/ }).click();
    const sheet = listSheet(page);
    await expect(sheet.getByText('08:30–09:25 · Aula 112')).toBeVisible();
    await tapTo(sheet, 2, 'Falta');
    await sheet.getByRole('button', { name: 'Cerrar lista' }).click();
    await expect(toast(page, 'Lista pasada · 11 presentes · 1 falta')).toBeVisible();
    await expect(agendaRow(page, '08:30')).toContainText('Lista pasada');
    await agendaRow(page, '08:30').click();
    await expect(session.getByRole('button', { name: /^Editar lista/ })).toContainText('Lista pasada · 1 falta');
    expect((await marks(world, '08:30')).by['Benítez Ruiz, Pablo']).toBe('absent');
  });
});

test.describe('hoy · la hoja de la lista se anuncia', () => {
  test.use({ worldSpec: { courses: [CLASS] } });

  test('hoy-79 · the list and the homework check are announced with the class (a screen reader says what opened)', async ({ page }) => {
    bug('BUG-HOY-07', 'Sheet only sets aria-label when its title is a string: «Pasar lista» and «Revisar deberes» (titles in a span) open as unnamed dialogs');
    await openHoy(page);
    await nowCard(page).getByRole('button', { name: 'Pasar lista' }).click();
    await expect(page.getByRole('dialog', { name: SHORT })).toBeVisible();
    await page.keyboard.press('Escape');
    await nowCard(page).getByRole('button', { name: 'Revisar' }).click();
    await expect(page.getByRole('dialog', { name: `Deberes · ${SHORT}` })).toBeVisible();
  });
});

test.describe('hoy · pasar lista en una clase sin alumnos', () => {
  test.use({ worldSpec: { courses: [{ ...CLASS, students: [], logs: [] }] } });

  test('hoy-38 · no list to take: «Añadir alumnos» instead', async ({ page, world }) => {
    await openHoy(page);
    await nowCard(page).getByRole('button', { name: 'Pasar lista' }).click();
    const sheet = listSheet(page);
    await expect(sheet.getByText('Esta clase aún no tiene alumnos.')).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Cerrar lista' })).toHaveCount(0);
    await sheet.getByRole('button', { name: 'Añadir alumnos' }).click();
    await expect(page).toHaveURL(new RegExp(`/clases/${world.courses[0].id}/alumnos\\?anadir=1$`));
    await expect(page.getByRole('dialog', { name: 'Añadir alumnos' })).toBeVisible();
  });

  test('hoy-39 · the agenda does not ask for a list a class without students cannot have', async ({ page }) => {
    // A class without students has no list («Una clase sin alumnos no tiene lista»): nothing is owed.
    await openHoy(page);
    await expect(agendaRow(page, '10:20')).toContainText(SHORT);
    await expect(agendaRow(page, '10:20')).not.toContainText('Lista sin pasar', { timeout: 2000 });
  });
});
