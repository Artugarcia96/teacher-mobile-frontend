import type { Page } from '@playwright/test';
import {
  bug, demoCourse, DEMO_2B, demoStudent, expect, isMobile, MATES_2C, openFile, section, shot, test,
  toast, type CourseSpec,
} from './alumnos-helpers';

// Ficha del alumno: the header (marks, measures), Notas with the same numbers as the Cuaderno (AI drafts, NP, adapted
// versions, «No cuenta», comments, «Exámenes pendientes»), Asistencia of the term (justify in place, «Deshacer»),
// a student in two classes, the way back, and the not-found and failed states. No AI.

/** Marta Alonso Gil (index 0) with a bit of everything; Pablo Benítez (1) was absent (NP) in Examen U1. */
const FICHA_CLASS: CourseSpec = {
  ...MATES_2C,
  activities: [
    { title: 'Prueba inicial', kind: 'exam', date: '2026-09-18', countsFor: 'none', grades: [3, 4] },
    { title: 'Examen U1 · Fracciones', kind: 'exam', date: '2026-10-15', grades: [6.5, 'NP', 8], comments: ['Repasar el m.c.m.'] },
    { title: 'Ficha de problemas', kind: 'worksheet', date: '2026-10-20', max: 20, grades: [14, 12, 16] },
    // Corrected for the others, not for Marta: an exam pending for her.
    { title: 'Examen U2 · Proporcionalidad', kind: 'exam', date: '2026-11-12', grades: [null, 7, 6] },
  ],
  marks: [
    { student: 0, date: '2026-11-13', start: '12:40', status: 'late' },
    { student: 0, date: '2026-11-16', start: '08:30', status: 'absent' },
    { student: 0, date: '2026-11-17', start: '09:25', status: 'justified', note: 'Cita médica' },
  ],
  homework: [
    { date: '2026-11-09', start: '08:30', marks: [{ student: 0, status: 'not_done' }] },
    { date: '2026-11-10', start: '09:25', marks: [{ student: 0, status: 'partial' }] },
    { date: '2026-11-13', start: '12:40', marks: [] },
  ],
  notes: [
    { students: [0], kind: 'family', date: '2026-10-01', text: 'Llamada con la madre.' },
    { students: [0], kind: 'positive', date: '2026-11-05', text: 'Ayuda a sus compañeros.' },
    { students: [0, 1], kind: 'observation', date: '2026-11-10', text: 'Trabajan bien en pareja.' },
    { students: [0], kind: 'incident', date: '2026-11-18', text: 'No trae el material por tercera vez.' },
  ],
};

const avg = (v: number) => v.toFixed(1).replace('.', ',');

