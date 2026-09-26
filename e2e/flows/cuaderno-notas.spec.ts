import {
  average, bug, cell, cellInput, CLASS, column, expect, isMobile, NAMES, openCuaderno, press, sheet, shot, STUDENTS, test, toast,
  typeGrade, type CourseSpec,
} from './cuaderno-helpers';

// Poner notas en el Cuaderno (docs/PRODUCT.md §4.5): tap a cell = numeric keypad; Enter goes down to the next student;
// Tab to the next column; NP beside the cell on phones; emptying the cell deletes the grade; the averages come from the
// server. Each test is a teacher of its own. A failed save («Sin guardar» · «Reintentar»): e2e/cuaderno-unsaved.spec.ts
// (the demo) and cuaderno-20 here (tap the cell to resend it).

const EXAM = 'Examen U1 · Números enteros';
const WORK = 'Ficha · Divisibilidad';
const TASK = 'Trabajo · Estadística';
const [MARTA, PABLO, LUCIA, HUGO, IRENE] = NAMES;

const WORLD: CourseSpec = {
  ...CLASS,
  activities: [
    { title: TASK, kind: 'task', date: '2026-11-05', max: 20 },
    { title: EXAM, kind: 'exam', date: '2026-11-12', grades: [null, null, null, 'EX'] },
    { title: WORK, kind: 'worksheet', date: '2026-11-17', grades: [8, 6, 9, null, 7, 5] },
  ],
};

