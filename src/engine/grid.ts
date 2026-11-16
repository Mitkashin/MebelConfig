import { autoHinge, frontAxis, handleFor, hingeCount } from './build';
import { SHEET } from './catalog';
import { requireModel, type ModelDef, type ModelParams } from './models';
import type { Axis, CellConfig, Config, Edges, ElementConfig, Fitting, HandlePlacement, Hinge, Issue, Material, Notice, Part, Role, Turn, Vec3 } from './types';

/**
 * Wardrobes: columns of stacked compartments. Every compartment is its own
 * carcass (top, bottom, two sides, back), so there is no shared top and the
 * piece can be wider than a sheet. Compartments at the ends can be turned to
 * open sideways; they are built facing forwards and then rotated.
 */

const NO_EDGES: Edges = { l1: false, l2: false, w1: false, w2: false };
const RAIL_DIAMETER = 25;

export interface GridResult {
  parts: Part[];
  handles: HandlePlacement[];
  fittings: Fitting[];
}

const legsHeight = (config: Pick<Config, 'mount' | 'legHeight'>) => (config.mount === 'legs' ? config.legHeight : 0);

/** Compartment heights of a column, top to bottom (legs included in the last one). */
export function columnHeights(config: Config, i: number): number[] {
  return (config.elements[i]?.cells ?? []).map((c) => c.height);
}

/** Height of a compartment's carcass: the bottom one stands on the legs. */
export function carcassHeight(config: Config, i: number, k: number): number {
  const cells = config.elements[i]?.cells ?? [];
  const h = cells[k]?.height ?? 0;
  return k === cells.length - 1 ? h - legsHeight(config) : h;
}

function frontDepth(hasFront: boolean, p: ModelParams): number {
  return hasFront ? p.board + p.frontGap : 0;
}

/** Depth of the carcass of a compartment. Forward-facing compartments share one front plane. */
export function cellCarcassDepth(config: Config, i: number, k: number, p: ModelParams): number {
  const c = config.elements[i]?.cells[k];
  const back = config.back ? p.back : 0;
  if (c && c.turn !== 'front') return (config.elements[i]?.width ?? 0) - frontDepth(c.front !== 'open', p) - back;
  const anyFront = config.elements.some((e) => e.cells.some((x) => x.turn === 'front' && x.front !== 'open'));
  return config.depth - frontDepth(anyFront, p) - back;
}

export interface CellCaps {
  maxShelves: number;
  maxDrawers: number;
  railsMax: 0 | 1 | 2;
  /** Overall depth needed for hanging rails in this compartment (mm). */
  railDepthOk: boolean;
  slide: number | null;
  turns: Turn[];
  doubleDoorsOk: boolean;
}

function slideFor(depth: number, p: ModelParams): number | null {
  const fits = p.drawerSlides.filter((s) => s <= depth - 10);
  return fits.length ? Math.max(...fits) : null;
}

/** Shelves that fit in a clear height, at least `spacing` apart. */
function shelvesIn(clear: number, p: ModelParams): number {
  return Math.max(0, Math.floor((clear - p.shelfSpacingMin) / (p.shelfSpacingMin + p.board)));
}

export function cellCaps(config: Config, model: ModelDef, i: number, k: number): CellCaps {
  const p = model.params;
  const c = config.elements[i]?.cells[k];
  const n = config.elements.length;
  const ch = carcassHeight(config, i, k);
  const inner = ch - 2 * p.board;
  const turned = c?.turn !== undefined && c.turn !== 'front';
  // How deep a hanger has to hang: the wardrobe depth, or the column width when turned.
  const hangDepth = turned ? (config.elements[i]?.width ?? 0) : config.depth;
  const railDepthOk = hangDepth >= p.railDepthMin;
  const railsMax: 0 | 1 | 2 = !model.features.rail || !railDepthOk ? 0 : inner >= p.railDoubleInnerMin ? 2 : inner >= p.railInnerMin ? 1 : 0;
  const rails = c?.rails ?? 0;
  const maxShelves = rails === 2 ? 0 : rails === 1 ? shelvesIn(inner - p.railInnerMin, p) : shelvesIn(inner, p);
  const zone = ch - p.stackGap;
  const maxDrawers = Math.max(0, Math.min(p.drawersMax, Math.floor((zone + p.drawerFrontGap) / (p.drawerFrontMin + p.drawerFrontGap))));
  const turns: Turn[] = ['front'];
  if (i === 0) turns.push('left');
  if (i === n - 1) turns.push('right');
  const frontWidth = turned ? config.depth : (config.elements[i]?.width ?? 0);
  return {
    maxShelves,
    maxDrawers,
    railsMax,
    railDepthOk,
    slide: slideFor(cellCarcassDepth(config, i, k, p), p),
    turns,
    doubleDoorsOk: frontWidth >= p.doubleDoorMin,
  };
}

