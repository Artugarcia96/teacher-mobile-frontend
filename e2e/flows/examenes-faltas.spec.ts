import {
  answer, bug, detail, dialog, esc, expect, NAMES, openActivity, shot, stepHead, test, toast,
} from './examenes-helpers';

// Who missed the exam (docs/PRODUCT.md §4.3 · asistencia del día del examen): the attendance list of the exam day marks
// them «Faltó»; the exam page offers the sheet to schedule a repeat exam («repesca», its grades fill the same column)
// or put NP (in the repesca when there is one), refuses a number for them, and warns when someone marked absent has a
// grade («¿Hoja mal asignada o lista mal pasada?»). The repeat exam has its own page. A teacher of their own per test,
// no AI. (Before the exam day, and the focus review of a student with a repesca: e2e/exam-day.spec.ts.)

const EXAM = 'Examen U2 · Fracciones';
const DAY = '2026-11-17'; // Tuesday, 11:45 session
const [MARTA, PABLO, LUCIA] = NAMES;

test.describe('examenes · faltaron al examen', () => {
  test.use({
    worldSpec: {
      activities: [{ title: EXAM, date: DAY }],
      absences: [
        { date: DAY, start: '11:45', student: 1 },
        { date: DAY, start: '11:45', student: 2, justified: true },
      ],
    },
  });

  test('examenes-62 · «Faltaron 2» opens the sheet from the day\'s list: each one pending, all chosen, a date for the repesca', async ({ page, world }, info) => {
    const course = await world.api.get(`/courses/${world.id}`);
    await openActivity(page, `/clases/${world.id}/actividades/${world.act[EXAM]}`, EXAM);
    const missed = page.getByRole('button', { name: 'Faltaron 2 alumnos: programar repesca o poner NP' });
    await expect(missed).toHaveText('Faltaron 2');
    await missed.click();
    const sheet = dialog(page, `Faltaron a ${EXAM}`);
    await expect(sheet.getByText('martes, 17 de noviembre · según la lista de ese día')).toBeVisible();
    await expect(sheet.locator('.row').filter({ hasText: 'Benítez Ruiz, Pablo' })).toContainText('Falta sin justificar · pendiente');
    await expect(sheet.locator('.row').filter({ hasText: 'Castro León, Lucía' })).toContainText('Falta justificada · pendiente');
    for (const chip of ['Pablo Benítez', 'Lucía Castro']) await expect(sheet.getByRole('button', { name: chip })).toHaveAttribute('aria-pressed', 'true');
    await expect(sheet.getByLabel('Fecha de la repesca')).toHaveValue(course.next_session.date);
    await expect(sheet.getByText('Con las mismas preguntas de este examen. Sus notas ocupan el hueco de este examen.')).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Programar repesca (2)' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Poner NP (2)' })).toBeVisible();
    await shot(page, info, '62-absences');
    // Nobody chosen: no action, and it says why.
    await sheet.getByRole('button', { name: 'Pablo Benítez' }).click();
    await sheet.getByRole('button', { name: 'Lucía Castro' }).click();
    await expect(sheet.getByText('Elige al menos un alumno.')).toBeVisible();
    await expect(sheet.getByRole('button', { name: /^Programar repesca/ })).toHaveCount(0);
    await sheet.getByRole('button', { name: 'Cerrar' }).click();
    await expect(sheet).toBeHidden();
  });

  test('examenes-63 · «Programar repesca» for one: its date, its own page for them only, and it cannot be scheduled twice', async ({ page, world }, info) => {
    const id = world.act[EXAM];
    const pablo = world.students[1];
    await openActivity(page, `/clases/${world.id}/actividades/${id}`, EXAM);
    await page.getByRole('button', { name: /^Faltaron 2 alumnos/ }).click();
    const sheet = dialog(page, `Faltaron a ${EXAM}`);
    await sheet.getByRole('button', { name: 'Lucía Castro' }).click();
    await sheet.getByLabel('Fecha de la repesca').fill('2026-12-01');
    // The page reloads the exam once the repesca is saved (reopening the sheet before that: EX-03, examenes-82).
    const refreshed = page.waitForResponse((r) => r.url().endsWith(`/api/activities/${id}`) && r.request().method() === 'GET');
    await sheet.getByRole('button', { name: 'Programar repesca (1)' }).click();
    await expect(toast(page, 'Repesca el 1 dic para 1 alumno. Su nota irá a esta columna.')).toBeVisible();
    await expect(sheet).toBeHidden();
    await refreshed;
    const a = await detail(world.api, id);
    expect(a.repeats).toHaveLength(1);
    expect(a.repeats[0]).toMatchObject({ date: '2026-12-01', student_ids: [pablo.id], title: `${EXAM} (repesca)` });

    await page.getByRole('button', { name: /^Faltaron 2 alumnos/ }).click();
    const row = sheet.locator('.row').filter({ hasText: 'Benítez Ruiz, Pablo' });
    await expect(row).toContainText('Falta sin justificar · repesca el 1 dic');
    // Only Lucía is chosen now: Pablo already has his repesca.
    await expect(sheet.getByRole('button', { name: 'Pablo Benítez' })).toHaveAttribute('aria-pressed', 'false');
    await expect(sheet.getByRole('button', { name: 'Lucía Castro' })).toHaveAttribute('aria-pressed', 'true');
    await sheet.getByRole('button', { name: 'Pablo Benítez' }).click();
    await sheet.getByRole('button', { name: 'Programar repesca (2)' }).click();
    await expect(toast(page, /Pablo Benítez Ruiz ya tiene repesca el 1\/12/)).toBeVisible();
    await shot(page, info, '63-repeat-twice');
    expect((await detail(world.api, id)).repeats).toHaveLength(1);

    await row.getByRole('link', { name: 'Ver repesca' }).click();
    await expect(page.getByRole('heading', { level: 1, name: `${EXAM} (repesca)` })).toBeVisible();
    await expect(page.getByText('martes, 1 de diciembre · 1.ª evaluación · sobre 10')).toBeVisible();
    await expect(stepHead(page, 1, 'Preparar')).toBeVisible();
  });

  test('examenes-64 · «Poner NP» asks first, naming them; the NP of a student with a repesca goes to the repesca', async ({ page, world }) => {
    const id = world.act[EXAM];
    const [, pablo, lucia] = world.students;
    const rep = await world.api.post(`/activities/${id}/repeat`, { date: '2026-12-01', student_ids: [pablo.id] });
    await openActivity(page, `/clases/${world.id}/actividades/${id}`, EXAM);
    await page.getByRole('button', { name: /^Faltaron 2 alumnos/ }).click();
    const sheet = dialog(page, `Faltaron a ${EXAM}`);
    await sheet.getByRole('button', { name: 'Pablo Benítez' }).click(); // both chosen
    await sheet.getByRole('button', { name: 'Poner NP (2)' }).click();
    const ask = dialog(page, 'Poner NP a 2 alumnos');
    await expect(ask.getByText('Benítez Ruiz, Pablo; Castro León, Lucía. El NP no cuenta en la media. Puedes cambiarlo después desde el cuaderno.')).toBeVisible();
    await answer(page, 'Poner NP a 2 alumnos', 'Poner NP');
    await expect(toast(page, 'NP puesto a 2 alumnos')).toBeVisible();
    const original = await detail(world.api, id);
    const repeat = await detail(world.api, rep.id);
    const status = (a: { sheet: { student: { id: string }; status: string }[] }, sid: string) => a.sheet.find((r) => r.student.id === sid)?.status;
    expect([status(original, lucia.id), status(original, pablo.id), status(repeat, pablo.id)]).toEqual(['absent', 'empty', 'absent']);

    await page.getByRole('button', { name: /^Faltaron 2 alumnos/ }).click();
    await expect(sheet.locator('.row').filter({ hasText: 'Castro León, Lucía' })).toContainText('Falta justificada · NP');
    await expect(sheet.getByText('No queda nadie pendiente de este examen.')).toBeVisible();
  });

  test('examenes-65 · grades by hand: «Faltó» next to them, and only NP is accepted for them (never a number)', async ({ page, world }) => {
    const id = world.act[EXAM];
    await openActivity(page, `/clases/${world.id}/actividades/${id}`, EXAM);
    await page.getByRole('button', { name: /^Sin documento \(solo nota\)/ }).click();
    const rowOf = (name: string) => page.locator('.manual-grades .row').filter({ has: page.getByRole('textbox', { name: `Nota de ${name}` }) });
    await expect(rowOf(PABLO).getByText('Faltó')).toBeVisible();
    await expect(rowOf(LUCIA).getByText('Faltó')).toBeVisible();
    await expect(rowOf(MARTA).getByText('Faltó')).toHaveCount(0);
    const box = page.getByRole('textbox', { name: `Nota de ${PABLO}` });
    await box.fill('5');
    await box.press('Tab');
    await expect(toast(page, 'Faltó a este examen: ponle NP o espera a su repesca.')).toBeVisible();
    await expect(box).toHaveValue('');
    await box.fill('NP');
    await box.press('Tab');
    await expect.poll(async () => (await detail(world.api, id)).sheet[1].status).toBe('absent');
    await expect(box).toHaveValue('NP');
  });
});