test.describe('a student with a bit of everything', () => {
  test.use({ teacherSpec: { courses: [FICHA_CLASS] } });

  test('alumnos-30 header, Notas by term (mobile: «Ver 4 notas») with the grades as they were put', async ({ page, teacher }, info) => {
    const [c] = teacher.courses;
    const marta = c.students[0];
    const file = await teacher.api.get(`/students/${marta.id}`);
    const t1 = file.courses[0].terms[0];
    await openFile(page, marta.id, 'Marta Alonso Gil');
    await expect(page.locator('.page-head .eyebrow')).toHaveText('2.º ESO C');
    await expect(page.getByRole('button', { name: 'Anotar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Preparar tutoría' })).toBeVisible();

    const notas = section(page, 'Notas');
    // One class: no class row. The terms: the proposal (integer) with the average under it; the rest «—».
    await expect(notas.getByRole('link', { name: /Matemáticas/ })).toHaveCount(0);
    const terms = notas.locator('.st-term');
    await expect(terms.locator('.st-term__label')).toHaveText(['1.ª', '2.ª', '3.ª', 'Final']);
    await expect(terms.nth(0).locator('.grade-pill')).toHaveText(String(t1.proposed));
    await expect(terms.nth(0).locator('.st-term__avg')).toHaveText(`media ${avg(t1.average)}`);
    await expect(terms.nth(1).locator('.grade-pill')).toHaveText('—');
    await expect(terms.nth(3).locator('.grade-pill')).toHaveText('—');
    // The same average as Clase › Alumnos.
    const roster = await teacher.api.get(`/courses/${c.id}/students`);
    expect(roster.find((s: { id: string }) => s.id === marta.id).term_average).toBe(t1.average);

    // Pending: corrected for the others, not for her.
    await expect(notas.locator('.row').filter({ hasText: 'Exámenes pendientes' })).toContainText('Examen U2 · Proporcionalidad (12 nov)');

    const grades = notas.locator('.row').filter({ has: page.locator('.row__sub') }).filter({ hasNotText: 'Exámenes pendientes' });
    if (isMobile(info)) {
      const more = notas.getByRole('button', { name: 'Ver 4 notas' });
      await expect(more).toHaveAttribute('aria-expanded', 'false');
      await expect(grades).toHaveCount(0);
      await more.click();
      await expect(notas.getByRole('button', { name: 'Ocultar notas' })).toHaveAttribute('aria-expanded', 'true');
    } else {
      await expect(notas.getByRole('button', { name: /Ver \d+ notas/ })).toHaveCount(0); // desktop: already open
    }
    // Newest first; each grade as it was put (14/20), the comment under it, «No cuenta» for the initial test. The
    // homework checks make «Deberes (1.ª)»: 10 × (1 done + 0,5 partial) / 3 checks.
    await expect(grades.locator('.row__title')).toHaveText(['Deberes (1.ª)', 'Ficha de problemas', 'Examen U1 · Fracciones', 'Prueba inicial']);
    await expect(grades.nth(0)).toContainText('9 nov · Trabajos y fichas');
    await expect(grades.nth(0).locator('.row__trail')).toHaveText('5');
    await expect(grades.nth(0).locator('.ai-badge')).toHaveCount(0);
    await expect(grades.nth(1)).toContainText('20 oct · Trabajos y fichas');
    await expect(grades.nth(1).locator('.row__trail')).toHaveText('14/20');
    await expect(grades.nth(2).locator('.row__trail')).toHaveText('6,5');
    await expect(grades.nth(2)).toContainText('15 oct · Exámenes');
    await expect(grades.nth(2)).toContainText('«Repasar el m.c.m.»');
    await expect(grades.nth(3).locator('.chip')).toHaveText('No cuenta');
    await shot(page, info, 'ficha-notas');
    if (isMobile(info)) {
      await notas.getByRole('button', { name: 'Ocultar notas' }).click();
      await expect(grades).toHaveCount(0);
    }
  });

  test('alumnos-31 the term grade set in Evaluación shows instead of the proposal; «Final» once there is one', async ({ page, teacher }) => {
    const [c] = teacher.courses;
    const marta = c.students[0];
    await teacher.api.put(`/courses/${c.id}/evaluation/1/students/${marta.id}`, { final_grade: 9 });
    await teacher.api.put(`/courses/${c.id}/evaluation/4/students/${marta.id}`, { final_grade: 8 });
    const file = await teacher.api.get(`/students/${marta.id}`);
    await openFile(page, marta.id, 'Marta Alonso Gil');
    const terms = section(page, 'Notas').locator('.st-term');
    await expect(terms.nth(0).locator('.grade-pill')).toHaveText('9');
    await expect(terms.nth(0).locator('.st-term__avg')).toHaveText(`media ${avg(file.courses[0].terms[0].average)}`);
    await expect(terms.nth(3).locator('.grade-pill')).toHaveText('8');
  });

  test('alumnos-32 Asistencia: the counts, the dated list, justify with «Deshacer»; a late is only shown', async ({ page, teacher }, info) => {
    const [c] = teacher.courses;
    const marta = c.students[0];
    await openFile(page, marta.id, 'Marta Alonso Gil');
    const asis = section(page, 'Asistencia');
    const head = asis.locator('button[aria-expanded]');
    await expect(head).toContainText('2 faltas (1 justificada) · 1 retraso en la 1.ª evaluación');
    await expect(head).toContainText('Deberes: no hizo 1 de 3 · 1 incompleto');
    await expect(head).toHaveAttribute('aria-expanded', 'false');
    await head.click();
    await expect(head).toHaveAttribute('aria-expanded', 'true');

    // Newest first, with the note of the list.
    const rows = asis.locator('.row').filter({ hasText: /nov · / });
    await expect(rows.locator('.row__title')).toHaveText(['mar 17 nov · 09:25', 'lun 16 nov · 08:30', 'vie 13 nov · 12:40']);
    await expect(rows.nth(0)).toContainText('Falta justificada · Cita médica');
    await expect(rows.nth(2)).toContainText('Retraso');
    await expect(asis.getByRole('button', { name: /vie 13 nov/ })).toHaveCount(0); // a late cannot be justified
    await shot(page, info, 'ficha-asistencia');

    const absent = asis.getByRole('button', { name: 'lun 16 nov · 08:30, Falta sin justificar: justificar' });
    await absent.click();
    await expect(toast(page, 'Falta justificada')).toBeVisible();
    await expect(asis.getByRole('button', { name: 'lun 16 nov · 08:30, Falta justificada: quitar justificación' })).toBeVisible();
    await expect(head).toContainText('2 faltas (2 justificadas)');
    let list = await teacher.api.get(`/courses/${c.id}/attendance?date=2026-11-16&start=08:30`);
    expect(JSON.stringify(list)).toContain('"justified"');

    // «Deshacer» in the notice puts it back.
    await toast(page, 'Falta justificada').getByRole('button', { name: 'Deshacer' }).click();
    await expect(toast(page, 'Deshecho')).toBeVisible();
    await expect(absent).toBeVisible();
    await expect(head).toContainText('2 faltas (1 justificada)');
    list = await teacher.api.get(`/courses/${c.id}/attendance?date=2026-11-16&start=08:30`);
    expect(JSON.stringify(list)).not.toContain('"justified"');

    // The justified one keeps its note when the justification goes.
    await asis.getByRole('button', { name: 'mar 17 nov · 09:25, Falta justificada · Cita médica: quitar justificación' }).click();
    await expect(toast(page, 'Justificación quitada')).toBeVisible();
    await expect(asis.getByRole('button', { name: 'mar 17 nov · 09:25, Falta sin justificar · Cita médica: justificar' })).toBeVisible();

    // Tap the counts again to fold the list.
    await head.click();
    await expect(rows).toHaveCount(0);
  });

  test('alumnos-35 opened directly, back goes to the class roster («‹ 2.º ESO C»)', async ({ page, teacher }) => {
    const [c] = teacher.courses;
    await openFile(page, c.students[0].id, 'Marta Alonso Gil');
    await page.getByRole('button', { name: '2.º ESO C' }).click();
    await expect(page).toHaveURL(new RegExp(`/clases/${c.id}/alumnos$`));
  });
});

