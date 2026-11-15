import { buildHandles, buildParts } from './build';
import { CURRENCY, HANDLE_PRICE_FACTOR, HARDWARE_PRICES, RATES } from './catalog';
import { bandingLength, buildCutList } from './cutlist';
import { requireModel } from './models';
import { nest } from './nesting';
import { carcassDepth, slideLength } from './rules';
import type { Config, Derived, HardwareItem, NestResult, Part, Price, PriceLine } from './types';

/** Hinges for one door: by the length of its hinged edge. */
export function hingeCount(part: Part, max2: number, max3: number): number {
  const edge = part.hinge === 'bottom' ? part.size[0] : part.size[1];
  return edge <= max2 ? 2 : edge <= max3 ? 3 : 4;
}

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
  const drawerFronts = parts.filter((x) => x.role === 'drawerFront');
  const shelves = parts.filter((x) => x.role === 'shelf').length;
  const backs = parts.filter((x) => x.role === 'back' || x.role === 'drawerBottom');
  const elements = config.elements.length;
  const fronts = doors.length + drawerFronts.length;

  const hinges = doors.reduce((s, d) => s + hingeCount(d, p.hingeMax2, p.hingeMax3), 0);
  push('hinge', hinges);
  push('flapStay', doors.filter((d) => d.hinge === 'bottom').length);

  if (fronts > 0 && model.features.handles) {
    if (config.openingType === 'handles') {
      push('handle', fronts, 'pcs', { shape: config.handleShape, finish: config.handleFinish }, Math.round(price('handle') * HANDLE_PRICE_FACTOR[config.handleShape]));
    } else {
      push('pushLatch', fronts);
    }
  } else if (fronts > 0) {
    push('pushLatch', fronts);
  }

  if (drawerFronts.length > 0) {
    push('drawerSlide', drawerFronts.length, 'pair', { length: slideLength(carcassDepth(config, p), p) ?? 0 });
  }
  push('shelfPin', shelves * 4);
  push('wallBracket', elements * 2);
  push('wallPlug', elements * 4);

  // Carcass: bottom to sides (2 joints, an extra screw on deep carcasses), rails to sides (4 joints),
  // top fixed through the rails (4). Drawer box: 4 corner joints, plus 4 screws through the inner front.
  const perJoint = carcassDepth(config, p) > 400 ? 3 : 2;
  push('carcassScrew', elements * (2 * perJoint + 4 * 2 + 4) + drawerFronts.length * (4 * 2 + 4));

  const handleScrews = config.openingType === 'handles' && model.features.handles ? fronts * (config.handleShape === 'knob' ? 1 : 2) : 0;
  push('smallScrew', hinges * 4 + elements * 2 * 2 + drawerFronts.length * 8 + handleScrews);

  const nails = backs.reduce((s, b) => s + Math.ceil((2 * (b.length + b.width)) / 150), 0);
  push('backNail', nails);
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
