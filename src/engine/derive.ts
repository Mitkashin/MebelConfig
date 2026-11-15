import { buildHandles, buildParts } from './build';
import { CURRENCY, HANDLE_PRICE_FACTOR, HARDWARE_PRICES, RATES } from './catalog';
import { bandingLength, buildCutList } from './cutlist';
import { requireModel } from './models';
import { nest } from './nesting';
import { carcassDepth, slideLength } from './rules';
import type { Config, Derived, HardwareItem, NestResult, Part, Price, PriceLine } from './types';

const RESERVE = 0.1;
/** Screws, caps and plugs are bought with a 10 % reserve, rounded up. */
const withReserve = (n: number) => (n > 0 ? n + Math.ceil(n * RESERVE) : 0);

/** Fittings needed to build the piece, derived from the same parts list as everything else. */
export function buildHardware(config: Config, parts: Part[]): HardwareItem[] {
  const model = requireModel(config.model);
  const p = model.params;
  const price = (key: string) => HARDWARE_PRICES[key] ?? 0;
  const items: HardwareItem[] = [];
  const push = (key: string, qty: number, unit: HardwareItem['unit'] = 'pcs', detail?: HardwareItem['detail'], unitPrice = price(key)) => {
    if (qty > 0) items.push({ key, qty, unit, unitPrice, ...(detail ? { detail } : {}) });
  };

  const doors = parts.filter((x) => x.role === 'door');
  const drawers = parts.filter((x) => x.role === 'drawerFront').length;
  const shelves = parts.filter((x) => x.role === 'shelf').length;
  const nailed = parts.filter((x) => x.role === 'back' || x.role === 'drawerBottom');
  const elements = config.elements.length;
  const fronts = doors.length + drawers;
  const handles = fronts > 0 && model.features.handles && config.openingType === 'handles';

  const hinges = doors.reduce((s, d) => s + (d.hinges ?? 0), 0);
  push('hinge', hinges);
  push('flapStay', doors.filter((d) => d.hinge === 'bottom').length);
  if (handles) {
    push('handle', fronts, 'pcs', { shape: config.handleShape, finish: config.handleFinish }, Math.round(price('handle') * HANDLE_PRICE_FACTOR[config.handleShape]));
  } else {
    push('pushLatch', fronts);
  }
  if (drawers > 0) push('drawerSlide', drawers, 'pair', { length: slideLength(carcassDepth(config, p), p) ?? 0 });
  push('shelfPin', shelves * 4);
  push('wallBracket', elements * 2);

  // 3.5x16: four per hinge, eight per pair of slides, two per push latch.
  push('screw3516', withReserve(hinges * 4 + drawers * 8 + (handles ? 0 : fronts * 2)));
  // 4x30: top fixed through the rails (4 per carcass), wall brackets (2 each), drawer fronts (4 each).
  push('screw430', withReserve(elements * 4 + elements * 2 * 2 + drawers * 4));
  // 4x50: bottom to sides (2 joints) and rails to sides (4 joints) per carcass, 4 corner joints per drawer box.
  const perJoint = carcassDepth(config, p) > 400 ? 3 : 2;
  const carcassScrews = withReserve(elements * (2 * perJoint + 4 * 2) + drawers * 4 * 2);
  push('screw450', carcassScrews);
  push('screwCap', carcassScrews);
  if (handles) push('handleScrew', withReserve(fronts * (config.handleShape === 'knob' ? 1 : 2)));
  push('backNail', withReserve(nailed.reduce((s, b) => s + Math.ceil((2 * (b.length + b.width)) / 150), 0)));
  push('wallPlug', withReserve(elements * 2 * 2));
  return items;
}

/** Price as line items. The total is defined as the sum of the lines, so the two can never drift apart. */
export function buildPrice(parts: Part[], nested: NestResult, hardware: HardwareItem[]): { price: Price; bandingMeters: number } {
  const lines: PriceLine[] = [];
  for (const stock of nested.stocks) {
    const qty = nested.sheets.filter((s) => s.stockKey === stock.key).length;
    lines.push({
      key: `sheet:${stock.key}`,
      kind: 'sheet',
      qty,
      unit: 'sheet',
      unitPrice: stock.price,
      total: qty * stock.price,
      detail: { material: stock.material, thickness: stock.thickness, decor: stock.decor ?? '' },
    });
  }
  const bandingMeters = Math.round(parts.reduce((s, x) => s + bandingLength(x), 0) / 10) / 100;
  lines.push({ key: 'banding', kind: 'banding', qty: bandingMeters, unit: 'm', unitPrice: RATES.bandingPerM, total: Math.round(bandingMeters * RATES.bandingPerM) });
  const cutMeters = Math.round(nested.cutLength / 10) / 100;
  lines.push({ key: 'cutting', kind: 'cutting', qty: cutMeters, unit: 'm', unitPrice: RATES.cuttingPerM, total: Math.round(cutMeters * RATES.cuttingPerM) });
  for (const item of hardware) {
    lines.push({
      key: `hardware:${item.key}`,
      kind: 'hardware',
      qty: item.qty,
      unit: item.unit,
      unitPrice: item.unitPrice,
      total: item.qty * item.unitPrice,
      ...(item.detail ? { detail: item.detail } : {}),
    });
  }
  return { price: { lines, total: lines.reduce((s, l) => s + l.total, 0), currency: CURRENCY }, bandingMeters };
}

/** The single derivation chain. Everything the UI shows comes from one call. */
export function derive(config: Config): Derived {
  const parts = buildParts(config);
  const handles = buildHandles(config, parts);
  const cutList = buildCutList(parts);
  const nested = nest(parts);
  const hardware = buildHardware(config, parts);
  const { price, bandingMeters } = buildPrice(parts, nested, hardware);
  return { parts, handles, cutList, nest: nested, hardware, price, bandingMeters, sheetCount: nested.sheets.length };
}