test.describe('examenes · ausente con nota', () => {
  test.use({
    worldSpec: {
      activities: [{ title: EXAM, date: DAY, grades: [7, null, null, 6, null] }],
      absences: [{ date: DAY, start: '11:45', student: 3 }],
    },
  });

  test('examenes-66 · someone marked absent with a grade: «¿Hoja mal asignada o lista mal pasada?» on the exam and in its sheet', async ({ page, world }, info) => {
    await openActivity(page, `/clases/${world.id}/actividades/${world.act[EXAM]}`, EXAM);
    const warn = page.locator('.callout').filter({ hasText: '¿Hoja mal asignada o lista mal pasada?' });
    await expect(warn).toContainText('Díaz Soto, Hugo figura como ausente y tiene nota 6.');
    await shot(page, info, '66-conflict');
    await warn.getByRole('button', { name: 'Revisar' }).click();
    const sheet = dialog(page, `Faltaron a ${EXAM}`);
    await expect(sheet.getByText('Díaz Soto, Hugo figura como ausente y tiene nota 6.')).toBeVisible();
    await expect(sheet.locator('.row').filter({ hasText: 'Díaz Soto, Hugo' })).toContainText('Falta sin justificar · con nota');
    await expect(page.getByRole('button', { name: 'Faltó 1 alumno: programar repesca o poner NP' })).toHaveText('Faltó 1');
  });
});

