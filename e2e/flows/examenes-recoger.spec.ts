import {
  answer, bug, correction, dialog, esc, expect, isMobile, openActivity, shot, stepHead, stepRow, test, toast,
  type Api, type Page,
} from './examenes-helpers';

// Recoger (docs/PRODUCT.md §4.3 · 2) on a private copy of the demo's «Examen U2 · Fracciones»: the pile the real AI
// read when the demo was seeded (24 papers, names to confirm, a paper with an unnamed extra sheet, a loose page of
// another document, blank backs discarded, two students without a paper). Fixing the pile by hand: confirm or change a
// name, «Está bien así», move a page to another student, split a paper, remove a page and undo, place or discard a
// loose page, recover or delete a discarded one, discard a paper; who is missing from the pile. Every page operation
// here is made without AI (reading a new pile, «Volver a leer» and «Sugerir notas»: examenes-ia.spec.ts).

interface Student { student: { id: string; name: string; first_name: string; last_name: string; sort_name: string }; paper_id: string | null;
  match_status: string | null; detected_name: string | null; pages: { id: string; kind: string; page_number: number | null }[];
  flags: { code: string; pages: number[] }[]; grade: { status: string; score: number | null } | null; missed: unknown }
const ATTENTION = ['falta_pagina', 'pagina_duplicada', 'extra_sin_nombre', 'pagina_dudosa', 'nombre_distinto', 'nombre_repetido', 'version_distinta'];

/** What the copied pile holds, from the API (the demo's AI reading decides who is where). */
async function pile(api: Api, id: string) {
  const c = await correction(api, id);
  const students: Student[] = c.students;
  const withPaper = students.filter((s) => s.paper_id);
  const toConfirm = withPaper.filter((s) => s.match_status === 'suggested');
  const settled = withPaper.filter((s) => s.match_status !== 'suggested');
  const flagged = settled.filter((s) => s.flags.some((f) => ATTENTION.includes(f.code)));
  const calm = settled.filter((s) => !s.flags.some((f) => ATTENTION.includes(f.code)));
  const missing = students.filter((s) => !s.paper_id && !['confirmed', 'absent', 'exempt'].includes(s.grade?.status ?? ''));
  const withExtra = flagged.find((s) => s.pages.some((x) => x.kind === 'extra_sheet'))!;
  return { c, students, withPaper, toConfirm, flagged, calm, missing, withExtra, byName: (n: string) => students.find((s) => s.student.sort_name === n)! };
}

/** The copied pile before the test touches it, with every case these flows need. */
async function freshPile(api: Api, id: string) {
  const p = await pile(api, id);
  if (!p.withExtra || p.toConfirm.length < 2 || !p.c.unplaced.length || p.missing.length < 2) {
    throw new Error('The demo pile lacks a case these flows need (a flagged paper with an extra sheet, two names to confirm, a loose page, two students without a paper): reseed the demo');
  }
  return p;
}

/** A section inside the open step (not the step itself), by its heading. */
const section = (page: Page, title: string | RegExp) =>
  page.locator('.exam-step .section').filter({ has: page.getByRole('heading', { level: 2, name: title }) });
/** The row of a student's paper in «Hojas» (by "Apellidos, Nombre"). */
const paperRow = (page: Page, sortName: string) => page.locator('.paper-row').filter({ hasText: sortName });
const strip = (page: Page, name: string) => page.getByRole('list', { name: `Páginas de ${name}` });
/** The page strip of a student's paper, unfolding the complete papers if it is among them. */
async function paperStrip(page: Page, name: string) {
  const unfold = page.getByRole('button', { name: /^Ver las \d+ hojas? completas?/ });
  if (!(await strip(page, name).isVisible()) && (await unfold.isVisible())) await unfold.click();
  await expect(strip(page, name)).toBeVisible();
  return strip(page, name);
}
/** The discarded pages, unfolded. */
async function discardedStrip(page: Page) {
  const list = page.getByRole('list', { name: 'Páginas descartadas' });
  if (!(await list.isVisible())) await page.getByRole('button', { name: /^(Reversos en blanco descartados|Páginas descartadas) \(\d+\)$/ }).click();
  await expect(list).toBeVisible();
  return list;
}

