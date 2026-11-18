import { buildFittings, buildHandles, buildParts } from './build';
import { cellCount } from './grid';
import { CURRENCY, getDecor, HANDLE_PRICES, HARDWARE, KNOB_PRICES, LEG_PRICES, NAILS_PER_PACK, nearestPrice, SERVICES, SLIDE_PRICES } from './catalog';
import { bandedLength, bandingLength, buildCutList } from './cutlist';
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
  const items: HardwareItem[] = [];
  const push = (key: string, qty: number, unit: HardwareItem['unit'] = 'pcs', detail?: HardwareItem['detail'], priced: { price: number; source?: string } | undefined = HARDWARE[key]) => {
    if (qty > 0) items.push({ key, qty, unit, unitPrice: priced?.price ?? 0, ...(detail ? { detail } : {}), ...(priced?.source ? { source: priced.source } : {}) });
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
    push('glassDoor', glassDoors.length, 'pcs', { area: Math.round(area * 100) / 100, frame: config.glassFrame, tint: config.glassTint }, { price: Math.round((area * p.glassPricePerM2) / glassDoors.length) });
  }
  push('flapStay', doors.filter((d) => d.hinge === 'bottom').length);
  if (handles) {
    const handle = config.handleShape === 'knob' ? (KNOB_PRICES[config.handleFinish] ?? HANDLE_PRICES.knob) : HANDLE_PRICES[config.handleShape];
    push('handle', fronts, 'pcs', { shape: config.handleShape, finish: config.handleFinish }, handle);
  } else {
    push('pushLatch', fronts);
  }
  if (drawers > 0) {
    const length = slideLength(carcassDepth(config, p), p) ?? 0;
    push('drawerSlide', drawers, 'pair', { length }, nearestPrice(SLIDE_PRICES, length));
  }
  push('shelfPin', shelves * 4);
  const legs = fittings.filter((f) => f.kind === 'leg').length;
  const rails = fittings.filter((f) => f.kind === 'rail').length;
  push('leg', legs, 'pcs', { height: config.legHeight, finish: config.legFinish }, nearestPrice(LEG_PRICES, config.legHeight));
  // The rail is sold by the metre: the line is priced by the total length, rounded up to 10 cm.
  const railMeters = Math.ceil(fittings.filter((f) => f.kind === 'rail').reduce((s, f) => s + f.size[0], 0) / 100) / 10;
  push('hangingRail', rails > 0 ? railMeters : 0, 'm', { count: rails });
  push('railHolder', rails * 2);
  // Hung pieces carry on two brackets per element; tall standing pieces get one each against tipping.
  const brackets = config.mount === 'wall' ? elements * 2 : config.height > 1200 ? elements : 0;
  push('wallBracket', brackets);

  // 3.5x16: four per hinge, eight per pair of slides, two per push latch, two per rail holder.
  push('screw3516', withReserve(hinges * 4 + drawers * 8 + (handles ? 0 : fronts * 2) + rails * 4));
  // 4x30: top fixed through the rails (4 per carcass), wall brackets (2 each), drawer fronts and legs (4 each).
  const plinths = parts.filter((x) => x.role === 'plinth');
  const plinthBase = !grid && config.mount === 'plinth';
  // A plinth base stands on levellers under its side panels and supports, two each; wardrobe plinth panels clip to the legs.
  const plinthRuns = plinthBase ? plinths.filter((x) => x.lengthAxis === 2).length : 0;
  push('plinthLeveller', plinthRuns * 2);
  push('plinthClip', plinthBase ? 0 : plinths.length * 3);
  // Stacked wardrobe carcasses are screwed to each other: 4 screws per joint.
  const stackJoints = grid ? config.elements.reduce((s, e) => s + e.cells.length - 1, 0) + (elements - 1) * 2 : 0;
  push('screw430', withReserve((grid ? stackJoints * 4 : elements * 4) + brackets * 2 + drawers * 4 + legs * 4));
  // 4x50: bottom (and top for wardrobes) to sides, rails to sides, 4 corner joints per drawer box, plinth base.
  const depthForScrews = grid ? config.depth : carcassDepth(config, p);
  const perJoint = depthForScrews > 400 ? 3 : 2;
  const carcassScrews = withReserve(carcasses * (grid ? 4 * perJoint : 2 * perJoint + 4 * 2) + drawers * 4 * 2);
  // Plinth base: two screws at each end of every side panel and support, and four through each carcass bottom (hidden, no caps).
  const plinthScrews = plinthBase ? plinthRuns * 2 * 2 + elements * 4 : 0;
  push('screw450', carcassScrews + withReserve(plinthScrews));
  push('screwCap', carcassScrews);
  if (handles) push('handleScrew', withReserve(fronts * (config.handleShape === 'knob' ? 1 : 2)));
  const nails = withReserve(nailed.reduce((s, b) => s + Math.ceil((2 * (b.length + b.width)) / 150), 0));
  push('backNail', Math.ceil(nails / NAILS_PER_PACK), 'pcs', { count: nails });
  push('wallPlug', withReserve(brackets * 2));
  return items;
}

