import { z } from 'zod';
import { getDecor, HANDLE_SHAPES } from './catalog';
import { normaliseGrid, validateGrid } from './grid';
import { getModel, type ModelDef, type ModelParams } from './models';
import type { Config, ElementConfig, Issue, Notice } from './types';

const elementSchema = z.object({
  width: z.number().int(),
  front: z.enum(['doors', 'open', 'drawers']),
  shelves: z.number().int().min(0),
  doors: z.union([z.literal(1), z.literal(2)]),
  opening: z.enum(['auto', 'left', 'right', 'bottom']),
  drawers: z.number().int().min(1),
  rail: z.boolean(),
  cells: z.array(
    z.object({
      height: z.number().int(),
      front: z.enum(['doors', 'open', 'drawers']),
      doors: z.union([z.literal(1), z.literal(2)]),
      glass: z.boolean(),
      opening: z.enum(['auto', 'left', 'right']),
      shelves: z.number().int().min(0),
      rails: z.union([z.literal(0), z.literal(1), z.literal(2)]),
      drawers: z.number().int().min(1),
      turn: z.enum(['front', 'left', 'right']),
    }),
  ),
  ownRows: z.boolean(),
});

/** Structural schema: types and enums only. Range rules live in `validate`, because they depend on the model. */
export const configSchema = z.object({
  model: z.string().min(1),
  width: z.number().int(),
  height: z.number().int(),
  depth: z.number().int(),
  elements: z.array(elementSchema).min(1),
  bodyDecor: z.string(),
  frontDecor: z.string(),
  back: z.boolean(),
  doubleTop: z.boolean(),
  openingType: z.enum(['handles', 'push']),
  handleShape: z.enum(HANDLE_SHAPES as [string, ...string[]]),
  handleFinish: z.enum(['grey', 'black', 'gold', 'white', 'brown', 'graphite']),
  mount: z.enum(['wall', 'legs', 'plinth', 'floor']),
  legHeight: z.number().int().min(0),
  legFinish: z.enum(['grey', 'black', 'gold', 'white', 'brown', 'graphite']),
  rows: z.array(z.number().int()),
  shelfSetback: z.number().int().min(0).max(100),
  plinth: z.object({ front: z.boolean(), left: z.boolean(), right: z.boolean() }),
  plinthSetback: z.number().int().min(0).max(100),
  frontGrain: z.object({ doors: z.enum(['vertical', 'horizontal']), drawers: z.enum(['vertical', 'horizontal']) }),
  glassFrame: z.enum(['black', 'white']),
  glassTint: z.enum(['clear', 'light', 'dark']),
});

type Zone = Pick<Config, 'height' | 'doubleTop' | 'mount' | 'legHeight'>;

/** Height of the legs or plinth under the carcass (0 when hung or standing on the floor). */
export function baseHeight(config: Pick<Config, 'mount' | 'legHeight'>): number {
  return config.mount === 'legs' || config.mount === 'plinth' ? config.legHeight : 0;
}

/** Heights offered for the base under the current mount. */
export function baseHeights(model: Pick<ModelDef, 'legHeights' | 'plinthHeights'>, mount: Config['mount']): number[] {
  return mount === 'plinth' ? model.plinthHeights : mount === 'legs' ? model.legHeights : [];
}

/** The offered height nearest to `height` (ties go to the lower one). */
export function nearestHeight(heights: number[], height: number): number {
  return heights.reduce((a, b) => (Math.abs(b - height) < Math.abs(a - height) ? b : a), heights[0] ?? height);
}

/** Height available to the carcass: a double top and legs each take their share of the total height. */
export function carcassZone(config: Zone, p: ModelParams): number {
  return config.height - (config.doubleTop ? p.board : 0) - baseHeight(config);
}

export function carcassDepth(config: Pick<Config, 'depth' | 'back' | 'elements'>, p: ModelParams): number {
  const anyFront = config.elements.some((e) => e.front !== 'open');
  return config.depth - (anyFront ? p.board + p.frontGap : 0) - (config.back ? p.back : 0);
}

/** Largest shelf count that keeps every gap at or above the minimum spacing. */
export function maxShelves(config: Zone, p: ModelParams): number {
  const inner = carcassZone(config, p) - 2 * p.board;
  return Math.max(0, Math.floor((inner - p.shelfSpacingMin) / (p.shelfSpacingMin + p.board)));
}

export function shelfSpacing(config: Zone, shelves: number, p: ModelParams): number {
  const inner = carcassZone(config, p) - 2 * p.board;
  return (inner - shelves * p.board) / (shelves + 1);
}

