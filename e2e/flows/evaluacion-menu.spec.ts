import {
  BASE, bug, confirmDialog, evalMenu, evalMenuItems, evaluation, expect, NAMES, openEvaluation, shot, studentRow,
  STUDENTS, terms, test, toast, type Api, type CourseSpec, type Page, type WorldSpec,
} from './evaluacion-helpers';

// El menú «···» de Evaluación y la recuperación (docs/PRODUCT.md §4.6): copiar los comentarios, la regla de las
// recuperaciones, «Crear recuperación (N)» antes de la sesión (menú) y desde el día de la sesión (botón), la
// recuperación final / extraordinaria y el informe del departamento.

const SESSION = { title: 'Sesión de evaluación · 1.ª evaluación', date: '2026-12-15', kind: 'evaluation' };

/** The page's own «Crear recuperación» and what it creates. */
async function createRecovery(page: Page, api: Api, courseId: string) {
  const sheet = page.getByRole('dialog', { name: /^Crear recuperación/ });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Crear actividad' }).click();
  await expect(page).toHaveURL(new RegExp(`/clases/${courseId}/actividades/[^/]+$`));
  const id = page.url().split('/').pop()!;
  return { id, activity: await api.get(`/activities/${id}`) };
}

test.describe('el menú de una evaluación sin sesión en el calendario', () => {
  test.use({ worldSpec: { courses: [BASE] } });

  test('evaluacion-60 el menú: copiar comentarios, regla de las recuperaciones e informe del departamento', async ({ page, world }) => {
    await openEvaluation(page, world.c.id);
    // Without a session, «Crear recuperación (2)» is a button on the page, not in the menu; no AI drafts to redo.
    expect(await evalMenuItems(page)).toEqual(['Copiar todos los comentarios', 'Regla de las recuperaciones', 'Informe del departamento']);
    await expect(page.getByRole('button', { name: 'Crear recuperación (2)' })).toBeVisible();
  });

  test('evaluacion-61 copiar todos los comentarios: sin comentarios lo dice; con ellos, al portapapeles por apellidos', async ({ page, world, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openEvaluation(page, world.c.id);
    await evalMenu(page, 'Copiar todos los comentarios');
    await expect(toast(page, 'Todavía no hay comentarios revisados que copiar')).toBeVisible();

    const [marta, , lucia] = world.c.students;
    await world.api.put(`/courses/${world.c.id}/evaluation/1/students/${lucia.id}`, { comment: 'Trabaja bien en clase.' });
    await world.api.put(`/courses/${world.c.id}/evaluation/1/students/${marta.id}`, { comment: 'Muy buen trimestre.' });
    await page.reload();
    await expect(studentRow(page, NAMES[0]).locator('.ev-row__comment')).toHaveText('Muy buen trimestre.');
    await evalMenu(page, 'Copiar todos los comentarios');
    await expect(toast(page, '2 comentarios copiados')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText()))
      .toBe('Alonso Gil, Marta\nMuy buen trimestre.\n\nCastro León, Lucía\nTrabaja bien en clase.');
  });

  test('evaluacion-62 si el portapapeles no deja copiar, lo dice y ofrece el CSV', async ({ page, world }) => {
    await world.api.put(`/courses/${world.c.id}/evaluation/1/students/${world.c.students[0].id}`, { comment: 'Muy buen trimestre.' });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true });
    });
    await openEvaluation(page, world.c.id);
    await evalMenu(page, 'Copiar todos los comentarios');
    await expect(toast(page, 'No se ha podido copiar. Exporta las notas en CSV.')).toBeVisible();
  });

  test('evaluacion-63 crear la recuperación desde la página (sin sesión por delante): los suspensos ya elegidos', async ({ page, world }, info) => {
    await openEvaluation(page, world.c.id);
    await page.getByRole('button', { name: 'Crear recuperación (2)' }).click();
    const sheet = page.getByRole('dialog', { name: 'Crear recuperación de la 1.ª' });
    await expect(sheet.locator('.sheet__sub')).toHaveText('Para 2 alumnos con la evaluación suspensa · sustituye si es mayor');
    await expect(sheet.getByRole('textbox', { name: 'Título' })).toHaveValue('Recuperación de la 1.ª evaluación');
    await expect(sheet.getByLabel('Fecha')).toHaveValue('2026-11-19'); // today: the session is not ahead
    await expect(sheet.getByRole('combobox', { name: 'Cuenta para' })).toHaveValue('rec-1');
    await expect(sheet.getByText('Alumnos · 2 alumnos de 6')).toBeVisible();
    // The failing students come first, chosen.
    const chips = sheet.locator('.chip-row').last().getByRole('button');
    await expect(chips).toHaveText(['Toda la clase', 'Pablo Benítez', 'Irene Esteban', 'Marta Alonso', 'Lucía Castro', 'Hugo Díaz', 'Adrián Fuentes']);
    await expect(sheet.getByRole('button', { name: 'Pablo Benítez' })).toHaveAttribute('aria-pressed', 'true');
    await expect(sheet.getByRole('button', { name: 'Irene Esteban' })).toHaveAttribute('aria-pressed', 'true');
    await expect(sheet.getByRole('button', { name: 'Marta Alonso' })).toHaveAttribute('aria-pressed', 'false');
    await shot(page, info, 'recuperacion');

    const { activity } = await createRecovery(page, world.api, world.c.id);
    await expect(toast(page, '«Recuperación de la 1.ª evaluación» añadida al cuaderno')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Recuperación de la 1.ª evaluación');
    expect(activity).toMatchObject({
      title: 'Recuperación de la 1.ª evaluación', kind: 'exam', date: '2026-11-19', counts_for: 'recovery', recovers_term: 1,
    });
    expect([...activity.student_ids].sort()).toEqual([world.c.students[1].id, world.c.students[4].id].sort());
  });

  test('evaluacion-64 cerrar la hoja de la recuperación sin crearla no pregunta ni crea nada', async ({ page, world }) => {
    await openEvaluation(page, world.c.id);
    await page.getByRole('button', { name: 'Crear recuperación (2)' }).click();
    const sheet = page.getByRole('dialog', { name: 'Crear recuperación de la 1.ª' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Cerrar' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const gb = await world.api.get(`/courses/${world.c.id}/gradebook?term=1`);
    expect(gb.activities.map((a: { title: string }) => a.title)).not.toContain('Recuperación de la 1.ª evaluación');
  });

  test('evaluacion-75 cerrar la recuperación con el título cambiado pide confirmación para descartar', async ({ page, world }) => {
    await openEvaluation(page, world.c.id);
    await page.getByRole('button', { name: 'Crear recuperación (2)' }).click();
    const sheet = page.getByRole('dialog', { name: 'Crear recuperación de la 1.ª' });
    await sheet.getByRole('textbox', { name: 'Título' }).fill('Recuperación de fracciones');
    await sheet.getByRole('button', { name: 'Cerrar' }).click();
    const discard = confirmDialog(page, 'Descartar los cambios');
    await expect(discard).toContainText('Lo que has escrito se perderá.');
    await discard.getByRole('button', { name: 'Cancelar' }).click();
    await expect(sheet.getByRole('textbox', { name: 'Título' })).toHaveValue('Recuperación de fracciones');
    await page.keyboard.press('Escape');
    await discard.getByRole('button', { name: 'Descartar' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const gb = await world.api.get(`/courses/${world.c.id}/gradebook?term=1`);
    expect(gb.activities).toHaveLength(2);
  });

  test('evaluacion-65 la regla de las recuperaciones: se elige en una hoja y cambia lo que suma la recuperación', async ({ page, world }, info) => {
    // Pablo (3,3) recovers with a 9.
    const rec = await world.api.post(`/courses/${world.c.id}/activities`, {
      title: 'Recuperación de la 1.ª evaluación', kind: 'exam', date: '2026-11-18', max_score: 10, counts_for: 'recovery', recovers_term: 1,
      student_ids: [world.c.students[1].id],
    });
    await world.api.put(`/activities/${rec.id}/grades`, { grades: [{ student_id: world.c.students[1].id, score: 9 }] });
    await openEvaluation(page, world.c.id);
    const pablo = studentRow(page, NAMES[1]).locator('.ev-row__meta');
    await expect(pablo).toHaveText('Media 9,0 · 3 → 9 (rec.)');

    await evalMenu(page, 'Regla de las recuperaciones');
    let sheet = page.getByRole('dialog', { name: 'Regla de las recuperaciones' });
    await expect(sheet.locator('.sheet__sub')).toHaveText('Matemáticas · 2.º ESO C · la acuerda el departamento');
    await expect(sheet.locator('.row')).toHaveText([
      'Sustituye si es mayorCuenta la nota de la recuperación si mejora la de la evaluación.Actual',
      'Como máximo un 5Aprobar la recuperación deja la evaluación en 5.',
      'Media de ambasMedia entre la evaluación y la recuperación.',
    ]);
    await expect(sheet.getByText('La recuperación nunca baja la nota. Se aplica a todas las recuperaciones de la clase.')).toBeVisible();
    await sheet.getByRole('button', { name: /^Como máximo un 5/ }).click();
    await expect(toast(page, 'Regla guardada: como máximo un 5')).toBeVisible();
    await expect(sheet).toBeHidden();
    await expect(pablo).toHaveText('Media 5,0 · 3 → 5 (rec.)');
    expect((await evaluation(world.api, world.c.id)).recovery_rule).toBe('cap_5');

    await evalMenu(page, 'Regla de las recuperaciones');
    sheet = page.getByRole('dialog', { name: 'Regla de las recuperaciones' });
    await expect(sheet.getByRole('button', { name: /^Como máximo un 5/ })).toContainText('Actual');
    await sheet.getByRole('button', { name: /^Media de ambas/ }).click();
    await expect(toast(page, 'Regla guardada: media de ambas')).toBeVisible();
    await expect(pablo).toHaveText('Media 6,2 · 3 → 6 (rec.)');

    // Esc closes the sheet without changing the rule.
    await evalMenu(page, 'Regla de las recuperaciones');
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    expect((await evaluation(world.api, world.c.id)).recovery_rule).toBe('average');
    await shot(page, info, 'regla');
  });

  test('evaluacion-66 «Informe del departamento» desde el menú abre el informe de esa evaluación', async ({ page, world }) => {
    await openEvaluation(page, world.c.id);
    await evalMenu(page, 'Informe del departamento');
    const report = page.getByRole('dialog', { name: 'Informe del departamento' });
    await expect(terms(report).getByRole('button', { name: '1.ª', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(report.getByText('2.º ESO C', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(report).toBeHidden();
  });
});

test.describe('una clase con unidades en varias evaluaciones', () => {
  test.use({
    worldSpec: {
      courses: [{
        ...BASE,
        units: [
          { title: 'U1 · Números naturales', status: 'done' },
          { title: 'U2 · Divisibilidad', status: 'current' },
          { title: 'U4 · Decimales', term: 2, status: 'pending' },
        ],
      }],
    },
  });

  test('evaluacion-19 la recuperación trae las unidades de la evaluación que recupera; las demás, tras «Otras unidades»', async ({ page, world }) => {
    const units: { id: string; title: string }[] = await world.api.get(`/courses/${world.c.id}/units`);
    const id = (t: string) => units.find((u) => u.title === t)!.id;
    await openEvaluation(page, world.c.id);
    await page.getByRole('button', { name: 'Crear recuperación (2)' }).click();
    const sheet = page.getByRole('dialog', { name: 'Crear recuperación de la 1.ª' });
    await expect(sheet.getByRole('button', { name: 'U1 · Números naturales' })).toHaveAttribute('aria-pressed', 'true');
    await expect(sheet.getByRole('button', { name: 'U2 · Divisibilidad' })).toHaveAttribute('aria-pressed', 'true');
    await expect(sheet.getByRole('button', { name: 'U4 · Decimales' })).toHaveCount(0);
    await sheet.getByRole('button', { name: 'Otras unidades' }).click();
    await expect(sheet.getByRole('button', { name: 'U4 · Decimales' })).toHaveAttribute('aria-pressed', 'false');
    // A recovery replaces the term's result: no category or weight to choose.
    await expect(sheet.getByRole('combobox', { name: 'Categoría' })).toHaveCount(0);
    const { activity } = await createRecovery(page, world.api, world.c.id);
    expect([...activity.unit_ids].sort()).toEqual([id('U1 · Números naturales'), id('U2 · Divisibilidad')].sort());
  });
});

test.describe('antes de la sesión de evaluación', () => {
  test.use({ worldSpec: { events: [SESSION], courses: [BASE] } });

  test('evaluacion-67 antes de la sesión, «Crear recuperación (2)» está en el menú y propone el día siguiente a la sesión', async ({ page, world }) => {
    await openEvaluation(page, world.c.id);
    await expect(page.getByRole('button', { name: /Crear recuperación/ })).toHaveCount(0);
    expect(await evalMenuItems(page)).toEqual([
      'Crear recuperación (2)', 'Copiar todos los comentarios', 'Regla de las recuperaciones', 'Informe del departamento',
    ]);
    await evalMenu(page, 'Crear recuperación (2)');
    const sheet = page.getByRole('dialog', { name: 'Crear recuperación de la 1.ª' });
    await expect(sheet.getByLabel('Fecha')).toHaveValue('2026-12-16');
    const { activity } = await createRecovery(page, world.api, world.c.id);
    expect(activity).toMatchObject({ date: '2026-12-16', counts_for: 'recovery', recovers_term: 1 });
  });
});

test.describe('el día de la sesión de evaluación', () => {
  test.use({ worldSpec: { events: [{ ...SESSION, date: '2026-11-19' }], courses: [BASE] } });

  test('evaluacion-68 desde el día de la sesión, «Crear recuperación (2)» es un botón de la página', async ({ page, world }) => {
    bug('EVA-02', 'on the day of the evaluation session «Crear recuperación» is still in the menu (docs/PRODUCT.md §4.6: visible from the session day)');
    await openEvaluation(page, world.c.id);
    await expect(page.getByRole('button', { name: 'Crear recuperación (2)' })).toBeVisible();
    expect(await evalMenuItems(page)).not.toContain('Crear recuperación (2)');
  });
});

test.describe('después de la sesión de evaluación', () => {
  test.use({ worldSpec: { events: [{ ...SESSION, date: '2026-11-17' }], courses: [BASE] } });

  test('evaluacion-69 después de la sesión, el botón está en la página y la fecha es hoy', async ({ page, world }) => {
    await openEvaluation(page, world.c.id);
    await expect(page.getByRole('button', { name: 'Crear recuperación (2)' })).toBeVisible();
    expect(await evalMenuItems(page)).not.toContain('Crear recuperación (2)');
    await page.getByRole('button', { name: 'Crear recuperación (2)' }).click();
    await expect(page.getByRole('dialog', { name: 'Crear recuperación de la 1.ª' }).getByLabel('Fecha')).toHaveValue('2026-11-19');
  });
});

test.describe('nadie suspende', () => {
  const spec: CourseSpec = { students: STUDENTS.slice(0, 2), activities: [{ title: 'Examen U1 · Números', date: '2026-10-29', grades: [8, 6] }] };
  test.use({ worldSpec: { events: [SESSION], courses: [spec] } });

  test('evaluacion-70 sin suspensos no hay recuperación que crear', async ({ page, world }) => {
    await openEvaluation(page, world.c.id);
    await expect(page.getByRole('button', { name: /Crear recuperación/ })).toHaveCount(0);
    expect(await evalMenuItems(page)).toEqual(['Copiar todos los comentarios', 'Regla de las recuperaciones', 'Informe del departamento']);
  });
});

/** The 3.ª started on 2 Nov, so the final is open. Pablo fails the three terms. */
const ALL_OPEN = (stage: 'eso' | 'bachillerato'): WorldSpec => ({
  terms: [
    { n: 1, start: '2026-09-08', end: '2026-09-30' },
    { n: 2, start: '2026-10-01', end: '2026-10-31' },
    { n: 3, start: '2026-11-02', end: '2026-12-22' },
  ],
  courses: [{
    stage, group: stage === 'eso' ? '4º ESO B' : '2º Bach A', subject: stage === 'eso' ? 'Matemáticas' : 'Matemáticas II',
    students: STUDENTS.slice(0, 3),
    activities: [
      { title: 'Examen U1 · Números', date: '2026-09-22', grades: [8, 3, 5] },
      { title: 'Examen U3 · Ecuaciones', date: '2026-10-20', grades: [6, 4, 7] },
      { title: 'Examen U5 · Funciones', date: '2026-11-10', grades: [10, 2, 6] },
    ],
  }],
});

test.describe('la evaluación final en ESO', () => {
  test.use({ worldSpec: ALL_OPEN('eso') });

  test('evaluacion-71 la recuperación de la final en ESO: «Recuperación final»', async ({ page, world }) => {
    await openEvaluation(page, world.c.id, 4);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Evaluación final');
    await page.getByRole('button', { name: 'Crear recuperación (1)' }).click();
    const sheet = page.getByRole('dialog', { name: 'Crear recuperación final' });
    await expect(sheet.getByRole('textbox', { name: 'Título' })).toHaveValue('Recuperación final');
    await expect(sheet.getByRole('combobox', { name: 'Cuenta para' })).toHaveValue('rec-4');
    await expect(sheet.getByRole('combobox', { name: 'Cuenta para' }).locator('option:checked')).toHaveText('Recuperar la final');
    const { activity } = await createRecovery(page, world.api, world.c.id);
    expect(activity).toMatchObject({ title: 'Recuperación final', counts_for: 'recovery', recovers_term: 4, student_ids: [world.c.students[1].id] });
  });

  test('evaluacion-72 el informe del departamento desde otra evaluación se abre en esa evaluación', async ({ page, world }) => {
    await openEvaluation(page, world.c.id, 2);
    await evalMenu(page, 'Informe del departamento');
    const report = page.getByRole('dialog', { name: 'Informe del departamento' });
    await expect(terms(report).getByRole('button', { name: '2.ª', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(report.getByText('3 alumnos · 67 % aprobados · media 5,7')).toBeVisible();
  });
});

test.describe('la evaluación final en Bachillerato', () => {
  test.use({ worldSpec: ALL_OPEN('bachillerato') });

  test('evaluacion-73 la recuperación de la final en Bachillerato es la extraordinaria', async ({ page, world }) => {
    await openEvaluation(page, world.c.id, 4);
    await page.getByRole('button', { name: 'Crear recuperación (1)' }).click();
    const sheet = page.getByRole('dialog', { name: 'Crear recuperación extraordinaria' });
    await expect(sheet.getByRole('textbox', { name: 'Título' })).toHaveValue('Recuperación extraordinaria');
    await expect(sheet.getByRole('combobox', { name: 'Cuenta para' }).locator('option:checked')).toHaveText('Recuperar la final (extraordinaria)');
    const { activity } = await createRecovery(page, world.api, world.c.id);
    expect(activity).toMatchObject({ title: 'Recuperación extraordinaria', recovers_term: 4 });
  });
});

test.describe('los borradores de la IA de la demo (sin llamar a la IA)', () => {
  test('evaluacion-74 «Redactar de nuevo N borradores» en el menú: pide confirmación y dice qué no toca', async ({ page, demo }) => {
    const courses: { id: string; label: string }[] = await demo.get('/courses');
    const course = courses.find((c) => /2\.º ESO B/.test(c.label))!;
    const ev = await evaluation(demo, course.id);
    test.skip(!ev.comments_unreviewed || ev.comments_missing > 0, 'the demo class has no AI drafts left to redo');
    const posts: string[] = [];
    await page.route('**/api/courses/*/evaluation/1/comments', (r) => { posts.push(r.request().postData() ?? ''); return r.abort(); });

    await openEvaluation(page, course.id);
    const label = `Redactar de nuevo ${ev.comments_unreviewed} ${ev.comments_unreviewed === 1 ? 'borrador' : 'borradores'}`;
    expect((await evalMenuItems(page))[0]).toBe(label);
    await expect(page.getByRole('button', { name: `Revisar ${ev.comments_unreviewed} comentarios` })).toBeVisible();
    await evalMenu(page, label);
    const confirm = confirmDialog(page, 'Redactar de nuevo los borradores');
    await expect(confirm).toContainText('Se sustituirán los borradores de la IA sin revisar; los que has escrito o aceptado no se tocan.');
    await expect(confirm).toContainText('Solo recibe el nombre de pila.');
    await confirm.getByRole('button', { name: 'Cancelar' }).click();
    await expect(confirm).toBeHidden();
    expect(posts).toEqual([]);
  });
});
