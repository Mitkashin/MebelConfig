import { getDecor } from '@/engine/catalog';
import type { Fitting, HandlePlacement, Part, Vec3 } from '@/engine/types';
import { rowColor } from './format';

/**
 * Technical drawings of the piece as standalone SVG strings, for the printed
 * document and the PDF: an oblique view with the overall sizes, a front and a
 * side view, and an exploded wireframe with the cut-list numbers.
 *
 * Oblique (cabinet) projection: the front is drawn true to size and depth
 * recedes up and to the right at half scale, so the front, top and right
 * side are the visible faces.
 */

const K = 0.5 * Math.SQRT1_2;
const INK = '#1b2422';
const ACCENT = '#0f6b5c';
const HDF = '#d9d4ca';

interface Box {
  position: Vec3;
  size: Vec3;
  fill: string;
}

type Pt = [number, number];

const project = (depth: number) => ([x, y, z]: Vec3): Pt => [x + K * (depth - z), -(y + K * (depth - z))];

function corners(b: Box): Vec3[] {
  const [x, y, z] = b.position;
  const [w, h, d] = b.size;
  return [
    [x, y, z],
    [x + w, y, z],
    [x + w, y + h, z],
    [x, y + h, z],
    [x, y, z + d],
    [x + w, y, z + d],
    [x + w, y + h, z + d],
    [x, y + h, z + d],
  ];
}

function bounds(points: Pt[], pad: number) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  return { minX, minY, w: Math.max(...xs) + pad - minX, h: Math.max(...ys) + pad - minY };
}

const poly = (pts: Pt[], fill: string, stroke = INK, width = 2, extra = '') => `<polygon points="${pts.map((p) => `${r(p[0])},${r(p[1])}`).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round"${extra}/>`;
const line = (a: Pt, b: Pt, stroke: string, width: number, extra = '') => `<line x1="${r(a[0])}" y1="${r(a[1])}" x2="${r(b[0])}" y2="${r(b[1])}" stroke="${stroke}" stroke-width="${width}"${extra}/>`;
const text = (p: Pt, value: string, size: number, anchor: 'start' | 'middle' | 'end' = 'middle', fill = ACCENT, extra = '') => `<text x="${r(p[0])}" y="${r(p[1])}" font-size="${size}" text-anchor="${anchor}" fill="${fill}" font-weight="bold"${extra}>${escape(value)}</text>`;
const r = (v: number) => Math.round(v * 10) / 10;
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** Shade a hex colour: factor < 1 darkens, > 1 lightens. */
function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(factor < 1 ? v * factor : v + (255 - v) * (factor - 1)));
  return `#${c.map((v) => Math.min(255, Math.max(0, v)).toString(16).padStart(2, '0')).join('')}`;
}

function partFill(part: Part): string {
  if (part.material === 'hdf') return HDF;
  if (part.material === 'glass') return '#cfe0e3';
  return getDecor(part.decor ?? '')?.color ?? '#cccccc';
}

function boxesOf(parts: Part[], handles: HandlePlacement[], fittings: Fitting[]): Box[] {
  return [
    ...parts.map((p) => ({ position: p.position, size: p.size, fill: partFill(p) })),
    ...handles.map((h) => ({ position: h.position, size: h.size, fill: '#3a3d40' })),
    ...fittings.map((f) => ({ position: f.position, size: f.size, fill: '#3a3d40' })),
  ];
}

/**
 * Painter's order for the oblique view (seen from the front, right and above):
 * a box goes after every box it is fully in front of, to the right of or
 * above, so nearer faces are drawn over farther ones.
 */
function paintOrder(boxes: Box[]): Box[] {
  const n = boxes.length;
  const lo = (b: Box, k: number) => b.position[k]!;
  const hi = (b: Box, k: number) => b.position[k]! + b.size[k]!;
  const after: number[][] = boxes.map(() => []);
  const blockers = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const a = boxes[i]!;
      const b = boxes[j]!;
      // Separated along depth, then width, then height: a is drawn after b when it is on the near side.
      const near = [2, 0, 1].find((k) => hi(b, k) <= lo(a, k) || hi(a, k) <= lo(b, k));
      if (near !== undefined && hi(b, near) <= lo(a, near)) {
        after[j]!.push(i);
        blockers[i]!++;
      }
    }
  const order: number[] = [];
  const ready = boxes.map((_, i) => i).filter((i) => blockers[i] === 0);
  const done = new Set<number>();
  while (order.length < n) {
    // Nothing free (a cycle): take the box with the fewest boxes still to go before it.
    if (!ready.length) ready.push(boxes.map((_, i) => i).filter((i) => !done.has(i)).sort((x, y) => blockers[x]! - blockers[y]! || lo(boxes[x]!, 2) - lo(boxes[y]!, 2))[0]!);
    const i = ready.shift()!;
    if (done.has(i)) continue;
    done.add(i);
    order.push(i);
    for (const k of after[i]!) if (--blockers[k]! === 0 && !done.has(k)) ready.push(k);
  }
  return order.map((i) => boxes[i]!);
}