/** A clothes rail needs hanging height under it and enough depth for hangers. */
export function railFits(config: Zone & Pick<Config, 'depth'>, p: ModelParams): boolean {
  return carcassZone(config, p) - 2 * p.board >= p.hangingSpace + 100 && config.depth >= p.railDepthMin;
}

/** Shelves that fit above a clothes rail while keeping the hanging space clear. */
export function railMaxShelves(config: Zone, p: ModelParams): number {
  const inner = carcassZone(config, p) - 2 * p.board;
  return Math.max(0, Math.floor((inner - p.hangingSpace - 100) / (p.railShelfPitch + p.board)));
}

export function elementMaxShelves(config: Zone, el: Pick<ElementConfig, 'rail'>, p: ModelParams): number {
  return el.rail ? railMaxShelves(config, p) : maxShelves(config, p);
}

export function frontZone(config: Zone, p: ModelParams): number {
  return carcassZone(config, p) - p.doorHeightReduction;
}

export function maxDrawers(config: Zone, p: ModelParams): number {
  const zone = frontZone(config, p);
  return Math.max(0, Math.min(p.drawersMax, Math.floor((zone + p.drawerFrontGap) / (p.drawerFrontMin + p.drawerFrontGap))));
}

/** Smallest overall height at which a clothes rail fits. */
export function railHeightMin(config: Pick<Config, 'doubleTop' | 'mount' | 'legHeight'>, p: ModelParams): number {
  return p.hangingSpace + 100 + 2 * p.board + (config.doubleTop ? p.board : 0) + baseHeight(config);
}

/** Longest standard slide that fits the carcass, or null when none does. */
export function slideLength(depth: number, p: ModelParams): number | null {
  const fits = p.drawerSlides.filter((s) => s <= depth - 10);
  return fits.length ? Math.max(...fits) : null;
}

/** Smallest overall depth at which drawers can be built. */
export function drawerDepthMin(config: Pick<Config, 'back'>, p: ModelParams): number {
  return Math.min(...p.drawerSlides) + 10 + p.board + p.frontGap + (config.back ? p.back : 0);
}

export interface Limits {
  width: { min: number; max: number };
  height: { min: number; max: number };
  depth: { min: number; max: number };
  elements: { min: number; max: number };
  elementWidth: { min: number; max: number };
  maxShelves: number;
  maxDrawers: number;
  drawersAvailable: boolean;
  railAvailable: boolean;
}

export function limits(config: Config, model: ModelDef): Limits {
  const p = model.params;
  const n = config.elements.length;
  const hasDrawers = config.elements.some((e) => e.front === 'drawers');
  return {
    width: { min: Math.max(p.widthMin, n * p.elementMin), max: Math.min(p.widthMax, n * p.elementMax) },
    height: { min: p.heightMin, max: p.heightMax },
    depth: { min: hasDrawers ? Math.max(p.depthMin, drawerDepthMin(config, p)) : p.depthMin, max: p.depthMax },
    elements: { min: Math.max(p.elementsMin, Math.ceil(config.width / p.elementMax)), max: Math.min(p.elementsMax, Math.floor(config.width / p.elementMin)) },
    elementWidth: { min: p.elementMin, max: Math.min(p.elementMax, config.width - (n - 1) * p.elementMin) },
    maxShelves: maxShelves(config, p),
    maxDrawers: maxDrawers(config, p),
    drawersAvailable:
      model.fronts.includes('drawers') && config.depth >= drawerDepthMin(config, p) && maxDrawers(config, p) >= 1,
    railAvailable: model.features.rail && railFits(config, p),
  };
}

const issue = (code: Issue['code'], path: string, params: Issue['params'] = {}): Issue => ({ code, path, params });

