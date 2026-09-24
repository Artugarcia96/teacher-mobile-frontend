import { defineConfig, devices } from '@playwright/test';

// E2E teacher workflows against the demo backend (mock AI, frozen date 2026-11-19 10:40).
// `npm run e2e` starts both servers if they are not running. `npm run shots` also saves screenshots.
const APP = process.env.APP || 'http://127.0.0.1:5173';
const API = process.env.API || 'http://127.0.0.1:8000';

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: APP, locale: 'es-ES', storageState: './e2e/.results/auth.json', trace: 'retain-on-failure' },
  projects: [
    { name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'chromium', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 } },
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
  ],
  webServer: [
    { command: 'cd ../teacher-mobile-backend && scripts/dev.sh --demo', url: `${API}/api/health`, reuseExistingServer: true, timeout: 120_000 },
    { command: 'npm run dev', url: APP, reuseExistingServer: true, timeout: 60_000 },
  ],
});