/** A dimension line from a to b with ticks and a label, offset sideways by `off` (screen units). */
function dimension(a: Pt, b: Pt, label: string, off: Pt, size: number): string {
  const A: Pt = [a[0] + off[0], a[1] + off[1]];
  const B: Pt = [b[0] + off[0], b[1] + off[1]];
  const len = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1;
  const t: Pt = [((B[1] - A[1]) / len) * size * 0.35, (-(B[0] - A[0]) / len) * size * 0.35];
  const mid: Pt = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
  const angle = (Math.atan2(B[1] - A[1], B[0] - A[0]) * 180) / Math.PI;
  const upright = angle > 90 || angle < -90 ? angle + 180 : angle;
  const n = Math.hypot(off[0], off[1]) || 1;
  const label_at: Pt = [mid[0] + (off[0] / n) * size * 0.45, mid[1] + (off[1] / n) * size * 0.45 + size * 0.35];
  return (
    line(a, A, ACCENT, 1.5, ' stroke-dasharray="6 6"') +
    line(b, B, ACCENT, 1.5, ' stroke-dasharray="6 6"') +
    line(A, B, ACCENT, 2.5) +
    line([A[0] - t[0], A[1] - t[1]], [A[0] + t[0], A[1] + t[1]], ACCENT, 2.5) +
    line([B[0] - t[0], B[1] - t[1]], [B[0] + t[0], B[1] + t[1]], ACCENT, 2.5) +
    text(label_at, label, size, 'middle', ACCENT, ` transform="rotate(${r(upright)} ${r(label_at[0])} ${r(label_at[1] - size * 0.35)})"`)
  );
}

function svg(b: { minX: number; minY: number; w: number; h: number }, body: string, width = 520): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r(b.minX)} ${r(b.minY)} ${r(b.w)} ${r(b.h)}" width="${width}" height="${Math.round((width * b.h) / b.w)}">${body}</svg>`;
}

export interface DrawingLabels {
  width: string;
  height: string;
  depth: string;
  /** Formatted width of each element, left to right. */
  elements: string[];
  /** Formatted height of the legs or plinth, when there is one. */
  base: string | null;
}

/** The assembled piece in oblique view, shaded in its decors, with width, height and depth. */
export function obliqueSvg(input: { parts: Part[]; handles: HandlePlacement[]; fittings: Fitting[]; width: number; height: number; depth: number; mountHeight?: number }, labels: DrawingLabels): string {
  const { width: W, height: H, depth: D } = input;
  const P = project(D);
  const boxes = boxesOf(input.parts, input.handles, input.fittings);
  let body = '';
  for (const b of paintOrder(boxes)) {
    const c = corners(b).map(P);
    body += poly([c[4]!, c[5]!, c[6]!, c[7]!], b.fill, INK, 1.5);
    body += poly([c[3]!, c[2]!, c[6]!, c[7]!], shade(b.fill, 1.25), INK, 1.5);
    body += poly([c[1]!, c[2]!, c[6]!, c[5]!], shade(b.fill, 0.78), INK, 1.5);
  }
  const size = Math.max(W, H) / 24;
  body += dimension(P([0, 0, D]), P([W, 0, D]), labels.width, [0, size * 1.6], size);
  body += dimension(P([0, 0, D]), P([0, H, D]), labels.height, [-size * 1.6, 0], size);
  body += dimension(P([W, 0, D]), P([W, 0, 0]), labels.depth, [size * 1.3, size * 0.6], size);
  const all = boxes.flatMap((b) => corners(b).map(P));
  return svg(bounds(all, size * 3.4), body);
}

