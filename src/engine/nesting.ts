import { getDecor, SHEET } from './catalog';
import { isGrained } from './cutlist';
import type { NestResult, Part, Placement, Sheet, Stock } from './types';

interface Item {
  id: string;
  /** Extent along the sheet length / width when not rotated. */
  w: number;
  h: number;
  canRotate: boolean;
}

interface Free {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Bin {
  free: Free[];
  placements: Placement[];
  cut: number;
}

export function stockFor(part: Pick<Part, 'material' | 'thickness' | 'decor'>): Stock {
  if (part.material === 'hdf') {
    const s = SHEET.hdf;
    return { key: `hdf|${s.thickness}`, material: 'hdf', thickness: s.thickness, decor: null, grain: false, sheetLength: s.length, sheetWidth: s.width, price: s.price };
  }
  const decor = part.decor ? getDecor(part.decor) : undefined;
  const s = SHEET.board;
  return {
    key: `board|${s.thickness}|${part.decor}`,
    material: 'board',
    thickness: s.thickness,
    decor: part.decor,
    grain: decor?.grain ?? false,
    sheetLength: s.length,
    sheetWidth: s.width,
    price: decor?.pricePerSheet ?? 0,
  };
}

type Order = (a: Item, b: Item) => number;
const ORDERS: Order[] = [
  (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h,
  (a, b) => b.w * b.h - a.w * a.h,
  (a, b) => b.h - a.h || b.w - a.w,
  (a, b) => b.w - a.w || b.h - a.h,
];

/**
 * Guillotine packing of one stock. Every placement splits its free rectangle
 * with a full edge-to-edge cut, so the layout can be sawn on a panel saw.
 * Kerf is handled by growing both the parts and the usable area by one kerf:
 * neighbours end up at least a kerf apart, and parts may still sit flush
 * against the trimmed sheet edge.
 */
function pack(items: Item[], length: number, width: number, kerf: number, order: Order): { bins: Bin[]; unplaced: string[] } {
  const areaW = length + kerf;
  const areaH = width + kerf;
  const bins: Bin[] = [];
  const unplaced: string[] = [];

  for (const item of [...items].sort(order)) {
    const options = [{ w: item.w, h: item.h, rotated: false }];
    if (item.canRotate && item.w !== item.h) options.push({ w: item.h, h: item.w, rotated: true });
    const fitsSheet = options.some((o) => o.w <= length && o.h <= width);
    if (!fitsSheet) {
      unplaced.push(item.id);
      continue;
    }

    let best: { bin: Bin; index: number; w: number; h: number; rotated: boolean; score: number } | null = null;
    const tryBin = (bin: Bin) => {
      bin.free.forEach((f, index) => {
        for (const o of options) {
          const w = o.w + kerf;
          const h = o.h + kerf;
          if (w > f.w || h > f.h) continue;
          const score = Math.min(f.w - w, f.h - h);
          if (!best || score < best.score) best = { bin, index, w, h, rotated: o.rotated, score };
        }
      });
    };
    for (const bin of bins) {
      tryBin(bin);
      if (best) break; // fill earlier sheets first
    }
    if (!best) {
      const bin: Bin = { free: [{ x: 0, y: 0, w: areaW, h: areaH }], placements: [], cut: 0 };
      bins.push(bin);
      tryBin(bin);
    }
    const chosen = best as unknown as { bin: Bin; index: number; w: number; h: number; rotated: boolean };
    const f = chosen.bin.free[chosen.index] as Free;
    chosen.bin.free.splice(chosen.index, 1);
    chosen.bin.placements.push({ partId: item.id, x: f.x, y: f.y, w: chosen.w - kerf, h: chosen.h - kerf, rotated: chosen.rotated });

    const restW = f.w - chosen.w;
    const restH = f.h - chosen.h;
    // Two ways to split the remainder; keep the one that leaves the larger single offcut.
    const acrossFirst = Math.max(restW * chosen.h, f.w * restH) >= Math.max(restW * f.h, chosen.w * restH);
    if (acrossFirst) {
      if (restH > 0) chosen.bin.cut += Math.min(f.w, length - f.x);
      if (restW > 0) chosen.bin.cut += chosen.h - kerf;
      if (restW > 0) chosen.bin.free.push({ x: f.x + chosen.w, y: f.y, w: restW, h: chosen.h });
      if (restH > 0) chosen.bin.free.push({ x: f.x, y: f.y + chosen.h, w: f.w, h: restH });
    } else {
      if (restW > 0) chosen.bin.cut += Math.min(f.h, width - f.y);
      if (restH > 0) chosen.bin.cut += chosen.w - kerf;
      if (restW > 0) chosen.bin.free.push({ x: f.x + chosen.w, y: f.y, w: restW, h: f.h });
      if (restH > 0) chosen.bin.free.push({ x: f.x, y: f.y + chosen.h, w: chosen.w, h: restH });
    }
  }
  return { bins, unplaced };
}

/** Lay every sheet part out on its stock and count the sheets. */
export function nest(parts: Part[], kerf = SHEET.kerf, trim = SHEET.trim): NestResult {
  const byStock = new Map<string, { stock: Stock; items: Item[] }>();
  for (const part of parts) {
    // Glass doors are bought ready-made; only board and HDF go on sheets.
    if (part.material === 'glass') continue;
    const stock = stockFor(part);
    let entry = byStock.get(stock.key);
    if (!entry) {
      entry = { stock, items: [] };
      byStock.set(stock.key, entry);
    }
    // Sheet grain runs along the sheet length, and so does the part's `length`.
    entry.items.push({ id: part.id, w: part.length, h: part.width, canRotate: !isGrained(part) });
  }

  const result: NestResult = { stocks: [], sheets: [], unplaced: [], cutLength: 0 };
  for (const { stock, items } of byStock.values()) {
    const length = stock.sheetLength - 2 * trim;
    const width = stock.sheetWidth - 2 * trim;
    let best: ReturnType<typeof pack> | null = null;
    let bestScore = Infinity;
    for (const order of ORDERS) {
      const attempt = pack(items, length, width, kerf, order);
      const last = attempt.bins[attempt.bins.length - 1];
      const lastUsed = last ? last.placements.reduce((s, pl) => s + pl.w * pl.h, 0) / (length * width) : 0;
      // Fewer sheets first; then the emptier last sheet, which leaves the most useful offcut.
      const score = attempt.unplaced.length * 1000 + attempt.bins.length + lastUsed;
      if (score < bestScore) {
        best = attempt;
        bestScore = score;
      }
    }
    if (!best) continue;
    result.stocks.push(stock);
    result.unplaced.push(...best.unplaced);
    best.bins.forEach((bin, index) => {
      const usedArea = bin.placements.reduce((s, pl) => s + pl.w * pl.h, 0);
      const sheet: Sheet = {
        stockKey: stock.key,
        index,
        placements: bin.placements.map((pl) => ({ ...pl, x: pl.x + trim, y: pl.y + trim })),
        usedArea,
        utilisation: usedArea / (stock.sheetLength * stock.sheetWidth),
      };
      result.sheets.push(sheet);
      // Trim cuts on all four sides, then the cuts between parts.
      result.cutLength += 2 * (stock.sheetLength + stock.sheetWidth) + bin.cut;
    });
  }
  return result;
}
