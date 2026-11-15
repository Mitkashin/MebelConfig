import { test } from '@playwright/test';
import { encodeConfig, defaultConfig } from '../../src/engine/share';
import { MODELS } from '../../src/engine/models';
import type { Config } from '../../src/engine/types';

const base = defaultConfig('sideboard-1');
const el = base.elements[0]!;

const SHOTS: { name: string; config: Config; click?: string[]; locale?: string; viewport?: { width: number; height: number } }[] = [
  { name: '01-default', config: base },
  { name: '02-default-open-dimensions', config: base, click: ['toggle-doors', 'toggle-dimensions'], locale: 'en' },
  {
    name: '03-mixed-fronts-open',
    config: {
      ...base,
      width: 2100,
      height: 800,
      depth: 420,
      frontDecor: 'u540-st9',
      bodyDecor: 'h1180-st37',
      handleShape: 'bar320',
      handleFinish: 'black',
      elements: [
        { ...el, width: 500, front: 'doors', shelves: 2 },
        { ...el, width: 700, front: 'drawers', drawers: 3 },
        { ...el, width: 500, front: 'open', shelves: 3 },
        { ...el, width: 400, front: 'doors', doors: 1, opening: 'right', shelves: 1 },
      ],
    },
    click: ['toggle-doors'],
  },
  {
    name: '04-double-doors-flap-double-top',
    config: {
      ...base,
      width: 2400,
      height: 500,
      depth: 450,
      doubleTop: true,
      bodyDecor: 'u961-st7',
      frontDecor: 'h3303-st10',
      handleShape: 'edge',
      elements: [
        { ...el, width: 800, doors: 2, shelves: 1 },
        { ...el, width: 900, opening: 'bottom', shelves: 0 },
        { ...el, width: 700, doors: 2, shelves: 1 },
      ],
    },
    click: ['toggle-doors'],
  },
  {
    name: '05-exploded',
    config: { ...base, width: 1200, elements: [{ ...el, width: 600, front: 'drawers', drawers: 2 }, { ...el, width: 600 }] },
    click: ['toggle-exploded'],
  },
  {
    name: '06-tall-narrow-push',
    config: { ...base, width: 700, height: 1800, depth: 300, openingType: 'push', bodyDecor: 'u708-st9', frontDecor: 'f186-st9', back: false, elements: [{ ...el, width: 350, shelves: 5 }, { ...el, width: 350, front: 'open', shelves: 6 }] },
  },
  { name: '07-open-sideboard', config: defaultConfig('open-sideboard-1') },
  { name: '14-wardrobe-open', config: defaultConfig('wardrobe-1'), click: ['toggle-doors'] },
  { name: '15-standing-sideboard', config: defaultConfig('standing-sideboard-1') },
  { name: '16-chest-of-drawers-open', config: defaultConfig('drawer-sideboard-1'), click: ['toggle-doors'] },
  { name: '08-mobile', config: base, viewport: { width: 390, height: 844 } },
];

for (const shot of SHOTS) {
  test(shot.name, async ({ page }) => {
    if (shot.viewport) await page.setViewportSize(shot.viewport);
    await page.goto(`/${shot.locale ?? 'mk'}/configurator/${shot.config.model}?c=${encodeConfig(shot.config)}`);
    await page.locator('[data-testid="viewer"][data-ready="1"]').waitFor({ timeout: 60_000 });
    for (const id of shot.click ?? []) await page.getByTestId(id).click();
    await page.waitForTimeout(2500);
    const target = shot.viewport ? page : page.getByTestId('viewer');
    await target.screenshot({ path: `docs/screenshots/${shot.name}.png` });
  });
}

test('09-pages', async ({ page }) => {
  await page.goto(`/en/configurator/sideboard-1?c=${encodeConfig(SHOTS[2]!.config)}`);
  await page.locator('[data-testid="viewer"][data-ready="1"]').waitFor({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Open all' }).click();
  await page.screenshot({ path: 'docs/screenshots/09-page-settings.png', fullPage: true });
  await page.getByTestId('generate').click();
  await page.getByTestId('cut-list').locator('tr[data-row="3"]').click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'docs/screenshots/10-page-results-cutlist.png', fullPage: true });
  await page.getByRole('tab', { name: 'Sheets' }).click();
  await page.screenshot({ path: 'docs/screenshots/11-page-results-sheets.png', fullPage: true });
  await page.getByRole('tab', { name: 'Price' }).click();
  await page.screenshot({ path: 'docs/screenshots/12-page-results-price.png', fullPage: true });
});

test('13-sample-pdf', async ({ page }) => {
  await page.goto(`/mk/configurator/sideboard-1?c=${encodeConfig(SHOTS[2]!.config)}`);
  await page.locator('[data-testid="viewer"][data-ready="1"]').waitFor({ timeout: 60_000 });
  await page.getByTestId('generate').click();
  const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.getByTestId('download-pdf').click()]);
  await pdf.saveAs('docs/sample-cut-list-mk.pdf');
});

// Card images for the model chooser: our own renders of each model's starting configuration.
for (const model of MODELS) {
  test(`thumbnail-${model.slug}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 760 });
    await page.goto(`/en/configurator/${model.slug}`);
    await page.locator('[data-testid="viewer"][data-ready="1"]').waitFor({ timeout: 60_000 });
    await page.addStyleTag({ content: '.no-print{display:none!important} [data-testid="viewer"]{border:0!important;border-radius:0!important}' });
    await page.waitForTimeout(1500);
    await page.getByTestId('viewer').screenshot({ path: `public/models/${model.slug}.raw.png` });
  });
}

test('17-chooser', async ({ page }) => {
  await page.goto('/en');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'docs/screenshots/17-model-chooser.png', fullPage: true });
});