test.describe('pending exams', () => {
  test.use({
    teacherSpec: {
      courses: [{
        ...MATES_2C,
        students: ['Alonso Gil, Marta', 'Benítez Ruiz, Pablo', 'Castro León, Lucía'],
        activities: [
          { title: 'Prueba inicial', kind: 'exam', date: '2026-09-18', countsFor: 'none', grades: [null, 5, 5] },
          { title: 'Examen U1', kind: 'exam', date: '2026-10-15', grades: [7, 'NP', 6] },
          { title: 'Trabajo de fracciones', kind: 'worksheet', date: '2026-11-02', grades: [null, 7, 7] },
          { title: 'Examen U2', kind: 'exam', date: '2026-11-05', grades: [null, 5, 8] },
          // Nobody has a grade yet: still the teacher's to correct, nobody's pending exam.
          { title: 'Examen U3', kind: 'exam', date: '2026-11-12' },
          // Today: not pending yet.
          { title: 'Control de hoy', kind: 'exam', date: '2026-11-19', grades: [null, 6, 6] },
        ],
      }],
    },
  });

  test('alumnos-42 «Exámenes pendientes»: past counted exams corrected for others, with NP marked; a repeat grade covers it', async ({ page, teacher }, info) => {
    const [c] = teacher.courses;
    const [marta, pablo, lucia] = c.students;
    const pending = (p: Page) => section(p, 'Notas').locator('.row').filter({ hasText: 'Exámenes pendientes' });
    await openFile(page, marta.id, 'Marta Alonso Gil');
    await expect(pending(page).locator('.row__sub')).toHaveText('Examen U2 (5 nov)');
    await openFile(page, pablo.id, 'Pablo Benítez Ruiz');
    await expect(pending(page).locator('.row__sub')).toHaveText('Examen U1 (15 oct, NP)');
    await shot(page, info, 'ficha-pendientes');
    await openFile(page, lucia.id, 'Lucía Castro León');
    await expect(section(page, 'Notas').locator('.st-term').first()).toBeVisible();
    await expect(pending(page)).toHaveCount(0);

    // Pablo sits the repeat («repesca») of Examen U1: its grade covers the original, and the repeat never shows alone.
    const u1 = c.activities[1];
    const repeat = await teacher.api.post(`/activities/${u1.id}/repeat`, { date: '2026-11-17', student_ids: [pablo.id] });
    await openFile(page, pablo.id, 'Pablo Benítez Ruiz');
    await expect(pending(page).locator('.row__sub')).toHaveText('Examen U1 (15 oct, NP)');
    await teacher.api.put(`/activities/${repeat.id}/grades`, { grades: [{ student_id: pablo.id, score: 6.5 }] });
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Pablo Benítez Ruiz' })).toBeVisible();
    await expect(section(page, 'Notas').locator('.st-term').first()).toBeVisible();
    await expect(pending(page)).toHaveCount(0);
    expect((await teacher.api.get(`/students/${pablo.id}`)).courses[0].pending_exams).toEqual([]);
  });
});