/** Customer-entered prices that replace the catalogue ones (after checking with a workshop). */
export interface PriceOverrides {
  sheet?: Record<string, number>;
  /** All-in edge banding per metre (band and gluing), replacing the per-decor band and the service. */
  bandingPerM?: number;
  /** Cutting per board sheet. */
  cuttingPerSheet?: number;
}

/** Price as line items. The total is defined as the sum of the lines, so the two can never drift apart. */
export function buildPrice(parts: Part[], nested: NestResult, hardware: HardwareItem[], overrides: PriceOverrides = {}): { price: Price; bandingMeters: number } {
  const lines: PriceLine[] = [];
  const m = (mm: number) => Math.round(mm / 10) / 100;
  const sheetsOf = { board: 0, hdf: 0 };
  for (const stock of nested.stocks) {
    const sheets = nested.sheets.filter((s) => s.stockKey === stock.key);
    // A half sheet counts as half a sheet, for the board and for the cutting.
    const qty = sheets.reduce((s, x) => s + x.fraction, 0);
    if (stock.material === 'board' || stock.material === 'hdf') sheetsOf[stock.material] += qty;
    const unitPrice = overrides.sheet?.[stock.key] ?? stock.price;
    const used = sheets.reduce((s, x) => s + x.usedArea, 0) / (qty * stock.sheetLength * stock.sheetWidth);
    lines.push({
      key: `sheet:${stock.key}`,
      kind: 'sheet',
      qty,
      unit: 'sheet',
      unitPrice,
      total: Math.round(qty * unitPrice),
      detail: { material: stock.material, thickness: stock.thickness, decor: stock.decor ?? '', utilisation: Math.round(used * 100) },
    });
  }

  // The supplier cuts per sheet bought.
  const boardCut = overrides.cuttingPerSheet ?? SERVICES.cuttingPerSheet.board;
  if (sheetsOf.board > 0) lines.push({ key: 'cutting:board', kind: 'cutting', qty: sheetsOf.board, unit: 'sheet', unitPrice: boardCut, total: Math.round(sheetsOf.board * boardCut), detail: { material: 'board' } });
  if (sheetsOf.hdf > 0) lines.push({ key: 'cutting:hdf', kind: 'cutting', qty: sheetsOf.hdf, unit: 'sheet', unitPrice: SERVICES.cuttingPerSheet.hdf, total: sheetsOf.hdf * SERVICES.cuttingPerSheet.hdf, detail: { material: 'hdf' } });

  // Edge band: bought per decor with an allowance per edge; the gluing is charged on the edges themselves.
  const bandMm = new Map<string, number>();
  let gluedMm = 0;
  for (const part of parts) {
    const len = bandingLength(part);
    if (len === 0 || !part.decor) continue;
    bandMm.set(part.decor, (bandMm.get(part.decor) ?? 0) + len);
    gluedMm += bandedLength(part);
  }
  const bandingMeters = m([...bandMm.values()].reduce((s, v) => s + v, 0));
  if (overrides.bandingPerM !== undefined) {
    lines.push({ key: 'banding', kind: 'banding', qty: bandingMeters, unit: 'm', unitPrice: overrides.bandingPerM, total: Math.round(bandingMeters * overrides.bandingPerM) });
  } else if (bandingMeters > 0) {
    for (const [decorId, mm] of bandMm) {
      const decor = getDecor(decorId);
      const unitPrice = decor?.band ?? 0;
      lines.push({ key: `banding:${decorId}`, kind: 'banding', qty: m(mm), unit: 'm', unitPrice, total: Math.round(m(mm) * unitPrice), detail: { decor: decorId, match: decor?.bandMatch ?? 'estimate', tape: decor?.bandTape ?? '' } });
    }
    lines.push({ key: 'bandingService', kind: 'service', qty: m(gluedMm), unit: 'm', unitPrice: SERVICES.bandingPerM, total: Math.round(m(gluedMm) * SERVICES.bandingPerM) });
  }

  // Hinge cups drilled by the supplier (glass doors arrive ready to hang).
  const cups = parts.filter((x) => x.role === 'door' && x.material === 'board').reduce((s, x) => s + (x.hinges ?? 0), 0);
  if (cups > 0) lines.push({ key: 'hingeDrilling', kind: 'service', qty: cups, unit: 'pcs', unitPrice: SERVICES.hingeDrilling, total: cups * SERVICES.hingeDrilling });

  for (const item of hardware) {
    lines.push({
      key: `hardware:${item.key}`,
      kind: 'hardware',
      qty: item.qty,
      unit: item.unit,
      unitPrice: item.unitPrice,
      total: Math.round(item.qty * item.unitPrice),
      ...(item.detail ? { detail: item.detail } : {}),
    });
  }
  return { price: { lines, total: lines.reduce((s, l) => s + l.total, 0), currency: CURRENCY }, bandingMeters };
}

