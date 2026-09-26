import { CLASS, expect, MON, nowCard, openHoy, section, shot, test, toast, type CourseSpec } from './hoy-helpers';

// «A vigilar» in Hoy (docs/PRODUCT.md §4.2): recent facts of the students of the day's classes, at most 4 with
// «Ver todos»; each one opens its reasons with «Ya lo sé» (hidden until something new) and «Avisar a la familia»
// (a message made of the facts: «Copiar y guardar» copies it, keeps it as a «Familia» note and counts as «Ya lo sé»).
// Each test is a teacher of its own whose students have incidents (2 in 7 days is a fact to watch).

const HUGO = 3; // Díaz Soto, Hugo
const incidents: CourseSpec['incidents'] = [
  { student: HUGO, date: '2026-11-17', text: 'Ha insultado a un compañero' },
  { student: HUGO, date: '2026-11-18', text: 'No deja de hablar en clase' },
];
const watchRow = (page: import('@playwright/test').Page, name: string) =>
  section(page, 'A vigilar').locator('.list').getByRole('button', { name: new RegExp(`^${name}`) });

test.describe('hoy · a vigilar', () => {
  test.use({ worldSpec: { courses: [{ ...CLASS, incidents }] } });

  test('hoy-60 · a student to watch: reason and date, the sheet with its reasons, «Ver ficha»', async ({ page, world }, info) => {
    const hugo = world.courses[0].students[HUGO];
    await openHoy(page);
    const row = watchRow(page, 'Hugo Díaz Soto');
    await expect(row).toContainText('2.º ESO C · 2 incidencias en 7 días');
    await row.click();
    const sheet = page.getByRole('dialog', { name: 'Hugo Díaz Soto' });
    await expect(sheet.getByText('Matemáticas · 2.º ESO C · último hecho: 18 nov')).toBeVisible();
    await expect(sheet.getByText('2 incidencias en 7 días')).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Ya lo sé' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Avisar a la familia' })).toBeVisible();
    await shot(page, info, '60-watch');
    await sheet.getByRole('link', { name: /^Ver ficha/ }).click();
    await expect(page).toHaveURL(new RegExp(`/alumnos/${hugo.id}$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Hugo Díaz Soto' })).toBeVisible();
  });

  test('hoy-61 · «Ya lo sé» hides the student until there is something new', async ({ page, world }) => {
    await openHoy(page);
    await watchRow(page, 'Hugo Díaz Soto').click();
    await page.getByRole('dialog', { name: 'Hugo Díaz Soto' }).getByRole('button', { name: 'Ya lo sé' }).click();
    await expect(toast(page, 'Hugo no volverá a salir en Hoy hasta que haya algo nuevo')).toBeVisible();
    await expect(watchRow(page, 'Hugo Díaz Soto')).toHaveCount(0);
    await expect(section(page, 'A vigilar').getByText('Nadie a vigilar')).toBeVisible();
    expect(await world.api.get('/watch')).toEqual([]);
    await page.reload();
    await expect(section(page, 'A vigilar').getByText('Nadie a vigilar')).toBeVisible();

    // Something new: another incident today, written from «Anotar».
    await nowCard(page).getByRole('button', { name: 'Anotar', exact: true }).click();
    const note = page.getByRole('dialog', { name: 'Anotar' });
    await note.getByRole('group', { name: 'Tipo' }).getByRole('button', { name: 'Incidencia' }).click();
    await note.getByRole('button', { name: 'Díaz, Hugo' }).click();
    await note.getByRole('textbox', { name: 'Texto' }).fill('Se ha levantado sin permiso');
    await note.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Incidencia guardada')).toBeVisible();
    await expect(watchRow(page, 'Hugo Díaz Soto')).toContainText('3 incidencias en 7 días');
  });

  test('hoy-62 · «Avisar a la familia»: the facts, edited, copied and kept as a «Familia» note', async ({ page, context, world }, info) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const hugo = world.courses[0].students[HUGO];
    await openHoy(page);
    await watchRow(page, 'Hugo Díaz Soto').click();
    await page.getByRole('dialog', { name: 'Hugo Díaz Soto' }).getByRole('button', { name: 'Avisar a la familia' }).click();
    const sheet = page.getByRole('dialog', { name: 'Avisar a la familia' });
    await expect(sheet.getByText('Hugo Díaz Soto · Matemáticas · 2.º ESO C')).toBeVisible();
    const text = sheet.getByRole('textbox', { name: 'Mensaje para la familia' });
    const facts = '· Incidencias: 17 de noviembre, «Ha insultado a un compañero»; 18 de noviembre, «No deja de hablar en clase».';
    await expect(text).toHaveValue(new RegExp([
      '^Buenos días:', 'Les escribo sobre Hugo, de Matemáticas \\(2\\.º ESO C\\), para que estén al tanto:',
      facts.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'Un saludo,\\nElena Prieto$',
    ].join('[\\s\\S]*')));
    await expect(sheet.getByText(/Los hechos quedan como observación «Familia» y Hugo sale de «A vigilar»/)).toBeVisible();
    const edited = (await text.inputValue()).replace(facts, `${facts}\n· Hoy ha vuelto a interrumpir la clase.`);
    await text.fill(edited);
    await shot(page, info, '62-family');
    await sheet.getByRole('button', { name: 'Copiar y guardar' }).click();
    await expect(toast(page, 'Mensaje copiado y guardado en observaciones')).toBeVisible();
    await expect(sheet).toBeHidden();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(edited);
    await expect(watchRow(page, 'Hugo Díaz Soto')).toHaveCount(0);

    const notes = await world.api.get(`/notes?student_id=${hugo.id}`);
    const family = notes.find((n: { kind: string }) => n.kind === 'family');
    expect(family.text).toBe('Aviso a la familia: Incidencias: 17 de noviembre, «Ha insultado a un compañero»; 18 de noviembre, '
      + '«No deja de hablar en clase». Hoy ha vuelto a interrumpir la clase.');
    expect(await world.api.get('/watch')).toEqual([]);
  });

  test('hoy-63 · when the phone does not let it copy, it says so and keeps the sheet to copy by hand', async ({ page, world }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) } });
    });
    await openHoy(page);
    await watchRow(page, 'Hugo Díaz Soto').click();
    await page.getByRole('dialog', { name: 'Hugo Díaz Soto' }).getByRole('button', { name: 'Avisar a la familia' }).click();
    const sheet = page.getByRole('dialog', { name: 'Avisar a la familia' });
    const text = sheet.getByRole('textbox', { name: 'Mensaje para la familia' });
    await expect(text).toHaveValue(/^Buenos días:/);
    const kept = await text.inputValue();
    await text.fill('');
    await expect(sheet.getByRole('button', { name: 'Copiar y guardar' })).toBeDisabled();
    await expect(sheet.getByRole('button', { name: 'Copiar y guardar' })).toHaveAttribute('title', 'Escribe el mensaje');
    await text.fill(kept);
    await sheet.getByRole('button', { name: 'Copiar y guardar' }).click();
    await expect(toast(page, 'Guardado en observaciones. No se ha podido copiar: selecciona el texto y cópialo a mano.')).toBeVisible();
    await expect(sheet).toBeVisible();
    await expect(text).toHaveValue(kept);
    const notes = await world.api.get(`/notes?student_id=${world.courses[0].students[HUGO].id}`);
    expect(notes.some((n: { kind: string }) => n.kind === 'family')).toBe(true);
  });
});

test.describe('hoy · a vigilar con muchos alumnos', () => {
  const five = [0, 1, 2, 3, 4].flatMap((student) => [
    { student, date: '2026-11-17', text: 'Interrumpe la explicación' }, { student, date: '2026-11-18', text: 'No trae el material' },
  ]);
  test.use({ worldSpec: { courses: [{ ...CLASS, incidents: five }] } });

  test('hoy-64 · at most four in Hoy; «Ver todos (5)» lists every class and opens each student', async ({ page }) => {
    await openHoy(page);
    const watch = section(page, 'A vigilar');
    await expect(watch.locator('.list').getByRole('button')).toHaveCount(4);
    await watch.getByRole('button', { name: 'Ver todos (5)' }).click();
    const all = page.getByRole('dialog', { name: 'A vigilar' });
    await expect(all.getByText('Faltas, suspensos, incidencias o deberes recientes en todas tus clases.')).toBeVisible();
    await expect(all.locator('.list').getByRole('button')).toHaveText([/^Marta Alonso Gil/, /^Pablo Benítez Ruiz/, /^Lucía Castro León/,
      /^Hugo Díaz Soto/, /^Irene Esteban Mora/]);
    await all.getByRole('button', { name: /^Irene Esteban Mora/ }).click();
    await expect(all).toBeHidden();
    await expect(page.getByRole('dialog', { name: 'Irene Esteban Mora' }).getByText('2 incidencias en 7 días')).toBeVisible();
  });
});

test.describe('hoy · a vigilar según el día', () => {
  const other: CourseSpec = {
    ...CLASS, subject: 'Física y Química', group: '1º ESO D', room: 'Lab. 2', logs: [], units: [],
    slots: [{ weekday: MON, start: '12:40', end: '13:35' }],
    incidents: [{ student: 0, date: '2026-11-17', text: 'Rompe material' }, { student: 0, date: '2026-11-18', text: 'Sale sin permiso' }],
  };
  test.use({ worldSpec: { courses: [CLASS, other] } });

  test('hoy-65 · nobody in today’s classes but someone in others; that class’s day shows them', async ({ page }) => {
    await openHoy(page);
    const watch = section(page, 'A vigilar');
    await expect(watch.getByText('Nadie en las clases de este día')).toBeVisible();
    await expect(watch.getByText('Hay 1 en otras clases.')).toBeVisible();
    await watch.getByRole('button', { name: 'Ver todos (1)' }).click();
    await expect(page.getByRole('dialog', { name: 'A vigilar' }).getByRole('button', { name: /^Marta Alonso Gil/ })).toContainText('1.º ESO D');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'lunes, 16 de noviembre' }).click();
    await expect(watchRow(page, 'Marta Alonso Gil')).toContainText('1.º ESO D · 2 incidencias en 7 días');
  });

  test('hoy-66 · a day the teacher is away: «Este día no estás»', async ({ page, world }) => {
    const [maths] = world.courses;
    await world.api.post('/absences', { reason: null, sessions: [{ course_id: maths.id, date: '2026-11-20', start: '09:25', task: 'Ficha 3', material_ids: [] }] });
    await openHoy(page, '2026-11-20');
    const watch = section(page, 'A vigilar');
    await expect(watch.getByText('Este día no estás')).toBeVisible();
    await expect(watch.getByText('Hay 1 en otras clases.')).toBeVisible();
    await expect(nowCard(page)).toHaveCount(0); // nothing to teach that day
  });
});