/** Every rule a configuration must satisfy before parts are built. Empty array = valid. */
export function validate(input: unknown): Issue[] {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues.slice(0, 5).map((i) => issue('invalid', i.path.join('.'), { message: i.message }));
  }
  const config = parsed.data as Config;
  const model = getModel(config.model);
  if (!model) return [issue('invalid', 'model', { message: 'unknown model' })];
  const p = model.params;
  const out: Issue[] = [];
  const n = config.elements.length;

  if (!getDecor(config.bodyDecor)) out.push(issue('invalid', 'bodyDecor'));
  if (!getDecor(config.frontDecor)) out.push(issue('invalid', 'frontDecor'));

  const grid = model.layout === 'grid';
  if (config.width > p.widthMax) out.push(grid ? issue('range', 'width', { min: Math.max(p.widthMin, n * p.elementMin), max: p.widthMax }) : issue('sheetLimit', 'width', { max: p.widthMax }));
  else if (config.width < p.widthMin) out.push(issue('range', 'width', { min: p.widthMin, max: p.widthMax }));
  else if (config.width < n * p.elementMin)
    out.push(issue('widthForElements', 'width', { count: n, min: n * p.elementMin, max: p.widthMax }));

  if (config.height < p.heightMin || config.height > p.heightMax)
    out.push(issue('range', 'height', { min: p.heightMin, max: p.heightMax }));
  if (config.depth < p.depthMin || config.depth > p.depthMax)
    out.push(issue('range', 'depth', { min: p.depthMin, max: p.depthMax }));

  if (n < p.elementsMin || n > p.elementsMax)
    out.push(issue('elementCount', 'elements', { min: p.elementsMin, max: p.elementsMax }));
  const sum = config.elements.reduce((s, e) => s + e.width, 0);
  if (sum !== config.width) out.push(issue('elementsSum', 'elements', { sum, width: config.width }));

  if (config.doubleTop && !model.features.doubleTop) out.push(issue('unsupported', 'doubleTop'));
  if (!model.mounts.includes(config.mount)) out.push(issue('unsupported', 'mount'));
  if ((config.mount === 'legs' || config.mount === 'plinth') && !baseHeights(model, config.mount).includes(config.legHeight)) out.push(issue('unsupported', 'legHeight'));
  if (config.mount === 'plinth' && !model.plinthSetbacks.includes(config.plinthSetback)) out.push(issue('unsupported', 'plinthSetback'));

  const drawersCap = maxDrawers(config, p);
  const elementMax = Math.min(p.elementMax, config.width - (n - 1) * p.elementMin);
  if (config.width <= p.widthMax && config.width > n * p.elementMax)
    out.push(issue('range', 'width', { min: Math.max(p.widthMin, n * p.elementMin), max: n * p.elementMax }));
  if (grid) {
    config.elements.forEach((e, i) => {
      if (e.width < p.elementMin) out.push(issue('elementMin', `elements.${i}.width`, { min: p.elementMin, max: elementMax }));
      if (e.width > p.elementMax) out.push(issue('elementMax', `elements.${i}.width`, { min: p.elementMin, max: p.elementMax }));
    });
    return [...out, ...validateGrid(config, model)];
  }
  config.elements.forEach((e, i) => {
    const at = `elements.${i}`;
    if (e.width < p.elementMin) out.push(issue('elementMin', `${at}.width`, { min: p.elementMin, max: elementMax }));
    if (e.width > p.elementMax) out.push(issue('elementMax', `${at}.width`, { min: p.elementMin, max: p.elementMax }));
    if (!model.fronts.includes(e.front)) out.push(issue('unsupported', `${at}.front`));
    const shelvesCap = elementMaxShelves(config, e, p);
    if (e.front !== 'drawers' && e.shelves > shelvesCap)
      out.push(issue('shelvesMax', `${at}.shelves`, { max: shelvesCap, spacing: e.rail ? p.railShelfPitch : p.shelfSpacingMin }));
    if (e.rail && e.front !== 'drawers') {
      if (!model.features.rail) out.push(issue('unsupported', `${at}.rail`));
      else if (!railFits(config, p)) out.push(issue('railSpace', `${at}.rail`, { height: railHeightMin(config, p), depth: p.railDepthMin }));
    }
    if (e.front === 'doors' && e.doors === 2 && e.width < p.doubleDoorMin)
      out.push(issue('doubleDoorMin', `${at}.doors`, { min: p.doubleDoorMin }));
    if (e.front === 'drawers') {
      if (e.drawers > drawersCap || drawersCap < 1)
        out.push(issue('drawersMax', `${at}.drawers`, { max: drawersCap, min: p.drawerFrontMin }));
      if (slideLength(carcassDepth(config, p), p) === null)
        out.push(issue('drawersDepth', `${at}.front`, { min: drawerDepthMin(config, p), max: p.depthMax }));
    }
  });
  return out;
}

/**
 * Bring dependent values back inside their limits after a change elsewhere
 * (fewer shelves when the height drops, and so on). Returns what was changed
 * so the UI can tell the customer.
 */
