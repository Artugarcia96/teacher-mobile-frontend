import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { shot, trackErrors } from '../helpers';
import { apiAs, FIRST_RENDER, goTo, LOGGED_OUT, loginAccount, openAs, openSettings, registerAccount, uniqueEmail, type Account } from './acceso.helpers';

// Acceso · primer día de una cuenta nueva: de «Crear cuenta» a un Hoy que sirve. Clases vacías que guían, «Nueva
// clase» con su horario, pegar la lista (o un archivo), la segunda clase del mismo grupo, el perfil con la comunidad
// autónoma y el curso escolar. Each test registers its own teacher through the API (the sign-up screen has its own
// spec), so nothing depends on another test. The demo's frozen clock: Thursday 19/11/2026, 10:40. No AI.

test.use({ storageState: LOGGED_OUT });

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
// Thursday = weekday 3; at 10:40 the 10:20–11:15 period is on.
const NOW_SLOT = { weekday: 3, start: '10:20', end: '11:15' };

interface Course { id: string; group: { id: string; name: string } }

async function createCourse(acc: Account, request: Parameters<typeof apiAs>[0], schedule = [NOW_SLOT]): Promise<Course> {
  return apiAs(request, acc.access_token).post('/courses', {
    subject: 'Matemáticas', short: 'Mates', color: 'teal', room: '204', schedule,
    new_group: { name: '2º ESO B', stage: 'eso', level: 2 },
  });
}

async function addStudents(acc: Account, request: Parameters<typeof apiAs>[0], course: Course, names: [string, string][]) {
  await apiAs(request, acc.access_token).post(`/groups/${course.group.id}/students`, {
    students: names.map(([last_name, first_name]) => ({ first_name, last_name })),
  });
}

const addSheet = (page: Page) => page.getByRole('dialog', { name: 'Añadir alumnos' });
// The list's sheet has no accessible name (BUG-HOY-07, hoy-79): found by what it says.
const listSheet = (page: Page) => page.getByRole('dialog').filter({ hasText: '2.º ESO B · Mates' });

