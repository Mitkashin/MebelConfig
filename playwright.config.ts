import { defineConfig } from '@playwright/test';

const PORT = 3100;

export const shared = {
  baseURL: `http://localhost:${PORT}`,
  // Uses the installed Chrome; software WebGL so the 3D view renders without a GPU.
  channel: 'chrome' as const,
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  viewport: { width: 1440, height: 900 },
};

export const webServer = {
  command: `npx next start -p ${PORT}`,
  url: `http://localhost:${PORT}/mk`,
  // Always start from the current build: a server left over from an older build serves stale asset names.
  reuseExistingServer: false,
  timeout: 120_000,
};

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /.*\.spec\.ts/,
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { ...shared, trace: 'retain-on-failure' },
  webServer,
});