export function normalise(input: Config, model: ModelDef): { config: Config; notices: Notice[] } {
  // Legs and plinths come in different heights: switching between them keeps the nearest one offered.
  const heights = baseHeights(model, input.mount);
  let config = heights.length && !heights.includes(input.legHeight) ? { ...input, legHeight: nearestHeight(heights, input.legHeight) } : input;
  if (config.mount === 'plinth' && model.plinthSetbacks.length && !model.plinthSetbacks.includes(config.plinthSetback)) config = { ...config, plinthSetback: nearestHeight(model.plinthSetbacks, config.plinthSetback) };
  if (model.layout === 'grid') return normaliseGrid(config, model);
  const p = model.params;
  const notices: Notice[] = [];
  const drawersCap = maxDrawers(config, p);
  const canRail = model.features.rail && railFits(config, p);
  let shelvesCap = maxShelves(config, p);
  let railCut = false;
  let shelvesCut = false;
  let drawersCut = false;
  let doorsCut = false;
  const elements = config.elements.map((e): ElementConfig => {
    const next = { ...e };
    if (next.rail && !canRail) {
      next.rail = false;
      if (e.front !== 'drawers') railCut = true;
    }
    const cap = elementMaxShelves(config, next, p);
    if (next.shelves > cap) {
      next.shelves = cap;
      if (e.front !== 'drawers') {
        shelvesCut = true;
        shelvesCap = Math.min(shelvesCap, cap);
      }
    }
    if (next.drawers > Math.max(1, drawersCap)) {
      next.drawers = Math.max(1, drawersCap);
      if (e.front === 'drawers') drawersCut = true;
    }
    if (next.doors === 2 && next.width < p.doubleDoorMin) {
      next.doors = 1;
      if (e.front === 'doors') doorsCut = true;
    }
    return next;
  });
  if (railCut) notices.push({ code: 'railRemoved', params: {} });
  if (shelvesCut) notices.push({ code: 'shelvesReduced', params: { max: shelvesCap } });
  if (drawersCut) notices.push({ code: 'drawersReduced', params: { max: drawersCap } });
  if (doorsCut) notices.push({ code: 'doubleDoorsRemoved', params: { min: p.doubleDoorMin } });
  return { config: { ...config, elements }, notices };
}

/** Split `total` into `n` integer widths, the remainder going to the left-most elements one millimetre at a time. */
export function distributeEqual(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const extra = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

/** Scale widths to a new total, keeping proportions. Falls back to equal widths if any element would get too narrow. */
export function scaleWidths(widths: number[], total: number, min: number): number[] {
  const old = widths.reduce((s, w) => s + w, 0);
  const scaled = widths.map((w) => Math.round((w * total) / old));
  const diff = total - scaled.reduce((s, w) => s + w, 0);
  const widest = scaled.indexOf(Math.max(...scaled));
  scaled[widest] = (scaled[widest] ?? 0) + diff;
  return scaled.every((w) => w >= min) ? scaled : distributeEqual(total, widths.length);
}

/** Spread `delta` (positive = take away) evenly over the elements at `indices`, a millimetre at a time for the remainder. */
function spread(widths: number[], indices: number[], delta: number): number[] {
  const next = [...widths];
  const each = Math.trunc(delta / indices.length);
  let rest = delta - each * indices.length;
  const step = Math.sign(rest);
  for (const i of indices) {
    next[i] = (next[i] ?? 0) - each;
    if (rest !== 0) {
      next[i] = (next[i] ?? 0) - step;
      rest -= step;
    }
  }
  return next;
}

/**
 * Set one element's width and spread the difference over the others so the
 * widths still add up. Elements the customer already sized (`pinned`) keep
 * their width when that is possible; only when the free elements cannot
 * absorb the change are the pinned ones adjusted too, and `released` says so.
 * Returns null when no split keeps every element within its limits.
 */
export function resizeElement(
  widths: number[],
  index: number,
  width: number,
  min: number,
  pinned: number[] = [],
  max = Infinity,
): { widths: number[]; released: boolean } | null {
  if (widths.length < 2 || width < min || width > max) return null;
  const delta = width - (widths[index] ?? 0);
  const ok = (ws: number[]) => ws.every((w) => w >= min && w <= max);
  const free = widths.map((_, i) => i).filter((i) => i !== index && !pinned.includes(i));
  if (free.length > 0) {
    const next = spread(widths, free, delta);
    next[index] = width;
    if (ok(next)) return { widths: next, released: false };
  }
  const others = widths.map((_, i) => i).filter((i) => i !== index);
  const next = spread(widths, others, delta);
  next[index] = width;
  return ok(next) ? { widths: next, released: others.some((i) => pinned.includes(i)) } : null;
}