test.describe('examenes · la repesca', () => {
  test.use({ worldSpec: { activities: [{ title: EXAM, date: DAY }], absences: [{ date: DAY, start: '11:45', student: 1 }] } });

  test('examenes-67 · the repesca\'s own page grades only its students, and the grade fills the original\'s column', async ({ page, world }, info) => {
    const id = world.act[EXAM];
    const pablo = world.students[1];
    const rep = await world.api.post(`/activities/${id}/repeat`, { date: '2026-11-19', student_ids: [pablo.id] });
    await openActivity(page, `/clases/${world.id}/actividades/${rep.id}`, `${EXAM} (repesca)`);
    await page.getByRole('button', { name: /^Sin documento \(solo nota\)/ }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Notas · 0 de 1' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /^Nota de / })).toHaveCount(1);
    const box = page.getByRole('textbox', { name: `Nota de ${PABLO}` });
    await box.fill('6,5');
    await box.press('Enter');
    await expect(page.getByRole('heading', { level: 2, name: 'Notas · 1 de 1' })).toBeVisible();
    await shot(page, info, '67-repeat');
    const gb = await world.api.get(`/courses/${world.id}/gradebook?term=1`);
    expect(gb.activities.map((a: { id: string }) => a.id)).not.toContain(rep.id); // one column: the original's
    const cell = gb.students.find((r: { student: { id: string } }) => r.student.id === pablo.id).grades[id];
    expect(cell).toMatchObject({ score: 6.5, status: 'confirmed', repeat: true });

    // Its focus review says «Repesca» on a phone.
    await page.goto(`/clases/${world.id}/actividades/${rep.id}/revisar?alumno=${pablo.id}`);
    await expect(page.getByRole('button', { name: `Volver a ${EXAM} (repesca)` })).toHaveText(info.project.name === 'mobile' ? 'Repesca' : `${EXAM} (repesca)`);
  });
});

test.describe('examenes · faltas en un examen escaneado (copia del demo)', () => {
  test('examenes-81 · after the scan: «Faltaron» leaves the header; a repesca and an NP are said in the row of papers received and in the class list', async ({ page, cloneExam, demo }, info) => {
    const exam = await cloneExam('fracciones');
    const c = await demo.get(`/activities/${exam.id}/correction`);
    const hugo = c.students.find((s: { missed: unknown; paper_id: string | null }) => s.missed && !s.paper_id).student;
    const carmen = c.students.find((s: { missed: unknown; paper_id: string | null }) => !s.missed && !s.paper_id).student;
    const received = c.students.filter((s: { paper_id: string | null }) => s.paper_id).length;
    await openActivity(page, exam.url, exam.title);
    await expect(page.getByRole('button', { name: /^Falt(ó|aron) \d/ })).toHaveCount(0); // only before scanning
    const row = page.getByRole('button', { name: new RegExp(`^${received} de ${c.students.length} hojas recibidas`) });
    // Students by first name, with the surname's initial when two of the class share it («Carmen C.»).
    const everyone = c.students.map((s: { student: { first_name: string } }) => s.student);
    const first = (x: { first_name: string; last_name: string }) =>
      everyone.filter((e: { first_name: string }) => e.first_name === x.first_name).length > 1 ? `${x.first_name} ${x.last_name[0]}.` : x.first_name;
    await expect(row).toContainText(`${first(carmen)} y ${first(hugo)}: pendientes`);
    await expect(row).toContainText('NP o repesca');

    // Hugo's repesca is scheduled (examenes-63 schedules one from the sheet); Carmen gets NP from the sheet.
    const rep = await demo.post(`/activities/${exam.id}/repeat`, { date: '2026-12-01', student_ids: [hugo.id] });
    await page.reload();
    await row.click();
    const sheet = dialog(page, `Sin hoja en ${exam.title}`);
    await expect(sheet.locator('.row').filter({ hasText: hugo.sort_name })).toContainText('Falta sin justificar · repesca el 1 dic');
    await expect(sheet.locator('.row').filter({ hasText: carmen.sort_name })).toContainText('Sin hoja · no consta falta en la lista');
    await sheet.getByRole('button', { name: 'Poner NP (1)' }).click();
    await answer(page, 'Poner NP a 1 alumno', 'Poner NP');
    await expect(toast(page, 'NP puesto a 1 alumno')).toBeVisible();

    // Everyone settled: the row stays, saying what was done, without the action.
    await expect(row).toContainText(`${first(carmen)}: NP`);
    await expect(row).toContainText(`${first(hugo)}: repesca el 1 dic`);
    await expect(row).not.toContainText('NP o repesca');
    const hugoRow = page.getByRole('link', { name: new RegExp(`^${esc(hugo.sort_name)} `) });
    await expect(hugoRow).toContainText('Repesca el 1 dic');
    await shot(page, info, '81-settled');

    // Graded in the repesca: «repesca, 6,5», and the class list shows it.
    await demo.put(`/activities/${rep.id}/grades`, { grades: [{ student_id: hugo.id, score: 6.5 }] });
    await page.reload();
    await expect(row).toContainText(`${first(hugo)}: repesca, 6,5`);
    await expect(hugoRow).toContainText('Nota de la repesca');
    await hugoRow.click();
    await expect(page.getByRole('heading', { level: 1, name: `${exam.title} (repesca)` })).toBeVisible();
  });
});

test.describe('examenes · la hoja de faltas justo después de programar una repesca', () => {
  test.use({ worldSpec: { activities: [{ title: EXAM, date: DAY }], absences: [{ date: DAY, start: '11:45', student: 1 }, { date: DAY, start: '11:45', student: 2 }] } });

  test('examenes-82 · reopened at once (a slow connection), the sheet does not choose again the student who now has a repesca', async ({ page, world }) => {
    bug('EX-03', 'ExamAbsencesSheet picks its students once, from the activity as cached: reopened before the refetch lands, it keeps choosing the student who now has a repesca («Poner NP (2)»), and never updates');
    const id = world.act[EXAM];
    await openActivity(page, `/clases/${world.id}/actividades/${id}`, EXAM);
    // The school Wi-Fi: the activity takes a while to come back after the repesca is scheduled.
    let slow = false;
    await page.route(`**/api/activities/${id}`, async (route) => {
      if (slow && route.request().method() === 'GET') await new Promise((r) => setTimeout(r, 2500));
      await route.fallback();
    });
    await page.getByRole('button', { name: /^Faltaron 2 alumnos/ }).click();
    const sheet = dialog(page, `Faltaron a ${EXAM}`);
    await sheet.getByRole('button', { name: 'Lucía Castro' }).click();
    slow = true;
    await sheet.getByRole('button', { name: 'Programar repesca (1)' }).click();
    await expect(toast(page, /^Repesca el /)).toBeVisible();
    await page.getByRole('button', { name: /^Faltaron 2 alumnos/ }).click();
    // Pablo has his repesca: only Lucía is still to decide.
    await expect(sheet.getByRole('button', { name: 'Poner NP (1)' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Pablo Benítez' })).toHaveAttribute('aria-pressed', 'false');
  });
});
