import { expect, test } from '@playwright/test';
import { defaultConfig, encodeConfig } from '../../src/engine/share';

test('fractional sheet counts render the same on the server and in the browser', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const c = { ...defaultConfig('drawer-sideboard-1'), bodyDecor: 'h1145-st10', frontDecor: 'h1145-st10' };
  await page.goto(`/mk/configurator/drawer-sideboard-1?c=${encodeConfig(c)}`);
  await expect(page.getByTestId('live-sheets')).toContainText('2,5 табли');
  expect(errors.filter((e) => /hydrat/i.test(e))).toEqual([]);
});