/** The single derivation chain. Everything the UI shows comes from one call. */
/** Separator in the ids of the copies of a part when several identical pieces are ordered (`e0.sideL@1`). */
export const COPY = '@';

/** The parts of all ordered pieces: the first keeps its ids (the 3D view shows it), the others get `@1`, `@2`, … */
export function orderedParts(parts: Part[], quantity: number): Part[] {
  if (quantity <= 1) return parts;
  return Array.from({ length: quantity }, (_, k) => (k === 0 ? parts : parts.map((x) => ({ ...x, id: `${x.id}${COPY}${k}` })))).flat();
}

/** Hardware for several identical pieces; HDF nails are recounted into packs. */
function multiplyHardware(items: HardwareItem[], quantity: number): HardwareItem[] {
  if (quantity <= 1) return items;
  return items.map((item) => {
    const detail = item.detail && 'count' in item.detail ? { ...item.detail, count: Number(item.detail.count) * quantity } : item.detail;
    const qty = item.key === 'backNail' ? Math.ceil((Number(item.detail?.count ?? 0) * quantity) / NAILS_PER_PACK) : Math.round(item.qty * quantity * 10) / 10;
    return { ...item, qty, ...(detail ? { detail } : {}) };
  });
}

export function derive(config: Config, overrides: PriceOverrides = {}): Derived {
  const parts = buildParts(config);
  const handles = buildHandles(config, parts);
  // Identical pieces are cut together, so their parts share the sheets.
  const all = orderedParts(parts, config.quantity);
  const cutList = buildCutList(all);
  const nested = nest(all);
  const fittings = buildFittings(config, parts);
  const hardware = multiplyHardware(buildHardware(config, parts, fittings), config.quantity);
  const { price, bandingMeters } = buildPrice(all, nested, hardware, overrides);
  return { parts, handles, fittings, cutList, nest: nested, hardware, price, bandingMeters, sheetCount: nested.sheets.reduce((n, x) => n + x.fraction, 0) };
}
