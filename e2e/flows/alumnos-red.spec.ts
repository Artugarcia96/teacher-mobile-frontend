import type { Page } from '@playwright/test';
import { confirmSheet, expect, fileMenu, MATES_2C, openFile, section, sheet, test, toast } from './alumnos-helpers';

// Alumnos without connection: «Añadir alumnos», «Editar datos y apoyos», «Anotar» and editing or deleting an
// observation fail at once with «Sin conexión…» (no silent wait), keep what was typed, save nothing, and the same
// button saves it once the connection is back. Each test is a teacher of its own; every save is checked through the
// API. No AI. (Ajustes and screens that cannot load are in the marco flows.)

const OFFLINE = 'Sin conexión con el servidor. Revisa tu conexión.';
const isApi = (url: URL) => url.pathname.startsWith('/api/');
const goOffline = (page: Page) => page.route(isApi, (route) => route.abort('internetdisconnected'));
const goOnline = (page: Page) => page.unroute(isApi);

const notesOf = async (api: { get: (p: string) => Promise<unknown> }, studentId: string) =>
  (await api.get(`/notes?student_id=${studentId}`)) as { id: string; kind: string; date: string; text: string }[];
const noteRow = (page: Page, text: string) => section(page, 'Observaciones').locator('.st-note').filter({ hasText: text });
async function noteMenu(page: Page, text: string, item: 'Editar' | 'Eliminar') {
  await noteRow(page, text).getByRole('button', { name: 'Opciones de la observación' }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

test.describe('an empty class', () => {
  test.use({ teacherSpec: { courses: [{ ...MATES_2C, students: [] }] } });

  test('alumnos-110 «Añadir alumnos» without connection: «Sin conexión…», the list and its preview stay; back online it adds them', async ({ page, teacher }) => {
    const [c] = teacher.courses;
    await page.goto(`/clases/${c.id}/alumnos?anadir=1`);
    const s = sheet(page, 'Añadir alumnos');
    const list = s.getByLabel('Un alumno por línea');
    await list.fill('García López, Ana\nPablo Ruiz Serrano');
    const preview = s.locator('.add-st__preview .row .row__title');
    await expect(preview).toHaveText(['García López, Ana', 'Ruiz Serrano, Pablo']);

    await goOffline(page);
    const started = Date.now();
    await s.getByRole('button', { name: 'Añadir 2 alumnos' }).click();
    await expect(s.getByRole('alert')).toHaveText(OFFLINE);
    expect(Date.now() - started).toBeLessThan(5_000);
    await expect(s).toBeVisible();
    await expect(list).toHaveValue('García López, Ana\nPablo Ruiz Serrano');
    await expect(preview).toHaveText(['García López, Ana', 'Ruiz Serrano, Pablo']);
    expect(await teacher.api.get(`/groups/${c.groupId}/students`)).toEqual([]);

    await goOnline(page);
    await s.getByRole('button', { name: 'Añadir 2 alumnos' }).click();
    await expect(toast(page, '2 alumnos añadidos')).toBeVisible();
    await expect(s).toBeHidden();
    await expect(page.locator('.students-roster').getByRole('heading', { name: '2 alumnos' })).toBeVisible();
    expect((await teacher.api.get(`/groups/${c.groupId}/students`)).map((x: { sort_name: string }) => x.sort_name))
      .toEqual(['García López, Ana', 'Ruiz Serrano, Pablo']);
  });
});

test.describe('a class with an observation', () => {
  test.use({
    teacherSpec: { courses: [{ ...MATES_2C, notes: [{ students: [0], kind: 'observation', date: '2026-11-10', text: 'Pregunta mucho en clase.' }] }] },
  });

  test('alumnos-110 «Editar datos y apoyos» without connection: «Sin conexión…», the name and the NEAE stay; back online it saves', async ({ page, teacher }) => {
    const marta = teacher.courses[0].students[0];
    await openFile(page, marta.id, 'Marta Alonso Gil');
    await fileMenu(page, 'Editar datos y apoyos');
    const s = sheet(page, 'Editar datos y apoyos');
    await s.getByLabel('Nombre').fill('Martina');
    await s.getByRole('switch', { name: 'NEAE', exact: true }).click();
    await s.getByLabel('Tipo').fill('TDAH');

    await goOffline(page);
    const started = Date.now();
    await s.getByRole('button', { name: 'Guardar' }).click();
    await expect(s.getByRole('alert')).toHaveText(OFFLINE);
    expect(Date.now() - started).toBeLessThan(5_000);
    await expect(s.getByLabel('Nombre')).toHaveValue('Martina');
    await expect(s.getByRole('switch', { name: 'NEAE', exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect(s.getByLabel('Tipo')).toHaveValue('TDAH');
    await expect(page.getByRole('heading', { level: 1, name: 'Marta Alonso Gil' })).toBeVisible();
    expect((await teacher.api.get(`/students/${marta.id}`)).student).toMatchObject({ first_name: 'Marta' });

    await goOnline(page);
    await s.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Datos guardados')).toBeVisible();
    await expect(s).toBeHidden();
    await expect(page.getByRole('heading', { level: 1, name: 'Martina Alonso Gil' })).toBeVisible();
    await expect(page.locator('.st-support .chip')).toHaveText(['NEAE · TDAH']);
    expect((await teacher.api.get(`/students/${marta.id}`)).student).toMatchObject({ first_name: 'Martina', support: { neae: true, kind: 'TDAH' } });
  });

  test('alumnos-110 «Anotar» without connection: «Sin conexión…», the text and the kind stay; back online it is saved once', async ({ page, teacher }) => {
    const marta = teacher.courses[0].students[0];
    await openFile(page, marta.id, 'Marta Alonso Gil');
    await page.getByRole('button', { name: 'Anotar' }).click();
    const s = sheet(page, 'Anotar');
    const kind = s.getByRole('group', { name: 'Tipo' }).getByRole('button', { name: 'Incidencia' });
    await kind.click();
    await s.getByRole('textbox', { name: 'Texto' }).fill('No trae el material por tercera vez.');

    await goOffline(page);
    const started = Date.now();
    await s.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, OFFLINE)).toBeVisible();
    expect(Date.now() - started).toBeLessThan(5_000);
    await expect(s).toBeVisible();
    await expect(s.getByRole('textbox', { name: 'Texto' })).toHaveValue('No trae el material por tercera vez.');
    await expect(kind).toHaveAttribute('aria-pressed', 'true');
    expect((await notesOf(teacher.api, marta.id)).map((n) => n.text)).toEqual(['Pregunta mucho en clase.']);

    await goOnline(page);
    await s.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Incidencia guardada')).toBeVisible();
    await expect(s).toBeHidden();
    await expect(noteRow(page, 'No trae el material por tercera vez.').locator('.chip')).toHaveText('Incidencia');
    const saved = (await notesOf(teacher.api, marta.id)).filter((n) => n.text === 'No trae el material por tercera vez.');
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ kind: 'incident', date: '2026-11-19' });
  });

  test('alumnos-110 editing an observation without connection: «Sin conexión…», the edit stays; back online it saves', async ({ page, teacher }) => {
    const marta = teacher.courses[0].students[0];
    await openFile(page, marta.id, 'Marta Alonso Gil');
    await noteMenu(page, 'Pregunta mucho en clase.', 'Editar');
    const s = sheet(page, 'Editar observación');
    await s.getByLabel('Texto').fill('Pregunta mucho y ayuda a sus compañeros.');
    const positive = s.getByRole('group', { name: 'Tipo' }).getByRole('button', { name: 'Positivo' });
    await positive.click();

    await goOffline(page);
    const started = Date.now();
    await s.getByRole('button', { name: 'Guardar' }).click();
    await expect(s.getByRole('alert')).toHaveText(OFFLINE);
    expect(Date.now() - started).toBeLessThan(5_000);
    await expect(s.getByLabel('Texto')).toHaveValue('Pregunta mucho y ayuda a sus compañeros.');
    await expect(positive).toHaveAttribute('aria-pressed', 'true');
    await expect(noteRow(page, 'Pregunta mucho en clase.')).toBeVisible();
    expect((await notesOf(teacher.api, marta.id))[0]).toMatchObject({ kind: 'observation', text: 'Pregunta mucho en clase.' });

    await goOnline(page);
    await s.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Observación guardada')).toBeVisible();
    await expect(s).toBeHidden();
    await expect(noteRow(page, 'Pregunta mucho y ayuda a sus compañeros.').locator('.chip')).toHaveText('Positivo');
    expect((await notesOf(teacher.api, marta.id))[0]).toMatchObject({ kind: 'positive', text: 'Pregunta mucho y ayuda a sus compañeros.' });
  });

  test('alumnos-110 deleting an observation without connection: «Sin conexión…» and it stays; back online it goes', async ({ page, teacher }) => {
    const marta = teacher.courses[0].students[0];
    await openFile(page, marta.id, 'Marta Alonso Gil');
    await goOffline(page);
    await noteMenu(page, 'Pregunta mucho en clase.', 'Eliminar');
    const ask = confirmSheet(page, 'Eliminar observación');
    const started = Date.now();
    await ask.getByRole('button', { name: 'Eliminar' }).click();
    const failed = toast(page, OFFLINE);
    await expect(failed).toBeVisible();
    expect(Date.now() - started).toBeLessThan(5_000);
    await expect(noteRow(page, 'Pregunta mucho en clase.')).toBeVisible();
    await expect(toast(page, 'Observación eliminada')).toHaveCount(0);
    expect(await notesOf(teacher.api, marta.id)).toHaveLength(1);
    await failed.getByRole('button', { name: 'Cerrar el aviso' }).click();

    await goOnline(page);
    await noteMenu(page, 'Pregunta mucho en clase.', 'Eliminar');
    await ask.getByRole('button', { name: 'Eliminar' }).click();
    await expect(toast(page, 'Observación eliminada')).toBeVisible();
    await expect(noteRow(page, 'Pregunta mucho en clase.')).toHaveCount(0);
    expect(await notesOf(teacher.api, marta.id)).toEqual([]);
  });
});