interface LocalSpec {
  id: string;
  role: Role;
  material?: Material;
  slot?: 'body' | 'front';
  position: Vec3;
  size: Vec3;
  lengthAxis: Axis;
  edges?: Partial<Edges>;
  hinge?: Hinge;
  group?: string;
}

/** Map a box built facing forwards into a compartment turned left or right. */
function turnBox(position: Vec3, size: Vec3, turn: Turn, colX: number, colW: number, depth: number): { position: Vec3; size: Vec3 } {
  const [x, y, z] = position;
  const [sx, sy, sz] = size;
  if (turn === 'left') return { position: [colX + colW - (z + sz), y, x], size: [sz, sy, sx] };
  if (turn === 'right') return { position: [colX + z, y, depth - (x + sx)], size: [sz, sy, sx] };
  return { position: [colX + x, y, z], size };
}

const swapAxis = (a: Axis, turn: Turn): Axis => (turn === 'front' || a === 1 ? a : a === 0 ? 2 : 0);

const cache = new WeakMap<Config, GridResult>();

export function buildGrid(config: Config): GridResult {
  const cached = cache.get(config);
  if (cached) return cached;
  const model = requireModel(config.model);
  const p = model.params;
  const t = p.board;
  const n = config.elements.length;
  const base = legsHeight(config);
  const withHandles = model.features.handles && config.openingType === 'handles';
  const doorAxis = frontAxis(config.frontGrain.doors);
  const drawerAxis = frontAxis(config.frontGrain.drawers);
  const result: GridResult = { parts: [], handles: [], fittings: [] };

  const toPart = (s: LocalSpec, i: number, k: number, turn: Turn, colX: number, colW: number, y0: number): Part => {
    const material = s.material ?? 'board';
    const placed = turnBox([s.position[0], s.position[1] + y0, s.position[2]], s.size, turn, colX, colW, config.depth);
    const thicknessAxis = s.size.indexOf(Math.min(...s.size)) as Axis;
    const axes = ([0, 1, 2] as Axis[]).filter((a) => a !== thicknessAxis);
    let lengthAxis = s.lengthAxis === thicknessAxis ? (axes[0] as Axis) : s.lengthAxis;
    let widthAxis = axes.find((a) => a !== lengthAxis) as Axis;
    if (s.size[widthAxis] > SHEET.board.width - 2 * SHEET.trim) [lengthAxis, widthAxis] = [widthAxis, lengthAxis];
    const slot = material === 'board' ? (s.slot ?? 'body') : null;
    return {
      id: s.id,
      role: s.role,
      element: i,
      cell: k,
      material,
      decorSlot: slot,
      decor: slot === null ? null : slot === 'front' ? config.frontDecor : config.bodyDecor,
      position: placed.position,
      size: placed.size,
      lengthAxis: swapAxis(lengthAxis, turn),
      widthAxis: swapAxis(widthAxis, turn),
      thicknessAxis: swapAxis(thicknessAxis, turn),
      length: s.size[lengthAxis],
      width: s.size[widthAxis],
      thickness: s.size[thicknessAxis],
      edges: { ...NO_EDGES, ...s.edges },
      ...(s.hinge ? { hinge: s.hinge, hinges: hingeCount(s.size, s.hinge, p) } : {}),
      ...(s.group ? { group: s.group } : {}),
      ...(turn !== 'front' ? { facing: turn } : {}),
    };
  };

  let colX = 0;
  config.elements.forEach((el, i) => {
    const cw = el.width;
    let yTop = config.height;
    el.cells.forEach((c, k) => {
      const bottom = k === el.cells.length - 1;
      const ch = c.height - (bottom ? base : 0);
      const y0 = yTop - c.height + (bottom ? base : 0);
      yTop -= c.height;
      const turn = c.turn;
      // Built facing forwards in its own frame: `w` runs along the front.
      const w = turn === 'front' ? cw : config.depth;
      const z0 = config.back ? p.back : 0;
      const cd = cellCarcassDepth(config, i, k, p);
      const zFront = z0 + cd + p.frontGap;
      const id = (name: string) => `c${i}.k${k}.${name}`;
      const local: LocalSpec[] = [];
      const add = (s: LocalSpec) => local.push(s);

      add({ id: id('top'), role: 'top', position: [0, ch - t, z0], size: [w, t, cd], lengthAxis: 0, edges: { l2: true } });
      add({ id: id('bottom'), role: 'bottom', position: [0, 0, z0], size: [w, t, cd], lengthAxis: 0, edges: { l2: true } });
      add({ id: id('sideL'), role: 'side', position: [0, t, z0], size: [t, ch - 2 * t, cd], lengthAxis: 1, edges: { l2: true } });
      add({ id: id('sideR'), role: 'side', position: [w - t, t, z0], size: [t, ch - 2 * t, cd], lengthAxis: 1, edges: { l2: true } });
      if (config.back) add({ id: id('back'), role: 'back', material: 'hdf', position: [0, 0, 0], size: [w, ch, p.back], lengthAxis: w >= ch ? 0 : 1 });

      const inner = ch - 2 * t;
      if (c.front !== 'drawers') {
        const setback = model.features.shelfSetback ? config.shelfSetback : p.shelfInset;
        const region = c.rails === 1 ? inner - p.railInnerMin : inner;
        for (let s = 0; s < c.shelves; s++) {
          const y = t + Math.floor(((s + 1) * (region - t)) / (c.shelves + 1));
          add({ id: id(`shelf${s}`), role: 'shelf', position: [t, y, z0 + setback], size: [w - 2 * t, t, cd - setback], lengthAxis: 0, edges: { l2: true } });
        }
      }

      const fronts: LocalSpec[] = [];
      if (c.front === 'doors') {
        const material: Material = c.glass ? 'glass' : 'board';
        const dh = ch - p.stackGap;
        const dy = Math.floor(p.stackGap / 2);
        const g = p.doorWidthGap;
        const all = c.glass ? {} : { l1: true, l2: true, w1: true, w2: true };
        if (c.doors === 2) {
          const leaf = Math.floor((w - 2 * g) / 2);
          fronts.push({ id: id('doorL'), role: 'door', material, slot: 'front', position: [Math.floor(g / 2), dy, zFront], size: [leaf, dh, t], lengthAxis: doorAxis, edges: all, hinge: 'left' });
          fronts.push({ id: id('doorR'), role: 'door', material, slot: 'front', position: [w - (g - Math.floor(g / 2)) - leaf, dy, zFront], size: [leaf, dh, t], lengthAxis: doorAxis, edges: all, hinge: 'right' });
        } else {
          // A turned door hinges on the room side, away from the wall it stands against.
          const hinge: Hinge = c.opening !== 'auto' ? c.opening : turn === 'left' ? 'right' : turn === 'right' ? 'left' : autoHinge(i, n);
          fronts.push({ id: id('door'), role: 'door', material, slot: 'front', position: [Math.floor(g / 2), dy, zFront], size: [w - g, dh, t], lengthAxis: doorAxis, edges: all, hinge });
        }
      } else if (c.front === 'drawers') {
        const slide = slideFor(cd, p);
        if (slide === null) throw new Error('buildGrid: carcass too shallow for drawers');
        const zone = ch - p.stackGap;
        const total = zone - (c.drawers - 1) * p.drawerFrontGap;
        const baseH = Math.floor(total / c.drawers);
        const extra = total - baseH * c.drawers;
        const boxW = w - 2 * t - 2 * p.drawerSlideClearance;
        const bx = t + p.drawerSlideClearance;
        const bz = zFront - slide;
        let y = Math.floor(p.stackGap / 2);
        for (let d = 0; d < c.drawers; d++) {
          const fh = baseH + (d < extra ? 1 : 0);
          const group = `c${i}.k${k}.d${d}`;
          const gid = (name: string) => `${group}.${name}`;
          const boxH = fh - p.drawerBoxReduction;
          const by = y + p.drawerBoxLift;
          fronts.push({ id: gid('front'), role: 'drawerFront', slot: 'front', group, position: [Math.floor(p.doorWidthGap / 2), y, zFront], size: [w - p.doorWidthGap, fh, t], lengthAxis: drawerAxis, edges: { l1: true, l2: true, w1: true, w2: true } });
          add({ id: gid('bottom'), role: 'drawerBottom', material: 'hdf', group, position: [bx, by, bz], size: [boxW, p.back, slide], lengthAxis: slide >= boxW ? 2 : 0 });
          add({ id: gid('sideL'), role: 'drawerSide', group, position: [bx, by + p.back, bz], size: [t, boxH, slide], lengthAxis: 2, edges: { l2: true } });
          add({ id: gid('sideR'), role: 'drawerSide', group, position: [bx + boxW - t, by + p.back, bz], size: [t, boxH, slide], lengthAxis: 2, edges: { l2: true } });
          add({ id: gid('innerB'), role: 'drawerInner', group, position: [bx + t, by + p.back, bz], size: [boxW - 2 * t, boxH, t], lengthAxis: 0, edges: { l2: true } });
          add({ id: gid('innerF'), role: 'drawerInner', group, position: [bx + t, by + p.back, zFront - t], size: [boxW - 2 * t, boxH, t], lengthAxis: 0, edges: { l2: true } });
          y += fh + p.drawerFrontGap;
        }
      }

      for (const s of [...local, ...fronts]) result.parts.push(toPart(s, i, k, turn, colX, cw, y0));
      if (withHandles) {
        for (const f of fronts) {
          // Handles are placed on the forward-facing front, then turned with it.
          const h = handleFor({ ...toPart(f, i, k, 'front', 0, cw, 0) }, config.handleShape);
          const placed = turnBox([h.position[0], h.position[1] + y0, h.position[2]], h.size, turn, colX, cw, config.depth);
          result.handles.push({ ...h, position: placed.position, size: placed.size });
        }
      }

      // Hanging rails: one under the top, or a second one halfway down.
      const railX = t + 5;
      const railLen = w - 2 * t - 10;
      const railZ = z0 + Math.round(cd / 2 - RAIL_DIAMETER / 2);
      const rails: number[] = [];
      if (c.rails >= 1 && c.front !== 'drawers') rails.push(ch - t - p.railTopOffset - RAIL_DIAMETER);
      if (c.rails === 2 && c.front !== 'drawers') rails.push(t + Math.floor(inner / 2) - p.railTopOffset - RAIL_DIAMETER);
      rails.forEach((ry, r) => {
        const placed = turnBox([railX, ry + y0, railZ], [railLen, RAIL_DIAMETER, RAIL_DIAMETER], turn, colX, cw, config.depth);
        result.fittings.push({ id: id(`rail${r}`), kind: 'rail', element: i, position: placed.position, size: placed.size });
      });
    });
    colX += cw;
  });

  // Legs at the column boundaries, front and back, under the forward-facing carcasses.
  if (base > 0) {
    const size = 36;
    const inset = 30;
    const z0 = config.back ? p.back : 0;
    const anyFront = config.elements.some((e) => e.cells.some((x) => x.turn === 'front' && x.front !== 'open'));
    const cd = config.depth - frontDepth(anyFront, p) - z0;
    const xs: number[] = [inset];
    let x = 0;
    config.elements.slice(0, -1).forEach((e) => {
      x += e.width;
      xs.push(x - size / 2);
    });
    xs.push(config.width - inset - size);
    xs.forEach((lx, li) => {
      for (const [k2, z] of [z0 + inset, z0 + cd - inset - size].entries()) {
        result.fittings.push({ id: `leg${li}.${k2}`, kind: 'leg', element: null, position: [Math.round(lx), 0, z], size: [size, base, size] });
      }
    });

    // Plinth panels in the body colour, as tall as the legs, banded all round.
    const all = { l1: true, l2: true, w1: true, w2: true };
    const plinth = (pid: string, position: Vec3, size: Vec3, lengthAxis: Axis) => {
      const thicknessAxis = size.indexOf(Math.min(...size)) as Axis;
      const widthAxis = ([0, 1, 2] as Axis[]).find((a) => a !== thicknessAxis && a !== lengthAxis) as Axis;
      result.parts.push({
        id: pid,
        role: 'plinth',
        element: null,
        material: 'board',
        decorSlot: 'body',
        decor: config.bodyDecor,
        position,
        size,
        lengthAxis,
        widthAxis,
        thicknessAxis,
        length: size[lengthAxis],
        width: size[widthAxis],
        thickness: size[thicknessAxis],
        edges: all,
      });
    };
    const front = z0 + cd;
    if (config.plinth.front) {
      // Wider than a sheet: split into equal pieces.
      const pieces = Math.ceil(config.width / (SHEET.board.length - 2 * SHEET.trim));
      const len = Math.floor(config.width / pieces);
      for (let q = 0; q < pieces; q++) {
        const px = q * len;
        const pw = q === pieces - 1 ? config.width - px : len;
        plinth(`plinth.front${q}`, [px, 0, front - p.board], [pw, base, p.board], 0);
      }
    }
    const sideDepth = front - z0 - (config.plinth.front ? p.board : 0);
    if (config.plinth.left) plinth('plinth.left', [0, 0, z0], [p.board, base, sideDepth], 2);
    if (config.plinth.right) plinth('plinth.right', [config.width - p.board, 0, z0], [p.board, base, sideDepth], 2);
  }

  cache.set(config, result);
  return result;
}

