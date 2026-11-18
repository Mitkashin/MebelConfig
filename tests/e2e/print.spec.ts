import { expect, test } from '@playwright/test';
import { defaultConfig, encodeConfig } from '../../src/engine/share';

test('Print opens a document with the piece, the exploded view, cut list, sheets, price and hardware, in that order', async ({ page }) => {
  const c = { ...defaultConfig('drawer-sideboard-1'), mount: 'plinth' as const };
  await page.goto(`/en/configurator/drawer-sideboard-1?c=${encodeConfig(c)}`);
  await page.locator('[data-testid="viewer"][data-ready="1"]').waitFor({ timeout: 60_000 });
  await page.getByTestId('generate').click();
  const [doc] = await Promise.all([page.waitForEvent('popup'), page.getByTestId('print').click()]);
  await doc.evaluate(() => {
    window.print = () => {};
  });
  const titles = await doc.locator('section h2').allInnerTexts();
  expect(titles).toEqual(['The piece and its sizes', 'Exploded view with part numbers', 'Cut list', 'Sheets', 'Price', 'Hardware']);
  // Drawings: the piece (with its width), front and side views, and the numbered exploded view.
  await expect(doc.locator('section').first().locator('svg')).toHaveCount(2);
  await expect(doc.locator('section').first()).toContainText('120.0 cm');
  const rows = await page.getByTestId('cut-list').locator('tbody tr').count();
  const numbers = await doc.locator('section').nth(1).locator('svg text').evaluateAll((els) => els.map((e) => e.textContent));
  expect(new Set(numbers).size).toBe(rows);
  await page.getByRole('tab', { name: 'Sheets' }).click();
  const sheets = await page.locator('[data-testid="sheet"]').count();
  expect(sheets).toBeGreaterThan(0);
  await expect(doc.locator('section').nth(3).locator('.sheet')).toHaveCount(sheets);
});
