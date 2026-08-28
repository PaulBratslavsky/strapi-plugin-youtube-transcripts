import { defineConfig } from '@playwright/test';

/**
 * Browser tests against a running Strapi admin.
 *
 * Opt-in: they need a server and an admin login. Without E2E_ADMIN_EMAIL and
 * E2E_ADMIN_PASSWORD the specs skip rather than fail, so `npm test` stays green
 * where there is no Strapi to talk to.
 */
export default defineConfig({
  testDir: './tests/e2e-browser',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:1337',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