const issue = (code: Issue['code'], path: string, params: Issue['params'] = {}): Issue => ({ code, path, params });

/** Rules specific to wardrobes (the shared rules for size, decors and mounting are checked as well). */
export function validateGrid(config: Config, model: ModelDef): Issue[] {
  const p = model.params;
  const out: Issue[] = [];
  const n = config.elements.length;
  const base = legsHeight(config);
  const rowSum = config.rows.reduce((s, h) => s + h, 0);
  if (config.rows.length < 1 || config.rows.length > p.rowsMax) out.push(issue('elementCount', 'rows', { min: 1, max: p.rowsMax }));
  if (rowSum !== config.height) out.push(issue('rowsSum', 'rows', { sum: rowSum, height: config.height }));
  config.rows.forEach((h, k) => {
    const eff = k === config.rows.length - 1 ? h - base : h;
    if (eff < p.rowMin) out.push(issue('rowMin', `rows.${k}`, { min: p.rowMin + (k === config.rows.length - 1 ? base : 0) }));
  });
  if (config.plinth.front || config.plinth.left || config.plinth.right) {
    if (config.mount !== 'legs') out.push(issue('plinthLegs', 'plinth'));
  }
  config.elements.forEach((el, i) => {
    const at = `elements.${i}`;
    if (el.cells.length < 1 || el.cells.length > p.rowsMax) out.push(issue('elementCount', `${at}.cells`, { min: 1, max: p.rowsMax }));
    const sum = el.cells.reduce((s, c) => s + c.height, 0);
    if (sum !== config.height) out.push(issue('rowsSum', `${at}.cells`, { sum, height: config.height }));
    if (!el.ownRows && (el.cells.length !== config.rows.length || el.cells.some((c, k) => c.height !== config.rows[k])))
      out.push(issue('rowsSum', `${at}.cells`, { sum, height: config.height }));
    el.cells.forEach((c, k) => {
      const cat = `${at}.cells.${k}`;
      if (carcassHeight(config, i, k) < p.rowMin) out.push(issue('rowMin', `${cat}.height`, { min: p.rowMin + (k === el.cells.length - 1 ? base : 0) }));
      if (!model.fronts.includes(c.front)) out.push(issue('unsupported', `${cat}.front`));
      if (c.glass && !model.features.glass) out.push(issue('unsupported', `${cat}.glass`));
      const caps = cellCaps(config, model, i, k);
      if (c.turn !== 'front' && !caps.turns.includes(c.turn)) out.push(issue('turn', `${cat}.turn`));
      if (c.turn !== 'front' && c.front === 'drawers') out.push(issue('turn', `${cat}.front`));
      if (c.front !== 'drawers' && c.shelves > caps.maxShelves) out.push(issue('shelvesMax', `${cat}.shelves`, { max: caps.maxShelves, spacing: p.shelfSpacingMin }));
      if (c.rails > 0 && c.front !== 'drawers' && c.rails > caps.railsMax) {
        const need = c.rails === 2 ? p.railDoubleInnerMin : p.railInnerMin;
        out.push(issue('railSpace', `${cat}.rails`, { height: need + 2 * p.board, depth: p.railDepthMin }));
      }
      if (c.front === 'doors' && c.doors === 2 && !caps.doubleDoorsOk) out.push(issue('doubleDoorMin', `${cat}.doors`, { min: p.doubleDoorMin }));
      if (c.front === 'drawers') {
        if (c.drawers < 1 || c.drawers > caps.maxDrawers) out.push(issue('drawersMax', `${cat}.drawers`, { max: caps.maxDrawers, min: p.drawerFrontMin }));
        if (caps.slide === null) out.push(issue('drawersDepth', `${cat}.front`, { min: Math.min(...p.drawerSlides) + 10 + p.board + p.frontGap + (config.back ? p.back : 0), max: p.depthMax }));
      }
    });
  });
  if (n > 0 && config.elements.some((e) => e.cells.length === 0)) out.push(issue('invalid', 'elements'));
  return out;
}

