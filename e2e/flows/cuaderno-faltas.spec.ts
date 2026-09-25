import {
  average, bug, cell, CLASS, column, confirmDialog, expect, gradebook, isMobile, NAMES, openCuaderno, press, sheet, shot, STUDENTS, test,
  toast, typeGrade, type CourseSpec, type Page, type TestInfo, type World,
} from './cuaderno-helpers';

// Faltas en exámenes, repescas y recuperaciones en el Cuaderno (docs/PRODUCT.md §4.3, §4.5): who has an absence on the
// exam day's list and no grade shows «Faltó»; one row above the grid opens the sheet to schedule a repesca (its grade
// fills the same column) or put NP (into the repesca when there is one); «ausente con nota» warns of a wrong list or
// paper. A recovery is a column of the term it recovers, only for its students, and the average says «rec.».
// Each test is a teacher of its own.

const EXAM = 'Examen U2 · Fracciones';
const [MARTA, PABLO, LUCIA, HUGO, IRENE] = NAMES;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Thursday 12 Nov, 09:25: Pablo absent, Irene absent with a justification; the rest sat the exam (Hugo has no grade yet).
const FALTAS: CourseSpec = {
  ...CLASS,
  activities: [{ title: EXAM, kind: 'exam', date: '2026-11-12', grades: [6, null, 7, null, null, 8] }],
  absences: [{ date: '2026-11-12', start: '09:25', student: 1 }, { date: '2026-11-12', start: '09:25', student: 4, justified: true }],
};

/** A row of «Pendiente» above the grid (a button, or a link for «N por revisar») by the start of its title. */
const pendingRow = (page: Page, title: string) => page.locator('.gb-pending').getByRole('button', { name: new RegExp(`^${esc(title)}`) });
const absencesSheet = (page: Page) => page.getByRole('dialog', { name: `Faltaron a ${EXAM}` });
const repeats = async (world: World) => (await world.api.get(`/activities/${world.act[EXAM]}`)).repeats as { id: string; date: string; student_ids: string[] }[];

