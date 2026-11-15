import { SHEET } from './catalog';
import { requireModel, type ModelParams } from './models';
import { carcassDepth, carcassZone, frontZone, slideLength } from './rules';
import type { Axis, Config, DecorSlot, Edges, HandlePlacement, Hinge, Material, Part, Role, Vec3 } from './types';

const NO_EDGES: Edges = { l1: false, l2: false, w1: false, w2: false };

interface Spec {
  id: string;
  role: Role;
  element: number | null;
  material?: Material;
  slot?: DecorSlot;
  position: Vec3;
  size: Vec3;
  /** Axis the decor grain (and the cut `length`) runs along. */
  lengthAxis: Axis;
  edges?: Partial<Edges>;
  hinge?: Hinge;
  group?: string;
}

/** Hinges for a door: by the length of its hinged edge. */
export function hingeCount(size: Vec3, hinge: Hinge, p: Pick<ModelParams, 'hingeMax2' | 'hingeMax3'>): number {
  const edge = hinge === 'bottom' ? size[0] : size[1];
  return edge <= p.hingeMax2 ? 2 : edge <= p.hingeMax3 ? 3 : 4;
}

/** Hinge side for an "auto" door: elements in the left half hinge left, the rest right. */
export function autoHinge(index: number, count: number): Hinge {
  return index < Math.ceil(count / 2) ? 'left' : 'right';
}

/**
 * Configuration in, parts out. Pure and framework-free: the 3D scene, the
 * cut list, the sheet layouts and the price are all computed from this list.
 * The configuration must already be valid (see `validate`).
 */