/** A new compartment, as a column added to the wardrobe gets them. */
export function newCell(height: number): CellConfig {
  return { height, front: 'doors', doors: 1, glass: false, opening: 'auto', shelves: 0, rails: 0, drawers: 2, turn: 'front' };
}

/** Columns that follow the shared rows get their compartments resized, added or removed to match. */
export function syncRows(config: Config): Config {
  const elements = config.elements.map((el): ElementConfig => {
    if (el.ownRows && el.cells.length > 0) return el;
    const cells = config.rows.map((h, k) => ({ ...(el.cells[k] ?? newCell(h)), height: h }));
    return { ...el, cells, ownRows: false };
  });
  return { ...config, elements };
}

/** Bring every compartment back within its limits after a change elsewhere, and say what changed. */
export function normaliseGrid(input: Config, model: ModelDef): { config: Config; notices: Notice[] } {
  const p = model.params;
  const notices: Notice[] = [];
  let config = syncRows(input);
  let shelvesCut = false;
  let shelvesMax = Infinity;
  let drawersCut = false;
  let drawersMax = Infinity;
  let railCut = false;
  let turnCut = false;
  let doorsCut = false;
  const elements = config.elements.map((el, i) => ({
    ...el,
    cells: el.cells.map((c0, k) => {
      let c = { ...c0 };
      const caps0 = cellCaps(config, model, i, k);
      if (c.turn !== 'front' && !caps0.turns.includes(c.turn)) {
        c = { ...c, turn: 'front' };
        turnCut = true;
      }
      if (c.turn !== 'front' && c.front === 'drawers') c = { ...c, front: 'doors' };
      const probe: Config = { ...config, elements: config.elements.map((e, ii) => (ii === i ? { ...e, cells: e.cells.map((x, kk) => (kk === k ? c : x)) } : e)) };
      let caps = cellCaps(probe, model, i, k);
      if (c.rails > caps.railsMax) {
        if (c.front !== 'drawers') railCut = true;
        c = { ...c, rails: caps.railsMax };
        caps = cellCaps({ ...probe, elements: probe.elements.map((e, ii) => (ii === i ? { ...e, cells: e.cells.map((x, kk) => (kk === k ? c : x)) } : e)) }, model, i, k);
      }
      if (c.shelves > caps.maxShelves) {
        if (c.front !== 'drawers') {
          shelvesCut = true;
          shelvesMax = Math.min(shelvesMax, caps.maxShelves);
        }
        c = { ...c, shelves: caps.maxShelves };
      }
      if (c.drawers > Math.max(1, caps.maxDrawers)) {
        if (c.front === 'drawers') {
          drawersCut = true;
          drawersMax = Math.min(drawersMax, caps.maxDrawers);
        }
        c = { ...c, drawers: Math.max(1, caps.maxDrawers) };
      }
      if (c.doors === 2 && !caps.doubleDoorsOk) {
        if (c.front === 'doors') doorsCut = true;
        c = { ...c, doors: 1 };
      }
      return c;
    }),
  }));
  config = { ...config, elements };
  if (config.mount !== 'legs' && (config.plinth.front || config.plinth.left || config.plinth.right)) {
    config = { ...config, plinth: { front: false, left: false, right: false } };
    notices.push({ code: 'plinthRemoved', params: {} });
  }
  if (turnCut) notices.push({ code: 'turnRemoved', params: {} });
  if (railCut) notices.push({ code: 'railRemoved', params: {} });
  if (shelvesCut) notices.push({ code: 'shelvesReduced', params: { max: shelvesMax } });
  if (drawersCut) notices.push({ code: 'drawersReduced', params: { max: drawersMax } });
  if (doorsCut) notices.push({ code: 'doubleDoorsRemoved', params: { min: p.doubleDoorMin } });
  return { config, notices };
}

