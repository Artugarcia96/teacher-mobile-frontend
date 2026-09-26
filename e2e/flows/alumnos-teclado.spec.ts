import type { Locator, Page } from '@playwright/test';
import { bug, expect, isMobile, MATES_2C, openFile, openRoster, rosterRow, section, sheet, test, toast } from './alumnos-helpers';

// Alumnos with the keyboard only: the Tab order of Clase › Alumnos (tabs of the class, rows, «Añadir alumnos») and of
// the student file (back, «···», Anotar, «Ver N notas» on a phone, the attendance row and its absences, the menus of
// the observations), and that Intro/Esc do on each what a tap does. A phone runs it too (a keyboard paired to it). A
// teacher of its own; no AI.

/** Tab once and expect the focus on `target`. */
async function tabTo(page: Page, target: Locator) {
  await page.keyboard.press('Tab');
  await expect(target).toBeFocused();
}
/** The dialog holds the focus. */
const holdsFocus = (dialog: Locator) => expect(dialog.locator(':focus')).toHaveCount(1);

test.use({
  teacherSpec: {
    courses: [{
      ...MATES_2C,
      students: MATES_2C.students!.slice(0, 3),
      activities: [
        { title: 'Examen tema 1', kind: 'exam', date: '2026-10-20', grades: [6, 7, 8] },
        { title: 'Ficha de fracciones', kind: 'worksheet', date: '2026-10-22', grades: [5, 5, 5] },
      ],
      marks: [
        { student: 0, date: '2026-11-16', start: '08:30', status: 'absent' },
        { student: 0, date: '2026-11-17', start: '09:25', status: 'justified' },
      ],
      notes: [
        { students: [0], kind: 'observation', date: '2026-11-10', text: 'Pregunta mucho en clase.' },
        { students: [0], kind: 'positive', date: '2026-11-12', text: 'Ayuda a sus compañeros.' },
      ],
    }],
  },
});