test.describe('cuaderno · poner notas', () => {
  test.use({ worldSpec: WORLD });

  test('cuaderno-09 · a class opens on its Cuaderno: students by surname, the latest activity first, Media at the end', async ({ page, world }, info) => {
    await page.goto('/clases');
    await press(page.getByRole('link', { name: /Matemáticas · 2\.º ESO C/ }).first(), info);
    await expect(page).toHaveURL(new RegExp(`/clases/${world.id}$`));
    await expect(page.getByRole('group', { name: 'Secciones de la clase' }).getByRole('button', { name: 'Cuaderno' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.gb-corner')).toHaveText('Alumnos6');
    await expect(page.locator('tbody th a.gb-student')).toHaveText(STUDENTS.map((s) => s.replace(', ', '')));
    await expect(page.locator('thead th.gb-col .gb-head__title')).toHaveText([WORK, 'Examen U1', 'Trabajo · Estadística']);
    await expect(page.locator('thead th').last()).toHaveText('Nota');
    await expect(page.getByRole('link', { name: 'Media. Evaluar la 1.ª' })).toContainText('Evaluar ›');
    await expect(page.getByText('Toca una celda para poner nota.')).toBeVisible();
  });

  test('cuaderno-10 · type a grade, Enter goes down to the next student and it is saved', async ({ page, world }, info) => {
    await openCuaderno(page, world.id);
    await expect(cell(page, MARTA, EXAM)).toHaveText('—');
    await typeGrade(page, info, MARTA, EXAM, '7');
    // Enter: saved, and the next student is being typed
    await expect(cellInput(page, PABLO, EXAM)).toBeFocused();
    await expect(cell(page, MARTA, EXAM)).toHaveText('7');
    await cellInput(page, PABLO, EXAM).fill('5');
    await cellInput(page, PABLO, EXAM).press('Enter');
    await expect(cellInput(page, LUCIA, EXAM)).toBeFocused();
    await shot(page, info, '10-typing');
    await cellInput(page, LUCIA, EXAM).press('Escape');
    await expect(cell(page, PABLO, EXAM)).toHaveAccessibleName(`${PABLO} · ${EXAM}: 5`);

    await expect.poll(async () => {
      const s = await sheet(world.api, world.act[EXAM]);
      return [s[STUDENTS[0]], s[STUDENTS[1]]];
    }).toEqual([{ score: 7, status: 'confirmed' }, { score: 5, status: 'confirmed' }]);
    await page.reload();
    await expect(cell(page, MARTA, EXAM)).toHaveText('7');
    await expect(cell(page, PABLO, EXAM)).toHaveText('5');
  });

  test('cuaderno-11 · decimals with comma or apostrophe, shown as typed; Escape leaves without saving', async ({ page, world }, info) => {
    await openCuaderno(page, world.id);
    await typeGrade(page, info, MARTA, EXAM, '6,5');
    await cellInput(page, PABLO, EXAM).fill("7'25");
    await cellInput(page, PABLO, EXAM).press('Enter');
    await cellInput(page, LUCIA, EXAM).fill('8.75');
    await cellInput(page, LUCIA, EXAM).press('Escape');
    await expect(cellInput(page, LUCIA, EXAM)).toHaveCount(0);
    await expect(cell(page, MARTA, EXAM)).toHaveText('6,5');
    await expect(cell(page, PABLO, EXAM)).toHaveText('7,25');
    await expect(cell(page, LUCIA, EXAM)).toHaveText('—');
    await expect.poll(async () => {
      const s = await sheet(world.api, world.act[EXAM]);
      return [s[STUDENTS[0]].score, s[STUDENTS[1]].score, s[STUDENTS[2]].status];
    }).toEqual([6.5, 7.25, 'empty']);
  });

  test('cuaderno-12 · keyboard: Tab to the next column (and the next row), Shift+Tab back, arrows and Shift+Enter up and down', async ({ page, world }, info) => {
    await openCuaderno(page, world.id);
    // Columns, most recent first: Ficha (17 nov) · Examen U1 (12 nov) · Trabajo (5 nov, /20)
    await typeGrade(page, info, MARTA, WORK, '9', 'Tab');
    await expect(cellInput(page, MARTA, EXAM)).toBeFocused();
    await expect(cell(page, MARTA, WORK)).toHaveText('9');
    await cellInput(page, MARTA, EXAM).press('Tab');
    await expect(cellInput(page, MARTA, TASK)).toBeFocused();
    await cellInput(page, MARTA, TASK).press('Tab'); // last column: next student, first column
    await expect(cellInput(page, PABLO, WORK)).toBeFocused();
    await cellInput(page, PABLO, WORK).press('Shift+Tab');
    await expect(cellInput(page, MARTA, TASK)).toBeFocused();
    await cellInput(page, MARTA, TASK).press('ArrowDown');
    await expect(cellInput(page, PABLO, TASK)).toBeFocused();
    await cellInput(page, PABLO, TASK).press('ArrowDown');
    await cellInput(page, LUCIA, TASK).press('ArrowUp');
    await expect(cellInput(page, PABLO, TASK)).toBeFocused();
    await cellInput(page, PABLO, TASK).fill('14');
    await cellInput(page, PABLO, TASK).press('Shift+Enter');
    await expect(cellInput(page, MARTA, TASK)).toBeFocused();
    await cellInput(page, MARTA, TASK).press('Escape');
    await expect(page.locator('.gb-input')).toHaveCount(0);

    // Passing through cells without typing changed nothing; the two typed grades are saved
    await expect(cell(page, PABLO, TASK)).toHaveText('14');
    await expect(cell(page, PABLO, WORK)).toHaveText('6');
    await expect.poll(async () => [
      (await sheet(world.api, world.act[TASK]))[STUDENTS[1]], (await sheet(world.api, world.act[WORK]))[STUDENTS[0]],
      (await sheet(world.api, world.act[EXAM]))[STUDENTS[0]].status,
    ]).toEqual([{ score: 14, status: 'confirmed' }, { score: 9, status: 'confirmed' }, 'empty']);
  });

  test('cuaderno-13 · leaving a cell by tapping elsewhere saves what was typed', async ({ page, world }, info) => {
    await openCuaderno(page, world.id);
    await press(cell(page, LUCIA, EXAM), info);
    await cellInput(page, LUCIA, EXAM).fill('4');
    await press(page.getByRole('heading', { level: 1 }), info);
    await expect(page.locator('.gb-input')).toHaveCount(0);
    await expect(cell(page, LUCIA, EXAM)).toHaveText('4');
    await expect.poll(async () => (await sheet(world.api, world.act[EXAM]))[STUDENTS[2]]).toEqual({ score: 4, status: 'confirmed' });
  });

  test('cuaderno-14 · NP typed or, on a phone, with the NP button beside the cell', async ({ page, world }, info) => {
    await openCuaderno(page, world.id);
    await typeGrade(page, info, MARTA, EXAM, 'np');
    await expect(cell(page, MARTA, EXAM)).toHaveText('NP');
    await expect(cell(page, MARTA, EXAM)).toHaveAccessibleName(`${MARTA} · ${EXAM}: no presentado`);
    const quick = page.getByRole('button', { name: 'No presentado', exact: true });
    if (isMobile(info)) {
      // The keypad has no letters: NP sits beside the cell being typed (Pablo's, after Enter)
      await expect(cellInput(page, PABLO, EXAM)).toBeFocused();
      await shot(page, info, '14-np-button');
      await quick.tap();
      await expect(cell(page, PABLO, EXAM)).toHaveText('NP');
      await expect(cellInput(page, LUCIA, EXAM)).toBeFocused(); // and goes on to the next student
    } else {
      await expect(quick).toBeHidden();
    }
    await page.keyboard.press('Escape');
    await expect.poll(async () => {
      const s = await sheet(world.api, world.act[EXAM]);
      return [s[STUDENTS[0]].status, s[STUDENTS[1]].status];
    }).toEqual(['absent', isMobile(info) ? 'absent' : 'empty']);

    // NP does not count: Marta's average is still her worksheet alone, and «Cómo se calcula» says why
    await expect(average(page, MARTA)).toHaveAccessibleName(`Media de ${MARTA}: 8,0`);
    await press(average(page, MARTA), info);
    await expect(page.getByRole('dialog', { name: MARTA }).getByText(`${EXAM}: NP`)).toBeVisible();
  });

  test('cuaderno-15 · emptying a cell deletes the grade and the average follows', async ({ page, world }, info) => {
    await openCuaderno(page, world.id);
    await expect(average(page, MARTA)).toHaveAccessibleName(`Media de ${MARTA}: 8,0`);
    await typeGrade(page, info, MARTA, WORK, '');
    await page.keyboard.press('Escape');
    await expect(cell(page, MARTA, WORK)).toHaveText('—');
    await expect(cell(page, MARTA, WORK)).toHaveAccessibleName(`${MARTA} · ${WORK}: sin nota`);
    await expect(average(page, MARTA)).toHaveAccessibleName(`Media de ${MARTA}: —`);
    await expect.poll(async () => (await sheet(world.api, world.act[WORK]))[STUDENTS[0]]).toEqual({ score: null, status: 'empty' });
  });

  test('cuaderno-16 · a grade out of range or not a number is refused and nothing is saved', async ({ page, world }, info) => {
    const puts: string[] = [];
    page.on('request', (r) => { if (r.method() === 'PUT' && r.url().includes('/grades')) puts.push(r.url()); });
    await openCuaderno(page, world.id);
    await press(cell(page, PABLO, WORK), info);
    const input = cellInput(page, PABLO, WORK);
    for (const wrong of ['11', '-1', 'abc']) {
      await input.fill(wrong);
      await input.press('Enter');
      await expect(toast(page, 'Escribe una nota de 0 a 10 o NP').last()).toBeVisible();
      await expect(input).toBeFocused(); // still typing the same cell
      await expect(input).toHaveValue(wrong);
    }
    await shot(page, info, '16-refused');
    await input.press('Escape');
    await expect(cell(page, PABLO, WORK)).toHaveText('6');
    expect(puts).toEqual([]);
    expect((await sheet(world.api, world.act[WORK]))[STUDENTS[1]]).toEqual({ score: 6, status: 'confirmed' });
  });

  test('cuaderno-17 · a column out of 20: its header says so, 15 is fine, 25 is refused', async ({ page, world }, info) => {
    await openCuaderno(page, world.id);
    await expect(column(page, TASK)).toContainText('/20');
    await expect(column(page, WORK)).not.toContainText('/');
    await typeGrade(page, info, IRENE, TASK, '25');
    await expect(toast(page, 'Escribe una nota de 0 a 20 o NP')).toBeVisible();
    await cellInput(page, IRENE, TASK).fill('15');
    await cellInput(page, IRENE, TASK).press('Escape');
    await expect(cell(page, IRENE, TASK)).toHaveText('—');
    await typeGrade(page, info, IRENE, TASK, '15');
    await page.keyboard.press('Escape');
    await expect(cell(page, IRENE, TASK)).toHaveText('15');
    // On its own scale in the cell; in the average it weighs as a 7,5 out of 10 (Trabajos y fichas: 7 and 7,5)
    await expect(average(page, IRENE)).toHaveAccessibleName(`Media de ${IRENE}: 7,3`);
    await expect.poll(async () => (await sheet(world.api, world.act[TASK]))[STUDENTS[4]]).toEqual({ score: 15, status: 'confirmed' });
  });

  test('cuaderno-18 · the averages come from the server and follow every grade', async ({ page, world }, info) => {
    await openCuaderno(page, world.id);
    const classRow = page.locator('tfoot tr');
    await expect(classRow.locator('td.gb-avg')).toHaveText('7,0'); // 8 6 9 7 5
    await expect(average(page, MARTA)).toHaveAccessibleName(`Media de ${MARTA}: 8,0`);
    await typeGrade(page, info, MARTA, EXAM, '5');
    await page.keyboard.press('Escape');
    // Exámenes 60 % and Trabajos y fichas 30 %: (5 × 60 + 8 × 30) / 90 = 6,0
    await expect(average(page, MARTA)).toHaveAccessibleName(`Media de ${MARTA}: 6,0`);
    const examFoot = classRow.locator('td.gb-cell').nth(1);
    await expect(examFoot).toHaveText('5,0');
    if (!isMobile(info)) {
      // Desktop also shows «Nota», the grade that counts (the proposal: 6, Bien)
      const nota = page.locator('tbody tr').first().locator('td.gb-prop');
      await expect(nota).toHaveText('6BI');
    }
    const gb = await world.api.get(`/courses/${world.id}/gradebook?term=1`);
    expect(gb.students[0].average).toBeCloseTo(6, 5);
  });

  test('cuaderno-19 · an exempt student shows «Ex.»; looking at the cell and leaving it keeps it exempt', async ({ page, world }, info) => {
    bug('CUA-01', 'opening an «Ex.» cell and leaving it without typing deletes the exemption (the input starts empty and blur saves it)');
    await openCuaderno(page, world.id);
    await expect(cell(page, HUGO, EXAM)).toHaveText('Ex.');
    await expect(cell(page, HUGO, EXAM)).toHaveAccessibleName(`${HUGO} · ${EXAM}: exento`);
    await press(cell(page, HUGO, EXAM), info);
    await expect(cellInput(page, HUGO, EXAM)).toBeFocused();
    await press(page.getByRole('heading', { level: 1 }), info);
    await expect(page.locator('.gb-input')).toHaveCount(0);
    await page.waitForLoadState('networkidle');
    expect((await sheet(world.api, world.act[EXAM]))[STUDENTS[3]].status).toBe('exempt');
    await expect(cell(page, HUGO, EXAM)).toHaveText('Ex.');
  });

  test('cuaderno-20 · a grade that did not save can be resent by tapping its «Sin guardar» cell', async ({ page, world }, info) => {
    await openCuaderno(page, world.id);
    await page.route('**/api/activities/*/grades', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Servidor no disponible' }) }));
    await typeGrade(page, info, LUCIA, EXAM, '8');
    await page.keyboard.press('Escape');
    // A server that does not answer is not a refusal: no notice, the cell keeps it as «Sin guardar».
    const unsaved = page.getByRole('button', { name: `${LUCIA} · ${EXAM}: 8, sin guardar. Toca para reintentar` });
    await expect(unsaved).toContainText('Sin guardar');
    await expect(page.getByText('1 nota sin guardar')).toBeVisible();

    // Still failing: stays unsaved
    await press(unsaved, info);
    await expect(unsaved).toBeVisible();
    await page.unroute('**/api/activities/*/grades');
    await press(unsaved, info);
    await expect(cell(page, LUCIA, EXAM)).toHaveText('8');
    await expect(page.getByText('1 nota sin guardar')).toHaveCount(0);
    await expect.poll(async () => (await sheet(world.api, world.act[EXAM]))[STUDENTS[2]]).toEqual({ score: 8, status: 'confirmed' });
  });

  test('cuaderno-21 · typing the grade a cell already has sends nothing', async ({ page, world }, info) => {
    const puts: string[] = [];
    page.on('request', (r) => { if (r.method() === 'PUT' && r.url().includes('/grades')) puts.push(r.url()); });
    await openCuaderno(page, world.id);
    await typeGrade(page, info, MARTA, WORK, '8');
    await cellInput(page, PABLO, WORK).fill('6,0');
    await cellInput(page, PABLO, WORK).press('Enter');
    await cellInput(page, LUCIA, WORK).press('Escape');
    await expect(cell(page, PABLO, WORK)).toHaveText('6');
    await page.waitForLoadState('networkidle');
    expect(puts).toEqual([]);
  });

  test('cuaderno-25 · a student who joins today: nothing before today is «sin nota» in their average', async ({ page, world }, info) => {
    bug('CUA-09', 'the gradebook ignores enrollment_since: a student added today gets cells in earlier activities and «Cómo se calcula» lists them as «sin nota» (PRODUCT §4.1: nada anterior le falta)');
    const [nuria] = await world.api.post(`/groups/${world.groupId}/students`, { students: [{ first_name: 'Nuria', last_name: 'Vidal Ruiz' }] });
    await openCuaderno(page, world.id);
    await press(average(page, 'Nuria Vidal Ruiz'), info);
    const why = page.getByRole('dialog', { name: 'Nuria Vidal Ruiz' });
    await expect(why.getByText('Todavía no hay notas que cuenten.')).toBeVisible();
    await expect(why.getByText(/: sin nota$/)).toHaveCount(0);
    expect(nuria.first_name).toBe('Nuria');
  });

  test('cuaderno-22 · a student name opens their file', async ({ page, world }) => {
    await openCuaderno(page, world.id);
    await page.locator('tbody').getByRole('link', { name: /Castro León/ }).click();
    await expect(page).toHaveURL(new RegExp(`/alumnos/${world.students[2].id}`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(LUCIA);
  });
});

// ── Phone layout ─────────────────────────────────────────────────────────────
const MANY = Array.from({ length: 28 }, (_, i) => `Apellido${String(i + 1).padStart(2, '0')} Prueba, Alumno${String(i + 1).padStart(2, '0')}`);
const LONG: CourseSpec = {
  ...CLASS,
  students: MANY,
  activities: ['Examen U1', 'Ficha 1', 'Ficha 2', 'Oral 1', 'Cuaderno 1', 'Examen U2', 'Ficha 3'].map((title, i) => ({
    title, kind: title.startsWith('Examen') ? 'exam' as const : 'worksheet' as const, date: `2026-11-${String(2 + i * 2).padStart(2, '0')}`,
  })),
};

test.describe('cuaderno · en el móvil', () => {
  test.use({ worldSpec: LONG });

  test('cuaderno-23 · the cell being typed stays above the tab capsule down to the last student', async ({ page, world }, info) => {
    test.skip(!isMobile(info), 'the floating tab capsule is the phone layout');
    await openCuaderno(page, world.id);
    const capsule = page.locator('nav.tabcap');
    await expect(capsule).toBeVisible();
    const name = (i: number) => `Alumno${String(i).padStart(2, '0')} Apellido${String(i).padStart(2, '0')} Prueba`;
    await typeGrade(page, info, name(20), 'Examen U2', '5');
    for (let i = 21; i <= 28; i++) {
      const input = cellInput(page, name(i), 'Examen U2');
      await expect(input).toBeFocused();
      await expect.poll(async () => {
        const box = await input.boundingBox();
        const cap = await capsule.boundingBox();
        return box && cap ? box.y + box.height <= cap.y : false;
      }, { message: `row ${i} above the capsule` }).toBe(true);
      await input.fill('6');
      await input.press('Enter');
    }
    await shot(page, info, '23-last-row');
    await expect(cell(page, name(28), 'Examen U2')).toHaveText('6');
    // The hint does not talk about keys a phone does not have
    await expect(page.getByText('Toca una celda para poner nota.')).toBeVisible();
    await expect(page.getByText('Enter baja al siguiente alumno')).toBeHidden();
    expect(world.students).toHaveLength(28);
  });

  test('cuaderno-24 · with more columns than fit, the edge fades until the last one is in view', async ({ page, world }, info) => {
    const scroller = page.locator('.gb-scroll');
    await openCuaderno(page, world.id);
    if (!isMobile(info)) {
      await expect(page.getByText('Enter baja al siguiente alumno, Tab pasa a la siguiente actividad.')).toBeVisible();
      return; // seven columns fit on a computer
    }
    await expect(scroller).toHaveClass(/gb-scroll--more/);
    await scroller.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
    await expect(scroller).not.toHaveClass(/gb-scroll--more/);
    await expect(column(page, 'Examen U1')).toBeInViewport();
  });
});
