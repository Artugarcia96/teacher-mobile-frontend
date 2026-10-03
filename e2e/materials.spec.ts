import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { shot, trackErrors } from './helpers';

// Materials of the seeded demo (Matemáticas 2.º ESO B · Fracciones): edit an exercise by hand; the presentación by
// lessons (switch, project frame by frame, teacher view and projector window, downloads, editing); the solucionario of apuntes and lectura sencilla, and the choices of «Preparar el trimestre». Nothing
// here calls the AI.
const API = process.env.API || 'http://127.0.0.1:8000';

interface MaterialRef { id: string; title: string }
interface LessonRef { n: number; title: string; status: string; slide_ids: string[]; hidden_ids: string[] }
interface Deck { id: string; lessons: LessonRef[]; slide_images: Record<string, { frames: string[] }>; slide_notes: Record<string, { label: string; text: string }[]> }

async function fractions(request: APIRequestContext) {
  const r = await request.post(`${API}/api/auth/login`, { data: { email: 'demo@sepia.es', password: 'sepia1234' } });
  const headers = { Authorization: `Bearer ${(await r.json()).access_token}` };
  const get = async (path: string) => (await request.get(`${API}/api${path}`, { headers })).json();
  const courses: { id: string; subject: string; group: { name: string } }[] = await get('/courses');
  const course = courses.find((c) => c.subject === 'Matemáticas' && c.group.name.includes('2º ESO B'))!;
  const units: { id: string; title: string }[] = await get(`/courses/${course.id}/units`);
  const unit = units.find((u) => u.title === 'Fracciones')!;
  const { materials }: { materials: MaterialRef[] } = await get(`/units/${unit.id}`);
  const material = (title: string) => `/clases/${course.id}/unidades/${unit.id}/materiales/${materials.find((m) => m.title === title)!.id}`;
  const deck = async (title: string): Promise<Deck> => get(`/materials/${materials.find((m) => m.title === title)!.id}`);
  return { course, material, deck };
}

async function editStatement(page: Page, text: (old: string) => string) {
  await page.locator('#ex-1').getByRole('button', { name: 'Opciones del apartado' }).click();
  await page.getByRole('menuitem', { name: 'Editar texto' }).click();
  const field = page.getByRole('dialog', { name: 'Editar ejercicio' }).getByLabel('Enunciado');
  const old = await field.inputValue();
  await field.fill(text(old));
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Cambios guardados').last()).toBeVisible();
  return old;
}

test('ficha: editar el enunciado de un ejercicio la deja como borrador', async ({ page, request }, info) => {
  const errors = trackErrors(page);
  const { material } = await fractions(request);
  await page.goto(material('Ficha de refuerzo · Fracciones'));
  await expect(page.locator('#ex-1')).toBeVisible();
  await page.getByRole('button', { name: 'Editar', exact: true }).click();

  const added = ' Trabaja con tu compañero.';
  const old = await editStatement(page, (t) => t + added);
  try {
    await expect(page.locator('#ex-1')).toContainText(added.trim());
    await expect(page.getByText('Borrador IA').first()).toBeVisible();
    await shot(page, info, 'material-edited');
  } finally {
    await editStatement(page, () => old);
  }
  await expect(page.locator('#ex-1')).not.toContainText(added.trim());
  expect(errors).toEqual([]);
});

// Text of a note line: what would show if the notes were projected.
const said = (t: string) => t.replace(/\$[^$]*\$/g, ' ').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
const PRES = 'Presentación · Fracciones';