test.describe('a student in two classes of the same group', () => {
  test.use({
    teacherSpec: {
      courses: [
        { ...MATES_2C, notes: [{ students: [0], kind: 'observation', date: '2026-11-10', text: 'Atenta en clase.' }] },
        { subject: 'Física y Química', short: 'FyQ', sameGroupAs: 0, color: 'indigo', slots: [],
          notes: [{ students: [0], kind: 'positive', date: '2026-11-12', text: 'Buen informe de laboratorio.' }] },
      ],
    },
  });

  test('alumnos-36 one block per class (with a link to its Cuaderno), notes say their class, back says «Clases»', async ({ page, teacher }, info) => {
    const [mates, fyq] = teacher.courses;
    await openFile(page, mates.students[0].id, 'Marta Alonso Gil');
    const notas = section(page, 'Notas');
    await expect(notas.getByRole('link', { name: 'Matemáticas · 2.º ESO C' })).toBeVisible();
    await expect(notas.getByRole('link', { name: 'Física y Química · 2.º ESO C' })).toBeVisible();
    await expect(section(page, 'Asistencia').getByText('Física y Química · 2.º ESO C')).toBeVisible();
    const obs = section(page, 'Observaciones');
    await expect(obs.locator('.st-note').filter({ hasText: 'Buen informe de laboratorio.' })).toContainText('12 nov · Física y Química · 2.º ESO C');
    await expect(obs.locator('.st-note').filter({ hasText: 'Atenta en clase.' })).toContainText('10 nov · Matemáticas · 2.º ESO C');
    await shot(page, info, 'ficha-dos-clases');

    await notas.getByRole('link', { name: 'Física y Química · 2.º ESO C' }).click();
    await expect(page).toHaveURL(new RegExp(`/clases/${fyq.id}/cuaderno$`));
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1, name: 'Marta Alonso Gil' })).toBeVisible();
    // Opened directly (a reload has no origin), with two classes: back goes to Clases.
    await page.reload();
    await page.getByRole('button', { name: 'Clases', exact: true }).first().click();
    await expect(page).toHaveURL(/\/clases$/);
  });
});

test.describe('the order of groups and classes', () => {
  // Eight groups of Matemáticas with the same student: the ficha names them in the order of the class list. (Eight, so
  // that the database's own order matches the class list by chance once in 40 320 runs, not once in 120.)
  const groups = ['1º ESO A', '1º ESO B', '1º ESO C', '1º ESO D', '1º ESO E', '1º ESO F', '1º ESO G', '1º ESO H'];
  test.use({
    teacherSpec: { courses: groups.map((g, i) => ({ subject: 'Matemáticas', group: g, students: i === 0 ? ['Alonso Gil, Marta'] : [] })) },
  });

  test('alumnos-37 the ficha lists her groups and classes in the order of the class list', async ({ page, teacher }) => {
    bug('BUG-ALUMNOS-04', 'the student file lists groups (eyebrow) and classes (Notas, Asistencia) in database order, not in the class-list order');
    const marta = teacher.courses[0].students[0];
    for (const c of teacher.courses.slice(1)) await teacher.api.post(`/groups/${c.groupId}/students`, { student_ids: [marta.id] });
    await openFile(page, marta.id, 'Marta Alonso Gil');
    await expect(page.locator('.page-head .eyebrow')).toHaveText(groups.map((g) => g.replace('º', '.º')).join(' · '));
    await expect(section(page, 'Notas').getByRole('link')).toHaveText(groups.map((g) => `Matemáticas · ${g.replace('º', '.º')}`));
  });
});

