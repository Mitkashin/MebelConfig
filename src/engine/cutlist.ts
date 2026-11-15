import { getDecor, RATES } from './catalog';
import type { CutRow, Edges, Part, Role } from './types';

export const ROLE_ORDER: Role[] = [
  'top',
  'bottom',
  'side',
  'rail',
  'shelf',
  'door',
  'drawerFront',
  'drawerSide',
  'drawerInner',
  'back',
  'drawerBottom',
];

/** A panel can be flipped end for end, so mirrored banding patterns are the same piece. */
function canonicalEdges(e: Edges): Edges {
  const long = Number(e.l1) + Number(e.l2);
  const short = Number(e.w1) + Number(e.w2);
  return { l1: long === 2, l2: long >= 1, w1: short === 2, w2: short >= 1 };
}
const edgeKey = (e: Edges) => `${Number(e.l1) + Number(e.l2)}${Number(e.w1) + Number(e.w2)}`;

/** Does the decor direction matter for this part when it is laid on a sheet? */
export function isGrained(part: Pick<Part, 'material' | 'decor'>): boolean {
  return part.material === 'board' && part.decor !== null && (getDecor(part.decor)?.grain ?? false);
}

/** Banded edge length of one part in mm, including the per-edge allowance. */
export function bandingLength(part: Pick<Part, 'length' | 'width' | 'edges'>): number {
  const { l1, l2, w1, w2 } = part.edges;
  const long = Number(l1) + Number(l2);
  const short = Number(w1) + Number(w2);
  return long * (part.length + RATES.bandingAllowance) + short * (part.width + RATES.bandingAllowance);
}

/**
 * Group identical parts into cut-list rows. Two parts share a row when role,
 * size, material, decor, the number of banded long and short edges, and the
 * hinge drilling all match.
 */
export function buildCutList(parts: Part[]): CutRow[] {
  const rows = new Map<string, CutRow>();
  for (const part of parts) {
    const key = [part.role, part.length, part.width, part.thickness, part.material, part.decor ?? '-', edgeKey(part.edges), part.hinges ?? 0, part.hinge === 'bottom' ? 'flap' : ''].join('|');
    const row = rows.get(key);
    if (row) {
      row.qty += 1;
      row.partIds.push(part.id);
    } else {
      rows.set(key, {
        key,
        no: 0,
        role: part.role,
        qty: 1,
        length: part.length,
        width: part.width,
        thickness: part.thickness,
        material: part.material,
        decor: part.decor,
        grain: isGrained(part),
        edges: canonicalEdges(part.edges),
        ...(part.hinges ? { hinges: part.hinges } : {}),
        bandingPerPiece: bandingLength(part),
        partIds: [part.id],
      });
    }
  }
  const sorted = [...rows.values()].sort(
    (a, b) =>
      ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) ||
      b.length * b.width - a.length * a.width ||
      a.key.localeCompare(b.key),
  );
  sorted.forEach((row, i) => (row.no = i + 1));
  return sorted;
}

export interface CsvLabels {
  header: string[];
  role: (role: Role) => string;
  material: (row: CutRow) => string;
  yes: string;
  no: string;
}

/** Cut list as CSV text. The separator is a parameter because spreadsheet locales disagree on it. */
export function cutListCsv(rows: CutRow[], labels: CsvLabels, separator: ',' | ';' = ','): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const flag = (b: boolean) => (b ? labels.yes : labels.no);
  const lines = [labels.header.map(esc).join(separator)];
  for (const r of rows) {
    lines.push(
      [
        r.no,
        labels.role(r.role),
        r.qty,
        r.length,
        r.width,
        r.thickness,
        labels.material(r),
        flag(r.grain),
        flag(r.edges.l1),
        flag(r.edges.l2),
        flag(r.edges.w1),
        flag(r.edges.w2),
        ((r.bandingPerPiece * r.qty) / 1000).toFixed(2),
      ]
        .map(esc)
        .join(separator),
    );
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}
