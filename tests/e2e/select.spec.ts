import { expect, test } from '@playwright/test';

test('clicking one part in the 3D view highlights only that part; its cut-list row highlights all of them', async ({ page }) => {
  await page.goto('/en/configurator/sideboard-1');
  await page.locator('[data-testid="viewer"][data-ready="1"]').waitFor({ timeout: 60_000 });
  const viewer = page.getByTestId('viewer');
  const box = (await viewer.boundingBox())!;
  // The middle of the view is a door front of the default sideboard (three identical doors).
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await expect(viewer).toHaveAttribute('data-selected', /^e\d\.door$/);
  await expect(page.getByTestId('selection-badge')).toContainText('1 of 3 identical parts');
  await page.getByTestId('generate').click();
  const row = page.getByTestId('cut-list').locator('tr[data-active="1"]');
  await expect(row).toHaveCount(1);
  await row.click();
  await expect(viewer).toHaveAttribute('data-selected', 'e0.door,e1.door,e2.door');
  await expect(page.getByTestId('selection-badge')).toContainText('3 of 3 identical parts');
});

test('an uneven width still gives one row per identical part, with the elements it belongs to', async ({ page }) => {
  await page.goto('/en/configurator/sideboard-1');
  await page.locator('[data-testid="viewer"][data-ready="1"]').waitFor({ timeout: 60_000 });
  const width = page.getByRole('textbox', { name: 'Width', exact: true });
  await width.fill('200');
  await width.blur();
  await page.getByTestId('generate').click();
  const cells = page.getByTestId('cut-list').locator('td[data-elements]');
  await expect(page.getByTestId('cut-list').locator('tbody tr')).toHaveCount(8);
  await expect(cells.first()).toHaveText('all');
  await expect(page.getByTestId('cut-list').locator('td[data-elements="0,1,2"]')).toHaveCount(5);
  await page.screenshot({ path: 'docs/screenshots/18-cut-list-elements.png', fullPage: true });
});
