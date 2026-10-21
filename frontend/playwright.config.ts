import { defineConfig, devices } from '@playwright/test';

const PORT = 4321;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const WEB_SERVER_ENV = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
);

// E2E availability mocks use deterministic fixture variant IDs. Keep the
// Playwright server isolated even when the preceding release build uses a live API.
WEB_SERVER_ENV.CATALOG_API_URL = '';

export default defineConfig({
  testDir: './e2e',
  timeout: 30 * 1000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : (process.platform === 'win32' ? 4 : undefined),
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: 'chromium-mobile',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    command: 'npm run build && npx astro preview --port 4321 --host 127.0.0.1',
    url: BASE_URL,
    env: WEB_SERVER_ENV,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 60 * 1000,
  },
});
