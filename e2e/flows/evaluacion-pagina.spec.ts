import {
  BASE, bug, csvRows, DETAILS, downloaded, evaluarClass, evaluation, expect, isMobile, NAMES, openEvaluation, pdfText,
  press, shot, studentRow, STUDENTS, terms, test, TITLES, toast, type CourseSpec, type WorldSpec,
} from './evaluacion-helpers';

// Evaluación de una clase (docs/PRODUCT.md §4.6): the term page, its states, what each row says, the «Notas incompletas»
// line, the primary action of the moment, the term selector, the acta and the CSV. The student sheet, the «···» menu,
// the department report and the AI are in their own files.

const rowOf = (page: Parameters<typeof studentRow>[0], i: number) => studentRow(page, NAMES[i]);

test.describe('una evaluación con notas', () => {
  test.use({ worldSpec: { courses: [BASE] } });

  test('evaluacion-20 cabecera, resumen y filas: lo que el profesor ve al abrir la 1.ª', async ({ page, world }, info) => {
    await openEvaluation(page, world.c.id, 1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Primera evaluación');
    await expect(page.locator('.page-head__eyebrow')).toHaveText('Matemáticas · 2.º ESO C');
    await expect(page).toHaveTitle('Primera evaluación · Sepia');
    await expect(page.getByLabel('Resumen de la evaluación'))
      .toHaveText('Media 6,4 · 67 % aprobados · IN 2 · SU 0 · BI 1 · NT 2 · SB 1');
    await expect(page.getByText('Notas incompletas.')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '6 alumnos' })).toBeVisible();
    await expect(page.locator('.ev-count')).toHaveText('6 por redactar');
    await expect(page.getByRole('button', { name: 'Redactar 6 comentarios con IA' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Acta (PDF)' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Exportar notas (CSV)' })).toBeVisible();
    // No evaluation session in the calendar: nothing is ahead of the recovery, so its button is on the page.
    await expect(page.getByRole('button', { name: 'Crear recuperación (2)' })).toBeVisible();

    // One row per student, by surname: the name, «Media 7,7» and the proposal with its grade word.
    const names = page.locator('.ev-row .row__title > span:first-child');
    await expect(names).toHaveText(STUDENTS);
    const expected: [number, string, string, string][] = [
      [0, '7,7', '8', 'NT'], [1, '3,3', '3', 'IN'], [2, '6,3', '6', 'BI'], [3, '9,7', '10', 'SB'], [4, '4,3', '4', 'IN'], [5, '7,3', '7', 'NT'],
    ];
    for (const [i, avg, prop, band] of expected) {
      const row = rowOf(page, i);
      await expect(row.locator('.ev-row__meta')).toHaveText(`Media ${avg}`);
      await expect(row.locator('.grade-pill')).toHaveText(`${prop}${band}`);
      await expect(row.getByText('Borrador IA')).toHaveCount(0);
      await expect(row.getByText(/Ajustada/)).toHaveCount(0);
    }
    // The same figures as the server.
    const ev = await evaluation(world.api, world.c.id);
    expect(ev.stats).toMatchObject({ average: 6.44, pass_rate: 67, failing: 2 });
    expect(ev.rows.map((r) => r.proposed)).toEqual([8, 3, 6, 10, 4, 7]);
    await shot(page, info, 'pagina');
  });

  test('evaluacion-21 la 2.ª, la 3.ª y la final aún no han empezado: atenuadas, y al tocarlas dicen cuándo empiezan', async ({ page, world }, info) => {
    await openEvaluation(page, world.c.id, 1);
    const sel = terms(page);
    await expect(sel.getByRole('button', { name: '1.ª', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const second = sel.getByRole('button', { name: /^2\.ª/ });
    await expect(second).toHaveAttribute('aria-disabled', 'true');
    // Screen readers read why.
    await expect(second).toHaveAccessibleName(/^2\.ª\s*: La 2\.ª evaluación empieza el viernes, 8 de enero$/);
    await expect(sel.getByRole('button', { name: /^3\.ª/ })).toHaveAccessibleName(/^3\.ª\s*: La 3\.ª evaluación empieza el martes, 30 de marzo$/);
    await expect(sel.getByRole('button', { name: /^Final/ }))
      .toHaveAccessibleName(/^Final\s*: La evaluación final se abre con la 3\.ª evaluación, el martes, 30 de marzo$/);

    await press(second, info, true);
    await expect(toast(page, 'La 2.ª evaluación empieza el viernes, 8 de enero')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/clases/${world.c.id}/evaluacion/1$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Primera evaluación');
    await press(sel.getByRole('button', { name: /^Final/ }), info, true);
    await expect(toast(page, 'La evaluación final se abre con la 3.ª evaluación, el martes, 30 de marzo')).toBeVisible();
    await expect(page).toHaveURL(new RegExp('/evaluacion/1$'));
  });

  test('evaluacion-15 mientras carga el perfil, una evaluación que no ha empezado tampoco pide sus datos', async ({ page, world }) => {
    bug('EVA-05', 'until /api/me answers, a term that has not started counts as open and its evaluation is requested (docs/PRODUCT.md §4.6: «su página no carga datos»)');
    const requested: string[] = [];
    page.on('request', (r) => { if (/\/api\/courses\/[^/]+\/evaluation\/[234]\b/.test(r.url())) requested.push(r.url()); });
    // A slow start (the phone waking up on the school's Wi-Fi): the profile, with the school year, answers late.
    await page.route('**/api/me', async (r) => { await new Promise((ok) => setTimeout(ok, 1500)); await r.fallback(); });
    await page.goto(`/clases/${world.c.id}/evaluacion/2`);
    await expect(page.getByText('La 2.ª evaluación aún no ha empezado')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Más acciones' })).toHaveCount(0);
    expect(requested, 'a term that has not started loads nothing').toEqual([]);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('evaluacion-22 abrir por enlace una evaluación que no ha empezado: dice cuándo empieza y no ofrece acciones', async ({ page, world }) => {
    await openEvaluation(page, world.c.id, 2);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Segunda evaluación');
    await expect(page.getByText('La 2.ª evaluación aún no ha empezado')).toBeVisible();
    await expect(page.getByText('Empieza el viernes, 8 de enero.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Más acciones' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Acta (PDF)' })).toHaveCount(0);
    await expect(terms(page).getByRole('button', { name: /^2\.ª/ })).toHaveAttribute('aria-pressed', 'true');

    for (const [path, title] of [['4', 'Evaluación final'], ['final', 'Evaluación final']]) {
      await openEvaluation(page, world.c.id, path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
      await expect(page.getByText('La evaluación final aún no se ha abierto')).toBeVisible();
      await expect(page.getByText('Se abre con la 3.ª evaluación, el martes, 30 de marzo.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Más acciones' })).toHaveCount(0);
    }

    await page.getByRole('link', { name: 'Ir a la evaluación actual' }).click();
    await expect(page).toHaveURL(new RegExp(`/clases/${world.c.id}/evaluacion/1$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Primera evaluación');
    await expect(page.getByLabel('Resumen de la evaluación')).toContainText('Media 6,4');
  });

  test('evaluacion-23 exportar notas (CSV): nota, calificación y comentario por apellidos', async ({ page, world }) => {
    // An adjusted grade and a comment, so the file shows the grade that counts and the text.
    const [marta, pablo] = world.c.students;
    await world.api.put(`/courses/${world.c.id}/evaluation/1/students/${marta.id}`, { final_grade: 9, comment: 'Muy buen trimestre; sigue así.' });
    await world.api.put(`/courses/${world.c.id}/evaluation/1/students/${pablo.id}`, { comment: 'Debe repasar "fracciones"; puede mejorar.' });
    await openEvaluation(page, world.c.id, 1);

    const { name, body } = await downloaded(page, () => page.getByRole('button', { name: 'Exportar notas (CSV)' }).click());
    expect(name).toBe('Evaluacion - Matematicas - 2o ESO C - 1a evaluacion.csv');
    await expect(toast(page, 'Notas descargadas')).toBeVisible();
    expect(body.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf])); // BOM: Excel opens the accents right
    expect(csvRows(body)).toEqual([
      ['Apellidos', 'Nombre', 'Nota', 'Calificación', 'Comentario'],
      ['Alonso Gil', 'Marta', '9', 'SB', 'Muy buen trimestre; sigue así.'],
      ['Benítez Ruiz', 'Pablo', '3', 'IN', 'Debe repasar "fracciones"; puede mejorar.'],
      ['Castro León', 'Lucía', '6', 'BI', ''],
      ['Díaz Soto', 'Hugo', '10', 'SB', ''],
      ['Esteban Mora', 'Irene', '4', 'IN', ''],
      ['Fuentes Vera', 'Adrián', '7', 'NT', ''],
    ]);
  });

  test('evaluacion-24 si la descarga falla, lo dice y se puede volver a pedir', async ({ page, world }) => {
    await openEvaluation(page, world.c.id, 1);
    await page.route('**/api/courses/*/evaluation/1/acta.pdf', (r) => r.fulfill({
      status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Internal Server Error' }),
    }));
    const acta = page.getByRole('button', { name: 'Acta (PDF)' });
    await acta.click();
    await expect(toast(page, 'El servidor ha fallado. Inténtalo en un momento.')).toBeVisible();
    await expect(acta).toBeEnabled();
    await page.unroute('**/api/courses/*/evaluation/1/acta.pdf');
    const { name } = await downloaded(page, () => acta.click());
    expect(name).toBe('Acta - Matematicas - 2o ESO C - 1a evaluacion.pdf');
    await expect(toast(page, 'Acta descargada')).toBeVisible();
  });

  test('evaluacion-25 volver desde una evaluación abierta por enlace: al Cuaderno de esa evaluación', async ({ page, world }) => {
    await page.goto(`/clases/${world.c.id}/evaluacion/1`);
    const back = page.locator('.back-btn');
    await expect(back).toHaveText('Cuaderno');
    await back.click();
    await expect(page).toHaveURL(new RegExp(`/clases/${world.c.id}/cuaderno\\?term=1$`));
    await expect(page.locator('table.gb')).toBeVisible();
  });

  test('evaluacion-26 volver desde una evaluación abierta desde Evaluar: «‹ Evaluar» y vuelve a la bandeja', async ({ page, world }) => {
    bug('EVA-01', 'Evaluación opened from Evaluar says «‹ Cuaderno» and goes to the Cuaderno (docs/PRODUCT.md §3: Volver names its origin)');
    await page.goto('/evaluar');
    await evaluarClass(page, /^2\.º ESO C · Matemáticas/).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Primera evaluación');
    const back = page.locator('.back-btn');
    await expect(back).toHaveText('Evaluar');
    await back.click();
    await expect(page).toHaveURL(new RegExp(`/evaluar$`));
  });
});

test.describe('una evaluación con todo lo que puede decir una fila', () => {
  test.use({ worldSpec: { courses: [DETAILS] } });

  test('evaluacion-27 filas: recuperación, faltas (justificadas), examen pendiente, notas que faltan, ACS, nota ajustada y comentario', async ({ page, world }, info) => {
    await openEvaluation(page, world.c.id, 1);
    await expect(page.getByLabel('Resumen de la evaluación'))
      .toHaveText('Media 7,0 · 100 % aprobados · IN 0 · SU 1 · BI 1 · NT 3 · SB 1');

    await expect(rowOf(page, 0).locator('.ev-row__meta')).toHaveText('Media 7,5');
    await expect(rowOf(page, 0).locator('.ev-row__comment')).toHaveText('Trabaja con constancia y participa en clase.');
    await expect(rowOf(page, 1).locator('.ev-row__meta')).toHaveText('Media 7,0 · 3 → 7 (rec.)');
    await expect(rowOf(page, 1).locator('.grade-pill')).toHaveText('7NT');
    await expect(rowOf(page, 2).locator('.ev-row__meta')).toHaveText('Media 6,2 · 2 faltas (1 just.) · Sin nota: Trabajo · Proyecto');
    await expect(rowOf(page, 3).locator('.row__title')).toContainText('ACS');
    await expect(rowOf(page, 3).locator('.grade-pill')).toHaveText('9SB');
    await expect(rowOf(page, 4).locator('.ev-row__meta')).toHaveText('Media 4,5 · 1 falta · Pendiente: Examen U2 · Fracciones');
    await expect(rowOf(page, 4).locator('.grade-pill')).toHaveText('5SU');
    await expect(rowOf(page, 5).locator('.ev-row__meta')).toHaveText('Media 7,3 · Sin nota: Trabajo · Proyecto, Examen U2 · Fracciones');
    await expect(rowOf(page, 5).locator('.grade-pill')).toHaveText('8NT');
    await expect(rowOf(page, 5).getByText('Ajustada (prop. 7)')).toBeVisible();
    // Only Marta has a comment, and it is hers: no «Borrador IA» anywhere.
    await expect(page.locator('.ev-row__comment')).toHaveCount(1);
    await expect(page.locator('.ev-list').getByText('Borrador IA')).toHaveCount(0);
    await expect(page.locator('.ev-count')).toHaveText('5 por redactar');
    await expect(page.getByRole('button', { name: 'Redactar 5 comentarios con IA' })).toBeVisible();
    // Everyone passes: no recovery to create.
    await expect(page.getByRole('button', { name: /Crear recuperación/ })).toHaveCount(0);
    await shot(page, info, 'filas');
  });

  test('evaluacion-28 «Notas incompletas»: lo que las propuestas aún no cuentan, con enlaces', async ({ page, world }) => {
    await openEvaluation(page, world.c.id, 1);
    const callout = page.locator('.callout').filter({ hasText: 'Notas incompletas.' });
    await expect(callout).toHaveText('Notas incompletas. Examen U2 · Fracciones: 1 por revisar · Trabajo · Proyecto: 2 sin nota · 1 alumno con un examen pendiente');

    // The same figures as the Evaluar inbox.
    const inbox = await world.api.get('/inbox');
    expect(inbox.evaluations[0]).toMatchObject({
      to_review: [{ title: 'Examen U2 · Fracciones', count: 1 }], to_grade: [{ title: 'Trabajo · Proyecto', count: 2 }], pending_absent: 1,
    });

    // One student with a missed exam: the link opens her sheet.
    await callout.getByRole('button', { name: '1 alumno con un examen pendiente' }).click();
    const irene = page.getByRole('dialog', { name: NAMES[4] });
    await expect(irene.locator('.ev-sheet__facts')).toContainText('Pendiente (faltó): Examen U2 · Fracciones');
    await page.keyboard.press('Escape');
    await expect(irene).toBeHidden();
  });

  test('evaluacion-76 cada enlace de «Notas incompletas» abre lo suyo: la actividad por revisar y la columna sin notas', async ({ page, world }, info) => {
    bug('EVA-06', 'on a phone each «Notas incompletas» link that wraps is covered by the enlarged tap area of the next one: tapping «Examen U2 · Fracciones: 1 por revisar» opens «Trabajo · Proyecto», and that one opens Irene\'s sheet', isMobile(info));
    await openEvaluation(page, world.c.id, 1);
    const callout = page.locator('.callout').filter({ hasText: 'Notas incompletas.' });
    // A finger lands where the link is drawn, whatever is on top (force: no waiting for the link to be the target).
    await press(callout.getByRole('link', { name: 'Examen U2 · Fracciones: 1 por revisar' }), info, true);
    await expect(page).toHaveURL(new RegExp(`/clases/${world.c.id}/actividades/${world.c.act['Examen U2 · Fracciones']}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Examen U2 · Fracciones');

    await openEvaluation(page, world.c.id, 1);
    await press(callout.getByRole('link', { name: 'Trabajo · Proyecto: 2 sin nota' }), info, true);
    await expect(page).toHaveURL(new RegExp(`/clases/${world.c.id}/cuaderno\\?term=1&a=${world.c.act['Trabajo · Proyecto']}$`));
    await expect(page.locator('table.gb')).toBeVisible();
  });

  test('evaluacion-29 acta (PDF): propuesta, recuperación, nota, faltas justificadas, comentario, ACS y firma', async ({ page, world }) => {
    await openEvaluation(page, world.c.id, 1);
    const { name, body } = await downloaded(page, () => page.getByRole('button', { name: 'Acta (PDF)' }).click());
    expect(name).toBe('Acta - Matematicas - 2o ESO C - 1a evaluacion.pdf');
    await expect(toast(page, 'Acta descargada')).toBeVisible();
    expect(body.subarray(0, 5).toString()).toBe('%PDF-');
    const text = pdfText(body);
    expect(text).toContain('Acta de evaluación');
    expect(text).toContain('Matemáticas · 2.º ESO C · 1.ª evaluación');
    expect(text).toContain('Profesor/a: Elena Prieto. Alumnos: 6. Media de la clase: 7,0. Aprobados: 100 %. Suspensos: 0.');
    for (const s of STUDENTS) expect(text).toContain(s);
    expect(text).toContain('Díaz Soto, Hugo *'); // ACS, with its note
    expect(text).toContain('Calificación referida a su adaptación curricular.');
    expect(text).toContain('3 → 7 NT (rec.)'); // Pablo's recovery
    expect(text).toContain('Trabaja con constancia y participa en clase.');
    expect(text).toContain('Faltas: todas las de la evaluación; (J) = justificadas.');
    expect(text).toMatch(/Castro León, Lucía 6,2 6 BI 6 BI 2 \(1 J\)/); // media, propuesta, nota, faltas (1 justificada)
    expect(text).toContain('Fecha y firma');
  });
});

test.describe('una clase sin alumnos', () => {
  test.use({ worldSpec: { courses: [{ group: '4º ESO D' }] } });

  test('evaluacion-30 sin alumnos: lo dice y lleva a añadirlos', async ({ page, world }) => {
    await openEvaluation(page, world.c.id, 1);
    await expect(page.getByText('Esta clase aún no tiene alumnos')).toBeVisible();
    await expect(page.getByLabel('Resumen de la evaluación')).toHaveCount(0);
    await page.getByRole('link', { name: 'Añadir alumnos' }).click();
    await expect(page).toHaveURL(new RegExp(`/clases/${world.c.id}/alumnos$`));
  });
});

test.describe('una clase con alumnos y sin notas', () => {
  test.use({ worldSpec: { courses: [{ students: STUDENTS.slice(0, 3) }] } });

  test('evaluacion-31 aún sin notas: el resumen lo dice, las filas no inventan una media y no hay comentarios que redactar', async ({ page, world }) => {
    await openEvaluation(page, world.c.id, 1);
    await expect(page.getByLabel('Resumen de la evaluación')).toHaveText('Aún no hay notas en esta evaluación');
    for (const i of [0, 1, 2]) {
      await expect(rowOf(page, i).locator('.ev-row__meta')).toHaveText('Media —');
      await expect(rowOf(page, i).locator('.ev-row__final')).toHaveText('—');
    }
    // Without grades the AI would have nothing true to say: no button, no count.
    await expect(page.getByRole('button', { name: /Redactar \d+ comentarios? con IA/ })).toHaveCount(0);
    await expect(page.locator('.ev-count')).toHaveText('');
    await expect(page.getByRole('button', { name: /Crear recuperación/ })).toHaveCount(0);
  });
});

test.describe('todos los comentarios escritos y aceptados', () => {
  const spec: CourseSpec = {
    ...BASE,
    students: STUDENTS.slice(0, 2),
    activities: BASE.activities!.map((a) => ({ ...a, grades: a.grades!.slice(0, 2) })),
    evaluation: [
      { student: 0, comment: 'Buen trimestre.', accept: true },
      { student: 1, comment: 'Tiene que estudiar cada día.' },
    ],
  };
  test.use({ worldSpec: { courses: [spec] } });

  test('evaluacion-32 comentarios al día: sin botón principal y «Comentarios revisados»', async ({ page, world }) => {
    await openEvaluation(page, world.c.id, 1);
    // A comment the teacher wrote counts as done, accepted or not.
    await expect(page.getByText('Comentarios revisados', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Redactar \d+ comentarios? con IA/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Revisar \d+ comentarios?/ })).toHaveCount(0);
    await expect(page.locator('.ev-row__comment')).toHaveText(['Buen trimestre.', 'Tiene que estudiar cada día.']);
  });
});

test.describe('una clase de Bachillerato', () => {
  test.use({
    worldSpec: {
      courses: [{
        subject: 'Matemáticas I', group: '1º Bach A', stage: 'bachillerato', students: STUDENTS.slice(0, 4),
        activities: [{ title: 'Examen U1 · Números reales', date: '2026-10-29', grades: [9, 4, 6, 7.5] }],
      }],
    },
  });

  test('evaluacion-33 Bachillerato: notas sin calificación en palabras y distribución por bandas numéricas', async ({ page, world }) => {
    await openEvaluation(page, world.c.id, 1);
    await expect(page.getByLabel('Resumen de la evaluación'))
      .toHaveText('Media 6,6 · 75 % aprobados · <5: 1 · 5: 0 · 6: 1 · 7-8: 1 · 9-10: 1');
    await expect(rowOf(page, 0).locator('.grade-pill')).toHaveText('9');
    const { body } = await downloaded(page, () => page.getByRole('button', { name: 'Exportar notas (CSV)' }).click());
    expect(csvRows(body)[1]).toEqual(['Alonso Gil', 'Marta', '9', '', '']);
  });
});

test.describe('un curso con las tres evaluaciones abiertas', () => {
  // The 3.ª started on 2 Nov: every term, and the final, can be opened. One exam per term.
  const spec: WorldSpec = {
    terms: [
      { n: 1, start: '2026-09-08', end: '2026-09-30' },
      { n: 2, start: '2026-10-01', end: '2026-10-31' },
      { n: 3, start: '2026-11-02', end: '2026-12-22' },
    ],
    courses: [{
      students: STUDENTS.slice(0, 3),
      activities: [
        { title: 'Examen U1 · Números', date: '2026-09-22', grades: [8, 3, 5] },
        { title: 'Examen U3 · Ecuaciones', date: '2026-10-20', grades: [6, 4, 7] },
        { title: 'Examen U5 · Funciones', date: '2026-11-10', grades: [10, 2, 6] },
      ],
    }],
  };
  test.use({ worldSpec: spec });

  test('evaluacion-34 cambiar de evaluación con el selector: cada una con sus notas, y la final con la media de las tres', async ({ page, world }, info) => {
    await openEvaluation(page, world.c.id, 3);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tercera evaluación');
    const sel = terms(page);
    for (const t of ['1.ª', '2.ª', '3.ª', 'Final']) await expect(sel.getByRole('button', { name: t, exact: true })).not.toHaveAttribute('aria-disabled');
    await expect(rowOf(page, 0).locator('.ev-row__meta')).toHaveText('Media 10,0');

    const cases: [string, number, string, string][] = [
      ['1.ª', 1, 'Media 8,0', 'Media 5,3 · 67 % aprobados'],
      ['2.ª', 2, 'Media 6,0', 'Media 5,7 · 67 % aprobados'],
      ['Final', 4, 'Media 8,0', 'Media 5,7 · 67 % aprobados'],
    ];
    for (const [label, n, marta, kpis] of cases) {
      await press(sel.getByRole('button', { name: label, exact: true }), info);
      await expect(page).toHaveURL(new RegExp(`/clases/${world.c.id}/evaluacion/${n}$`));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(TITLES[n]);
      await expect(sel.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(rowOf(page, 0).locator('.ev-row__meta')).toHaveText(marta);
      await expect(page.getByLabel('Resumen de la evaluación')).toContainText(kpis);
    }
    // The selector replaces the entry: back leaves the evaluation instead of walking through the terms.
    await page.goBack();
    await expect(page).not.toHaveURL(/\/evaluacion\//);
  });

  test('evaluacion-35 el selector de evaluación con teclado', async ({ page, world }, info) => {
    test.skip(isMobile(info), 'keyboard path: desktop');
    await openEvaluation(page, world.c.id, 3);
    const second = terms(page).getByRole('button', { name: '2.ª', exact: true });
    await second.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/evaluacion/2$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Segunda evaluación');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Space');
    await expect(page).toHaveURL(new RegExp(`/evaluacion/3$`));
  });
});

test.describe('estados de error', () => {
  test.use({ worldSpec: { courses: [BASE] } });

  test('evaluacion-36 una clase que no existe: «No se ha encontrado la clase» y a Clases', async ({ page }) => {
    await page.goto('/clases/00000000-0000-0000-0000-000000000000/evaluacion/1');
    await expect(page.getByText('No se ha encontrado la clase')).toBeVisible();
    await expect(page.getByText('Puede que se haya eliminado.')).toBeVisible();
    await page.getByRole('link', { name: 'Ir a Clases' }).click();
    await expect(page).toHaveURL(/\/clases$/);
  });

  test('evaluacion-37 si la clase no carga por un fallo del servidor, se puede reintentar', async ({ page, world }) => {
    let fail = true;
    await page.route(`**/api/courses/${world.c.id}`, (r) => (fail
      ? r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Error interno del servidor.' }) })
      : r.fallback()));
    await page.goto(`/clases/${world.c.id}/evaluacion/1`);
    await expect(page.getByText('No se ha podido cargar la clase')).toBeVisible({ timeout: 20_000 });
    fail = false;
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.getByLabel('Resumen de la evaluación')).toContainText('Media 6,4');
  });

  test('evaluacion-38 si la evaluación no carga, lo dice y se puede reintentar', async ({ page, world }) => {
    let fail = true;
    await page.route(`**/api/courses/${world.c.id}/evaluation/1`, (r) => (fail
      ? r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Error interno del servidor.' }) })
      : r.fallback()));
    await page.goto(`/clases/${world.c.id}/evaluacion/1`);
    await expect(page.getByText('No se ha podido cargar la evaluación.')).toBeVisible({ timeout: 20_000 });
    fail = false;
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.getByLabel('Resumen de la evaluación')).toContainText('Media 6,4');
  });
});

test.describe('lo ajustado en Evaluación se ve en el Cuaderno', () => {
  test.use({ worldSpec: { courses: [BASE] } });

  test('evaluacion-39 la nota ajustada sale en la columna Nota del Cuaderno con «aj.»', async ({ page, world }, info) => {
    test.skip(isMobile(info), 'the Nota column is a desktop column');
    await world.api.put(`/courses/${world.c.id}/evaluation/1/students/${world.c.students[1].id}`, { final_grade: 5 });
    await page.goto(`/clases/${world.c.id}/cuaderno?term=1`);
    const row = page.locator('tr').filter({ has: page.getByRole('button', { name: /^Media de Pablo Benítez Ruiz: / }) });
    await expect(row.locator('td.gb-prop')).toHaveText('5SUaj.');
    await expect(row.locator('.gb-prop__val')).toHaveAttribute('title', 'Ajustada en Evaluación (propuesta 3)');
  });
});
