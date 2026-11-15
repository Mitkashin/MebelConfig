import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const L = {
  en: {
    width: 'Width', height: 'Height', steps: ['Dimensions', 'Elements', 'Fronts and shelves', 'Colours', 'Details'],
    elementCountUp: 'Increase Number of elements', element1: 'Width of element 1', equalise: 'Equalise widths',
    drawers: 'Drawers', open: 'Open', double: 'Double doors', shelvesUp: 'Increase Shelves', doubleTop: 'Double top (36 mm)',
    knob: 'Round knob', black: 'Black', matt: /^Matt \(/, tabs: ['Cut list', 'Sheets', 'Price', 'Hardware'],
    name: 'Name', contact: 'Email or phone', send: 'Send inquiry', sheetLimit: /278\.0 cm/, nearest: /Use 278\.0 cm/, cyrillic: false,
  },
  mk: {
    width: 'Широчина', height: 'Висина', steps: ['Димензии', 'Елементи', 'Фронтови и полици', 'Бои', 'Детали'],
    elementCountUp: 'Зголеми: Број на елементи', element1: 'Широчина на елемент 1', equalise: 'Изедначи ги широчините',
    drawers: 'Фиоки', open: 'Отворено', double: 'Двокрилна', shelvesUp: 'Зголеми: Полици', doubleTop: 'Двојна горна плоча (36 mm)',
    knob: 'Тркалезно копче', black: 'Црна', matt: /^Мат \(/, tabs: ['Листа за кроење', 'Табли', 'Цена', 'Оков'],
    name: 'Име', contact: 'Е-пошта или телефон', send: 'Испрати барање', sheetLimit: /278,0 cm/, nearest: /Постави 278,0 cm/, cyrillic: true,
  },
} as const;

const SERBIAN = /[čćđšžČĆĐŠŽ]|Širina|Visina|Dubina|Sačuvaj|Generiši|Podešavanja/;

async function ready(page: Page) {
  await page.locator('[data-testid="configurator"][data-hydrated="1"]').waitFor();
  await page.locator('[data-testid="viewer"][data-ready="1"]').waitFor({ timeout: 60_000 });
}
const code = (page: Page) => page.getByTestId('configurator').getAttribute('data-config');

for (const locale of ['mk', 'en'] as const) {
  const t = L[locale];
  test(`${locale}: configure, generate, export, reopen from the shared link`, async ({ page, context }) => {
    await page.goto(`/${locale}/configurator/sideboard-1`);
    await ready(page);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    const viewer = page.getByTestId('viewer');
    await expect(viewer).toHaveAttribute('data-part-count', '25');
    const startPrice = await page.getByTestId('live-price').textContent();

    // Step 1: an out-of-range width is explained and blocks generation; the suggested value fixes it.
    const width = page.getByRole('textbox', { name: t.width, exact: true });
    await width.fill('300');
    await expect(page.getByTestId('step-1').getByRole('alert')).toContainText(t.sheetLimit);
    await expect(page.getByTestId('generate')).toBeDisabled();
    await page.getByRole('button', { name: t.nearest }).click();
    await expect(page.getByTestId('generate')).toBeEnabled();
    await width.fill('200');
    await width.blur();
    await page.getByRole('textbox', { name: t.height, exact: true }).fill('80');

    // Step 2: four elements, one resized, then equalised again.
    await page.getByTestId('step-2').getByRole('button', { name: t.steps[1] }).click();
    await page.getByRole('button', { name: t.elementCountUp }).click();
    await expect(viewer).toHaveAttribute('data-part-count', /^\d+$/);
    const first = page.getByRole('textbox', { name: t.element1, exact: true });
    await first.fill('70');
    await first.blur();
    await expect(page.getByRole('button', { name: t.equalise })).toBeEnabled();
    await page.getByRole('button', { name: t.equalise }).click();
    await expect(first).toHaveValue(locale === 'mk' ? '50,0' : '50.0');

    // Step 3: drawers, double doors, an open element with an extra shelf.
    await page.getByTestId('step-3').getByRole('button', { name: t.steps[2] }).click();
    await page.getByTestId('element-0').getByRole('radio', { name: t.drawers }).click();
    await page.getByTestId('element-1').getByRole('radio', { name: t.double }).click();
    await page.getByTestId('element-2').getByRole('radio', { name: t.open, exact: true }).click();
    await page.getByTestId('element-2').getByRole('button', { name: t.shelvesUp }).click();

    // Step 4: body and front decors, the front one through a category filter.
    await page.getByTestId('step-4').getByRole('button', { name: t.steps[3] }).click();
    await page.getByTestId('decor-bodyDecor').getByRole('radio', { name: /W-03/ }).click();
    await page.getByTestId('decor-frontDecor').getByRole('radio', { name: t.matt }).click();
    await page.getByTestId('decor-frontDecor').getByRole('radio', { name: /X-03/ }).click();

    // Step 5: double top, knob handles in black.
    await page.getByTestId('step-5').getByRole('button', { name: t.steps[4] }).click();
    await page.getByRole('switch', { name: t.doubleTop }).check();
    await page.getByRole('radio', { name: t.knob }).click();
    await page.getByTestId('step-5').getByRole('radio', { name: t.black, exact: true }).click();

    // The price follows every change, and undo/redo walk the history.
    await expect(page.getByTestId('live-price')).not.toHaveText(startPrice ?? '');
    const configured = await code(page);
    await page.getByTestId('undo').click();
    expect(await code(page)).not.toBe(configured);
    await page.getByTestId('redo').click();
    expect(await code(page)).toBe(configured);

    // Viewer toggles.
    await page.getByTestId('toggle-doors').click();
    await expect(viewer).toHaveAttribute('data-doors-open', '1');
    await page.getByTestId('toggle-exploded').click();
    await expect(viewer).toHaveAttribute('data-exploded', '1');
    await expect(viewer).toHaveAttribute('data-doors-open', '0');
    await page.getByTestId('toggle-dimensions').click();
    await expect(page.getByTestId('dimension-label').first()).toBeVisible();
    await page.getByTestId('toggle-exploded').click();

    // Step 6: summary, then generate the cut list.
    await expect(page.getByTestId('summary')).toContainText(locale === 'mk' ? '200,0 cm' : '200.0 cm');
    await page.getByTestId('generate').click();
    const results = page.getByTestId('results');
    await expect(results).toBeVisible();
    const rows = results.getByTestId('cut-list').locator('tbody tr');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(8);

    // Clicking a row highlights its parts in the 3D view.
    await rows.first().click();
    await expect(viewer).toHaveAttribute('data-selected', /top/);
    await expect(page.getByTestId('selection-badge')).toBeVisible();

    // Sheets, price (total = sum of lines) and hardware.
    await results.getByRole('tab', { name: t.tabs[1] }).click();
    expect(await results.getByTestId('sheet').count()).toBeGreaterThanOrEqual(3);
    await results.getByRole('tab', { name: t.tabs[2] }).click();
    const totals = await results.locator('[data-line-total]').evaluateAll((cells) => cells.map((c) => Number(c.getAttribute('data-line-total'))));
    const total = Number(await results.getByTestId('price-total').getAttribute('data-total'));
    expect(totals.reduce((s, v) => s + v, 0)).toBe(total);
    await results.getByRole('tab', { name: t.tabs[3] }).click();
    await expect(results.locator('[data-item="drawerSlide"]')).toHaveAttribute('data-qty', '2');
    await expect(results.locator('[data-item="handle"]')).toBeVisible();

    // Exports.
    const [csv] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-csv').click()]);
    expect(csv.suggestedFilename()).toMatch(/sideboard-1-2000x800x350\.csv$/);
    const csvText = readFileSync(await csv.path(), 'utf8');
    expect(csvText.trim().split('\r\n')).toHaveLength(rowCount + 1);
    const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.getByTestId('download-pdf').click()]);
    const pdfBytes = readFileSync(await pdf.path());
    expect(pdfBytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdfBytes.length).toBeGreaterThan(20_000);

    // Inquiry.
    await page.getByRole('textbox', { name: t.name, exact: true }).fill('Test Customer');
    await page.getByRole('textbox', { name: t.contact }).fill('test@example.com');
    await page.getByRole('button', { name: t.send }).click();
    await expect(page.getByTestId('inquiry-sent')).toBeVisible();

    // Language: no Serbian anywhere, Cyrillic only on the Macedonian page.
    const text = await page.locator('body').innerText();
    expect(SERBIAN.test(text)).toBe(false);
    expect(/[Ѐ-ӿ]{4,}/.test(text.replace('Македонски', ''))).toBe(t.cyrillic);

    // The address bar holds the share link; a fresh page restores the exact configuration and price.
    const shared = page.url();
    expect(shared).toContain(`?c=${configured}`);
    const price = await page.getByTestId('results-summary').textContent();
    const again = await context.newPage();
    await again.goto(shared);
    await ready(again);
    expect(await code(again)).toBe(configured);
    await again.getByTestId('generate').click();
    await expect(again.getByTestId('results-summary')).toHaveText(price ?? '');

    // Switching language keeps the configuration.
    await again.getByTestId('locale-switch').click();
    await again.waitForURL(new RegExp(`/${locale === 'mk' ? 'en' : 'mk'}/configurator/`));
    await ready(again);
    expect(await code(again)).toBe(configured);
  });
}