/** Change a list of heights to a new total: the tallest entry absorbs the change, as long as it stays above `min`. */
function absorb(heights: number[], total: number, min: number, minLast: number): number[] | null {
  const delta = total - heights.reduce((s, h) => s + h, 0);
  const next = [...heights];
  const order = next.map((h, k) => k).sort((a, b) => (next[b] as number) - (next[a] as number));
  let rest = delta;
  for (const k of order) {
    if (rest === 0) break;
    const floor = k === next.length - 1 ? minLast : min;
    const value = Math.max(floor, (next[k] as number) + rest);
    rest -= value - (next[k] as number);
    next[k] = value;
  }
  return rest === 0 ? next : null;
}

/** New total height: the tallest row (and the tallest compartment of each column with its own heights) takes up the change. */
export function withHeight(config: Config, model: ModelDef, height: number): Config {
  const p = model.params;
  const minLast = p.rowMin + legsHeight(config);
  const rows = absorb(config.rows, height, p.rowMin, minLast) ?? config.rows.map((h) => Math.round((h * height) / config.height));
  const elements = config.elements.map((el) => {
    if (!el.ownRows) return el;
    const hs = absorb(el.cells.map((c) => c.height), height, p.rowMin, minLast);
    return hs ? { ...el, cells: el.cells.map((c, k) => ({ ...c, height: hs[k] as number })) } : { ...el, ownRows: false };
  });
  const fixed = rows.reduce((s, h) => s + h, 0);
  if (fixed !== height && rows.length > 0) rows[rows.length - 1] = (rows[rows.length - 1] as number) + height - fixed;
  return syncRows({ ...config, height, rows, elements });
}