export function buildParts(config: Config): Part[] {
  const model = requireModel(config.model);
  const p = model.params;
  const t = p.board;
  const parts: Part[] = [];

  const add = (s: Spec) => {
    const material = s.material ?? 'board';
    const thicknessAxis = s.size.indexOf(Math.min(...s.size)) as Axis;
    const axes = ([0, 1, 2] as Axis[]).filter((a) => a !== thicknessAxis);
    let lengthAxis = s.lengthAxis === thicknessAxis ? (axes[0] as Axis) : s.lengthAxis;
    let widthAxis = axes.find((a) => a !== lengthAxis) as Axis;
    // The grain runs along the sheet length. A part too wide to fit across the sheet
    // (a very wide flap or drawer front) is turned so that it can still be cut.
    if (s.size[widthAxis] > SHEET.board.width - 2 * SHEET.trim) [lengthAxis, widthAxis] = [widthAxis, lengthAxis];
    const slot = material === 'hdf' ? null : (s.slot ?? 'body');
    parts.push({
      id: s.id,
      role: s.role,
      element: s.element,
      material,
      decorSlot: slot,
      decor: slot === null ? null : slot === 'front' ? config.frontDecor : config.bodyDecor,
      position: s.position,
      size: s.size,
      lengthAxis,
      widthAxis,
      thicknessAxis,
      length: s.size[lengthAxis],
      width: s.size[widthAxis],
      thickness: s.size[thicknessAxis],
      edges: { ...NO_EDGES, ...s.edges },
      ...(s.hinge ? { hinge: s.hinge, hinges: hingeCount(s.size, s.hinge, p) } : {}),
      ...(s.group ? { group: s.group } : {}),
    });
  };

  const { width: W, height: H, depth: D } = config;
  const n = config.elements.length;
  const zone = carcassZone(config, p);
  const cd = carcassDepth(config, p);
  const z0 = config.back ? p.back : 0;
  const zFront = z0 + cd + p.frontGap;

  // Top: one board, or two glued boards for a 36 mm top. Front and both ends are banded.
  const topEdges = { l2: true, w1: true, w2: true };
  add({ id: 'top', role: 'top', element: null, position: [0, H - t, 0], size: [W, t, D], lengthAxis: 0, edges: topEdges });
  if (config.doubleTop) {
    add({ id: 'top.lower', role: 'top', element: null, position: [0, H - 2 * t, 0], size: [W, t, D], lengthAxis: 0, edges: topEdges });
  }

  // Each element is its own carcass. From three elements up, every carcass is built slightly
  // narrower so the row never ends up wider than the top; the slack is split left and right.
  const allowance = n >= p.joinAllowanceFrom ? p.joinAllowance : 0;
  let x0 = Math.floor((n * allowance) / 2);
  const sideHeight = zone - 2 * t;
  const railWidth = Math.min(p.railWidth, Math.floor(cd / 2));
  const shelfDepth = cd - Math.min(p.shelfInset, Math.floor(cd / 2));
  const doorHeight = frontZone(config, p);
  const doorY = Math.floor((zone - t - doorHeight) / 2);

  config.elements.forEach((el, i) => {
    const cw = el.width - allowance;
    const id = (name: string) => `e${i}.${name}`;

    add({
      id: id('bottom'),
      role: 'bottom',
      element: i,
      position: [x0, 0, z0],
      size: [cw, t, cd],
      lengthAxis: 0,
      edges: { l2: true, w1: i === 0, w2: i === n - 1 },
    });
    add({ id: id('sideL'), role: 'side', element: i, position: [x0, t, z0], size: [t, sideHeight, cd], lengthAxis: 1, edges: { l2: true } });
    add({ id: id('sideR'), role: 'side', element: i, position: [x0 + cw - t, t, z0], size: [t, sideHeight, cd], lengthAxis: 1, edges: { l2: true } });

    const railY = zone - 2 * t;
    add({ id: id('railB'), role: 'rail', element: i, position: [x0 + t, railY, z0], size: [cw - 2 * t, t, railWidth], lengthAxis: 0, edges: { l2: true } });
    add({ id: id('railF'), role: 'rail', element: i, position: [x0 + t, railY, z0 + cd - railWidth], size: [cw - 2 * t, t, railWidth], lengthAxis: 0, edges: { l2: true } });

    if (el.front !== 'drawers') {
      for (let k = 0; k < el.shelves; k++) {
        const y = t + Math.floor(((k + 1) * (sideHeight - t)) / (el.shelves + 1));
        add({ id: id(`shelf${k}`), role: 'shelf', element: i, position: [x0 + t, y, z0], size: [cw - 2 * t, t, shelfDepth], lengthAxis: 0, edges: { l2: true } });
      }
    }

    if (config.back) {
      add({ id: id('back'), role: 'back', element: i, material: 'hdf', position: [x0, 0, 0], size: [cw, zone - t, p.back], lengthAxis: cw >= zone - t ? 0 : 1 });
    }

    const allEdges = { l1: true, l2: true, w1: true, w2: true };
    const gapSide = Math.floor(p.doorWidthGap / 2);
    if (el.front === 'doors') {
      if (el.doors === 2) {
        const leaf = Math.floor((cw - 2 * p.doorWidthGap) / 2);
        add({ id: id('doorL'), role: 'door', element: i, slot: 'front', position: [x0 + gapSide, doorY, zFront], size: [leaf, doorHeight, t], lengthAxis: 1, edges: allEdges, hinge: 'left' });
        add({ id: id('doorR'), role: 'door', element: i, slot: 'front', position: [x0 + cw - (p.doorWidthGap - gapSide) - leaf, doorY, zFront], size: [leaf, doorHeight, t], lengthAxis: 1, edges: allEdges, hinge: 'right' });
      } else {
        const dw = cw - p.doorWidthGap;
        const hinge: Hinge = el.opening === 'auto' ? (dw > doorHeight ? 'bottom' : autoHinge(i, n)) : el.opening;
        add({ id: id('door'), role: 'door', element: i, slot: 'front', position: [x0 + gapSide, doorY, zFront], size: [dw, doorHeight, t], lengthAxis: 1, edges: allEdges, hinge });
      }
    }

    if (el.front === 'drawers') {
      addDrawers(add, p, { index: i, count: el.drawers, x0, cw, doorY, doorHeight, zFront, cd });
    }

    x0 += cw;
  });

  return parts;
}