test('alumnos-111 Clase › Alumnos with Tab: the class tabs, each row in list order, «Añadir alumnos»; Intro opens each', async ({ page, teacher }) => {
  const [c] = teacher.courses;
  await openRoster(page, c.id);
  await expect(rosterRow(page, 'Castro León, Lucía')).toBeVisible();
  const tabs = page.getByRole('button', { name: 'Alumnos', pressed: true });
  await tabs.focus();
  await tabTo(page, page.getByRole('button', { name: 'Temario', exact: true }));
  await tabTo(page, page.getByRole('button', { name: 'Faltas', exact: true }));
  await tabTo(page, rosterRow(page, 'Alonso Gil, Marta'));
  await tabTo(page, rosterRow(page, 'Benítez Ruiz, Pablo'));
  await tabTo(page, rosterRow(page, 'Castro León, Lucía'));
  const add = page.locator('.students-roster').getByRole('button', { name: 'Añadir alumnos' });
  await tabTo(page, add);

  // Intro on «Añadir alumnos» opens its sheet; Esc closes it.
  await page.keyboard.press('Enter');
  const s = sheet(page, 'Añadir alumnos');
  await expect(s).toBeVisible();
  await expect(page).toHaveURL(/\?anadir=1$/);
  await page.keyboard.press('Escape');
  await expect(s).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`/clases/${c.id}/alumnos$`));

  // Back to a row with Shift+Tab; Intro opens the student file.
  await rosterRow(page, 'Castro León, Lucía').focus();
  await page.keyboard.press('Shift+Tab');
  await expect(rosterRow(page, 'Benítez Ruiz, Pablo')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`/alumnos/${c.students[1].id}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Pablo Benítez Ruiz' })).toBeVisible();
});

test('alumnos-111 the student file with Tab: back, «···», Anotar, the notes, the absences, each observation', async ({ page, teacher }, info) => {
  const [c] = teacher.courses;
  const marta = c.students[0];
  await openFile(page, marta.id, 'Marta Alonso Gil');
  await page.getByRole('button', { name: '2.º ESO C', exact: true }).focus();
  await tabTo(page, page.getByRole('button', { name: 'Más opciones', exact: true }));
  await tabTo(page, page.getByRole('button', { name: 'Anotar' }));
  // On a phone the grades are folded under «Ver 2 notas»; a computer shows them (rows, not stops).
  const more = page.getByRole('button', { name: 'Ver 2 notas' });
  if (isMobile(info)) await tabTo(page, more);
  else await expect(more).toHaveCount(0);
  const absences = section(page, 'Asistencia').getByRole('button', { name: /^2 faltas \(1 justificada\) en la 1\.ª evaluación/ });
  await tabTo(page, absences);
  const options = section(page, 'Observaciones').getByRole('button', { name: 'Opciones de la observación' });
  await tabTo(page, options.nth(0));
  await tabTo(page, options.nth(1));

  // Intro on «Ver 2 notas» unfolds the grades; again folds them.
  if (isMobile(info)) {
    await more.focus();
    await page.keyboard.press('Enter');
    const less = page.getByRole('button', { name: 'Ocultar notas' });
    await expect(less).toBeFocused();
    await expect(less).toHaveAttribute('aria-expanded', 'true');
    await expect(section(page, 'Notas').getByText('Examen tema 1')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await expect(section(page, 'Notas').getByText('Examen tema 1')).toHaveCount(0);
  }

  // Intro on the attendance row opens the absences; Tab reaches the unjustified one and Intro justifies it.
  await absences.focus();
  await page.keyboard.press('Enter');
  await expect(absences).toHaveAttribute('aria-expanded', 'true');
  const monday = section(page, 'Asistencia').getByRole('button', { name: /^lun 16 nov · 08:30, Falta sin justificar: justificar$/ });
  const tuesday = section(page, 'Asistencia').getByRole('button', { name: /^mar 17 nov · 09:25, Falta justificada: quitar justificación$/ });
  await expect(monday).toBeVisible();
  await expect(tuesday).toBeVisible();
  const first = (await monday.boundingBox())!.y < (await tuesday.boundingBox())!.y ? monday : tuesday;
  await tabTo(page, first);
  await tabTo(page, first === monday ? tuesday : monday);
  await monday.focus();
  await page.keyboard.press('Enter');
  await expect(toast(page, 'Falta justificada')).toBeVisible();
  await expect(section(page, 'Asistencia').getByRole('button', { name: /^lun 16 nov · 08:30, Falta justificada: quitar justificación$/ })).toBeVisible();
  const list = await teacher.api.get(`/courses/${c.id}/attendance?date=2026-11-16&start=08:30`);
  expect(JSON.stringify(list)).toContain('"justified"');

  // Intro on «Anotar»: the text takes the focus; type, Tab to «Guardar», Intro saves.
  await page.getByRole('button', { name: 'Anotar' }).focus();
  await page.keyboard.press('Enter');
  const s = sheet(page, 'Anotar');
  const text = s.getByRole('textbox', { name: 'Texto' });
  await expect(text).toBeFocused();
  await expect(s.getByRole('button', { name: 'Alonso, Marta' })).toBeVisible(); // the class list has loaded
  await page.keyboard.type('Explica el ejercicio en la pizarra.');
  await tabTo(page, s.getByRole('button', { name: 'Alonso, Marta' }));
  await tabTo(page, s.getByRole('button', { name: 'Añadir alumnos' }));
  await tabTo(page, s.getByRole('button', { name: 'Guardar' }));
  await page.keyboard.press('Enter');
  await expect(toast(page, 'Observación guardada')).toBeVisible();
  await expect(s).toBeHidden();
  await expect(section(page, 'Observaciones').locator('.st-note').first()).toContainText('Explica el ejercicio en la pizarra.');
  const notes = await teacher.api.get(`/notes?student_id=${marta.id}`);
  expect(notes.map((n: { text: string }) => n.text)).toContain('Explica el ejercicio en la pizarra.');
});

test('alumnos-111 the menus of the student file with the keyboard: «···» and an observation\'s options reach their items', async ({ page, teacher }) => {
  bug('marco-B1', 'a menu opened with the keyboard keeps the focus on «···»: «Editar datos y apoyos», «Quitar de…» and an observation\'s «Editar»/«Eliminar» cannot be reached');
  const marta = teacher.courses[0].students[0];
  await openFile(page, marta.id, 'Marta Alonso Gil');
  const trigger = page.getByRole('button', { name: 'Más opciones', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: 'Editar datos y apoyos' })).toBeFocused({ timeout: 2_000 });
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();

  const options = section(page, 'Observaciones').getByRole('button', { name: 'Opciones de la observación' }).first();
  await options.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: 'Editar' })).toBeFocused({ timeout: 2_000 });
  await page.keyboard.press('Enter');
  await expect(sheet(page, 'Editar observación')).toBeVisible();
});

test('alumnos-111 a sheet opened with the keyboard takes the focus, keeps Tab inside and gives it back on close', async ({ page, teacher }) => {
  bug('BUG-ALUMNOS-10', 'Sheet: «Añadir alumnos» opened with Intro leaves the focus on the row behind; Tab walks out of an open modal sheet («Anotar» → the page behind); closing a sheet drops the focus on <body> instead of the button that opened it');
  const [c] = teacher.courses;
  // «Añadir alumnos»: the focus goes into the sheet, and back to the row on Esc.
  await openRoster(page, c.id);
  const add = page.locator('.students-roster').getByRole('button', { name: 'Añadir alumnos' });
  await add.focus();
  await page.keyboard.press('Enter');
  const adding = sheet(page, 'Añadir alumnos');
  await expect(adding).toBeVisible();
  await holdsFocus(adding);
  await page.keyboard.press('Escape');
  await expect(adding).toBeHidden();
  await expect(add).toBeFocused();

  // «Anotar»: ten Tabs never leave the sheet; Esc gives the focus back to «Anotar».
  await openFile(page, c.students[0].id, 'Marta Alonso Gil');
  const anotar = page.getByRole('button', { name: 'Anotar' });
  await anotar.focus();
  await page.keyboard.press('Enter');
  const s = sheet(page, 'Anotar');
  await expect(s.getByRole('textbox', { name: 'Texto' })).toBeFocused();
  await expect(s.getByRole('button', { name: 'Alonso, Marta' })).toBeVisible();
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    await holdsFocus(s);
  }
  await page.keyboard.press('Escape');
  await expect(s).toBeHidden();
  await expect(anotar).toBeFocused();
});
