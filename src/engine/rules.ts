import { z } from 'zod';
import { getDecor, HANDLE_SHAPES } from './catalog';
import { getModel, type ModelDef, type ModelParams } from './models';
import type { Config, ElementConfig, Issue, Notice } from './types';

const elementSchema = z.object({
  width: z.number().int(),
  front: z.enum(['doors', 'open', 'drawers']),
  shelves: z.number().int().min(0),
  doors: z.union([z.literal(1), z.literal(2)]),
  opening: z.enum(['auto', 'left', 'right', 'bottom']),
  drawers: z.number().int().min(1),
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
  handleFinish: z.enum(['grey', 'black', 'gold', 'white', 'brown']),
});

/** Height available to the carcass: a double top takes one board thickness from it. */
export function carcassZone(config: Pick<Config, 'height' | 'doubleTop'>, p: ModelParams): number {
  return config.height - (config.doubleTop ? p.board : 0);
}

export function carcassDepth(config: Pick<Config, 'depth' | 'back' | 'elements'>, p: ModelParams): number {
  const anyFront = config.elements.some((e) => e.front !== 'open');
  return config.depth - (anyFront ? p.board + p.frontGap : 0) - (config.back ? p.back : 0);
}

/** Largest shelf count that keeps every gap at or above the minimum spacing. */
export function maxShelves(config: Pick<Config, 'height' | 'doubleTop'>, p: ModelParams): number {
  const inner = carcassZone(config, p) - 2 * p.board;
  return Math.max(0, Math.floor((inner - p.shelfSpacingMin) / (p.shelfSpacingMin + p.board)));
}

export function shelfSpacing(config: Pick<Config, 'height' | 'doubleTop'>, shelves: number, p: ModelParams): number {
  const inner = carcassZone(config, p) - 2 * p.board;
  return (inner - shelves * p.board) / (shelves + 1);
}

export function frontZone(config: Pick<Config, 'height' | 'doubleTop'>, p: ModelParams): number {
  return carcassZone(config, p) - p.doorHeightReduction;
}

export function maxDrawers(config: Pick<Config, 'height' | 'doubleTop'>, p: ModelParams): number {
  const zone = frontZone(config, p);
  return Math.max(0, Math.min(p.drawersMax, Math.floor((zone + p.drawerFrontGap) / (p.drawerFrontMin + p.drawerFrontGap))));
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
}

export function limits(config: Config, model: ModelDef): Limits {
  const p = model.params;
  const n = config.elements.length;
  const hasDrawers = config.elements.some((e) => e.front === 'drawers');
  return {
    width: { min: Math.max(p.widthMin, n * p.elementMin), max: p.widthMax },
    height: { min: p.heightMin, max: p.heightMax },
    depth: { min: hasDrawers ? Math.max(p.depthMin, drawerDepthMin(config, p)) : p.depthMin, max: p.depthMax },
    elements: { min: p.elementsMin, max: Math.min(p.elementsMax, Math.floor(config.width / p.elementMin)) },
    elementWidth: { min: p.elementMin, max: config.width - (n - 1) * p.elementMin },
    maxShelves: maxShelves(config, p),
    maxDrawers: maxDrawers(config, p),
    drawersAvailable:
      model.fronts.includes('drawers') && config.depth >= drawerDepthMin(config, p) && maxDrawers(config, p) >= 1,
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

  if (config.width > p.widthMax) out.push(issue('sheetLimit', 'width', { max: p.widthMax }));
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

  const shelvesCap = maxShelves(config, p);
  const drawersCap = maxDrawers(config, p);
  const elementMax = config.width - (n - 1) * p.elementMin;
  config.elements.forEach((e, i) => {
    const at = `elements.${i}`;
    if (e.width < p.elementMin) out.push(issue('elementMin', `${at}.width`, { min: p.elementMin, max: elementMax }));
    if (!model.fronts.includes(e.front)) out.push(issue('unsupported', `${at}.front`));
    if (e.front !== 'drawers' && e.shelves > shelvesCap)
      out.push(issue('shelvesMax', `${at}.shelves`, { max: shelvesCap, spacing: p.shelfSpacingMin }));
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
export function normalise(config: Config, model: ModelDef): { config: Config; notices: Notice[] } {
  const p = model.params;
  const notices: Notice[] = [];
  const shelvesCap = maxShelves(config, p);
  const drawersCap = maxDrawers(config, p);
  let shelvesCut = false;
  let drawersCut = false;
  let doorsCut = false;
  const elements = config.elements.map((e): ElementConfig => {
    const next = { ...e };
    if (next.shelves > shelvesCap) {
      next.shelves = shelvesCap;
      if (e.front !== 'drawers') shelvesCut = true;
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

/**
 * Set one element's width and spread the difference evenly over the others,
 * so the widths still add up. Returns null when another element would fall
 * below the minimum.
 */
export function resizeElement(widths: number[], index: number, width: number, min: number): number[] | null {
  const others = widths.length - 1;
  if (others === 0 || width < min) return null;
  const delta = width - (widths[index] ?? 0);
  const each = Math.trunc(delta / others);
  let rest = delta - each * others;
  const step = Math.sign(rest);
  const next = widths.map((w, i) => {
    if (i === index) return width;
    let value = w - each;
    if (rest !== 0) {
      value -= step;
      rest -= step;
    }
    return value;
  });
  return next.every((w) => w >= min) ? next : null;
}