function addDrawers(
  add: (s: Spec) => void,
  p: ModelParams,
  o: { index: number; count: number; x0: number; cw: number; doorY: number; doorHeight: number; zFront: number; cd: number },
) {
  const t = p.board;
  const boxLength = slideLength(o.cd, p);
  if (boxLength === null) throw new Error('buildParts: carcass too shallow for drawers');
  const total = o.doorHeight - (o.count - 1) * p.drawerFrontGap;
  const base = Math.floor(total / o.count);
  const extra = total - base * o.count;
  const frontWidth = o.cw - p.doorWidthGap;
  const boxWidth = o.cw - 2 * t - 2 * p.drawerSlideClearance;
  const bx = o.x0 + t + p.drawerSlideClearance;
  const bz = o.zFront - boxLength;
  let y = o.doorY;
  for (let k = 0; k < o.count; k++) {
    const fh = base + (k < extra ? 1 : 0);
    const group = `e${o.index}.d${k}`;
    const id = (name: string) => `${group}.${name}`;
    const boxHeight = fh - p.drawerBoxReduction;
    const by = y + p.drawerBoxLift;
    add({ id: id('front'), role: 'drawerFront', element: o.index, slot: 'front', group, position: [o.x0 + Math.floor(p.doorWidthGap / 2), y, o.zFront], size: [frontWidth, fh, t], lengthAxis: 1, edges: { l1: true, l2: true, w1: true, w2: true } });
    add({ id: id('bottom'), role: 'drawerBottom', element: o.index, material: 'hdf', group, position: [bx, by, bz], size: [boxWidth, p.back, boxLength], lengthAxis: boxLength >= boxWidth ? 2 : 0 });
    const sideY = by + p.back;
    add({ id: id('sideL'), role: 'drawerSide', element: o.index, group, position: [bx, sideY, bz], size: [t, boxHeight, boxLength], lengthAxis: 2, edges: { l2: true } });
    add({ id: id('sideR'), role: 'drawerSide', element: o.index, group, position: [bx + boxWidth - t, sideY, bz], size: [t, boxHeight, boxLength], lengthAxis: 2, edges: { l2: true } });
    add({ id: id('innerB'), role: 'drawerInner', element: o.index, group, position: [bx + t, sideY, bz], size: [boxWidth - 2 * t, boxHeight, t], lengthAxis: 0, edges: { l2: true } });
    add({ id: id('innerF'), role: 'drawerInner', element: o.index, group, position: [bx + t, sideY, o.zFront - t], size: [boxWidth - 2 * t, boxHeight, t], lengthAxis: 0, edges: { l2: true } });
    y += fh + p.drawerFrontGap;
  }
}

/** Handle boxes for every door leaf and drawer front. Hardware, not sheet parts; they move with their front. */
export function buildHandles(config: Config, parts: Part[]): HandlePlacement[] {
  const model = requireModel(config.model);
  if (!model.features.handles || config.openingType !== 'handles') return [];
  const shape = config.handleShape;
  const out: HandlePlacement[] = [];
  for (const part of parts) {
    if (part.role !== 'door' && part.role !== 'drawerFront') continue;
    const [x, y, z] = part.position;
    const [w, h, th] = part.size;
    const zf = z + th;
    const top = y + h;
    const cx = x + w / 2;
    const cy = y + h / 2;
    // A side-hung door is pulled at the edge opposite the hinge; flaps and drawers at the centre.
    const sideHung = part.role === 'door' && part.hinge !== 'bottom';
    const edgeX = (inset: number, size: number) => (part.hinge === 'left' ? x + w - inset - size : x + inset);
    let position: Vec3;
    let size: Vec3;
    switch (shape) {
      case 'bar128': {
        const len = Math.min(128, w - 40);
        position = part.role === 'door' ? [cx - len / 2, top - 50, zf] : [cx - len / 2, cy - 5, zf];
        size = [len, 10, 14];
        break;
      }
      case 'bar320':
      case 'longBar': {
        if (sideHung) {
          const len = shape === 'bar320' ? Math.min(320, h - 120) : Math.round(h / 2);
          const y0 = shape === 'bar320' ? top - 60 - len : cy - len / 2;
          position = [edgeX(35, 10), y0, zf];
          size = [10, len, 14];
        } else {
          const len = shape === 'bar320' ? Math.min(320, w - 80) : Math.round(w / 2);
          position = [cx - len / 2, part.role === 'door' ? top - 50 : cy - 5, zf];
          size = [len, 10, 14];
        }
        break;
      }
      case 'knob':
        position = sideHung ? [edgeX(25, 30), top - 60, zf] : [cx - 15, part.role === 'door' ? top - 60 : cy - 15, zf];
        size = [30, 30, 24];
        break;
      case 'shell':
        if (sideHung) {
          position = [edgeX(28, 28), top - 60 - 96, zf];
          size = [28, 96, 4];
        } else {
          position = [cx - 48, part.role === 'door' ? top - 68 : cy - 14, zf];
          size = [96, 28, 4];
        }
        break;
      case 'edge':
        position = [x, top - 14, zf];
        size = [w, 14, 10];
        break;
      case 'topPull': {
        const len = Math.min(150, w - 40);
        position = [cx - len / 2, top - 22, zf];
        size = [len, 22, 18];
        break;
      }
    }
    out.push({ id: `handle:${part.id}`, frontId: part.id, shape, position, size });
  }
  return out;
}