/** Front and side views with element widths and the base height. */
export function elevationsSvg(input: { parts: Part[]; handles: HandlePlacement[]; fittings: Fitting[]; width: number; height: number; depth: number }, labels: DrawingLabels): string {
  const { width: W, height: H, depth: D } = input;
  const boxes = boxesOf(input.parts, input.handles, input.fittings);
  const size = Math.max(W, H) / 26;
  const gap = Math.max(D * 0.6, size * 6);
  let body = '';
  // Front view: x across, y up; nearest parts on top.
  for (const b of [...boxes].sort((a, c) => a.position[2] + a.size[2] - (c.position[2] + c.size[2]))) {
    const [x, y] = b.position;
    const [w, h] = b.size;
    body += `<rect x="${r(x)}" y="${r(-(y + h))}" width="${r(w)}" height="${r(h)}" fill="${b.fill}" stroke="${INK}" stroke-width="1.5"/>`;
  }
  // Side view (from the right): depth across with the back on the left, y up.
  const sx = W + gap;
  for (const b of [...boxes].sort((a, c) => a.position[0] + a.size[0] - (c.position[0] + c.size[0]))) {
    const [, y, z] = b.position;
    const [, h, d] = b.size;
    body += `<rect x="${r(sx + z)}" y="${r(-(y + h))}" width="${r(d)}" height="${r(h)}" fill="${b.fill}" stroke="${INK}" stroke-width="1.5"/>`;
  }
  body += dimension([0, 0], [W, 0], labels.width, [0, size * 1.8], size);
  body += dimension([0, 0], [0, -H], labels.height, [-size * 1.6, 0], size);
  body += dimension([sx, 0], [sx + D, 0], labels.depth, [0, size * 1.8], size);
  // Element widths along the top, from the parts of each element.
  const xs = labels.elements.map((_, i) => {
    const own = input.parts.filter((p) => p.element === i);
    return own.length ? [Math.min(...own.map((p) => p.position[0])), Math.max(...own.map((p) => p.position[0] + p.size[0]))] : null;
  });
  if (labels.elements.length > 1)
    xs.forEach((span, i) => {
      if (span) body += dimension([span[0]!, -H], [span[1]!, -H], labels.elements[i] ?? '', [0, -size * 1.5], size);
    });
  if (labels.base) {
    const base = Math.min(...input.parts.filter((p) => p.role === 'bottom').map((p) => p.position[1]));
    if (base > 0) body += dimension([sx + D, 0], [sx + D, -base], labels.base, [size * 1.6, 0], size);
  }
  return svg({ minX: -size * 4, minY: -H - size * 4, w: sx + D + size * 8, h: H + size * 8 }, body);
}

/** Exploded wireframe in oblique view: each part outlined in its cut-list colour with its number at its top-left front corner. */
export function explodedSvg(input: { parts: Part[]; offsets: Map<string, Vec3>; depth: number; rowNoByPart: Record<string, number> }): string {
  const P = project(input.depth);
  const moved = input.parts.map((p) => {
    const o = input.offsets.get(p.id) ?? [0, 0, 0];
    return { part: p, box: { position: [p.position[0] + o[0], p.position[1] + o[1], p.position[2] + o[2]] as Vec3, size: p.size, fill: 'none' } };
  });
  const span = Math.max(...moved.map((m) => m.box.position[0] + m.box.size[0])) - Math.min(...moved.map((m) => m.box.position[0]));
  const size = Math.max(span / 50, 22);
  let body = '';
  const edges: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (const { part, box } of moved) {
    const c = corners(box).map(P);
    const colour = rowColor(input.rowNoByPart[part.id] ?? 0);
    body += poly([c[4]!, c[5]!, c[6]!, c[7]!], colour, colour, 0, ' fill-opacity="0.08"');
    for (const [a, b] of edges) body += line(c[a]!, c[b]!, colour, 2);
  }
  // Numbers last, so no line runs over them.
  for (const { part, box } of moved) {
    const no = input.rowNoByPart[part.id];
    if (!no) continue;
    const [x, y, z] = box.position;
    const at = P([x, y + box.size[1], z + box.size[2]]);
    const centre: Pt = [at[0] + size * 0.75, at[1] + size * 0.75];
    body += `<circle cx="${r(centre[0])}" cy="${r(centre[1])}" r="${r(size * 0.7)}" fill="${rowColor(no)}" stroke="#ffffff" stroke-width="${r(size * 0.1)}"/>`;
    body += text([centre[0], centre[1] + size * 0.32], String(no), size * 0.85, 'middle', '#ffffff');
  }
  const all = moved.flatMap((m) => corners(m.box).map(P));
  return svg(bounds(all, size * 2), body);
}
