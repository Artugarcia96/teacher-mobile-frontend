import type { Page } from '@playwright/test';
import {
  expect, fileMenu, isMobile, MATES_2C, openFile, openRoster, rosterRow, section, sheet, shot, test, toast,
} from './alumnos-helpers';

// «Editar datos y apoyos» (ficha › «···»; on a computer a side panel with the ficha in view): name, NEAE/ACNEE and its
// type, the measures (ACS with its level, only in Primaria/ESO), the adaptation details and the private notes. What
// is saved shows in the ficha header, and only «NEAE»/«ACNEE» plus the measures in the roster and the search (the
// diagnosis never leaves the ficha). No AI.

const editSheet = (page: Page) => sheet(page, 'Editar datos y apoyos');
const sw = (page: Page, label: string) => editSheet(page).getByRole('switch', { name: label, exact: true });
const support = async (api: { get: (p: string) => Promise<any> }, id: string) => (await api.get(`/students/${id}`)).student.support;

async function openEdit(page: Page, id: string, name: string) {
  await openFile(page, id, name);
  await fileMenu(page, 'Editar datos y apoyos');
  await expect(editSheet(page)).toBeVisible();
  return editSheet(page);
}

test.describe('an ESO class', () => {
  test.use({ teacherSpec: { courses: [MATES_2C] } });

  test('alumnos-60 rename a student: the ficha, the roster and the search follow; the name cannot be empty', async ({ page, teacher }, info) => {
    const [c] = teacher.courses;
    const marta = c.students[0];
    const s = await openEdit(page, marta.id, 'Marta Alonso Gil');
    await expect(s.getByText('Marta Alonso Gil')).toBeVisible();
    if (isMobile(info)) await expect(s).toHaveAttribute('aria-modal', 'true');
    else {
      // A side panel: the ficha stays in view and usable.
      await expect(s).toHaveAttribute('aria-modal', 'false');
      await expect(page.getByRole('heading', { level: 1, name: 'Marta Alonso Gil' })).toBeInViewport();
    }
    await expect(s.getByLabel('Nombre')).toHaveValue('Marta');
    await expect(s.getByLabel('Apellidos')).toHaveValue('Alonso Gil');
    await s.getByLabel('Nombre').fill('  ');
    await expect(s.getByRole('button', { name: 'Escribe el nombre' })).toBeDisabled();
    await s.getByLabel('Nombre').fill('Martina');
    await s.getByLabel('Apellidos').fill('Alonso Gil de Prado');
    await shot(page, info, 'apoyos-nombre');
    await s.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Datos guardados')).toBeVisible();
    await expect(s).toBeHidden();
    await expect(page.getByRole('heading', { level: 1, name: 'Martina Alonso Gil de Prado' })).toBeVisible();
    expect((await teacher.api.get(`/students/${marta.id}`)).student).toMatchObject({ first_name: 'Martina', last_name: 'Alonso Gil de Prado' });

    await openRoster(page, c.id);
    await expect(rosterRow(page, 'Alonso Gil de Prado, Martina')).toBeVisible();
    await page.goto('/clases');
    await page.getByRole('searchbox', { name: 'Buscar alumno o clase' }).fill('martina prado');
    await expect(page.getByRole('button', { name: /Alonso Gil de Prado, Martina/ })).toBeVisible();
  });

  test('alumnos-61 NEAE with its type and two measures: chips in the ficha; lists and search say only «NEAE» and the measures', async ({ page, teacher }, info) => {
    const [c] = teacher.courses;
    const pablo = c.students[1];
    const s = await openEdit(page, pablo.id, 'Pablo Benítez Ruiz');
    await expect(s.getByLabel('Tipo')).toHaveCount(0);
    await sw(page, 'NEAE').click();
    await expect(sw(page, 'NEAE')).toHaveAttribute('aria-checked', 'true');
    await expect(sw(page, 'ACNEE')).toHaveAttribute('aria-checked', 'false');
    await s.getByLabel('Tipo').fill('TDAH');
    await sw(page, 'Más tiempo en los exámenes').click();
    await sw(page, 'Enunciados por pasos').click();
    await s.getByLabel('Detalles de la adaptación').fill('Se sienta cerca de la pizarra. Puede usar calculadora.');
    await expect(s.getByText('La ACS es para alumnado ACNEE de Primaria y ESO.', { exact: false })).toBeVisible();
    await shot(page, info, 'apoyos-neae');
    await s.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Datos guardados')).toBeVisible();

    await expect(page.locator('.st-support .chip')).toHaveText(['NEAE · TDAH', 'Más tiempo', 'Por pasos']);
    await expect(page.locator('.st-support__notes')).toHaveText('Se sienta cerca de la pizarra. Puede usar calculadora.');
    expect(await support(teacher.api, pablo.id)).toMatchObject({
      neae: true, acnee: false, kind: 'TDAH', measures: ['mas_tiempo', 'enunciados_por_pasos'], notes: 'Se sienta cerca de la pizarra. Puede usar calculadora.',
    });

    // The roster: measures, never the diagnosis.
    await openRoster(page, c.id);
    const row = rosterRow(page, 'Benítez Ruiz, Pablo');
    await expect(row.locator('.chip')).toHaveText(['Más tiempo', 'Por pasos']);
    await expect(row).not.toContainText('TDAH');
    // The search: «NEAE», never the diagnosis.
    await page.goto('/clases');
    await page.getByRole('searchbox', { name: 'Buscar alumno o clase' }).fill('benitez');
    const hit = page.getByRole('button', { name: /Benítez Ruiz, Pablo/ });
    await expect(hit).toContainText('2.º ESO C · Mates · NEAE');
    await expect(hit).not.toContainText('TDAH');

    // Switching NEAE off takes the type away; a measure switched off goes.
    await openEdit(page, pablo.id, 'Pablo Benítez Ruiz');
    await expect(sw(page, 'Más tiempo en los exámenes')).toHaveAttribute('aria-checked', 'true');
    await sw(page, 'NEAE').click();
    await expect(editSheet(page).getByLabel('Tipo')).toHaveCount(0);
    await sw(page, 'Más tiempo en los exámenes').click();
    await editSheet(page).getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Datos guardados')).toBeVisible();
    await expect(page.locator('.st-support .chip')).toHaveText(['Por pasos']);
    expect(await support(teacher.api, pablo.id)).toMatchObject({ neae: false, acnee: false, kind: null, measures: ['enunciados_por_pasos'] });
  });

  test('alumnos-62 ACS (ESO): switching it on marks ACNEE; its level shows in the chips; ACNEE off takes the ACS away', async ({ page, teacher }, info) => {
    const [c] = teacher.courses;
    const lucia = c.students[2];
    const s = await openEdit(page, lucia.id, 'Lucía Castro León');
    const acs = sw(page, 'ACS · adaptación curricular significativa');
    await expect(acs).toHaveAttribute('aria-checked', 'false');
    await acs.click();
    await expect(sw(page, 'ACNEE')).toHaveAttribute('aria-checked', 'true');
    await expect(sw(page, 'NEAE')).toHaveAttribute('aria-checked', 'true');
    const level = s.getByLabel('Nivel de la ACS');
    await expect(s.getByText('El curso al que se refiere su adaptación curricular.')).toBeVisible();
    await level.fill('5.º Primaria');
    await shot(page, info, 'apoyos-acs');
    await s.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Datos guardados')).toBeVisible();
    await expect(page.locator('.st-support .chip')).toHaveText(['ACNEE', 'ACS 5.º Primaria']);
    expect(await support(teacher.api, lucia.id)).toMatchObject({ neae: true, acnee: true, measures: ['acs'], acs_level: '5.º Primaria' });
    await openRoster(page, c.id);
    await expect(rosterRow(page, 'Castro León, Lucía').locator('.chip')).toHaveText(['ACS 5.º Primaria']);

    // Without ACNEE there is no ACS.
    await openEdit(page, lucia.id, 'Lucía Castro León');
    await sw(page, 'ACNEE').click();
    await expect(acs).toHaveAttribute('aria-checked', 'false');
    await expect(editSheet(page).getByLabel('Nivel de la ACS')).toHaveCount(0);
    await expect(sw(page, 'NEAE')).toHaveAttribute('aria-checked', 'true');
    await editSheet(page).getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Datos guardados')).toBeVisible();
    await expect(page.locator('.st-support .chip')).toHaveText(['NEAE']);
    expect(await support(teacher.api, lucia.id)).toMatchObject({ neae: true, acnee: false, measures: [], acs_level: null });
  });

  test('alumnos-63 private notes: a section of the ficha with «Editar»; emptied, it goes', async ({ page, teacher }) => {
    const hugo = teacher.courses[0].students[3];
    const s = await openEdit(page, hugo.id, 'Hugo Díaz Soto');
    await expect(s.getByText('Solo las ves tú. No se usan para la IA.')).toBeVisible();
    await s.getByLabel('Notas privadas').fill('Hermana en 4.º ESO A.');
    await s.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Datos guardados')).toBeVisible();
    const priv = section(page, 'Notas privadas');
    await expect(priv).toContainText('Hermana en 4.º ESO A.');
    expect((await teacher.api.get(`/students/${hugo.id}`)).notes_text).toBe('Hermana en 4.º ESO A.');

    await priv.getByRole('button', { name: 'Editar' }).click();
    await expect(editSheet(page).getByLabel('Notas privadas')).toHaveValue('Hermana en 4.º ESO A.');
    await editSheet(page).getByLabel('Notas privadas').fill('');
    await editSheet(page).getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Datos guardados')).toBeVisible();
    await expect(section(page, 'Notas privadas')).toHaveCount(0);
    expect((await teacher.api.get(`/students/${hugo.id}`)).notes_text).toBeNull();
  });

  test('alumnos-64 a save that fails keeps the sheet and what was typed, with the reason', async ({ page, teacher }) => {
    const irene = teacher.courses[0].students[4];
    const s = await openEdit(page, irene.id, 'Irene Esteban Mora');
    await s.getByLabel('Nombre').fill('Irene María');
    await page.route(`**/api/students/${irene.id}`, (route) => (route.request().method() === 'PATCH'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"boom"}' }) : route.continue()), { times: 1 });
    await s.getByRole('button', { name: 'Guardar' }).click();
    await expect(s.getByRole('alert')).toHaveText('El servidor ha fallado. Inténtalo en un momento.');
    await expect(s.getByLabel('Nombre')).toHaveValue('Irene María');
    await s.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Datos guardados')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Irene María Esteban Mora' })).toBeVisible();
  });

  test('alumnos-65 edited details are not lost by Esc: it asks before discarding', async ({ page, teacher }) => {
    const adrian = teacher.courses[0].students[5];
    const s = await openEdit(page, adrian.id, 'Adrián Fuentes Vera');
    await s.getByLabel('Detalles de la adaptación').fill('Necesita más tiempo para leer.');
    await page.keyboard.press('Escape');
    await expect(sheet(page, 'Descartar los cambios')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('a Bachillerato class', () => {
  test.use({ teacherSpec: { courses: [{ ...MATES_2C, subject: 'Matemáticas I', group: '1º Bach B' }] } });

  test('alumnos-66 no ACS in Bachillerato: the switch is not offered and the hint does not mention it; the other measures are', async ({ page, teacher }) => {
    const marta = teacher.courses[0].students[0];
    const s = await openEdit(page, marta.id, 'Marta Alonso Gil');
    await expect(sw(page, 'Más tiempo en los exámenes')).toBeVisible();
    await expect(sw(page, 'Examen adaptado')).toBeVisible();
    await expect(sw(page, 'ACS · adaptación curricular significativa')).toHaveCount(0);
    await expect(s.getByText('La ACS es para alumnado ACNEE', { exact: false })).toHaveCount(0);
    // ACNEE is still a mark of its own.
    await sw(page, 'ACNEE').click();
    await sw(page, 'Examen adaptado').click();
    await sw(page, 'Lectura de enunciados en voz alta').click();
    await sw(page, 'Letra ampliada').click();
    await s.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Datos guardados')).toBeVisible();
    // Chips in the catalogue order, whatever the order they were switched on.
    await expect(page.locator('.st-support .chip')).toHaveText(['ACNEE', 'Letra ampliada', 'Lectura en voz alta', 'Examen adaptado']);
    expect(await support(teacher.api, marta.id)).toMatchObject({ acnee: true, measures: ['letra_ampliada', 'lectura_en_voz_alta', 'examen_adaptado'] });
  });
});