async function openCollect(page: Page, url: string, title: string) {
  await openActivity(page, `${url}?paso=recoger`, title);
  await expect(stepHead(page, 2, 'Recoger')).toBeVisible();
}

test.describe('examenes · recoger', () => {
  test('examenes-31 · the pile at a glance: what needs the teacher first, complete papers and blank backs folded', async ({ page, cloneExam, demo }, info) => {
    const exam = await cloneExam('fracciones');
    const p = await freshPile(demo, exam.id);
    await openCollect(page, exam.url, exam.title);
    // The collapsed step says what is left to do.
    await stepRow(page, 3, 'Revisar').click();
    await expect(stepRow(page, 2, 'Recoger')).toContainText(`${p.c.unplaced.length} página por colocar · ${p.flagged.length} por ordenar`);
    await stepRow(page, 2, 'Recoger').click();

    await expect(page.getByRole('button', { name: new RegExp(`^${p.withPaper.length} de ${p.students.length} hojas recibidas`) })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: `Páginas por colocar · ${p.c.unplaced.length}` })).toBeVisible();
    const loose = p.c.unplaced[0];
    if (loose.written_name) await expect(section(page, /^Páginas por colocar/).getByText(`Se lee «${loose.written_name}»`)).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: `Por confirmar · ${p.toConfirm.length}` })).toBeVisible();
    const first = p.toConfirm[0];
    const confirmSection = section(page, /^Por confirmar/);
    await expect(confirmSection.getByText(first.student.name, { exact: true })).toBeVisible();
    await expect(confirmSection.getByText(`Se lee «${first.detected_name}»`)).toBeVisible();
    await expect(confirmSection.getByRole('button', { name: 'Es correcto' })).toHaveCount(p.toConfirm.length);
    await expect(page.getByRole('heading', { level: 2, name: `Hojas por revisar · ${p.flagged.length}` })).toBeVisible();
    const vega = p.withExtra;
    await expect(paperRow(page, vega.student.sort_name)).toBeVisible();
    await expect(strip(page, vega.student.name).getByRole('button')).toHaveCount(vega.pages.length);
    await expect(strip(page, vega.student.name).getByRole('button', { name: /^Ver Hoja extra/ })).toContainText('extra');
    await expect(paperRow(page, vega.student.sort_name).getByText('Hoja extra sin nombre')).toBeVisible();
    await shot(page, info, '31-pile');

    // Complete papers stay folded until asked for.
    const calmRow = p.calm[0];
    await expect(paperRow(page, calmRow.student.sort_name)).toHaveCount(0);
    await page.getByRole('button', { name: `Ver las ${p.calm.length} hojas completas` }).click();
    await expect(paperRow(page, calmRow.student.sort_name)).toBeVisible();
    await page.getByRole('button', { name: 'Ocultar las hojas completas' }).click();
    await expect(paperRow(page, calmRow.student.sort_name)).toHaveCount(0);

    // Blank backs, discarded without AI, folded too.
    const blanks = page.getByRole('button', { name: `Reversos en blanco descartados (${p.c.discarded.length})` });
    await expect(page.getByRole('list', { name: 'Páginas descartadas' })).toHaveCount(0);
    await blanks.click();
    await expect(page.getByRole('list', { name: 'Páginas descartadas' }).getByRole('button')).toHaveCount(p.c.discarded.length);
    await blanks.click();
    await expect(page.getByRole('list', { name: 'Páginas descartadas' })).toHaveCount(0);
  });

  test('examenes-32 · «Añadir hojas»: how to pair (read names / list order) and the upload buttons; nothing is sent until a file is picked', async ({ page, cloneExam }, info) => {
    const exam = await cloneExam('fracciones');
    await openCollect(page, exam.url, exam.title);
    const add = section(page, 'Añadir hojas');
    await expect(add.getByText('Si lo imprimiste desde Sepia, cada página lleva una marca y el montón se ordena solo, aunque venga desordenado.', { exact: false })).toBeVisible();
    await expect(add.getByText('Se lee el nombre de la cabecera y se compara con tu lista, que no sale de Sepia.')).toBeVisible();
    const mode = add.getByRole('group', { name: 'Cómo emparejar' });
    await expect(mode.getByRole('button', { name: 'Leer nombres' })).toHaveAttribute('aria-pressed', 'true');
    await mode.getByRole('button', { name: 'En orden de lista' }).click();
    await expect(mode.getByRole('button', { name: 'En orden de lista' })).toHaveAttribute('aria-pressed', 'true');
    await expect(add.getByText('Por orden alfabético de apellidos. También se lee el nombre, para avisarte si el orden no cuadra.')).toBeVisible();
    await expect(add.getByText('Ordena el montón por apellidos y escanéalo a una o dos caras.', { exact: false })).toBeVisible();
    await expect(add.getByText('Añadir más hojas')).toBeVisible();
    await expect(add.getByText('Se suman a las que ya has subido.')).toBeVisible();
    const chooser = page.waitForEvent('filechooser');
    await add.getByRole('button', { name: 'Subir hojas' }).click();
    const fc = await chooser;
    expect(fc.isMultiple()).toBe(true);
    expect(await fc.element().getAttribute('accept')).toBe('application/pdf,image/*');
    await shot(page, info, '32-add-pages');
    // Photos straight from the camera only where there is one: a touch screen (DropZone's own contract).
    if (isMobile(info)) {
      await expect(add.getByRole('button', { name: 'Hacer fotos' })).toBeVisible();
    } else {
      bug('EX-01', '«Hacer fotos» shows on a computer: .btn overrides .dropzone__camera { display: none }');
      await expect(add.getByRole('button', { name: 'Hacer fotos' })).toBeHidden();
    }
  });

  test('examenes-33 · a name to confirm: «Es correcto» keeps it; «Cambiar» finds another student (search) and joins the pages', async ({ page, cloneExam, demo }, info) => {
    const exam = await cloneExam('fracciones');
    const p = await freshPile(demo, exam.id);
    const [one, two] = p.toConfirm;
    const withPaper = p.calm.find((s) => s.grade?.status === 'suggested')!;
    await openCollect(page, exam.url, exam.title);
    const confirmSection = section(page, /^Por confirmar/);
    const rowOf = (name: string) => confirmSection.locator('.tray-row').filter({ hasText: name });

    await rowOf(one.student.name).getByRole('button', { name: 'Es correcto' }).click();
    await expect(toast(page, `Hoja asignada a ${one.student.name}`)).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: `Por confirmar · ${p.toConfirm.length - 1}` })).toBeVisible();
    await expect.poll(async () => (await pile(demo, exam.id)).byName(one.student.sort_name).match_status).toBe('confirmed');

    await rowOf(two.student.name).getByRole('button', { name: 'Cambiar' }).click();
    const picker = dialog(page, '¿De quién es esta hoja?');
    await expect(picker.getByText(`Se lee «${two.detected_name}».`)).toBeVisible();
    await expect(picker.getByRole('heading', { name: 'Sin hoja' })).toBeVisible();
    for (const s of p.missing) await expect(picker.getByRole('button', { name: s.student.sort_name })).toBeVisible();
    await expect(picker.getByText('Si eliges uno de estos, las páginas se añaden a su examen.')).toBeVisible();
    await picker.getByLabel('Buscar alumno').fill('zzz');
    await expect(picker.getByText('Ningún alumno coincide con «zzz».')).toBeVisible();
    // Accents do not matter.
    await picker.getByLabel('Buscar alumno').fill(withPaper.student.last_name.split(' ')[0].normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase());
    await shot(page, info, '33-picker');
    await picker.getByRole('button', { name: withPaper.student.sort_name }).click();
    await expect(picker).toBeHidden();
    await expect(toast(page, new RegExp(`^Páginas añadidas a la hoja de ${esc(withPaper.student.first_name)}\\.`))).toBeVisible();
    await expect.poll(async () => {
      const now = await pile(demo, exam.id);
      return [now.byName(two.student.sort_name).paper_id, now.byName(withPaper.student.sort_name).pages.length];
    }).toEqual([null, withPaper.pages.length + two.pages.length]);
    // The joined paper lost its AI suggestion: its grade waits for the teacher (never a grade made with other pages).
    expect((await pile(demo, exam.id)).byName(withPaper.student.sort_name).grade?.status ?? 'empty').not.toBe('suggested');
  });

  test('examenes-34 · «Está bien así» clears the warnings of a paper the teacher looked at', async ({ page, cloneExam, demo }) => {
    const exam = await cloneExam('fracciones');
    const p = await freshPile(demo, exam.id);
    const vega = p.withExtra;
    await openCollect(page, exam.url, exam.title);
    await paperRow(page, vega.student.sort_name).getByRole('button', { name: 'Más' }).click();
    await page.getByRole('menuitem', { name: 'Está bien así' }).click();
    await expect(toast(page, 'Hoja revisada')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: p.flagged.length > 1 ? `Hojas por revisar · ${p.flagged.length - 1}` : 'Hojas', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: `Ver las ${p.calm.length + 1} hojas completas` })).toBeVisible();
    await expect.poll(async () => (await pile(demo, exam.id)).byName(vega.student.sort_name).flags).toEqual([]);
  });

  test('examenes-35 · the page viewer: caption, arrows, and on a paper «Mover a otro alumno», «Separar aquí» (from page 2), «Quitar»', async ({ page, cloneExam, demo }, info) => {
    const exam = await cloneExam('fracciones');
    const vega = (await freshPile(demo, exam.id)).withExtra;
    const short = `${vega.student.first_name} ${vega.student.last_name.split(' ')[0]}`;
    await openCollect(page, exam.url, exam.title);
    await strip(page, vega.student.name).getByRole('button', { name: 'Ver Pág. 1 de 2' }).click();
    const viewer = page.getByRole('dialog', { name: `${short} · Pág. 1 de 2` });
    await expect(viewer).toBeVisible();
    await expect(viewer.getByText(`1 / ${vega.pages.length}`)).toBeVisible();
    await expect(viewer.getByRole('button', { name: 'Mover a otro alumno' })).toBeVisible();
    await expect(viewer.getByRole('button', { name: 'Quitar' })).toBeVisible();
    await expect(viewer.getByRole('button', { name: 'Separar aquí' })).toHaveCount(0); // not on the first page
    await expect(viewer.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    await viewer.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('dialog', { name: `${short} · Pág. 2 de 2` })).toBeVisible();
    await expect(page.getByRole('dialog', { name: `${short} · Pág. 2 de 2` }).getByRole('button', { name: 'Separar aquí' })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('dialog', { name: new RegExp(`^${esc(short)} · Hoja extra`) })).toBeVisible();
    await shot(page, info, '35-viewer');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: new RegExp(`^${esc(short)} ·`) })).toHaveCount(0);
  });

  test('examenes-36 · «Quitar» a page sends it to the discarded ones and «Deshacer» puts it back in its paper', async ({ page, cloneExam, demo }) => {
    const exam = await cloneExam('fracciones');
    const p = await freshPile(demo, exam.id);
    const vega = p.withExtra;
    await openCollect(page, exam.url, exam.title);
    await strip(page, vega.student.name).getByRole('button', { name: /^Ver Hoja extra/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Quitar' }).click();
    const done = toast(page, new RegExp(`^Página quitada\\. Se ha quitado la sugerencia de la IA de ${esc(vega.student.first_name)}\\.`));
    await expect(done).toBeVisible();
    // Without the unnamed extra sheet the paper has nothing to look at: it joins the complete ones.
    await expect(page.getByRole('button', { name: `Páginas descartadas (${p.c.discarded.length + 1})` })).toBeVisible();
    await expect((await paperStrip(page, vega.student.name)).getByRole('button')).toHaveCount(vega.pages.length - 1);
    await done.getByRole('button', { name: 'Deshacer' }).click();
    await expect((await paperStrip(page, vega.student.name)).getByRole('button')).toHaveCount(vega.pages.length);
    await expect(page.getByRole('button', { name: `Reversos en blanco descartados (${p.c.discarded.length})` })).toBeVisible();
    await expect.poll(async () => (await pile(demo, exam.id)).byName(vega.student.sort_name).pages.map((x) => x.id))
      .toEqual(vega.pages.map((x) => x.id));
  });

  test('examenes-37 · «Separar aquí» makes another paper («Sin identificar»): «Deshacer» joins it back, «Otro…» gives it to a student', async ({ page, cloneExam, demo }, info) => {
    const exam = await cloneExam('fracciones');
    const p = await freshPile(demo, exam.id);
    const vega = p.withExtra;
    const extra = vega.pages.findIndex((x) => x.kind === 'extra_sheet');
    await openCollect(page, exam.url, exam.title);
    const split = async () => {
      await (await paperStrip(page, vega.student.name)).getByRole('button', { name: /^Ver Hoja extra/ }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Separar aquí' }).click();
    };
    const pagesOf = async () => (await pile(demo, exam.id)).byName(vega.student.sort_name).pages.length;
    await split();
    const t = toast(page, 'Separada. Elige de quién es en «Sin identificar».');
    await expect(t).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Sin identificar · 1' })).toBeVisible();
    await expect.poll(pagesOf).toBe(extra);
    await t.getByRole('button', { name: 'Deshacer' }).click();
    await expect(page.getByRole('heading', { level: 2, name: /^Sin identificar/ })).toHaveCount(0);
    await expect.poll(pagesOf).toBe(vega.pages.length);

    // Split again: the unidentified paper offers students and «Otro…»; given to someone with a paper, the pages join it.
    await split();
    const tray = section(page, /^Sin identificar/);
    await expect(tray.getByText('Nombre ilegible')).toBeVisible();
    await expect(tray.getByRole('button', { name: 'Otro…' })).toBeVisible();
    await shot(page, info, '37-unidentified');
    await tray.getByRole('button', { name: 'Otro…' }).click();
    const picker = dialog(page, '¿De quién es esta hoja?');
    await expect(picker.getByText('No se ha podido leer el nombre.')).toBeVisible();
    await picker.getByRole('button', { name: vega.student.sort_name }).click();
    await expect(toast(page, new RegExp(`^Páginas añadidas a la hoja de ${esc(vega.student.first_name)}\\.`))).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /^Sin identificar/ })).toHaveCount(0);
    await expect.poll(pagesOf).toBe(vega.pages.length);

  });

  test('examenes-38 · «Mover a otro alumno»: a page goes to a student without a paper; the paper it left says what is missing', async ({ page, cloneExam, demo }) => {
    const exam = await cloneExam('fracciones');
    const p = await freshPile(demo, exam.id);
    const from = p.calm.find((s) => s.pages.length === 2 && s.grade?.status === 'suggested')!;
    const to = p.missing.find((s) => !s.missed)!;
    await openCollect(page, exam.url, exam.title);
    await (await paperStrip(page, from.student.name)).getByRole('button', { name: 'Ver Pág. 2 de 2' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Mover a otro alumno' }).click();
    const picker = dialog(page, '¿De quién es esta página?');
    await expect(picker.getByText(/^Pág\. 2 de 2/)).toBeVisible();
    await expect(picker.getByText('La página se añade a su examen.')).toBeVisible();
    await picker.getByRole('button', { name: to.student.sort_name }).click();
    await expect(toast(page, new RegExp(`^Página movida a la hoja de ${esc(to.student.first_name)}\\. Se ha quitado la sugerencia de la IA de .*${esc(from.student.first_name)}`))).toBeVisible();
    // Both papers now need a look: one misses page 2, the other has only page 2.
    await expect(page.getByRole('heading', { level: 2, name: /^Hojas por revisar/ })).toBeVisible();
    await expect(paperRow(page, from.student.sort_name).getByText('Falta pág. 2')).toBeVisible();
    await expect(paperRow(page, to.student.sort_name).getByText('Falta pág. 1')).toBeVisible();
    const after = await pile(demo, exam.id);
    expect(after.byName(to.student.sort_name).pages.map((x) => x.id)).toEqual([from.pages[1].id]);
    expect(after.byName(from.student.sort_name).grade?.status ?? 'empty').toBe('empty');
    // Both are held back from the AI until fixed or marked «Está bien así».
    await expect(page.getByText('La IA sugiere la nota de estas hojas cuando las ordenas o marcas «Está bien así».')).toBeVisible();
  });

  test('examenes-39 · a loose page: discarded and back with «Deshacer»; its viewer; placed on a student\'s paper', async ({ page, cloneExam, demo }, info) => {
    const exam = await cloneExam('fracciones');
    const p = await freshPile(demo, exam.id);
    const target = p.calm.find((s) => s.grade?.status === 'suggested')!;
    await openCollect(page, exam.url, exam.title);
    const loose = section(page, /^Páginas por colocar/);
    await loose.getByRole('button', { name: 'Más' }).click();
    await page.getByRole('menuitem', { name: 'Descartar página' }).click();
    const t = toast(page, 'Página descartada.');
    await expect(t).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /^Páginas por colocar/ })).toHaveCount(0);
    await t.getByRole('button', { name: 'Deshacer' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Páginas por colocar · 1' })).toBeVisible();

    await loose.getByRole('list').getByRole('button').first().click();
    const viewer = page.getByRole('dialog');
    await expect(viewer.getByRole('button', { name: 'Asignar a un alumno' })).toBeVisible();
    await expect(viewer.getByRole('button', { name: 'Descartar' })).toBeVisible();
    await shot(page, info, '39-loose-viewer');
    await viewer.getByRole('button', { name: 'Asignar a un alumno' }).click();
    const picker = dialog(page, '¿De quién es esta página?');
    await picker.getByRole('button', { name: target.student.sort_name }).click();
    await expect(toast(page, new RegExp(`^Página añadida a la hoja de ${esc(target.student.first_name)}\\.`))).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /^Páginas por colocar/ })).toHaveCount(0);
    const after = await pile(demo, exam.id);
    expect([after.c.unplaced.length, after.byName(target.student.sort_name).pages.length]).toEqual([0, target.pages.length + 1]);
  });

  test('examenes-40 · a discarded page: «Recuperar» (to the pages to place) or «Borrar» for good, which asks first', async ({ page, cloneExam, demo }) => {
    const exam = await cloneExam('fracciones');
    const p = await freshPile(demo, exam.id);
    const n = p.c.discarded.length;
    await openCollect(page, exam.url, exam.title);
    await page.getByRole('button', { name: `Reversos en blanco descartados (${n})` }).click();
    await (await discardedStrip(page)).getByRole('button').first().click();
    const viewer = page.getByRole('dialog');
    await expect(viewer.getByRole('button', { name: 'Asignar a un alumno' })).toBeVisible();
    await viewer.getByRole('button', { name: 'Recuperar' }).click();
    await expect(toast(page, 'Página recuperada: está en «Páginas por colocar».')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: `Páginas por colocar · ${p.c.unplaced.length + 1}` })).toBeVisible();

    await expect(page.getByRole('button', { name: `Reversos en blanco descartados (${n - 1})` })).toBeVisible();
    await (await discardedStrip(page)).getByRole('button').first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Borrar' }).click();
    const ask = dialog(page, 'Borrar esta página');
    await expect(ask.getByText('Se borra la imagen escaneada. No se puede deshacer.')).toBeVisible();
    await answer(page, 'Borrar esta página', 'Borrar');
    await expect(toast(page, 'Página borrada')).toBeVisible();
    await expect(page.getByRole('button', { name: `Reversos en blanco descartados (${n - 2})` })).toBeVisible();
    const after = await pile(demo, exam.id);
    expect([after.c.discarded.length, after.c.unplaced.length]).toEqual([n - 2, p.c.unplaced.length + 1]);
  });

  test('examenes-41 · who is missing from the pile: the row opens the sheet with each one\'s case (absent that day, or just no paper)', async ({ page, cloneExam, demo }, info) => {
    const exam = await cloneExam('fracciones');
    const p = await freshPile(demo, exam.id);
    await openCollect(page, exam.url, exam.title);
    await page.getByRole('button', { name: new RegExp(`^${p.withPaper.length} de ${p.students.length} hojas recibidas`) }).click();
    const sheet = dialog(page, `Sin hoja en ${exam.title}`);
    await expect(sheet.getByText(`${p.withPaper.length} de ${p.students.length} hojas recibidas · martes, 17 de noviembre`)).toBeVisible();
    for (const s of p.missing) {
      const sub = s.missed ? 'Falta sin justificar · pendiente' : 'Sin hoja · no consta falta en la lista';
      await expect(sheet.locator('.row').filter({ hasText: s.student.sort_name })).toContainText(sub);
      await expect(sheet.getByRole('button', { name: `${s.student.first_name} ${s.student.last_name.split(' ')[0]}` })).toHaveAttribute('aria-pressed', 'true');
    }
    await expect(sheet.getByRole('button', { name: `Programar repesca (${p.missing.length})` })).toBeVisible();
    await expect(sheet.getByRole('button', { name: `Poner NP (${p.missing.length})` })).toBeVisible();
    await shot(page, info, '41-missing');
  });

  test('examenes-42 · «Descartar hoja»: an unidentified paper goes to the discarded pages (recoverable), and the toast says so', async ({ page, cloneExam, demo }) => {
    bug('EX-02', 'the toast reads «Hoja descartada: 1 su página está en «Páginas descartadas».» (plural() prefixes the number)');
    const exam = await cloneExam('fracciones');
    const p = await freshPile(demo, exam.id);
    const vega = p.withExtra;
    const extra = vega.pages.findIndex((x) => x.kind === 'extra_sheet');
    await demo.post(`/papers/${vega.paper_id}/split`, { page_id: vega.pages[extra].id }); // an unidentified paper
    await openCollect(page, exam.url, exam.title);
    await section(page, /^Sin identificar/).getByRole('button', { name: 'Más' }).click();
    await page.getByRole('menuitem', { name: 'Descartar hoja' }).click();
    await expect(page.getByRole('heading', { level: 2, name: /^Sin identificar/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: `Páginas descartadas (${p.c.discarded.length + 1})` })).toBeVisible();
    const after = await pile(demo, exam.id);
    expect([after.c.unmatched.length, after.c.discarded.length, after.byName(vega.student.sort_name).pages.length])
      .toEqual([0, p.c.discarded.length + 1, extra]);
    await expect(toast(page, 'Hoja descartada: su página está en «Páginas descartadas».')).toBeVisible();
  });
  test('examenes-83 · a page of another of the teacher\'s exams in the pile is set apart with that exam\'s title', async ({ page, cloneExam, demo }) => {
    const exam = await cloneExam('fracciones');
    const p = await freshPile(demo, exam.id);
    const gb = await demo.get(`/courses/${exam.courseId}/gradebook?term=1`);
    const codes = new Map<string, string>();
    for (const a of gb.activities) codes.set((await demo.get(`/activities/${a.id}/correction`)).exam_code, a.title);
    const foreign = p.c.unplaced.find((x: { exam_code: string | null }) => x.exam_code && codes.has(x.exam_code) && codes.get(x.exam_code) !== exam.title);
    if (!foreign) throw new Error('The demo pile has no page of another exam: reseed the demo');
    // Its marker was read (a Sepia code of another exam of this teacher), even when the AI took the page for «another document».
    if (foreign.reason === 'otro') bug('EX-04', 'a page carrying the marker of another exam of the teacher, classified «other» by the AI, is shown as «Otro documento»: papers.sort_pile only looks the code up for exam pages');
    await openCollect(page, exam.url, exam.title);
    await expect(section(page, /^Páginas por colocar/)).toContainText(`Del examen «${codes.get(foreign.exam_code)}» · 2.º ESO B`);
  });
  test('examenes-84 · a page of another exam: its title and group (with the ordinal as everywhere, «2.º ESO B»); no student suggested for it', async ({ page, cloneExam, demo }) => {
    const exam = await cloneExam('fracciones', { foreign: true });
    const p = await freshPile(demo, exam.id);
    const foreign = p.c.unplaced.find((x: { reason: string }) => x.reason === 'otro_examen');
    expect(foreign?.other_exam, 'the copied loose page is read as a page of another exam').toBeTruthy();
    if (foreign.other_exam.course !== '2.º ESO B') bug('EX-05', `the other exam's group comes as «${foreign.other_exam.course}» (Group.name, not display_group): «Del examen … · 2º ESO B»`);
    await openCollect(page, exam.url, exam.title);
    const loose = section(page, /^Páginas por colocar/);
    await expect(loose).toContainText(`Del examen «${foreign.other_exam.title}» · 2.º ESO B`);
    // No student is suggested for another exam's page; it can still be given to one.
    await expect(loose.getByRole('button', { name: 'Otro…' })).toHaveCount(0);
    await expect(loose.getByRole('button', { name: 'Asignar a un alumno' })).toBeVisible();
  });
});