test('acceso-30 · cuenta nueva: Hoy, Clases y Evaluar vacíos llevan a crear la primera clase', async ({ page, request }, info) => {
  const errors = trackErrors(page);
  const acc = await registerAccount(request, info, 'vacia');
  await openAs(page, acc, '/hoy');
  await expect(page.getByRole('heading', { name: 'Hoy' }).first()).toBeVisible();
  await expect(page.getByText('1.ª evaluación, semana 11')).toBeVisible();
  await expect(page.getByText('Aún no tienes clases')).toBeVisible();
  await expect(page.getByText('Crea tu primera clase con su horario y aparecerá aquí.')).toBeVisible();
  // Said once: no second «no classes» line for the day under it.
  await expect(page.getByText('Este día no tienes clases')).toHaveCount(0);
  await shot(page, info, 'acceso-30-hoy-empty');
  if (info.project.name === 'desktop') {
    const side = page.getByRole('complementary', { name: 'Navegación' });
    await expect(side.getByText('Mis clases')).toHaveCount(0);
    await expect(side.getByRole('link', { name: /Marta Ruiz Ortega/ })).toContainText('Ajustes');
  }

  await goTo(page, info, 'Clases');
  await expect(page.getByText('Crea tu primera clase')).toBeVisible();
  for (const step of ['Materia y grupo, por ejemplo «Matemáticas · 2.º ESO B».', 'Pega la lista de alumnos.', 'Marca el horario y la verás cada día en Hoy.']) {
    await expect(page.getByText(step)).toBeVisible();
  }
  // Nothing to search and no second «Nueva clase» while there are no classes.
  await expect(page.getByRole('searchbox', { name: 'Buscar alumno o clase' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Nueva clase' })).toHaveCount(0);
  await shot(page, info, 'acceso-30-clases-empty');

  await page.getByRole('button', { name: 'Crear clase' }).click();
  await expect(page).toHaveURL(/\/clases\?nueva=1$/);
  await expect(page.getByRole('dialog', { name: 'Nueva clase' })).toBeVisible();
  // Back (the phone's gesture) closes the sheet and stays in Clases.
  await page.goBack();
  await expect(page.getByRole('dialog', { name: 'Nueva clase' })).toBeHidden();
  await expect(page).toHaveURL(/\/clases$/);

  await goTo(page, info, 'Evaluar');
  await expect(page.getByText('Todo al día')).toBeVisible(FIRST_RENDER);
  await page.getByRole('link', { name: 'Ver clases' }).click();
  await expect(page).toHaveURL(/\/clases$/);
  expect(errors).toEqual([]);
});

// BUG acceso-B06: Hoy's empty state says «Crear clase» but only goes to Clases, where the same button has to be tapped
// again to open «Nueva clase».
test('acceso-43 · «Crear clase» en el Hoy vacío abre directamente «Nueva clase»', async ({ page, request }, info) => {
  test.fail(true, 'acceso-B06: TodayPage navega a /clases en vez de /clases?nueva=1');
  const acc = await registerAccount(request, info, 'crearhoy');
  await openAs(page, acc, '/hoy');
  await page.getByRole('button', { name: 'Crear clase' }).click();
  await expect(page.getByRole('dialog', { name: 'Nueva clase' })).toBeVisible();
});

test('acceso-31 · «Nueva clase»: materia, grupo, horario, aula y color; al crearla pide la lista', async ({ page, request }, info) => {
  const errors = trackErrors(page);
  const acc = await registerAccount(request, info, 'clase');
  await openAs(page, acc, '/clases?nueva=1');
  const sheet = page.getByRole('dialog', { name: 'Nueva clase' });

  // The main button says what is missing.
  await expect(sheet.getByRole('button', { name: 'Escribe la materia' })).toBeDisabled();
  await sheet.getByRole('button', { name: 'Matemáticas' }).click();
  await expect(sheet.getByLabel('Materia')).toHaveValue('Matemáticas');
  await expect(sheet.getByRole('button', { name: 'Matemáticas' })).toHaveAttribute('aria-pressed', 'true');
  await expect(sheet.getByRole('button', { name: 'Escribe el nombre del grupo' })).toBeDisabled();

  // The group's stage and year are read from its name.
  await sheet.getByLabel('Nombre del grupo').fill('2º ESO B');
  await expect(sheet.getByLabel('Etapa')).toHaveValue('eso');
  await expect(sheet.getByLabel('Curso')).toHaveValue('2');
  await sheet.getByLabel('Nombre del grupo').fill('1º Bach A');
  await expect(sheet.getByLabel('Etapa')).toHaveValue('bachillerato');
  await expect(sheet.getByLabel('Curso')).toHaveValue('1');
  await sheet.getByLabel('Nombre del grupo').fill('2º ESO B');

  // Timetable: tap the periods; a tap again takes it off; «Otra hora» adds a row of its own.
  const grid = sheet.getByRole('grid', { name: 'Horario semanal' });
  await expect(sheet.getByText('Toca las horas en las que das esta clase.')).toBeVisible();
  const cell = (name: string) => grid.getByRole('gridcell', { name, exact: true });
  await cell('lunes de 08:30 a 09:25').click();
  await cell('jueves de 10:20 a 11:15').click();
  await cell('martes de 12:40 a 13:35').click();
  await expect(sheet.getByText('3 sesiones a la semana')).toBeVisible();
  await cell('martes de 12:40 a 13:35').click();
  await expect(cell('martes de 12:40 a 13:35')).toHaveAttribute('aria-pressed', 'false');
  await expect(sheet.getByText('2 sesiones a la semana')).toBeVisible();

  // «Otra hora» adds a period to all her classes; the button says what is wrong with the times.
  await sheet.getByRole('button', { name: 'Otra hora' }).click();
  await sheet.getByLabel('Empieza').fill('15:30');
  await sheet.getByLabel('Termina').fill('15:00');
  await expect(sheet.getByRole('button', { name: 'Termina antes de empezar' })).toBeDisabled();
  await sheet.getByLabel('Termina').fill('16:25');
  await sheet.getByRole('button', { name: 'Añadir hora' }).click();
  await expect(page.getByText('Hora 15:30–16:25 añadida a tus clases')).toBeVisible();
  await cell('viernes de 15:30 a 16:25').click();
  await expect(sheet.getByText('3 sesiones a la semana')).toBeVisible();

  await sheet.getByLabel('Aula').fill('204');
  const colors = sheet.getByRole('radiogroup', { name: 'Color' });
  await expect(colors.getByRole('radio', { name: 'Verde azulado' })).toHaveAttribute('aria-checked', 'true');
  await colors.getByRole('radio', { name: 'Índigo' }).click();
  await expect(colors.getByRole('radio', { name: 'Índigo' })).toHaveAttribute('aria-checked', 'true');
  await shot(page, info, 'acceso-31-new-class');

  await sheet.getByRole('button', { name: 'Crear clase' }).click();
  await expect(page.getByText('Clase creada')).toBeVisible();
  await expect(page).toHaveURL(/\/clases\/[^/]+\/alumnos\?anadir=1$/);
  await expect(addSheet(page)).toBeVisible();
  await expect(addSheet(page)).toContainText('2.º ESO B');

  // Saved as chosen.
  const courses = await apiAs(request, acc.access_token).get('/courses');
  expect(courses).toHaveLength(1);
  expect(courses[0]).toMatchObject({
    subject: 'Matemáticas', short: 'Mates', room: '204', color: 'indigo', student_count: 0,
    group: { name: '2º ESO B', stage: 'eso', level: 2 },
    schedule: [
      { weekday: 0, start: '08:30', end: '09:25' },
      { weekday: 3, start: '10:20', end: '11:15' },
      { weekday: 4, start: '15:30', end: '16:25' },
    ],
  });
  expect(page.url()).toContain(`/clases/${courses[0].id}/`);
  expect(errors).toEqual([]);
});

test('acceso-32 · pegar la lista: se limpia, se corrige un nombre, se quita otro y quedan por apellidos', async ({ page, request }, info) => {
  const errors = trackErrors(page);
  const acc = await registerAccount(request, info, 'lista');
  const course = await createCourse(acc, request);
  await openAs(page, acc, `/clases/${course.id}/alumnos`);
  await expect(page.getByText('Esta clase aún no tiene alumnos')).toBeVisible();
  await page.getByRole('button', { name: 'Añadir alumnos' }).click();
  const sheet = addSheet(page);
  await expect(sheet.getByRole('button', { name: 'Pega al menos un nombre' })).toBeDisabled();

  // Copied from a PDF of the school platform: a title line, row numbers, capitals, a compound name, a repeated line.
  await sheet.getByLabel('Un alumno por línea').fill([
    'IES Miguel de Cervantes · 2º ESO B · Curso 2026-2027',
    '1 GARCÍA LÓPEZ, ANA',
    '2 Pablo Ruiz Serrano',
    '3 María José Fernández Gil',
    '4 DEL RÍO BLANCO, JOSÉ MARÍA',
    '5 García López, Ana',
    '6 Núñez Castro, Iker',
  ].join('\n'));
  await expect(sheet.getByText('5 alumnos · Apellidos, Nombre')).toBeVisible();
  await expect(sheet.getByText('Línea 1 ignorada: «IES Miguel de Cervantes · 2º ESO B · Cur»')).toBeVisible();
  await expect(sheet.getByText('«Ana García López» aparece 2 veces; se añade una.')).toBeVisible();
  for (const n of ['García López, Ana', 'Ruiz Serrano, Pablo', 'Fernández Gil, María José', 'del Río Blanco, José María', 'Núñez Castro, Iker']) {
    await expect(sheet.getByRole('button', { name: new RegExp(n) })).toBeVisible();
  }
  await shot(page, info, 'acceso-32-paste-preview');

  // Correct one split, drop another.
  await sheet.getByRole('button', { name: /Ruiz Serrano, Pablo/ }).click();
  await sheet.getByLabel('Apellidos').fill('Ruiz');
  await sheet.getByLabel('Nombre').fill('Pablo Serrano');
  await sheet.getByLabel('Nombre').press('Enter');
  await expect(sheet.getByRole('button', { name: /Ruiz, Pablo Serrano/ })).toBeVisible();
  await sheet.getByRole('button', { name: /Núñez Castro, Iker/ }).click();
  await sheet.getByRole('button', { name: 'Quitar' }).click();
  await expect(sheet.getByText('4 alumnos · Apellidos, Nombre')).toBeVisible();
  await expect(sheet.getByRole('button', { name: /Núñez Castro/ })).toHaveCount(0);

  await sheet.getByRole('button', { name: 'Añadir 4 alumnos' }).click();
  await expect(page.getByText('4 alumnos añadidos')).toBeVisible();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`/clases/${course.id}/alumnos$`));
  const roster = page.getByRole('main').getByRole('link');
  await expect(roster.filter({ hasText: ', ' })).toHaveText([
    /del Río Blanco, José María/, /Fernández Gil, María José/, /García López, Ana/, /Ruiz, Pablo Serrano/,
  ]);
  await expect(page.getByRole('heading', { name: '4 alumnos' })).toBeVisible();

  // Saved, and the same after a reload.
  const saved: { first_name: string; last_name: string }[] = await apiAs(request, acc.access_token).get(`/groups/${course.group.id}/students`);
  expect(saved.map((s) => `${s.last_name}, ${s.first_name}`).sort()).toEqual(
    ['Fernández Gil, María José', 'García López, Ana', 'Ruiz, Pablo Serrano', 'del Río Blanco, José María'].sort());
  await page.reload();
  await expect(page.getByRole('heading', { name: '4 alumnos' })).toBeVisible();

  // Adding the same names again adds nobody and says so.
  await page.getByRole('button', { name: 'Añadir alumnos' }).click();
  await addSheet(page).getByLabel('Un alumno por línea').fill('García López, Ana');
  await addSheet(page).getByRole('button', { name: 'Añadir 1 alumno' }).click();
  await expect(page.getByText('Todos ya estaban en el grupo')).toBeVisible();
  await expect(page.getByRole('heading', { name: '4 alumnos' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('acceso-33 · la lista desde un archivo (Excel y CSV) llena la misma vista previa', async ({ page, request }, info) => {
  const errors = trackErrors(page);
  const acc = await registerAccount(request, info, 'archivo');
  const course = await createCourse(acc, request);
  await openAs(page, acc, `/clases/${course.id}/alumnos?anadir=1`);
  const sheet = addSheet(page);
  await expect(sheet.getByText('(CSV, TXT o Excel)')).toBeVisible();

  // Excel from the school platform: a title, an empty row, a header with «Alumno/a», dates and «Repite».
  const chooser = page.waitForEvent('filechooser');
  await sheet.getByRole('button', { name: 'o elige un archivo' }).click();
  await (await chooser).setFiles(`${FIXTURES}alumnado-2eso-b.xlsx`);
  await expect(sheet.getByText('· alumnado-2eso-b.xlsx')).toBeVisible();
  await expect(sheet.getByText('3 alumnos · Apellidos, Nombre')).toBeVisible();
  for (const n of ['Castillo Moreno, Lucía', 'Domínguez Vera, Hugo', 'Ortega Sanz, Candela']) {
    await expect(sheet.getByRole('button', { name: new RegExp(n) })).toBeVisible();
  }
  await shot(page, info, 'acceso-33-xlsx-preview');

  // Typing replaces the file's preview; choosing a CSV (Excel in Spanish: «;», BOM) replaces it again.
  await sheet.getByLabel('Un alumno por línea').fill('Vidal Ruiz, Nuria');
  await expect(sheet.getByText('1 alumno · Apellidos, Nombre')).toBeVisible();
  await expect(sheet.getByText('(CSV, TXT o Excel)')).toBeVisible();
  const chooser2 = page.waitForEvent('filechooser');
  await sheet.getByRole('button', { name: 'o elige un archivo' }).click();
  await (await chooser2).setFiles(`${FIXTURES}alumnado-2eso-b.csv`);
  await expect(sheet.getByText('2 alumnos · Apellidos, Nombre')).toBeVisible();
  await expect(sheet.getByRole('button', { name: /Benítez Rubio, Marcos/ })).toBeVisible();
  await expect(sheet.getByRole('button', { name: /Iglesias Prieto, Nerea/ })).toBeVisible();

  await sheet.getByRole('button', { name: 'Añadir 2 alumnos' }).click();
  await expect(page.getByText('2 alumnos añadidos')).toBeVisible();
  const saved: { first_name: string; last_name: string }[] = await apiAs(request, acc.access_token).get(`/groups/${course.group.id}/students`);
  expect(saved.map((s) => `${s.last_name}, ${s.first_name}`).sort()).toEqual(['Benítez Rubio, Marcos', 'Iglesias Prieto, Nerea']);
  expect(errors).toEqual([]);
});

// BUG acceso-B03: rows copied from a table (Séneca, Raíces, a spreadsheet: tab-separated) skip the title line without a
// word, while the same list pasted as plain lines says «Línea 1 ignorada: …» (docs/PRODUCT.md §4.1).
test('acceso-34 · filas copiadas de una tabla (con tabuladores) avisan de la línea de título que se salta', async ({ page, request }, info) => {
  test.fail(true, 'acceso-B03: roster.parse_rows salta las líneas de título sin aviso');
  const acc = await registerAccount(request, info, 'tabla');
  const course = await createCourse(acc, request);
  await openAs(page, acc, `/clases/${course.id}/alumnos?anadir=1`);
  const sheet = addSheet(page);
  await sheet.getByLabel('Un alumno por línea').fill([
    'IES Miguel de Cervantes · 2º ESO B · Curso 2026-2027',
    '1\tGARCÍA LÓPEZ, ANA\t12/03/2012\tNo',
    '2\tRUIZ SERRANO, PABLO\t02/05/2012\tNo',
  ].join('\n'));
  await expect(sheet.getByText('2 alumnos · Apellidos, Nombre')).toBeVisible();
  await expect(sheet.getByRole('button', { name: /García López, Ana/ })).toBeVisible();
  await expect(sheet.getByText(/Línea 1 ignorada/)).toBeVisible();
});

// «Añadir alumnos» holds a pasted list of 25-30 names: a stray tap on the scrim, Esc or the back gesture asks first,
// like Anotar or Nueva actividad («Descartar los cambios»).
test('acceso-35 · «Añadir alumnos» no pierde la lista pegada por un toque fuera, Esc o atrás', async ({ page, request }, info) => {
  const acc = await registerAccount(request, info, 'perder');
  const course = await createCourse(acc, request);
  await openAs(page, acc, `/clases/${course.id}/alumnos`);
  await page.getByRole('button', { name: 'Añadir alumnos' }).click();
  await addSheet(page).getByLabel('Un alumno por línea').fill('García López, Ana\nRuiz Serrano, Pablo\nNúñez Castro, Iker');
  await expect(addSheet(page).getByText('3 alumnos · Apellidos, Nombre')).toBeVisible();
  // The phone's back gesture; Esc on a computer.
  if (info.project.name === 'mobile') await page.goBack();
  else await page.keyboard.press('Escape');
  const ask = page.getByRole('dialog', { name: 'Descartar los cambios' });
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Cancelar' }).click();
  await expect(addSheet(page).getByLabel('Un alumno por línea')).toHaveValue(/Núñez Castro, Iker/);
});

// BUG acceso-B02 (same): «Nueva clase» holds the subject, the group and a timetable tapped cell by cell; Esc, the back
// gesture or a tap on the scrim closes it without asking and all of it is gone.
test('acceso-42 · «Nueva clase» no pierde la materia, el grupo y el horario por un toque fuera, Esc o atrás', async ({ page, request }, info) => {
  test.fail(true, 'acceso-B02: NewCourseSheet no pasa `dirty` a Sheet');
  const acc = await registerAccount(request, info, 'perderclase');
  await openAs(page, acc, '/clases?nueva=1');
  const sheet = page.getByRole('dialog', { name: 'Nueva clase' });
  await sheet.getByRole('button', { name: 'Matemáticas' }).click();
  await sheet.getByLabel('Nombre del grupo').fill('2º ESO B');
  await sheet.getByRole('grid', { name: 'Horario semanal' }).getByRole('gridcell', { name: 'jueves de 10:20 a 11:15', exact: true }).click();
  if (info.project.name === 'mobile') await page.goBack();
  else await page.keyboard.press('Escape');
  const ask = page.getByRole('dialog', { name: 'Descartar los cambios' });
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Cancelar' }).click();
  await expect(sheet.getByLabel('Nombre del grupo')).toHaveValue('2º ESO B');
});

test('acceso-36 · con horario y alumnos, Hoy ya sirve: la clase de ahora, su lista y nada pendiente de antes', async ({ page, request }, info) => {
  const errors = trackErrors(page);
  const acc = await registerAccount(request, info, 'hoy');
  const course = await createCourse(acc, request);
  await addStudents(acc, request, course, [['García López', 'Ana'], ['Ruiz Serrano', 'Pablo'], ['Núñez Castro', 'Iker']]);
  await openAs(page, acc, '/hoy');

  const now = page.getByRole('region', { name: 'Ahora · quedan 35 min' });
  await expect(now).toBeVisible();
  await expect(now).toContainText('2.º ESO B · Mates');
  await expect(now).toContainText('Aula 204 · 10:20–11:15');
  // The class is on: its list is not owed yet, so the agenda row only says what and where.
  const agenda = page.getByRole('button', { name: /10:20.*2\.º ESO B · Mates/ });
  await expect(agenda).not.toContainText('Lista');
  // The class was created today: no list of earlier days is owed; nobody to watch yet.
  await expect(page.getByText('No hay listas, correcciones ni comentarios pendientes.')).toBeVisible();
  await expect(page.getByText('Nadie a vigilar')).toBeVisible();

  // The list has the three of them, all present by default; one absence and «Cerrar lista».
  await now.getByRole('button', { name: 'Pasar lista' }).click();
  const list = listSheet(page);
  await expect(list.getByText('Toca a quien falte. Otro toque: retraso.')).toBeVisible();
  await expect(list).toContainText('3 presentes');
  await list.getByRole('button', { name: /Núñez Castro, Iker/ }).click();
  await expect(list).toContainText('2 presentes · 1 falta');
  await shot(page, info, 'acceso-36-first-list');
  await list.getByRole('button', { name: 'Cerrar lista' }).click();
  await expect(page.getByText('Lista pasada · 2 presentes · 1 falta')).toBeVisible();
  await expect(list).toBeHidden();
  await expect(agenda).toContainText('Lista pasada');

  const day = await apiAs(request, acc.access_token).get('/today');
  expect(day.sessions[0]).toMatchObject({ course: { id: course.id }, status: 'now', attendance: { taken: true } });
  if (info.project.name === 'desktop') {
    await expect(page.getByRole('complementary', { name: 'Navegación' }).getByRole('link', { name: '2.º ESO B · Mates' })).toBeVisible();
  }
  await goTo(page, info, 'Clases');
  await expect(page.getByRole('link', { name: /Matemáticas · 2\.º ESO B/ })).toContainText('3 alumnos');
  expect(errors).toEqual([]);
});

// BUG acceso-B04 (P1): «Pasar lista» of a class without students, then «Añadir alumnos», then «Pasar lista» again for
// the same session: the sheet starts from the cached empty list, the refetch brings the new students and the whole
// app goes blank (TypeError: Cannot read properties of undefined (reading 'status'), TakeAttendanceSheet.tsx).
test('acceso-37 · una clase sin alumnos: «Pasar lista» lleva a añadirlos y, al volver, la lista ya los tiene', async ({ page, request }, info) => {
  test.fail(true, 'acceso-B04: TakeAttendanceSheet no incorpora los alumnos que llegan después de la primera carga y la app se queda en blanco');
  const errors = trackErrors(page);
  const acc = await registerAccount(request, info, 'sinlista');
  await createCourse(acc, request);
  await openAs(page, acc, '/hoy');
  const now = page.getByRole('region', { name: 'Ahora · quedan 35 min' });
  await now.getByRole('button', { name: 'Pasar lista' }).click();
  const list = listSheet(page);
  await expect(list.getByText('Esta clase aún no tiene alumnos.')).toBeVisible();
  await list.getByRole('button', { name: 'Añadir alumnos' }).click();
  await expect(page).toHaveURL(/\/alumnos\?anadir=1$/);
  await addSheet(page).getByLabel('Un alumno por línea').fill('García López, Ana\nRuiz Serrano, Pablo\nNúñez Castro, Iker');
  await addSheet(page).getByRole('button', { name: 'Añadir 3 alumnos' }).click();
  await expect(page.getByText('3 alumnos añadidos')).toBeVisible();

  await goTo(page, info, 'Hoy');
  await now.getByRole('button', { name: 'Pasar lista' }).click();
  await expect(list.getByText('Toca a quien falte. Otro toque: retraso.')).toBeVisible();
  await expect(list).toContainText('3 presentes');
  expect(errors).toEqual([]);
});

test('acceso-38 · la segunda clase del mismo grupo reutiliza sus alumnos y su horario marca lo ocupado', async ({ page, request }, info) => {
  const errors = trackErrors(page);
  const acc = await registerAccount(request, info, 'segunda');
  const first = await createCourse(acc, request, [NOW_SLOT, { weekday: 0, start: '09:00', end: '10:00' }]);
  await addStudents(acc, request, first, [['García López', 'Ana'], ['Ruiz Serrano', 'Pablo'], ['Núñez Castro', 'Iker']]);
  await openAs(page, acc, '/clases');
  await page.getByRole('button', { name: 'Nueva clase' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nueva clase' });
  await sheet.getByRole('button', { name: 'Física y Química' }).click();
  await expect(sheet.getByLabel('Materia')).toHaveValue('Física y Química');

  await expect(sheet.getByRole('button', { name: 'Elige un grupo' })).toBeDisabled();
  await sheet.getByRole('button', { name: '2.º ESO B' }).click();
  await expect(sheet.getByText('Ya tiene 3 alumnos: se usarán en esta clase. ¿Solo algunos? Elige «Nuevo grupo» y añádelos desde 2.º ESO B.')).toBeVisible();

  // The rows are the school's periods plus the teacher's own hours (09:00–10:00); every cell that overlaps her other
  // class is taken, named by its group, and cannot be chosen.
  const grid = sheet.getByRole('grid', { name: 'Horario semanal' });
  await expect(grid.getByRole('gridcell', { name: 'lunes de 09:00 a 10:00: Matemáticas · 2.º ESO B' })).toHaveText('2 B');
  await expect(grid.getByRole('gridcell', { name: 'lunes de 08:30 a 09:25: Matemáticas · 2.º ESO B' })).toHaveAttribute('aria-disabled', 'true');
  await expect(grid.getByRole('gridcell', { name: 'martes de 08:30 a 09:25', exact: true })).toHaveAttribute('aria-pressed', 'false');
  const taken = grid.getByRole('gridcell', { name: 'jueves de 10:20 a 11:15: Matemáticas · 2.º ESO B' });
  await expect(taken).toHaveAttribute('aria-disabled', 'true');
  await taken.click({ force: true }); // a tap on it does nothing
  await expect(sheet.getByText('Toca las horas en las que das esta clase.')).toBeVisible();
  await grid.getByRole('gridcell', { name: 'miércoles de 09:00 a 10:00', exact: true }).click();
  await expect(sheet.getByText('1 sesión a la semana')).toBeVisible();
  await expect(sheet.getByRole('radiogroup', { name: 'Color' }).getByRole('radio', { name: 'Ocre' })).toHaveAttribute('aria-checked', 'true');
  await shot(page, info, 'acceso-38-second-class');

  await sheet.getByRole('button', { name: 'Crear clase' }).click();
  await expect(page.getByText('Clase creada')).toBeVisible();
  // It already has students: no «Añadir alumnos» sheet.
  await expect(page).toHaveURL(/\/clases\/[^/]+\/alumnos$/);
  await expect(addSheet(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '3 alumnos' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: /García López, Ana/ })).toBeVisible();

  const courses: { subject: string; group: { id: string }; student_count: number }[] = await apiAs(request, acc.access_token).get('/courses');
  expect(courses.map((c) => [c.subject, c.group.id, c.student_count])).toEqual(expect.arrayContaining([
    ['Matemáticas', first.group.id, 3], ['Física y Química', first.group.id, 3],
  ]));
  expect(errors).toEqual([]);
});

test('acceso-39 · perfil de la cuenta nueva: nombre, centro y comunidad autónoma', async ({ page, request }, info) => {
  const errors = trackErrors(page);
  const acc = await registerAccount(request, info, 'perfil');
  await openAs(page, acc, '/hoy');
  await openSettings(page, info, acc.name);

  await expect(page.getByLabel('Nombre')).toHaveValue('Marta Ruiz Ortega');
  await expect(page.getByRole('main').getByText(acc.email)).toBeVisible();
  const region = page.getByLabel('Comunidad autónoma');
  await expect(region).toHaveValue('');
  await expect(page.getByText('Sin guardar')).toHaveCount(0);

  // A change shows the bar; «Descartar» puts everything back.
  await page.getByLabel('Centro').fill('IES Otro');
  await expect(page.getByText('Sin guardar')).toBeVisible();
  await page.getByRole('button', { name: 'Descartar' }).click();
  await expect(page.getByLabel('Centro')).toHaveValue('');
  await expect(page.getByText('Sin guardar')).toHaveCount(0);

  // An empty name cannot be saved, and the button says why.
  await page.getByLabel('Nombre').fill(' ');
  await expect(page.getByRole('button', { name: 'Escribe tu nombre' })).toBeDisabled();
  await page.getByLabel('Nombre').fill('Marta Ruiz');

  await page.getByLabel('Centro').fill('IES Miguel de Cervantes');
  await region.selectOption({ label: 'Comunidad de Madrid' });
  await expect(region).toHaveValue('MD');
  await region.selectOption({ label: 'Andalucía' });
  await expect(region).toHaveValue('AN');
  await shot(page, info, 'acceso-39-profile');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Cambios guardados').last()).toBeVisible();
  await expect(page.getByText('Sin guardar')).toHaveCount(0);

  const me = await apiAs(request, acc.access_token).get('/me');
  expect(me.teacher).toMatchObject({ name: 'Marta Ruiz', school: 'IES Miguel de Cervantes', region: 'AN' });
  await page.reload();
  await expect(page.getByLabel('Centro')).toHaveValue('IES Miguel de Cervantes');
  await expect(region).toHaveValue('AN');
  if (info.project.name === 'desktop') {
    await expect(page.getByRole('complementary', { name: 'Navegación' }).getByRole('link', { name: /Marta Ruiz/ }))
      .toContainText('IES Miguel de Cervantes');
  }
  expect(errors).toEqual([]);
});

test('acceso-40 · curso escolar de la cuenta nueva: evaluaciones y festivos de España; se ajusta una fecha y un festivo propio vacía Hoy', async ({ page, request }, info) => {
  const errors = trackErrors(page);
  const acc = await registerAccount(request, info, 'curso');
  await createCourse(acc, request);
  await openAs(page, acc, '/ajustes');

  // Dates read in Spanish whatever the browser; the native picker underneath holds the ISO date.
  const date = (label: string) => page.locator('.datefield').filter({ has: page.getByLabel(label, { exact: true }) });
  await expect(page.getByLabel('1.ª evaluación: primer día')).toHaveValue('2026-09-08', FIRST_RENDER);
  await expect(date('1.ª evaluación: primer día')).toContainText('8 sept 2026');
  await expect(page.getByLabel('1.ª evaluación: primer día')).toHaveValue('2026-09-08');
  await expect(date('1.ª evaluación: último día')).toContainText('22 dic 2026');
  await expect(date('2.ª evaluación: primer día')).toContainText('8 ene 2027');
  await expect(date('3.ª evaluación: último día')).toContainText('19 jun 2027');
  for (const [label, when] of [['Fiesta Nacional', '12 oct'], ['Todos los Santos', '1 nov'], ['Constitución e Inmaculada', '6 dic'],
    ['Navidad', '23 dic'], ['Semana Santa', '19 mar'], ['Día del Trabajo', '1 may']]) {
    await expect(page.getByRole('button', { name: `Editar ${label}` })).toContainText(when);
  }

  // The region's calendar ends the first term earlier: the date is edited in place.
  await page.getByLabel('1.ª evaluación: último día').fill('2026-12-18');
  await expect(date('1.ª evaluación: último día')).toContainText('18 dic 2026');
  await expect(page.getByText('Sin guardar')).toBeVisible();

  // The school's own day off, today: saved with the term, and Hoy has no class.
  await page.getByRole('button', { name: 'Añadir festivo' }).click();
  const editor = page.locator('.set-holiday');
  await editor.getByLabel('Motivo').fill('Jornada de puertas abiertas');
  await editor.locator('input[type=date]').first().fill('2026-11-19');
  await editor.getByRole('button', { name: 'Listo' }).click();
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Cambios guardados').last()).toBeVisible();
  const year = await apiAs(request, acc.access_token).get('/school-year');
  expect(year.label).toBe('2026-2027');
  expect(year.terms[0]).toEqual({ n: 1, start: '2026-09-08', end: '2026-12-18' });
  expect(year.holidays).toContainEqual({ label: 'Jornada de puertas abiertas', start: '2026-11-19', end: '2026-11-19' });
  await page.reload();
  await expect(date('1.ª evaluación: último día')).toContainText('18 dic 2026');
  await expect(page.getByRole('button', { name: 'Editar Jornada de puertas abiertas' })).toContainText('19 nov');

  await page.goto('/hoy');
  await expect(page.getByText('Sin clases · Jornada de puertas abiertas')).toBeVisible();
  await expect(page.getByText('Día no lectivo en tu calendario escolar.')).toBeVisible();
  await expect(page.getByRole('region', { name: /^Ahora/ })).toHaveCount(0);
  await shot(page, info, 'acceso-40-holiday-today');
  expect(errors).toEqual([]);
});

// BUG acceso-B10: when today itself is a holiday, Hoy's empty state offers «Volver a hoy», which does nothing (the
// «Sin clases este día» state already hides it on today).
test('acceso-44 · un festivo hoy no ofrece «Volver a hoy» estando ya en hoy', async ({ page, request }, info) => {
  test.fail(true, 'acceso-B10: TodayPage muestra «Volver a hoy» en un día no lectivo aunque sea hoy');
  const acc = await registerAccount(request, info, 'festivohoy');
  const api = apiAs(request, acc.access_token);
  await createCourse(acc, request);
  const year = await api.get('/school-year');
  await api.put('/school-year', {
    label: year.label, terms: year.terms,
    holidays: [...year.holidays, { label: 'Jornada de puertas abiertas', start: '2026-11-19', end: '2026-11-19' }],
  });
  await openAs(page, acc, '/hoy');
  await expect(page.getByText('Sin clases · Jornada de puertas abiertas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Volver a hoy' })).toHaveCount(0);
});

test('acceso-41 · recorrido completo: de la landing a pasar la primera lista, solo con la interfaz', async ({ page, request }, info) => {
  const errors = trackErrors(page);
  const email = uniqueEmail(info, 'recorrido');
  await page.goto('/landing/index.html');
  await page.getByRole('banner').getByRole('link', { name: 'Entrar' }).click();
  await page.getByRole('group', { name: 'Acceso' }).getByRole('button', { name: 'Crear cuenta' }).click();
  await page.getByLabel('Nombre').fill('Marta Ruiz Ortega');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill('clave-segura-1');
  await page.locator('form').getByRole('button', { name: 'Crear cuenta' }).click();

  const sheet = page.getByRole('dialog', { name: 'Nueva clase' });
  await sheet.getByRole('button', { name: 'Matemáticas' }).click();
  await sheet.getByLabel('Nombre del grupo').fill('2º ESO B');
  await sheet.getByRole('grid', { name: 'Horario semanal' }).getByRole('gridcell', { name: 'jueves de 10:20 a 11:15', exact: true }).click();
  await sheet.getByLabel('Aula').fill('204');
  await sheet.getByRole('button', { name: 'Crear clase' }).click();

  await addSheet(page).getByLabel('Un alumno por línea').fill(
    'García López, Ana\nRuiz Serrano, Pablo\nFernández Gil, María José\nNúñez Castro, Iker\nOrtega Sanz, Candela');
  await addSheet(page).getByRole('button', { name: 'Añadir 5 alumnos' }).click();
  await expect(page.getByText('5 alumnos añadidos')).toBeVisible();
  await expect(page.getByRole('heading', { name: '5 alumnos' })).toBeVisible();

  await goTo(page, info, 'Hoy');
  const now = page.getByRole('region', { name: 'Ahora · quedan 35 min' });
  await expect(now).toContainText('2.º ESO B · Mates');
  await now.getByRole('button', { name: 'Pasar lista' }).click();
  const list = listSheet(page);
  await expect(list).toContainText('5 presentes');
  await list.getByRole('button', { name: 'Cerrar lista' }).click();
  await expect(page.getByText('Lista pasada · 5 presentes')).toBeVisible();
  await shot(page, info, 'acceso-41-first-day-done');

  const t = await loginAccount(request, email, 'clave-segura-1');
  const day = await apiAs(request, t.access_token).get('/today');
  expect(day.sessions).toHaveLength(1);
  expect(day.sessions[0]).toMatchObject({ start: '10:20', status: 'now', attendance: { taken: true } });
  expect(errors).toEqual([]);
});
