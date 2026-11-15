import { defineConfig } from '@playwright/test';
import { shared, webServer } from './playwright.config';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /screenshots\.shots\.ts/,
  timeout: 180_000,
  workers: 1,
  reporter: [['list']],
  use: shared,
  webServer,
});