/** Default row heights for a number of rows: a 40 cm top row, a 60 cm bottom row, the rest shared. */
export function defaultRows(height: number, count: number): number[] {
  if (count === 1) return [height];
  if (count === 2) return [height - 600, 600];
  const middle = height - 400 - 600;
  const each = Math.floor(middle / (count - 2));
  const rows = [400, ...Array.from({ length: count - 2 }, () => each), 600];
  rows[1] = (rows[1] as number) + middle - each * (count - 2);
  return rows;
}

/**
 * Take a compartment out of a column; its neighbours take over its height
 * (the one below for the top compartment, the one above for the bottom one,
 * half each otherwise). The column then has its own heights.
 */
export function removeCell(config: Config, i: number, k: number): Config | null {
  const el = config.elements[i];
  if (!el || el.cells.length < 2) return null;
  const cells = el.cells.map((c) => ({ ...c }));
  const h = (cells[k] as CellConfig).height;
  if (k === 0) (cells[1] as CellConfig).height += h;
  else if (k === cells.length - 1) (cells[k - 1] as CellConfig).height += h;
  else {
    const half = Math.floor(h / 2);
    (cells[k - 1] as CellConfig).height += half;
    (cells[k + 1] as CellConfig).height += h - half;
  }
  cells.splice(k, 1);
  return { ...config, elements: config.elements.map((e, ii) => (ii === i ? { ...e, cells, ownRows: true } : e)) };
}

/** Split a compartment into two of half the height (same settings, shelves divided). The column then has its own heights. */
export function splitCell(config: Config, model: ModelDef, i: number, k: number): Config | null {
  const el = config.elements[i];
  const c = el?.cells[k];
  if (!el || !c || el.cells.length >= model.params.rowsMax) return null;
  const bottom = k === el.cells.length - 1;
  const eff = c.height - (bottom ? legsHeight(config) : 0);
  if (eff < 2 * model.params.rowMin) return null;
  const upper = Math.floor(eff / 2);
  const lower = c.height - upper;
  const cells = [...el.cells];
  cells.splice(k, 1, { ...c, height: upper, rails: 0, shelves: Math.floor(c.shelves / 2) }, { ...c, height: lower, rails: 0, shelves: c.shelves - Math.floor(c.shelves / 2) });
  return { ...config, elements: config.elements.map((e, ii) => (ii === i ? { ...e, cells, ownRows: true } : e)) };
}

/** Number of compartments, for hardware counts. */
export function cellCount(config: Config): number {
  return config.elements.reduce((s, e) => s + e.cells.length, 0);
}

export function isGrid(config: Pick<Config, 'model'>): boolean {
  return requireModel(config.model).layout === 'grid';
}

export type { ModelParams };
