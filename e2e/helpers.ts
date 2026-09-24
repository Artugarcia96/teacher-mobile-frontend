import type { Page, TestInfo } from '@playwright/test';

/** Save a named screenshot when SHOTS=1 (npm run shots) into e2e/screenshots/<project>/. */
export async function shot(page: Page, info: TestInfo, name: string) {
  if (!process.env.SHOTS) return;
  await page.waitForTimeout(400);
  await page.screenshot({ path: `e2e/screenshots/${info.project.name}/${name}.png` });
}

/** Fail the test on uncaught page errors. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}