for (const [browserLocale, expected] of [['mk-MK', 'mk'], ['en-US', 'en'], ['de-DE', 'mk']] as const) {
  test(`root: a ${browserLocale} browser lands on /${expected}`, async ({ browser }) => {
    const context = await browser.newContext({ locale: browserLocale });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page).toHaveURL(new RegExp(`/${expected}$`));
    await expect(page.getByRole('link', { name: expected === 'mk' ? 'Конфигурирај' : 'Configure' })).toHaveCount(2);
    await context.close();
  });
}

test('a broken share link falls back to the defaults and says so', async ({ page }) => {
  await page.goto('/en/configurator/sideboard-1?c=1.garbage');
  await ready(page);
  await expect(page.getByTestId('notice')).toContainText('could not be opened');
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-part-count', '25');
});

test('lowering the height reduces shelves, tells the customer, and undo restores them', async ({ page }) => {
  await page.goto('/en/configurator/sideboard-1');
  await ready(page);
  await page.getByTestId('step-3').getByRole('button', { name: 'Fronts and shelves' }).click();
  await page.getByTestId('element-0').getByRole('button', { name: 'Increase Shelves' }).click();
  const before = await code(page);
  const height = page.getByRole('textbox', { name: 'Height', exact: true });
  await height.fill('40');
  await expect(page.getByTestId('notice')).toContainText('shelves were reduced');
  await page.getByTestId('notice').getByRole('button', { name: 'Undo' }).click();
  expect(await code(page)).toBe(before);
});