test('presentación: cambiar de sesión, proyectarla clic a clic y sin notas en la pantalla', async ({ page, request }, info) => {
  const errors = trackErrors(page);
  const { material, deck } = await fractions(request);
  const d = await deck(PRES);
  const ready = d.lessons.filter((l) => l.status === 'ready');
  const lesson = ready[ready.length - 1];
  await page.goto(material(PRES));
  if (ready.length > 1) {
    await page.getByRole('group', { name: 'Sesión' }).getByRole('button', { name: String(lesson.n), exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`sesion=${lesson.n}`));
  }
  await expect(page.getByRole('heading', { name: new RegExp(`^Sesión ${lesson.n} · `) })).toBeVisible();
  await shot(page, info, 'presentation-page');
  await page.getByRole('button', { name: `Proyectar sesión ${lesson.n}` }).click();
  const presenter = page.getByRole('dialog', { name: `Proyectar sesión ${lesson.n}` });
  await expect(presenter).toBeVisible();
  await expect(presenter.getByText(`Diapositiva 1 de `)).toBeVisible();
  // Through every frame of the second slide, then to the third: a build never changes the slide number.
  await page.keyboard.press('ArrowRight');
  const second = lesson.slide_ids[1];
  for (let f = 1; f < d.slide_images[second].frames.length; f++) {
    await page.keyboard.press('ArrowRight');
    await expect(presenter.getByText('Diapositiva 2 de ')).toBeVisible();
  }
  await page.keyboard.press('ArrowRight');
  await expect(presenter.getByText('Diapositiva 3 de ')).toBeVisible();
  const shown = (await presenter.innerText()).replace(/\s+/g, ' ');
  for (const line of d.slide_notes[lesson.slide_ids[2]] ?? []) if (said(line.text).length >= 12) expect(shown).not.toContain(said(line.text));
  await page.keyboard.press('b');
  await expect(presenter.getByLabel('Pantalla oscurecida')).toBeVisible();
  await page.keyboard.press('b');
  await shot(page, info, 'presentation-presenter');
  await page.keyboard.press('Escape');
  await expect(presenter).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('presentación: la vista del profesor lleva la ventana del proyector, y «Pasar lista» no llega a él', async ({ page, request, context }, info) => {
  test.skip(info.project.name === 'mobile', 'La vista del profesor es de escritorio');
  const errors = trackErrors(page);
  const { material, deck } = await fractions(request);
  const d = await deck(PRES);
  const lesson = d.lessons.find((l) => l.status === 'ready')!;
  await page.goto(`${material(PRES)}?sesion=${lesson.n}`);
  await page.getByRole('button', { name: 'Abrir vista del profesor' }).click();
  const view = page.getByRole('dialog', { name: 'Vista del profesor' });
  await expect(view.getByText('Siguiente')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(view.getByText(/Diapositiva 2 de/)).toBeVisible();
  for (const line of (d.slide_notes[lesson.slide_ids[1]] ?? []).slice(0, 2)) await expect(view.getByText(line.label, { exact: true }).first()).toBeVisible();
  const [projector] = await Promise.all([context.waitForEvent('page'), view.getByRole('button', { name: 'Abrir ventana del proyector' }).click()]);
  await projector.waitForLoadState();
  const src = async (p: typeof page) => p.locator(p === page ? '.teacher__main .slide-img__img' : '.slide-img__img').first().getAttribute('src');
  await expect.poll(() => src(projector)).toBe(await src(page));
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => src(projector)).toBe(await src(page));
  await projector.keyboard.press('ArrowRight');  // a key on the panel moves the teacher view
  await expect.poll(() => src(page)).toBe(await src(projector));
  const list = view.getByRole('button', { name: /^Pasar lista/ });
  if (await list.isEnabled()) {
    await list.click();
    await expect(page.getByRole('dialog').filter({ hasText: 'Toca a quien falte' })).toBeVisible();
    await expect(projector.locator('body')).not.toContainText('Toca a quien falte');
  }
  await shot(page, info, 'presentation-teacher');
  await projector.close();
  expect(errors).toEqual([]);
});

test('presentación: «Descargar» da los cuatro archivos de cada sesión y el ZIP', async ({ page, request }, info) => {
  const { material, deck } = await fractions(request);
  const d = await deck(PRES);
  const ready = d.lessons.filter((l) => l.status === 'ready');
  await page.goto(material(PRES));
  await page.getByRole('button', { name: 'Descargar', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Descargar' });
  for (const l of ready) {
    for (const f of ['PowerPoint', 'PDF para alumnos', 'PDF del profesor', 'Hoja para los alumnos']) {
      await expect(sheet.getByRole('button', { name: `Descargar ${f} de la sesión ${l.n}` })).toBeVisible();
    }
  }
  if (ready.length > 1) await expect(sheet.getByRole('button', { name: /Todas las sesiones \(PowerPoint, ZIP\)/ })).toBeVisible();
  await expect(sheet.getByText('Los cambios que hagas en PowerPoint no vuelven a Sepia.', { exact: false })).toBeVisible();
  await shot(page, info, 'presentation-downloads');
  const download = page.waitForEvent('download').catch(() => null);
  await sheet.getByRole('button', { name: `Descargar PDF para alumnos de la sesión ${ready[0].n}` }).click();
  await download;
});

test('presentación: editar el texto con aviso, pasar a reserva, mover y añadir una bisagra', async ({ page, request }, info) => {
  test.skip(info.project.name === 'mobile', 'Una vez basta: cambia la presentación de la demo');
  const errors = trackErrors(page);
  const { material, deck } = await fractions(request);
  const d = await deck(PRES);
  const ready = d.lessons.filter((l) => l.status === 'ready');
  const lesson = ready[0];
  await page.goto(`${material(PRES)}?sesion=${lesson.n}`);
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  const menuOf = (n: number) => page.getByRole('button', { name: `Opciones de la diapositiva ${n}` });
  const toast = (t: string) => expect(page.getByText(t).last()).toBeVisible({ timeout: 60_000 });

  // A headline over its cap is saved with a warning; then put back.
  await menuOf(4).click();
  await page.getByRole('menuitem', { name: 'Editar texto' }).click();
  const sheet = page.getByRole('dialog', { name: /^Editar · / });
  const field = sheet.getByRole('textbox').first();
  const old = await field.inputValue();
  await field.fill(`${old} y además una frase larga para pasar del límite de palabras del titular de esta diapositiva`);
  await expect(sheet.getByText(/^Más de \d+ palabras: puede no caber en dos líneas/)).toBeVisible();
  await shot(page, info, 'presentation-edit-warning');
  await sheet.getByRole('button', { name: 'Guardar cambios' }).click();
  await toast('Cambios guardados');
  await menuOf(4).click();
  await page.getByRole('menuitem', { name: 'Editar texto' }).click();
  await page.getByRole('dialog', { name: /^Editar · / }).getByRole('textbox').first().fill(old);
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await toast('Cambios guardados');

  // Backup slide and back.
  await menuOf(5).click();
  await page.getByRole('menuitem', { name: 'Pasar a reserva' }).click();
  await toast('Diapositiva pasada a reserva');
  await expect(page.getByRole('heading', { name: 'Diapositivas de reserva' })).toBeVisible();

  // Move to another lesson.
  if (ready.length > 1) {
    await menuOf(5).click();
    await page.getByRole('menuitem', { name: 'Mover a otra sesión…' }).click();
    await page.getByRole('button', { name: /^Mover a la sesión \d$/ }).click();
    await expect(page.getByText(/^Diapositiva movida a la sesión \d$/).last()).toBeVisible({ timeout: 60_000 });
  }

  // A bisagra added by hand: options, the answer among them, saved.
  await page.getByRole('button', { name: `Opciones de la sesión ${lesson.n}` }).click();
  await page.getByRole('menuitem', { name: 'Añadir diapositiva' }).click();
  await page.getByRole('dialog', { name: 'Añadir diapositiva' }).getByRole('button', { name: 'Pregunta bisagra' }).click();
  await toast('Diapositiva añadida');
  const add = page.getByRole('dialog', { name: 'Editar · Pregunta bisagra' });
  await add.getByRole('textbox').first().fill('¿Qué fracción es mayor, 2/3 o 3/5?');
  await add.getByLabel('Opciones (una por línea)').fill('2/3\n3/5\nSon iguales');
  await add.getByLabel('Respuesta correcta').selectOption('2/3');
  await add.getByRole('button', { name: 'Guardar cambios' }).click();
  await toast('Cambios guardados');
  expect(errors).toEqual([]);
});

test('apuntes y lectura sencilla: el PDF es el de los alumnos, el solucionario va aparte y no se comparte', async ({ page, request }) => {
  const errors = trackErrors(page);
  const { material } = await fractions(request);
  for (const [title, name] of [['Apuntes · Fracciones', 'Apuntes'], ['Lectura sencilla · Fracciones', 'Lectura sencilla']]) {
    await page.goto(material(title));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
    await page.getByRole('button', { name: 'Descargar', exact: true }).click();
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem')).toHaveText(['Descargar PDF', 'Descargar solucionario']);
    // The whole menu on screen, also when its button sits at the left edge of a phone.
    const box = (await menu.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await page.getByRole('button', { name: 'Más opciones' }).click();
    await page.getByRole('menuitem', { name: 'Compartir con alumnos' }).click();
    const share = page.getByRole('dialog', { name: 'Compartir con alumnos' });
    await expect(share.getByText('Se comparte sin las soluciones: el solucionario es solo para ti.')).toBeVisible();
    await share.getByRole('button', { name: 'Cerrar' }).click();
    await expect(share).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('preparar el trimestre: el botón cuenta los materiales y dice por qué no se puede', async ({ page, request }, info) => {
  const errors = trackErrors(page);
  const { course } = await fractions(request);
  await page.goto(`/clases/${course.id}/programacion`);
  await page.getByRole('button', { name: 'Preparar el trimestre' }).click();
  const sheet = page.getByRole('dialog', { name: 'Preparar el trimestre' });
  const submit = sheet.getByRole('button', { name: /^Crear \d+ materiales?$|^Elige como mucho 15 materiales a la vez$/ });
  await expect(submit).toBeVisible();
  await shot(page, info, 'prepare-term');

  for (const kind of ['Apuntes', 'Ficha', 'Presentación']) await sheet.getByRole('button', { name: kind, exact: true }).click();
  await expect(sheet.getByRole('button', { name: 'Elige al menos un tipo de material' })).toBeDisabled();
  await sheet.getByRole('button', { name: 'Resumen', exact: true }).click();
  await expect(sheet.getByRole('button', { name: /^Crear \d+ materiales?$|^Esas unidades ya tienen esos materiales$/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('«Cerrar clase» a medias y Hoy abre esa sesión en la diapositiva donde se quedó', async ({ page, request }, info) => {
  test.skip(info.project.name === 'mobile', 'Una vez basta: cierra la clase de la demo');
  const errors = trackErrors(page);
  const { course, deck } = await fractions(request);
  const d = await deck(PRES);
  const r = await request.post(`${API}/api/auth/login`, { data: { email: 'demo@sepia.es', password: 'sepia1234' } });
  const headers = { Authorization: `Bearer ${(await r.json()).access_token}` };
  // The presenter got to slide 12 of lesson 1 during this class (stored: it is inside the class's timetable slot).
  await request.post(`${API}/api/materials/${d.id}/presented`, { headers, data: { lesson: 1, slide: 12 } });
  const today = await (await request.get(`${API}/api/today`, { headers })).json();
  const now = today.sessions.find((s: { status: string; course: { id: string } }) => s.status === 'now' && s.course.id === course.id);
  try {
    await page.goto('/hoy');
    await page.getByRole('region', { name: /^Ahora/ }).getByRole('button', { name: 'Cerrar clase', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: /^Cerrar clase/ });
    await expect(sheet.getByText(/^Presentación: Sesión 1 · /)).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'A medias' })).toHaveAttribute('aria-pressed', 'true');
    await expect(sheet.getByLabel('Hecho hoy')).toHaveValue(/, hasta la diapositiva 12$/);
    await expect(sheet.getByLabel('Para la próxima')).toHaveValue('Terminar la sesión 1');
    await shot(page, info, 'close-session-lesson');
    await sheet.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Clase cerrada').last()).toBeVisible();

    // The next class of the group opens lesson 1 at slide 12.
    let next: string | null = null;
    for (let i = 1; i <= 7 && !next; i++) {
      const day = new Date(`${today.date}T12:00:00Z`);
      day.setUTCDate(day.getUTCDate() + i);
      const date = day.toISOString().slice(0, 10);
      const t = await (await request.get(`${API}/api/today?date=${date}`, { headers })).json();
      const s = t.sessions.find((x: { course: { id: string } }) => x.course.id === course.id);
      if (s) {
        const slides = s.materials.find((m: { kind: string }) => m.kind === 'slides');
        expect(slides.lesson).toBe(1);
        expect(slides.slide).toBe(12);
        next = date;
      }
    }
    expect(next).not.toBeNull();
    await page.goto(`/hoy?dia=${next}`);
    await expect(page.getByText('Seguir en la diapositiva 12').first()).toBeVisible();
    await page.getByRole('button', { name: 'Presentación · S1' }).first().click();
    await expect(page).toHaveURL(/sesion=1&diapositiva=12/);
    await expect(page.getByText('Diapositiva 12 de ')).toBeVisible();
  } finally {
    await request.put(`${API}/api/courses/${course.id}/sessions/log`, {
      headers, data: { date: now.date, start: now.start, done: '', next: '', homework: '', material_id: null, lesson: null, lesson_done: null },
    });
  }
  expect(errors).toEqual([]);
});