test.describe('demo students (read only)', () => {
  const file = async (page: Page, demo: any, sortName: string, name: string) => {
    const s = await demoStudent(demo, await demoCourse(demo, DEMO_2B), sortName);
    await openFile(page, s.id, name);
    return s;
  };
  const openGrades = async (page: Page, info: { project: { name: string } }) => {
    if (info.project.name === 'mobile') await section(page, 'Notas').getByRole('button', { name: /^Ver \d+ notas$/ }).click();
  };

  test('alumnos-38 header marks and measures: «NEAE · Dislexia» and its chips; the adaptation details', async ({ page, demo }, info) => {
    await file(page, demo, 'López Vázquez, Rubén', 'Rubén López Vázquez');
    await expect(page.locator('.st-support .chip')).toHaveText(['NEAE · Dislexia', 'Más tiempo', 'Letra ampliada', 'Lectura en voz alta']);
    await shot(page, info, 'ficha-apoyos');
    await file(page, demo, 'Guerrero Ruiz, Nicolás', 'Nicolás Guerrero Ruiz');
    await expect(page.locator('.st-support .chip')).toHaveText(['NEAE · Altas capacidades']);
    await expect(page.locator('.st-support__notes')).toHaveText('Actividades de ampliación.');
    await file(page, demo, 'Cano Álvarez, Jorge', 'Jorge Cano Álvarez');
    await expect(page.locator('.st-support')).toHaveCount(0);
  });

  test('alumnos-39 an AI draft grade says «Borrador IA»; an NP says NP and is a pending exam', async ({ page, demo }, info) => {
    await file(page, demo, 'Cano Álvarez, Jorge', 'Jorge Cano Álvarez');
    await openGrades(page, info);
    const draft = section(page, 'Notas').locator('.row').filter({ has: page.locator('.ai-badge') });
    await expect(draft).toHaveCount(1);
    await expect(draft.locator('.ai-badge')).toHaveText('Borrador IA');

    await file(page, demo, 'Castillo Medina, Adrián', 'Adrián Castillo Medina');
    const notas = section(page, 'Notas');
    await expect(notas.locator('.row').filter({ hasText: 'Exámenes pendientes' })).toContainText('Examen U1 · Números enteros (16 oct, NP)');
    await openGrades(page, info);
    await expect(notas.locator('.row').filter({ hasText: 'Examen U1 · Números enteros' }).filter({ hasText: '16 oct' }).locator('.row__trail'))
      .toHaveText('NP');
  });

  test('alumnos-40 a grade on an adapted version carries its measure: «ACS 5.º Primaria», «Letra ampliada»', async ({ page, demo }, info) => {
    const course = await demoCourse(demo, DEMO_2B);
    const nerea = await demoStudent(demo, course, 'Vázquez Delgado, Nerea');
    const ruben = await demoStudent(demo, course, 'López Vázquez, Rubén');
    const gb = await demo.get(`/courses/${course.id}/gradebook?term=1`);
    const exam = gb.activities.find((a: { title: string }) => a.title === 'Examen global · 1.ª evaluación');
    await demo.put(`/activities/${exam.id}/grades`, { grades: [
      { student_id: nerea.id, score: 7.5, comment: 'Buen trabajo con apoyo.' }, { student_id: ruben.id, score: 6 },
    ] });
    try {
      await openFile(page, nerea.id, 'Nerea Vázquez Delgado');
      await openGrades(page, info);
      const row = section(page, 'Notas').locator('.row').filter({ hasText: 'Examen global · 1.ª evaluación' });
      await expect(row.locator('.chip')).toHaveText('ACS 5.º Primaria');
      await expect(row.locator('.chip')).toHaveClass(/chip--warn/);
      await expect(row).toContainText('«Buen trabajo con apoyo.»');
      await shot(page, info, 'ficha-adaptado');
      await openFile(page, ruben.id, 'Rubén López Vázquez');
      await openGrades(page, info);
      const r = section(page, 'Notas').locator('.row').filter({ hasText: 'Examen global · 1.ª evaluación' });
      await expect(r.locator('.chip')).toHaveText('Letra ampliada');
      await expect(r.locator('.chip')).not.toHaveClass(/chip--warn/);
    } finally {
      await demo.put(`/activities/${exam.id}/grades`, { grades: [
        { student_id: nerea.id, status: 'empty', comment: null }, { student_id: ruben.id, status: 'empty' },
      ] });
    }
  });

  test('alumnos-41 a student that does not exist, and a ficha that fails to load', async ({ page, demo }) => {
    await page.goto('/alumnos/00000000-0000-0000-0000-000000000000');
    await expect(page.getByText('No se ha encontrado el alumno')).toBeVisible();
    await page.getByRole('link', { name: 'Ir a Clases' }).click();
    await expect(page).toHaveURL(/\/clases$/);

    const s = await demoStudent(demo, await demoCourse(demo, DEMO_2B), 'Cano Álvarez, Jorge');
    let fail = true;
    await page.route(`**/api/students/${s.id}`, (route) => (fail
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"boom"}' }) : route.continue()));
    await page.goto(`/alumnos/${s.id}`);
    await expect(page.getByText('No se ha podido cargar la ficha')).toBeVisible({ timeout: 15_000 });
    fail = false;
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Jorge Cano Álvarez' })).toBeVisible();
  });
});
