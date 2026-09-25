import {
  BASE, DETAILS, evalRow, evaluarClass, expect, openEvaluation, press, shot, STUDENTS, test, type CourseSpec, type Page,
  type WorldSpec,
} from './evaluacion-helpers';

// Evaluar, la bandeja (docs/PRODUCT.md §4.7): la sesión de evaluación en la cabecera, «Por revisar», «Por calificar»,
// la evaluación actual de cada clase (solo lo que no está ya arriba), «Todo al día», el informe del departamento y la
// insignia de la pestaña Evaluar.

const SESSION = { title: 'Sesión de evaluación · 1.ª evaluación', date: '2026-12-15', kind: 'evaluation' };

/** 1.º ESO A: a missed exam still without two grades (one of them, who missed it), one comment missing. */
const PRIMERO: CourseSpec = {
  group: '1º ESO A', color: 'ochre', students: ['Ruiz Mora, Ana', 'Sanz Gil, Bruno', 'Vidal Pons, Carla'],
  activities: [{ title: 'Examen U1 · Enteros', date: '2026-11-12', grades: [7, null, null] }],
  absences: [{ date: '2026-11-12', start: '09:25', student: 2 }],
  evaluation: [{ student: 0, comment: 'Buen trimestre.' }, { student: 1, comment: 'Debe estudiar más.', accept: true }],
};
/** 3.º ESO A: everything graded and every comment written: ready for the session. */
const TERCERO: CourseSpec = {
  subject: 'Física y Química', group: '3º ESO A', color: 'indigo', students: ['León Díaz, Eva', 'Mora Gil, Iván'],
  activities: [{ title: 'Examen U1 · La materia', date: '2026-10-29', grades: [6, 9] }],
  evaluation: [{ student: 0, comment: 'Trabaja bien.', accept: true }, { student: 1, comment: 'Excelente trimestre.' }],
};
/** 4.º ESO D: no students yet. */
const CUARTO: CourseSpec = { subject: 'Lengua', group: '4º ESO D', color: 'rose' };

/** The Evaluar link of the navigation shown on this screen (sidebar on computers, capsule on phones). */
const evaluarNav = (page: Page) => page.locator('a[href="/evaluar"]').filter({ visible: true });

