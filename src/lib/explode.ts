import type { Config, Part, Vec3 } from '@/engine/types';

/** Exploded view: how far (mm) a part, or the drawer/door group it leads, moves away from its place. */
export function explodeOffset(part: Part, count: number, cellsInColumn: number): Vec3 {
  const spread = part.element === null ? 0 : (part.element - (count - 1) / 2) * 170;
  if (part.cell !== undefined) {
    // Wardrobe compartments also move apart vertically, so stacked carcasses separate.
    const lift = (cellsInColumn - 1 - part.cell) * 150;
    const role = part.role === 'top' ? [0, 60, 0] : part.role === 'bottom' ? [0, -60, 0] : part.role === 'side' ? [part.id.endsWith('L') ? -75 : 75, 0, 0] : part.role === 'shelf' ? [0, 0, 160] : part.role === 'back' ? [0, 0, -200] : [0, 0, 320];
    return [spread + (role[0] as number), lift + (role[1] as number), role[2] as number];
  }
  switch (part.role) {
    case 'top':
      return [0, part.id === 'top' ? 280 : 160, 0];
    case 'bottom':
      return [spread, -150, 0];
    case 'side':
      return [spread + (part.id.endsWith('L') ? -75 : 75), 0, 0];
    case 'rail':
      return [spread, 80, part.id.endsWith('F') ? 70 : -70];
    case 'shelf':
      return [spread, 0, 180];
    case 'back':
      return [spread, 0, -220];
    case 'plinth': {
      // The base drops below the carcass and opens out: front forward, back backward, ends outward.
      const side = (part.id.split('.')[1] ?? '').replace(/\d+$/, '');
      const [dx, dz] = side === 'front' ? [0, 160] : side === 'back' ? [0, -160] : side === 'left' ? [-160, 0] : side === 'right' ? [160, 0] : [0, 0];
      return [dx, -280, dz];
    }
    default:
      return [spread, 0, 340];
  }
}

/** The group a part moves with: each door alone, a drawer front with its box. */
export function moverOf(part: Part): string {
  return part.role === 'door' ? part.id : (part.group ?? part.id);
}

/**
 * Where every part sits in the exploded view (the same offsets the 3D view
 * animates to): groups move with their lead front, everything steps 280 mm
 * away from the wall, and the whole piece is lifted so nothing goes below
 * the floor.
 */
export function explodedOffsets(parts: Part[], config: Pick<Config, 'elements'>, mountHeight = 0): Map<string, Vec3> {
  const groups = new Map<string, Part[]>();
  for (const part of parts) groups.set(moverOf(part), [...(groups.get(moverOf(part)) ?? []), part]);
  const n = config.elements.length;
  const offsets = new Map<string, Vec3>();
  for (const members of groups.values()) {
    const lead = members.find((x) => x.role === 'door' || x.role === 'drawerFront') ?? (members[0] as Part);
    const cells = lead.element === null ? 1 : (config.elements[lead.element]?.cells?.length ?? 1);
    const o = explodeOffset(lead, n, cells);
    for (const m of members) offsets.set(m.id, [o[0], o[1], o[2] + 280]);
  }
  const lowest = Math.min(...parts.map((x) => x.position[1] + (offsets.get(x.id)?.[1] ?? 0)));
  const lift = Math.max(0, -(lowest + mountHeight));
  if (lift > 0) for (const [id, o] of offsets) offsets.set(id, [o[0], o[1] + lift, o[2]]);
  return offsets;
}
