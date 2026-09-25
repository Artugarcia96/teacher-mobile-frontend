import { expect, heading, nav, shot, test, toast } from './marco.helpers';

// Marco · IA que sigue trabajando: a material asked to the AI (one, or a batch from «Preparar el trimestre») keeps
// being made while the teacher goes elsewhere, and the app says when it is ready wherever she is, with «Abrir».
// Real AI (claude_cli): run with `npx playwright test --grep @ai`. Each test is a teacher of its own.

const AI_STEP = 4 * 60_000;

test.describe('ia · avisos al terminar', () => {
  test.use({ teacherSpec: { course: { units: [{ title: 'Fracciones', term: 1, status: 'current' }] } } });

  test('marco-70 @ai · un resumen creado con IA avisa al terminar estando en Hoy, y «Abrir» lleva a él', async ({ page, teacher }, info) => {
    test.setTimeout(AI_STEP + 90_000);
    const unit = teacher.course!.units[0];
    await page.goto(`/clases/${teacher.course!.id}/unidades/${unit.id}`);
    await expect(heading(page, 'Fracciones')).toBeVisible();
    await page.getByRole('button', { name: 'Crear con IA' }).click();
    const sheet = page.getByRole('dialog', { name: 'Crear con IA' });
    await sheet.getByRole('button', { name: 'Resumen' }).click();
    await sheet.getByRole('button', { name: 'Crear resumen' }).click();
    await expect(toast(page, 'Creando el resumen. Puedes seguir trabajando: Sepia avisa al terminar.')).toBeVisible();
    await expect(sheet).toBeHidden();

    // The teacher goes on with her day.
    await nav(page, info).getByRole('link', { name: 'Hoy', exact: true }).click();
    await expect(heading(page, 'Hoy')).toBeVisible();
    const ready = toast(page, 'Resumen de «Fracciones» listo');
    await expect(ready).toBeVisible({ timeout: AI_STEP });
    await shot(page, info, 'ia-aviso-listo');
    await ready.getByRole('button', { name: 'Abrir' }).click();
    await expect(page).toHaveURL(new RegExp(`/clases/${teacher.course!.id}/unidades/${unit.id}/materiales/[^/]+$`));
    await expect(heading(page, 'Resumen')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Marcar como revisado' })).toBeVisible();

    const detail = await teacher.api.get(`/units/${unit.id}`);
    expect(detail.materials.find((m: { kind: string }) => m.kind === 'summary')).toMatchObject({ status: 'ready', reviewed: false });
  });

  test('marco-71 @ai · «Preparar el trimestre» avisa al terminar aunque se cierre su hoja y se vaya a otra pantalla', async ({ page, teacher }, info) => {
    test.setTimeout(AI_STEP + 90_000);
    await page.goto(`/clases/${teacher.course!.id}/programacion`);
    await page.getByRole('button', { name: /^Preparar el trimestre/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Preparar el trimestre' });
    // Only a summary of the one unit (the defaults are notes, worksheet and slides).
    for (const k of ['Apuntes', 'Ficha', 'Presentación']) await sheet.getByRole('button', { name: k, exact: true }).click();
    await sheet.getByRole('button', { name: 'Resumen', exact: true }).click();
    await sheet.getByRole('button', { name: 'Crear 1 material' }).click();
    const progress = page.getByRole('dialog', { name: 'Preparando el trimestre' });
    await expect(progress).toContainText('Puedes cerrar esta hoja y seguir trabajando: al terminar aparece un aviso.');
    await progress.locator('.sheet__foot').getByRole('button', { name: 'Cerrar' }).click();
    await expect(progress).toBeHidden();

    await nav(page, info).getByRole('link', { name: /Evaluar/ }).click();
    await expect(heading(page, 'Evaluar')).toBeVisible();
    await expect(toast(page, 'Materiales preparados: 1 listo')).toBeVisible({ timeout: AI_STEP });
    const detail = await teacher.api.get(`/units/${teacher.course!.units[0].id}`);
    expect(detail.materials.filter((m: { kind: string; status: string }) => m.kind === 'summary' && m.status === 'ready')).toHaveLength(1);
  });
});