test.describe('la bandeja de un profesor con cuatro clases', () => {
  test.use({ worldSpec: { events: [SESSION], courses: [DETAILS, TERCERO, PRIMERO, CUARTO] } });

  test('evaluacion-01 cabecera: la sesión de la 1.ª evaluación, con su fecha y cuánto falta', async ({ page }, info) => {
    await page.goto('/evaluar');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Evaluar');
    await expect(page.locator('.page-head__sub')).toHaveText('Sesión de la 1.ª evaluación: martes, 15 de diciembre, en 26 días');
    await shot(page, info, 'bandeja');
  });

  test('evaluacion-02 «Por revisar»: las notas de la IA por revisar, y lleva a la actividad', async ({ page, world }, info) => {
    await page.goto('/evaluar');
    const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Por revisar' }) });
    const rows = section.getByRole('link');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveText('Examen U2 · Fracciones Matemáticas · 2.º ESO C · 17 nov1 por revisar');
    await press(rows.first(), info);
    await expect(page).toHaveURL(new RegExp(`/clases/${world.c.id}/actividades/${world.c.act['Examen U2 · Fracciones']}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Examen U2 · Fracciones');
  });

  test('evaluacion-03 «Por calificar»: actividades pasadas sin todas las notas, quién faltó, y lleva a su columna', async ({ page, world }, info) => {
    await page.goto('/evaluar');
    const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Por calificar' }) });
    const rows = section.getByRole('link');
    // In class-list order: 1.º ESO A before 2.º ESO C. Who missed the exam is not «sin nota».
    await expect(rows).toHaveText([
      'Examen U1 · Enteros Matemáticas · 1.º ESO A · 12 nov1 sin nota1 faltó',
      'Trabajo · Proyecto Matemáticas · 2.º ESO C · 12 nov2 sin nota',
    ]);
    await press(rows.nth(1), info);
    await expect(page).toHaveURL(new RegExp(`/clases/${world.c.id}/cuaderno\\?term=1&a=${world.c.act['Trabajo · Proyecto']}$`));
    await expect(page.locator('table.gb')).toBeVisible();
  });

  test('evaluacion-04 la evaluación actual por clase: solo lo que falta, en el orden de las clases; sin alumnos no sale', async ({ page, world }, info) => {
    await page.goto('/evaluar');
    const section = page.locator('section').filter({ has: page.getByRole('heading', { name: '1.ª evaluación' }) });
    const rows = section.getByRole('link');
    await expect(rows).toHaveCount(3);
    // Named group first. Carla, who missed the only exam, has no grade yet: no comment is due for her.
    await expect(rows.nth(0)).toHaveText('1.º ESO A · Matemáticas1 alumno con examen pendiente por falta · faltan notas de Examen U1 · Enteros');
    await expect(rows.nth(1)).toHaveText('2.º ESO C · MatemáticasFaltan 5 comentarios · 1 alumno con examen pendiente por falta · faltan notas en 2 actividades');
    // Comments written by the teacher count as done, accepted or not.
    await expect(rows.nth(2)).toHaveText('3.º ESO A · Física y QuímicaNotas y comentarios revisadosLista');
    await expect(section.getByText(/4\.º ESO D/)).toHaveCount(0);

    await press(rows.nth(1), info);
    await expect(page).toHaveURL(new RegExp(`/clases/${world.c.id}/evaluacion/1$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Primera evaluación');
    // The same figures on the page.
    await expect(page.locator('.ev-count')).toHaveText('5 por redactar');
    await expect(page.locator('.callout').filter({ hasText: 'Notas incompletas.' })).toContainText('1 alumno con un examen pendiente');
  });

  test('evaluacion-05 la insignia de Evaluar cuenta las actividades con notas de la IA por revisar', async ({ page, world }) => {
    await page.goto('/evaluar');
    await expect(evaluarNav(page).locator('.nav-badge')).toHaveText('1');
    // Reviewing the AI grade (confirming it) empties the badge.
    await world.api.put(`/activities/${world.c.act['Examen U2 · Fracciones']}/grades`, {
      grades: [{ student_id: world.c.students[5].id, score: 6, status: 'confirmed' }],
    });
    await page.reload();
    await expect(page.locator('section').filter({ has: page.getByRole('heading', { name: '1.ª evaluación' }) })).toBeVisible();
    await expect(evaluarNav(page).locator('.nav-badge')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Por revisar' })).toHaveCount(0);
    // The exam is now waiting for Irene, who missed it: nothing to grade for the others.
    await expect(page.locator('section').filter({ has: page.getByRole('heading', { name: 'Por calificar' }) }).getByRole('link'))
      .toHaveText([/^Examen U1 · Enteros/, /^Trabajo · Proyecto/]);
  });

  test('evaluacion-06 «Informe del departamento» desde Evaluar', async ({ page }) => {
    await page.goto('/evaluar');
    await page.getByRole('button', { name: 'Informe del departamento' }).click();
    const report = page.getByRole('dialog', { name: 'Informe del departamento' });
    await expect(report.getByRole('group', { name: 'Evaluación' }).getByRole('button', { name: '1.ª', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(report.getByRole('heading', { name: 'Matemáticas', exact: true })).toBeVisible();
    await report.getByRole('button', { name: 'Cerrar' }).click();
    await expect(report).toBeHidden();
    await expect(page).toHaveURL(/\/evaluar$/);
  });
});

test.describe('todo calificado', () => {
  test.use({ worldSpec: { courses: [TERCERO] } });

  test('evaluacion-07 «Todo al día»: nada por revisar ni por calificar, sin sesión en la cabecera', async ({ page }, info) => {
    await page.goto('/evaluar');
    await expect(page.getByText('Todo al día')).toBeVisible();
    await expect(page.getByText('No hay exámenes por revisar ni notas pendientes.')).toBeVisible();
    await expect(page.locator('.page-head__sub')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Por revisar' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Por calificar' })).toHaveCount(0);
    await expect(evaluarClass(page, /^3\.º ESO A · Física y Química/)).toContainText('Lista');
    await press(page.getByRole('link', { name: 'Ver clases' }), info);
    await expect(page).toHaveURL(/\/clases$/);
  });
});

test.describe('un profesor sin clases', () => {
  test.use({ worldSpec: { courses: [] } });

  test('evaluacion-08 sin clases: «Todo al día» y ninguna evaluación que preparar', async ({ page }) => {
    await page.goto('/evaluar');
    await expect(page.getByText('Todo al día')).toBeVisible();
    await expect(page.getByRole('heading', { name: '1.ª evaluación' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Informe del departamento' })).toHaveCount(0);
    await expect(evaluarNav(page).locator('.nav-badge')).toHaveCount(0);
  });
});

for (const [id, what, event, subtitle] of [
  ['evaluacion-09', 'un evento con otro título se nombra por su título ("mañana")', { title: 'Evaluación inicial', date: '2026-11-20', kind: 'evaluation' },
    'Evaluación inicial: viernes, 20 de noviembre, mañana'],
  ['evaluacion-10', 'la sesión es hoy', { ...SESSION, date: '2026-11-19' }, 'Sesión de la 1.ª evaluación: jueves, 19 de noviembre, hoy'],
] as const) {
  test.describe(`cabecera: ${what}`, () => {
    // A session already past does not count: the next one is named.
    test.use({ worldSpec: { events: [{ ...SESSION, date: '2026-11-10' }, event], courses: [BASE] } as WorldSpec });

    test(`${id} cabecera: ${what}`, async ({ page }) => {
      await page.goto('/evaluar');
      await expect(page.locator('.page-head__sub')).toHaveText(subtitle);
    });
  });
}

test.describe('una clase sin notas y un comentario que ya no cuadra con la nota', () => {
  // 4.º ESO B: students, no grades yet. 2.º ESO C: Marta's comment was accepted with a 7, then her grade was set to 8.
  const SIN_NOTAS: CourseSpec = { group: '4º ESO B', students: STUDENTS.slice(0, 2) };
  const NO_CUADRA: CourseSpec = {
    students: STUDENTS.slice(0, 1),
    activities: [{ title: 'Examen U1 · Números', date: '2026-10-29', grades: [7] }],
    evaluation: [{ student: 0, comment: 'Buen trimestre, con un examen muy trabajado.', accept: true }, { student: 0, final: 8 }],
  };
  test.use({ worldSpec: { courses: [NO_CUADRA, SIN_NOTAS] } });

  test('evaluacion-16 «Sin notas aún» y «1 comentario no cuadra con la nota», las mismas cifras que en la evaluación', async ({ page, world }) => {
    await page.goto('/evaluar');
    await expect(evaluarClass(page, /^4\.º ESO B · /)).toHaveText('4.º ESO B · MatemáticasSin notas aún');
    await expect(evaluarClass(page, /^2\.º ESO C · /)).toHaveText('2.º ESO C · Matemáticas1 comentario no cuadra con la nota');
    await evaluarClass(page, /^2\.º ESO C · /).click();
    await expect(page.locator('.ev-count')).toHaveText('1 no cuadra con la nota');
    expect(await evalRow(world.api, world.c.id, STUDENTS[0])).toMatchObject({ comment_stale: true, comment_grade: 7, final: 8 });
    await openEvaluation(page, world.courses[1].id);
    await expect(page.getByLabel('Resumen de la evaluación')).toHaveText('Aún no hay notas en esta evaluación');
  });
});

test.describe('si la bandeja no carga', () => {
  test.use({ worldSpec: { courses: [BASE] } });

  test('evaluacion-11 lo dice y se puede reintentar', async ({ page }) => {
    let fail = true;
    await page.route('**/api/inbox', (r) => (fail
      ? r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Internal Server Error' }) })
      : r.fallback()));
    await page.goto('/evaluar');
    await expect(page.getByText('No se ha podido cargar la bandeja.')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('El servidor ha fallado. Inténtalo en un momento.')).toBeVisible();
    fail = false;
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(evaluarClass(page, /^2\.º ESO C · Matemáticas/)).toBeVisible();
  });
});

test.describe('la demo: las mismas cifras en Evaluar, en la insignia y en la evaluación', () => {
  test('evaluacion-12 lo que dice Evaluar de 2.º ESO B es lo que dice el servidor y su evaluación', async ({ page, demo }) => {
    const inbox = await demo.get('/inbox');
    const ev = inbox.evaluations.find((e: { course: { label: string } }) => /2\.º ESO B/.test(e.course.label));
    const review = inbox.to_review.filter((x: { suggested: number }) => x.suggested > 0);
    await page.goto('/evaluar');
    await expect(evaluarNav(page).locator('.nav-badge')).toHaveText(String(inbox.count));
    expect(inbox.count).toBe(review.length);
    for (const x of review) {
      await expect(page.getByRole('link', { name: new RegExp(`^${x.activity.title}`) }).first()).toContainText(`${x.suggested} por revisar`);
    }
    const row = evaluarClass(page, /^2\.º ESO B · /);
    if (ev.comments_unreviewed) {
      await expect(row).toContainText(`${ev.comments_unreviewed} ${ev.comments_unreviewed === 1 ? 'comentario de la IA sin revisar' : 'comentarios de la IA sin revisar'}`);
    }
    await row.click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Primera evaluación');
    if (ev.comments_unreviewed) {
      await expect(page.locator('.ev-count')).toContainText(`${ev.comments_unreviewed} comentario`);
    }
  });
});

test.describe('otras entradas a la evaluación: el Cuaderno', () => {
  test.use({ worldSpec: { courses: [BASE] } });

  test('evaluacion-13 desde el Cuaderno: «Evaluar la 1.ª» del menú de la clase', async ({ page, world }) => {
    await page.goto(`/clases/${world.c.id}/cuaderno?term=1`);
    await page.getByRole('button', { name: 'Más opciones de la clase' }).click();
    await page.getByRole('menuitem', { name: 'Evaluar la 1.ª' }).click();
    await expect(page).toHaveURL(new RegExp(`/clases/${world.c.id}/evaluacion/1$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Primera evaluación');
    await page.locator('.back-btn').click();
    await expect(page).toHaveURL(new RegExp(`/clases/${world.c.id}/cuaderno\\?term=1$`));
  });

  test('evaluacion-14 desde el Cuaderno: la cabecera «Media · Evaluar ›»', async ({ page, world }, info) => {
    await page.goto(`/clases/${world.c.id}/cuaderno?term=1`);
    await press(page.getByRole('link', { name: 'Media. Evaluar la 1.ª' }), info);
    await expect(page).toHaveURL(new RegExp(`/clases/${world.c.id}/evaluacion/1$`));
    await expect(page.getByLabel('Resumen de la evaluación')).toContainText('Media 6,4');
  });
});
