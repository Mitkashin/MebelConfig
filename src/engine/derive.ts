import { buildFittings, buildHandles, buildParts } from './build';
import { cellCount } from './grid';
import { CURRENCY, HANDLE_PRICE_FACTOR, HARDWARE_PRICES, RATES } from './catalog';
import { bandingLength, buildCutList } from './cutlist';
import { requireModel } from './models';
import { nest } from './nesting';
import { carcassDepth, slideLength } from './rules';
import type { Config, Derived, Fitting, HardwareItem, NestResult, Part, Price, PriceLine } from './types';

const RESERVE = 0.1;
/** Screws, caps and plugs are bought with a 10 % reserve, rounded up. */
const withReserve = (n: number) => (n > 0 ? n + Math.ceil(n * RESERVE) : 0);

/** Fittings needed to build the piece, derived from the same parts list as everything else. */
export function buildHardware(config: Config, parts: Part[], fittings: Fitting[] = []): HardwareItem[] {
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
  const grid = model.layout === 'grid';
  // Wardrobes are built from one carcass per compartment.
  const carcasses = grid ? cellCount(config) : config.elements.length;
  const elements = config.elements.length;
  const fronts = doors.length + drawers;
  const handles = fronts > 0 && model.features.handles && config.openingType === 'handles';

  const glassDoors = doors.filter((d) => d.material === 'glass');
  const hinges = doors.reduce((s, d) => s + (d.material === 'glass' ? 0 : (d.hinges ?? 0)), 0);
  const glassHinges = glassDoors.reduce((s, d) => s + (d.hinges ?? 0), 0);
  push('hinge', hinges);
  push('glassHinge', glassHinges);
  if (glassDoors.length > 0) {
    // Glass doors come ready-made in an aluminium frame, priced by area.
    const area = glassDoors.reduce((s, d) => s + (d.length * d.width) / 1e6, 0);
    push('glassDoor', glassDoors.length, 'pcs', { area: Math.round(area * 100) / 100, frame: config.glassFrame, tint: config.glassTint }, Math.round((area * p.glassPricePerM2) / glassDoors.length));
  }
  push('flapStay', doors.filter((d) => d.hinge === 'bottom').length);
  if (handles) {
    push('handle', fronts, 'pcs', { shape: config.handleShape, finish: config.handleFinish }, Math.round(price('handle') * HANDLE_PRICE_FACTOR[config.handleShape]));
  } else {
    push('pushLatch', fronts);
  }
  if (drawers > 0) push('drawerSlide', drawers, 'pair', { length: slideLength(carcassDepth(config, p), p) ?? 0 });
  push('shelfPin', shelves * 4);
  const legs = fittings.filter((f) => f.kind === 'leg').length;
  const rails = fittings.filter((f) => f.kind === 'rail').length;
  push('leg', legs, 'pcs', { height: config.legHeight, finish: config.legFinish });
  push('hangingRail', rails);
  push('railHolder', rails * 2);
  // Hung pieces carry on two brackets per element; tall standing pieces get one each against tipping.
  const brackets = config.mount === 'wall' ? elements * 2 : config.height > 1200 ? elements : 0;
  push('wallBracket', brackets);

  // 3.5x16: four per hinge, eight per pair of slides, two per push latch, two per rail holder.
  push('screw3516', withReserve(hinges * 4 + drawers * 8 + (handles ? 0 : fronts * 2) + rails * 4));
  // 4x30: top fixed through the rails (4 per carcass), wall brackets (2 each), drawer fronts and legs (4 each).
  const plinths = parts.filter((x) => x.role === 'plinth').length;
  push('plinthClip', plinths * 3);
  // Stacked wardrobe carcasses are screwed to each other: 4 screws per joint.
  const stackJoints = grid ? config.elements.reduce((s, e) => s + e.cells.length - 1, 0) + (elements - 1) * 2 : 0;
  push('screw430', withReserve((grid ? stackJoints * 4 : elements * 4) + brackets * 2 + drawers * 4 + legs * 4));
  // 4x50: bottom (and top for wardrobes) to sides, rails to sides, 4 corner joints per drawer box.
  const depthForScrews = grid ? config.depth : carcassDepth(config, p);
  const perJoint = depthForScrews > 400 ? 3 : 2;
  const carcassScrews = withReserve(carcasses * (grid ? 4 * perJoint : 2 * perJoint + 4 * 2) + drawers * 4 * 2);
  push('screw450', carcassScrews);
  push('screwCap', carcassScrews);
  if (handles) push('handleScrew', withReserve(fronts * (config.handleShape === 'knob' ? 1 : 2)));
  push('backNail', withReserve(nailed.reduce((s, b) => s + Math.ceil((2 * (b.length + b.width)) / 150), 0)));
  push('wallPlug', withReserve(brackets * 2));
  return items;
}

/** Customer-entered prices that replace the catalogue ones (after checking with a workshop). */
export interface PriceOverrides {
  sheet?: Record<string, number>;
  bandingPerM?: number;
  cuttingPerM?: number;
}

/** Price as line items. The total is defined as the sum of the lines, so the two can never drift apart. */
export function buildPrice(parts: Part[], nested: NestResult, hardware: HardwareItem[], overrides: PriceOverrides = {}): { price: Price; bandingMeters: number } {
  const lines: PriceLine[] = [];
  const bandingRate = overrides.bandingPerM ?? RATES.bandingPerM;
  const cuttingRate = overrides.cuttingPerM ?? RATES.cuttingPerM;
  for (const stock of nested.stocks) {
    const sheets = nested.sheets.filter((s) => s.stockKey === stock.key);
    const qty = sheets.length;
    const unitPrice = overrides.sheet?.[stock.key] ?? stock.price;
    const used = sheets.reduce((s, x) => s + x.utilisation, 0) / Math.max(1, qty);
    lines.push({
      key: `sheet:${stock.key}`,
      kind: 'sheet',
      qty,
      unit: 'sheet',
      unitPrice,
      total: qty * unitPrice,
      detail: { material: stock.material, thickness: stock.thickness, decor: stock.decor ?? '', utilisation: Math.round(used * 100) },
    });
  }
  const bandingMeters = Math.round(parts.reduce((s, x) => s + bandingLength(x), 0) / 10) / 100;
  lines.push({ key: 'banding', kind: 'banding', qty: bandingMeters, unit: 'm', unitPrice: bandingRate, total: Math.round(bandingMeters * bandingRate) });
  const cutMeters = Math.round(nested.cutLength / 10) / 100;
  lines.push({ key: 'cutting', kind: 'cutting', qty: cutMeters, unit: 'm', unitPrice: cuttingRate, total: Math.round(cutMeters * cuttingRate) });
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
export function derive(config: Config, overrides: PriceOverrides = {}): Derived {
  const parts = buildParts(config);
  const handles = buildHandles(config, parts);
  const cutList = buildCutList(parts);
  const nested = nest(parts);
  const fittings = buildFittings(config, parts);
  const hardware = buildHardware(config, parts, fittings);
  const { price, bandingMeters } = buildPrice(parts, nested, hardware, overrides);
  return { parts, handles, fittings, cutList, nest: nested, hardware, price, bandingMeters, sheetCount: nested.sheets.length };
}