test.describe('cuaderno · faltas en exámenes y repescas', () => {
  test.use({ worldSpec: FALTAS });

  test('cuaderno-60 · who missed the exam shows «Faltó»; one row above the grid opens the sheet', async ({ page, world }, info) => {
    await openCuaderno(page, world.id);
    await expect(cell(page, PABLO, EXAM)).toHaveText('Faltó');
    await expect(cell(page, PABLO, EXAM)).toHaveAccessibleName(`${PABLO} · ${EXAM}: faltó al examen, pendiente`);
    await expect(cell(page, IRENE, EXAM)).toHaveAccessibleName(`${IRENE} · ${EXAM}: faltó al examen (falta justificada), pendiente`);
    await expect(cell(page, HUGO, EXAM)).toHaveText('—'); // no grade yet, but he was there
    const row = pendingRow(page, `Faltaron 2 alumnos a ${EXAM}`);
    await expect(row).toContainText('Benítez Ruiz, Pablo · Esteban Mora, Irene · programar repesca o poner NP');
    await shot(page, info, '60-missed');

    // Not counted, and said so
    await press(average(page, PABLO), info);
    await expect(page.getByRole('dialog', { name: PABLO }).getByText(`${EXAM}: faltó, pendiente`)).toBeVisible();
    await page.keyboard.press('Escape');

    await press(row, info);
    const s = absencesSheet(page);
    await expect(s.getByText('jueves, 12 de noviembre · según la lista de ese día')).toBeVisible();
    await expect(s.getByText('Falta sin justificar · pendiente')).toBeVisible();
    await expect(s.getByText('Falta justificada · pendiente')).toBeVisible();
    await expect(s.getByRole('button', { name: 'Pablo Benítez', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(s.getByRole('button', { name: 'Irene Esteban', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(s.getByText('martes, 24 nov 2026')).toBeVisible(); // the class's next session
    await expect(s.getByRole('button', { name: 'Poner NP (2)' })).toBeVisible();
    await expect(s.getByRole('button', { name: 'Programar repesca (2)' })).toBeVisible();
    await shot(page, info, '60-sheet');
    // Nobody chosen: no action
    await s.getByRole('button', { name: 'Pablo Benítez', exact: true }).click();
    await s.getByRole('button', { name: 'Irene Esteban', exact: true }).click();
    await expect(s.getByText('Elige al menos un alumno.')).toBeVisible();
    await expect(s.getByRole('button', { name: /Programar repesca/ })).toHaveCount(0);
  });

  test('cuaderno-61 · schedule a repesca: «Pendiente» in the same column, and its grade goes there', async ({ page, world }, info) => {
    await openCuaderno(page, world.id);
    await press(pendingRow(page, `Faltaron 2 alumnos a ${EXAM}`), info);
    const s = absencesSheet(page);
    await s.getByRole('button', { name: 'Irene Esteban', exact: true }).click();
    await s.getByLabel('Fecha de la repesca').fill('2026-11-26');
    await s.getByRole('button', { name: 'Programar repesca (1)' }).click();
    await expect(toast(page, 'Repesca el 26 nov para 1 alumno. Su nota irá a esta columna.')).toBeVisible();
    await expect(s).toBeHidden();

    await expect(cell(page, PABLO, EXAM)).toHaveText('Pendiente');
    await expect(cell(page, PABLO, EXAM)).toHaveAccessibleName(`${PABLO} · ${EXAM}: faltó al examen, repesca programada`);
    await expect(pendingRow(page, `Faltó 1 alumno a ${EXAM}`)).toContainText('Esteban Mora, Irene · programar repesca o poner NP');
    const [rep] = await repeats(world);
    expect(rep).toMatchObject({ date: '2026-11-26', student_ids: [world.students[1].id] });
    expect((await gradebook(world.api, world.id)).activities).toHaveLength(1); // the repesca is not another column

    await typeGrade(page, info, PABLO, EXAM, '6,5');
    await page.keyboard.press('Escape');
    await expect(cell(page, PABLO, EXAM)).toHaveAccessibleName(`${PABLO} · ${EXAM}: 6,5, nota de la repesca`);
    await expect(average(page, PABLO)).toHaveAccessibleName(`Media de ${PABLO}: 6,5`);
    await expect.poll(async () => (await sheet(world.api, rep.id))[STUDENTS[1]]).toEqual({ score: 6.5, status: 'confirmed' });
    expect((await sheet(world.api, world.act[EXAM]))[STUDENTS[1]].status).toBe('empty');

    // «Ver repesca» in the sheet opens it
    await press(pendingRow(page, `Faltó 1 alumno a ${EXAM}`), info);
    await expect(s.getByText('Falta sin justificar · con nota')).toBeVisible();
    await press(s.getByRole('link', { name: 'Ver repesca' }), info);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${EXAM} (repesca)`);
  });

  test('cuaderno-62 · NP from the sheet; for a student with a repesca, the NP goes to the repesca', async ({ page, world }, info) => {
    const rep = await world.api.post(`/activities/${world.act[EXAM]}/repeat`, { date: '2026-11-26', student_ids: [world.students[1].id] });
    await openCuaderno(page, world.id);
    await expect(cell(page, PABLO, EXAM)).toHaveText('Pendiente');
    await press(pendingRow(page, `Faltó 1 alumno a ${EXAM}`), info);
    const s = absencesSheet(page);
    await expect(s.getByText('Falta sin justificar · repesca el 26 nov')).toBeVisible();
    await expect(s.getByRole('button', { name: 'Pablo Benítez', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await s.getByRole('button', { name: 'Pablo Benítez', exact: true }).click();
    await s.getByRole('button', { name: 'Poner NP (2)' }).click();
    const ask = confirmDialog(page, 'Poner NP a 2 alumnos');
    await expect(ask.getByText('Benítez Ruiz, Pablo; Esteban Mora, Irene. El NP no cuenta en la media. Puedes cambiarlo después desde el cuaderno.')).toBeVisible();
    await ask.getByRole('button', { name: 'Poner NP' }).click();
    await expect(toast(page, 'NP puesto a 2 alumnos')).toBeVisible();
    await expect(cell(page, PABLO, EXAM)).toHaveText('NP');
    await expect(cell(page, IRENE, EXAM)).toHaveText('NP');
    await expect(page.locator('.gb-pending')).toHaveCount(0);
    await expect.poll(async () => (await sheet(world.api, rep.id))[STUDENTS[1]].status).toBe('absent');
    const original = await sheet(world.api, world.act[EXAM]);
    expect([original[STUDENTS[1]].status, original[STUDENTS[4]].status]).toEqual(['empty', 'absent']);
  });

  test('cuaderno-63 · NP typed in a «Pendiente» cell is written in the repesca', async ({ page, world }, info) => {
    const rep = await world.api.post(`/activities/${world.act[EXAM]}/repeat`, { date: '2026-11-26', student_ids: [world.students[1].id] });
    await openCuaderno(page, world.id);
    await typeGrade(page, info, PABLO, EXAM, 'NP');
    await page.keyboard.press('Escape');
    await expect(cell(page, PABLO, EXAM)).toHaveText('NP');
    await expect.poll(async () => (await sheet(world.api, rep.id))[STUDENTS[1]].status).toBe('absent');
    expect((await sheet(world.api, world.act[EXAM]))[STUDENTS[1]].status).toBe('empty');
  });

  test('cuaderno-58 · a repesca whose day has passed without a grade shows up again as pending', async ({ page, world }) => {
    bug('CUA-10', 'PendingWork drops every student with a repesca (cell.activity_id) for good: after the repesca\'s day, still without a grade, the Cuaderno never flags him again');
    await world.api.post(`/activities/${world.act[EXAM]}/repeat`, { date: '2026-11-17', student_ids: [world.students[1].id] });
    await openCuaderno(page, world.id);
    await expect(cell(page, PABLO, EXAM)).toHaveText('Pendiente');
    await expect(page.locator('.gb-pending').first()).toContainText('Benítez Ruiz, Pablo');
  });

  test('cuaderno-64 · a grade typed for someone the list marks absent raises «ausente con nota»', async ({ page, world }, info) => {
    await openCuaderno(page, world.id);
    await typeGrade(page, info, PABLO, EXAM, '7');
    await page.keyboard.press('Escape');
    await expect(cell(page, PABLO, EXAM)).toHaveText('7');
    await expect.poll(async () => (await gradebook(world.api, world.id)).activities[0]).toMatchObject({ attendance_conflicts: 1, pending_absent: 1 });
    await expectPending(page, info, [`Faltó 1 alumno a ${EXAM}`, `${EXAM}: ausente con nota`], '1 falta en exámenes · 1 aviso de lista');
  });
});

/** The rows of «Pendiente»: two full rows on a computer; on a phone one summary row whose sheet lists them. */
async function expectPending(page: Page, info: TestInfo, titles: string[], summary: string) {
  if (!isMobile(info)) {
    for (const t of titles) await expect(pendingRow(page, t)).toBeVisible();
    await expect(page.getByRole('button', { name: `Pendiente en esta evaluación: ${summary}` })).toBeHidden();
    return;
  }
  for (const t of titles) await expect(pendingRow(page, t)).toBeHidden();
  const compact = page.getByRole('button', { name: `Pendiente en esta evaluación: ${summary}` });
  await compact.tap();
  const list = page.getByRole('dialog', { name: 'Pendiente en esta evaluación' });
  await expect(list.getByText(summary)).toBeVisible();
  for (const t of titles) await expect(list.getByRole('button', { name: new RegExp(`^${esc(t)}`) })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(list).toBeHidden();
}

test.describe('cuaderno · ausente con nota', () => {
  // Hugo is on the list as absent and yet has a 4: a paper given to the wrong student, or a list taken wrong.
  test.use({
    worldSpec: {
      ...FALTAS,
      activities: [{ title: EXAM, kind: 'exam', date: '2026-11-12', grades: [6, null, 7, 4, null, 8] }],
      absences: [...FALTAS.absences!, { date: '2026-11-12', start: '09:25', student: 3 }],
    },
  });

  test('cuaderno-65 · the warning opens the same sheet, which says who and what; phones fold the rows into one', async ({ page, world }, info) => {
    await openCuaderno(page, world.id);
    await expect(cell(page, HUGO, EXAM)).toHaveText('4');
    await expectPending(page, info, [`Faltaron 2 alumnos a ${EXAM}`, `${EXAM}: ausente con nota`], '2 faltas en exámenes · 1 aviso de lista');
    if (isMobile(info)) {
      await page.getByRole('button', { name: /^Pendiente en esta evaluación/ }).tap();
      await page.getByRole('dialog', { name: 'Pendiente en esta evaluación' }).getByRole('button', { name: new RegExp(`^${esc(EXAM)}: ausente con nota`) }).tap();
      await expect(page.getByRole('dialog', { name: 'Pendiente en esta evaluación' })).toBeHidden();
    } else {
      await expect(pendingRow(page, `${EXAM}: ausente con nota`)).toContainText('¿Hoja mal asignada o lista mal pasada? Figura como ausente y tiene hoja o nota');
      await pendingRow(page, `${EXAM}: ausente con nota`).click();
    }
    const s = absencesSheet(page);
    await expect(s.getByText('¿Hoja mal asignada o lista mal pasada? Díaz Soto, Hugo figura como ausente y tiene nota 4.')).toBeVisible();
    await expect(s.getByText('Falta sin justificar · con nota')).toBeVisible();
    await shot(page, info, '65-conflict');
    // Hugo has his grade: only Pablo and Irene can get a repesca or NP
    await expect(s.getByRole('button', { name: 'Hugo Díaz', exact: true })).toHaveCount(0);
    await expect(s.getByRole('button', { name: 'Programar repesca (2)' })).toBeVisible();
    expect(world.students).toHaveLength(6);
  });
});

// ── Recuperaciones ────────────────────────────────────────────────────────────
const U1 = 'Examen U1 · Números enteros';
const REC: CourseSpec = {
  ...CLASS,
  activities: [
    { title: U1, kind: 'exam', date: '2026-10-15', grades: [3, 8, 4, 6, 2, 9] },
    { title: 'Ficha · Enteros', kind: 'worksheet', date: '2026-10-20', grades: [3, 8, 4, 6, 2, 9] },
  ],
};

test.describe('cuaderno · recuperaciones', () => {
  test.use({ worldSpec: REC });

  test('cuaderno-66 · a recovery for the failing students: their cells alone, and the average says «rec.»', async ({ page, world }, info) => {
    const TITLE = 'Recuperación de la 1.ª evaluación';
    await openCuaderno(page, world.id);
    await page.getByRole('button', { name: 'Actividad', exact: true }).click();
    const s = page.getByRole('dialog', { name: 'Nueva actividad' });
    await s.getByRole('textbox', { name: 'Título' }).fill(TITLE);
    await s.getByRole('button', { name: 'Más opciones' }).click();
    await s.getByLabel('Cuenta para').selectOption({ label: 'Recuperar la 1.ª evaluación' });
    await expect(s.getByText('Recupera la 1.ª evaluación')).toBeVisible();
    await s.getByRole('button', { name: 'Toda la clase' }).click();
    for (const chip of ['Marta Alonso', 'Lucía Castro', 'Irene Esteban']) await s.getByRole('button', { name: chip, exact: true }).click();
    await s.getByRole('button', { name: 'Crear actividad' }).click();
    await expect(page).toHaveURL(/\/actividades\//); // an exam: its page first
    const created = (await gradebook(world.api, world.id)).activities.find((a) => a.title === TITLE)!;
    expect(created).toMatchObject({ counts_for: 'recovery', recovers_term: 1, student_ids: [0, 2, 4].map((i) => world.students[i].id) });

    await openCuaderno(page, world.id);
    await expect(column(page, TITLE)).not.toContainText('Recuperación ·'); // its title already says it: no tag
    await expect(column(page, TITLE).locator('.gb-head__tag')).toHaveCount(0);
    await expect(page.getByRole('cell', { name: `${PABLO} · ${TITLE}: no hace esta actividad` })).toBeVisible();
    await expect(average(page, MARTA)).toHaveAccessibleName(`Media de ${MARTA}: 3,0`);
    await typeGrade(page, info, MARTA, TITLE, '7');
    await expect(page.getByRole('textbox', { name: `${LUCIA} · ${TITLE}` })).toBeFocused(); // Enter skips Pablo
    await page.getByRole('textbox', { name: `${LUCIA} · ${TITLE}` }).fill('3');
    await page.getByRole('textbox', { name: `${LUCIA} · ${TITLE}` }).press('Enter');
    await expect(page.getByRole('textbox', { name: `${IRENE} · ${TITLE}` })).toBeFocused();
    await page.keyboard.press('Escape');

    await expect(average(page, MARTA)).toHaveAccessibleName(`Media de ${MARTA}: 7,0, con recuperación`);
    await expect(page.locator('tbody tr').first().locator('td.gb-avg')).toContainText('rec.');
    await expect(average(page, LUCIA)).toHaveAccessibleName(/^Media de Lucía Castro León: 4,0/); // a recovery never lowers
    await press(average(page, MARTA), info);
    const why = page.getByRole('dialog', { name: MARTA });
    await expect(why.getByText('Recuperación: 7,0 → la media pasa de 3,0 a 7,0 (la recuperación sustituye si es mayor).')).toBeVisible();
    await shot(page, info, '66-recovery');
  });

  test('cuaderno-67 · a recovery titled otherwise is tagged «Recuperación»; one of the final lives in «Final»', async ({ page, world }) => {
    const other = await world.api.post(`/courses/${world.id}/activities`, {
      title: 'Examen de repaso', kind: 'exam', date: '2026-11-18', counts_for: 'recovery', recovers_term: 1, student_ids: [world.students[0].id],
    });
    const final = await world.api.post(`/courses/${world.id}/activities`, {
      title: 'Prueba final de junio', kind: 'exam', date: '2027-06-10', counts_for: 'recovery', recovers_term: 4, student_ids: [world.students[4].id],
    });
    await openCuaderno(page, world.id);
    await expect(column(page, 'Examen de repaso').locator('.gb-head__tag')).toHaveText('Recuperación');
    await expect(column(page, 'Prueba final de junio')).toHaveCount(0);
    await openCuaderno(page, world.id, 4);
    await expect(column(page, 'Prueba final de junio').locator('.gb-head__tag')).toHaveText('Recuperación');
    await expect(page.getByRole('button', { name: `${IRENE} · Prueba final de junio: sin nota` })).toBeVisible();
    await expect(page.getByRole('cell', { name: `${MARTA} · Prueba final de junio: no hace esta actividad` })).toBeVisible();
    expect([other.term, final.recovers_term]).toEqual([1, 4]);
  });

  test('cuaderno-68 · «Cuenta para» offers the recovery of each term and of the final', async ({ page, world }) => {
    await openCuaderno(page, world.id);
    await page.getByRole('button', { name: 'Actividad', exact: true }).click();
    const s = page.getByRole('dialog', { name: 'Nueva actividad' });
    await s.getByRole('button', { name: 'Más opciones' }).click();
    const options = await s.getByLabel('Cuenta para').locator('option').allTextContents();
    expect(options).toEqual([
      'La media de la evaluación', 'No cuenta (evaluación inicial, diagnóstica)', 'Recuperar la 1.ª evaluación', 'Recuperar la 2.ª evaluación',
      'Recuperar la 3.ª evaluación', 'Recuperar la final',
    ]);
    expect(world.label).toBe('Matemáticas · 2.º ESO C');
  });
});

test.describe('cuaderno · recuperaciones en Bachillerato', () => {
  test.use({ worldSpec: { ...CLASS, subject: 'Matemáticas I', group: '1º Bach B', stage: 'bachillerato' } });

  test('cuaderno-69 · in Bachillerato the final recovery is the extraordinaria', async ({ page, world }) => {
    await openCuaderno(page, world.id);
    await page.getByRole('button', { name: 'Añadir actividad' }).click();
    const s = page.getByRole('dialog', { name: 'Nueva actividad' });
    await s.getByRole('button', { name: 'Más opciones' }).click();
    await expect(s.getByLabel('Cuenta para').locator('option').last()).toHaveText('Recuperar la final (extraordinaria)');
    await s.getByLabel('Cuenta para').selectOption({ label: 'Recuperar la final (extraordinaria)' });
    await expect(s.getByText('Recuperación extraordinaria')).toBeVisible();
    expect(world.group).toBe('1º Bach B');
  });
});
