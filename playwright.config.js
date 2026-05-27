import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  workers: 3,
  retries: 1,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    viewport: { width: 1024, height: 768 },
  },
  projects: [
    { name: 'tablet-landscape', use: { viewport: { width: 1024, height: 768 } } },
    { name: 'tablet-portrait',  use: { viewport: { width: 768, height: 1024 } } },
    { name: 'mobile',           use: { viewport: { width: 375, height: 812 } } },
  ],
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