test('the second model reuses the shell without door controls', async ({ page }) => {
  await page.goto('/en/configurator/shelf-1');
  await ready(page);
  await page.getByTestId('step-3').getByRole('button', { name: 'Fronts and shelves' }).click();
  await expect(page.getByTestId('element-0').getByRole('radio', { name: 'Doors' })).toHaveCount(0);
  await expect(page.getByTestId('toggle-doors')).toHaveCount(0);
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-handle-count', '0');
});

test('mobile: the viewer stays on screen while the controls scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/en/configurator/sideboard-1');
  await ready(page);
  await page.getByRole('button', { name: 'Open all' }).click();
  await page.getByTestId('summary').scrollIntoViewIfNeeded();
  const box = await page.getByTestId('viewer').boundingBox();
  expect(box && box.y >= 0 && box.y < 20 && box.height > 200).toBe(true);
});

test('keyboard: steppers, tabs and the viewer are reachable without a mouse', async ({ page }) => {
  await page.goto('/en/configurator/sideboard-1');
  await ready(page);
  const width = page.getByRole('textbox', { name: 'Width', exact: true });
  await width.focus();
  await page.keyboard.press('ArrowUp');
  await expect(width).toHaveValue('165.1');
  await page.keyboard.press('Shift+ArrowUp');
  await expect(width).toHaveValue('166.1');
  const scene = page.getByRole('img', { name: /3D view/ });
  await scene.focus();
  await expect(scene).toBeFocused();
  await page.keyboard.press('ArrowLeft');
});
