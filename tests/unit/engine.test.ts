import { describe, expect, it } from 'vitest';
import { buildParts } from '@/engine/build';
import { DECORS, SHEET } from '@/engine/catalog';
import { buildCutList, cutListCsv, isGrained } from '@/engine/cutlist';
import { derive } from '@/engine/derive';
import { MODELS, requireModel } from '@/engine/models';
import { nest } from '@/engine/nesting';
import { distributeEqual, elementMaxShelves, limits, maxDrawers, maxShelves, normalise, railFits, resizeElement, scaleWidths, shelfSpacing, validate } from '@/engine/rules';
import { decodeConfig, defaultConfig, encodeConfig } from '@/engine/share';
import type { Config, ElementConfig, Part } from '@/engine/types';

const WALL = { doubleTop: false, mount: 'wall', legHeight: 0 } as const;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random but valid configuration of a random model. */
function randomConfig(seed: number): Config {
  const r = rng(seed);
  const int = (min: number, max: number) => min + Math.floor(r() * (max - min + 1));
  const pick = <T,>(xs: readonly T[]): T => xs[int(0, xs.length - 1)] as T;
  const model = MODELS[seed % MODELS.length]!;
  const p = model.params;
  const n = int(p.elementsMin, Math.min(p.elementsMax, Math.floor(p.widthMax / p.elementMin)));
  const width = int(Math.max(p.widthMin, n * p.elementMin), Math.min(p.widthMax, n * p.elementMax));
  const spare = width - n * p.elementMin;
  let widths: number[] = [];
  for (let attempt = 0; attempt < 40; attempt++) {
    const cuts = Array.from({ length: n - 1 }, () => int(0, spare)).sort((a, b) => a - b);
    widths = Array.from({ length: n }, (_, i) => p.elementMin + (cuts[i] ?? spare) - (cuts[i - 1] ?? 0));
    if (widths.every((w) => w <= p.elementMax)) break;
    widths = distributeEqual(width, n);
  }
  const template = model.defaults.elements[0]!;
  const base: Config = {
    ...defaultConfig(model.slug),
    width,
    height: int(p.heightMin, p.heightMax),
    depth: int(p.depthMin, p.depthMax),
    back: model.features.back ? r() < 0.7 : true,
    doubleTop: model.features.doubleTop && r() < 0.3,
    bodyDecor: pick(DECORS).id,
    frontDecor: pick(DECORS).id,
    openingType: r() < 0.8 ? 'handles' : 'push',
    handleShape: pick(['bar128', 'bar320', 'longBar', 'knob', 'shell', 'edge', 'topPull'] as const),
    mount: pick(model.mounts),
    legHeight: model.legHeights.length ? pick(model.legHeights) : 0,
    elements: widths.map((w) => ({ ...template, width: w, rail: false, shelves: 0 })),
  };
  const lim = limits(base, model);
  base.elements = widths.map((w): ElementConfig => {
    const fronts = model.fronts.filter((f) => f !== 'drawers' || lim.drawersAvailable);
    const rail = lim.railAvailable && r() < 0.5;
    return {
      width: w,
      front: pick(fronts),
      shelves: int(0, elementMaxShelves(base, { rail }, p)),
      doors: w >= p.doubleDoorMin && r() < 0.4 ? 2 : 1,
      opening: pick(['auto', 'left', 'right', 'bottom'] as const),
      drawers: int(1, Math.max(1, lim.maxDrawers)),
      rail,
    };
  });
  return base;
}

const SEEDS = Array.from({ length: 420 }, (_, i) => i + 1);

function overlaps(a: Part, b: Part): boolean {
  return [0, 1, 2].every((k) => a.position[k]! < b.position[k]! + b.size[k]! && b.position[k]! < a.position[k]! + a.size[k]!);
}

describe('defaults', () => {
  it.each(MODELS.map((m) => m.slug))('%s defaults are valid and buildable', (slug) => {
    const config = defaultConfig(slug);
    expect(validate(config)).toEqual([]);
    expect(derive(config).parts.length).toBeGreaterThan(0);
  });

  it('reproduces the reference geometry for the default sideboard', () => {
    const parts = buildParts(defaultConfig('sideboard-1'));
    const byId = new Map(parts.map((x) => [x.id, x]));
    // 1 top + 3 x (bottom, 2 sides, 2 rails, shelf, back, door) = 25, as in the reference scene.
    expect(parts).toHaveLength(25);
    const door = byId.get('e0.door')!;
    expect(door.size).toEqual([547, 626, 18]);
    expect(door.position[1]).toBe(3);
    expect(door.position[2] + door.size[2]).toBe(350);
    expect(byId.get('e0.sideL')!.size).toEqual([18, 614, 325]);
    expect(byId.get('e0.bottom')!.size).toEqual([549, 18, 325]);
    expect(byId.get('e0.railF')!.size).toEqual([513, 18, 80]);
    expect(byId.get('e0.shelf0')!.size).toEqual([513, 18, 310]);
    expect(byId.get('e0.shelf0')!.position[1]).toBe(316);
    expect(byId.get('e0.back')!.size).toEqual([549, 632, 3]);
    expect(byId.get('top')!.size).toEqual([1650, 18, 350]);
    expect(parts.filter((x) => x.role === 'door').map((d) => d.hinge)).toEqual(['left', 'left', 'right']);
  });

  it('matches the cut list, banding and fittings the reference generated for its default', () => {
    // Read from the reference's results page for 165 x 65 x 35 cm, 3 elements, doors, 1 shelf each.
    const d = derive(defaultConfig('sideboard-1'));
    const rows = d.cutList.map((r) => [r.role, r.qty, r.length, r.width, r.thickness, Number(r.edges.l1) + Number(r.edges.l2), Number(r.edges.w1) + Number(r.edges.w2)]);
    expect(rows).toEqual([
      ['top', 1, 1650, 350, 18, 1, 2],
      ['bottom', 1, 549, 325, 18, 1, 0],
      ['bottom', 2, 549, 325, 18, 1, 1],
      ['side', 6, 614, 325, 18, 1, 0],
      ['rail', 6, 513, 80, 18, 1, 0],
      ['shelf', 3, 513, 310, 18, 1, 0],
      ['door', 3, 626, 547, 18, 2, 2],
      ['back', 3, 632, 549, 3, 0, 0],
    ]);
    expect(d.parts).toHaveLength(25);
    expect(d.sheetCount).toBe(3);
    expect(d.bandingMeters).toBe(21.04);
    const qty = Object.fromEntries(d.hardware.map((h) => [h.key, h.qty]));
    expect(qty).toMatchObject({ hinge: 6, handle: 3, shelfPin: 12, wallBracket: 6, screw3516: 27, screw430: 27, screw450: 40, screwCap: 40, handleScrew: 7, backNail: 53, wallPlug: 14 });
  });

  it('shelf limits follow the minimum spacing', () => {
    const p = requireModel('sideboard-1').params;
    expect(maxShelves({ height: 650, ...WALL }, p)).toBe(2);
    expect(maxShelves({ height: 330, ...WALL }, p)).toBe(0);
    expect(maxShelves({ height: 2000, ...WALL }, p)).toBe(10);
    expect(shelfSpacing({ height: 650, ...WALL }, 1, p)).toBe(298);
    expect(maxDrawers({ height: 650, ...WALL }, p)).toBe(4);
  });
});

describe('invariants over random configurations', () => {
  const cases = SEEDS.map((seed) => ({ seed, config: randomConfig(seed) }));

  it('generated configurations are valid', () => {
    for (const { seed, config } of cases) expect(validate(config), `seed ${seed}`).toEqual([]);
  });

  it('element widths plus panel thicknesses equal the total width', () => {
    for (const { seed, config } of cases) {
      const p = requireModel(config.model).params;
      const parts = buildParts(config);
      const n = config.elements.length;
      const allowance = n >= p.joinAllowanceFrom ? p.joinAllowance : 0;
      expect(config.elements.reduce((s, e) => s + e.width, 0), `seed ${seed}`).toBe(config.width);
      let clear = 0;
      let panels = 0;
      config.elements.forEach((el, i) => {
        const sides = parts.filter((x) => x.element === i && x.role === 'side');
        const bottom = parts.find((x) => x.id === `e${i}.bottom`)!;
        expect(sides).toHaveLength(2);
        const inner = sides[1]!.position[0] - (sides[0]!.position[0] + sides[0]!.size[0]);
        // clear opening + two sides = carcass width = typed width minus the join allowance
        expect(inner + 2 * p.board, `seed ${seed} el ${i}`).toBe(bottom.size[0]);
        expect(bottom.size[0] + allowance).toBe(el.width);
        clear += inner;
        panels += sides[0]!.size[0] + sides[1]!.size[0];
      });
      expect(clear + panels + n * allowance, `seed ${seed}`).toBe(config.width);
    }
  });

  it('no parts overlap and all stay inside the outer dimensions', () => {
    for (const { seed, config } of cases) {
      const parts = buildParts(config);
      for (const part of parts) {
        const max = [config.width, config.height, config.depth];
        for (const k of [0, 1, 2]) {
          expect(part.position[k]!, `seed ${seed} ${part.id}`).toBeGreaterThanOrEqual(0);
          expect(part.position[k]! + part.size[k]!, `seed ${seed} ${part.id} axis ${k}`).toBeLessThanOrEqual(max[k]!);
          expect(part.size[k]!).toBeGreaterThan(0);
          expect(Number.isInteger(part.size[k]!) && Number.isInteger(part.position[k]!)).toBe(true);
        }
      }
      for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
          if (overlaps(parts[i]!, parts[j]!)) throw new Error(`seed ${seed}: ${parts[i]!.id} overlaps ${parts[j]!.id}`);
        }
      }
      // Legs and rails are inside the outer dimensions and never run through a panel.
      for (const fitting of derive(config).fittings) {
        const box = { position: fitting.position, size: fitting.size } as Part;
        const max = [config.width, config.height, config.depth];
        for (const k of [0, 1, 2]) {
          expect(fitting.position[k]!, `seed ${seed} ${fitting.id}`).toBeGreaterThanOrEqual(0);
          expect(fitting.position[k]! + fitting.size[k]!, `seed ${seed} ${fitting.id}`).toBeLessThanOrEqual(max[k]!);
        }
        for (const part of parts) if (overlaps(box, part)) throw new Error(`seed ${seed}: ${fitting.id} runs through ${part.id}`);
      }
    }
  });

  it('every scene part is in the cut list exactly once, and vice versa', () => {
    for (const { seed, config } of cases) {
      const d = derive(config);
      const fromRows = d.cutList.flatMap((r) => r.partIds).sort();
      const fromScene = d.parts.map((x) => x.id).sort();
      expect(fromRows, `seed ${seed}`).toEqual(fromScene);
      expect(new Set(fromScene).size).toBe(fromScene.length);
      expect(d.cutList.reduce((s, r) => s + r.qty, 0)).toBe(d.parts.length);
      for (const row of d.cutList) {
        expect(row.partIds).toHaveLength(row.qty);
        for (const id of row.partIds) {
          const part = d.parts.find((x) => x.id === id)!;
          expect([part.length, part.width, part.thickness]).toEqual([row.length, row.width, row.thickness]);
        }
      }
    }
  });

  it('sheet layouts place every part once, inside the trim, a kerf apart, grain respected', () => {
    for (const { seed, config } of cases) {
      const d = derive(config);
      expect(d.nest.unplaced, `seed ${seed}`).toEqual([]);
      const placed = d.nest.sheets.flatMap((s) => s.placements.map((pl) => pl.partId)).sort();
      expect(placed).toEqual(d.parts.map((x) => x.id).sort());
      for (const sheet of d.nest.sheets) {
        const stock = d.nest.stocks.find((s) => s.key === sheet.stockKey)!;
        for (const pl of sheet.placements) {
          const part = d.parts.find((x) => x.id === pl.partId)!;
          expect(pl.x).toBeGreaterThanOrEqual(SHEET.trim);
          expect(pl.y).toBeGreaterThanOrEqual(SHEET.trim);
          expect(pl.x + pl.w, `seed ${seed} ${pl.partId}`).toBeLessThanOrEqual(stock.sheetLength - SHEET.trim);
          expect(pl.y + pl.h, `seed ${seed} ${pl.partId}`).toBeLessThanOrEqual(stock.sheetWidth - SHEET.trim);
          expect(pl.rotated ? [pl.h, pl.w] : [pl.w, pl.h]).toEqual([part.length, part.width]);
          if (isGrained(part)) expect(pl.rotated, `seed ${seed} ${pl.partId}`).toBe(false);
        }
        const ps = sheet.placements;
        for (let i = 0; i < ps.length; i++) {
          for (let j = i + 1; j < ps.length; j++) {
            const a = ps[i]!;
            const b = ps[j]!;
            const apart =
              a.x + a.w + SHEET.kerf <= b.x || b.x + b.w + SHEET.kerf <= a.x || a.y + a.h + SHEET.kerf <= b.y || b.y + b.h + SHEET.kerf <= a.y;
            if (!apart) throw new Error(`seed ${seed}: ${a.partId} and ${b.partId} closer than a kerf`);
          }
        }
      }
    }
  });

  it('price equals the sum of its line items, and sheet lines match the layouts', () => {
    for (const { seed, config } of cases) {
      const d = derive(config);
      expect(d.price.total, `seed ${seed}`).toBe(d.price.lines.reduce((s, l) => s + l.total, 0));
      const sheetQty = d.price.lines.filter((l) => l.kind === 'sheet').reduce((s, l) => s + l.qty, 0);
      expect(sheetQty).toBe(d.sheetCount);
      for (const line of d.price.lines) expect(Number.isInteger(line.total) && line.total >= 0).toBe(true);
    }
  });

  it('hardware follows the parts', () => {
    for (const { seed, config } of cases) {
      const d = derive(config);
      const fronts = d.parts.filter((x) => x.role === 'door' || x.role === 'drawerFront').length;
      const qty = (key: string) => d.hardware.find((h) => h.key === key)?.qty ?? 0;
      expect(d.handles.length, `seed ${seed}`).toBe(config.openingType === 'handles' ? fronts : 0);
      expect(qty('handle') + qty('pushLatch')).toBe(fronts);
      expect(qty('shelfPin')).toBe(d.parts.filter((x) => x.role === 'shelf').length * 4);
      expect(qty('drawerSlide')).toBe(d.parts.filter((x) => x.role === 'drawerFront').length);
      const brackets = config.mount === 'wall' ? config.elements.length * 2 : config.height > 1200 ? config.elements.length : 0;
      expect(qty('wallBracket')).toBe(brackets);
      expect(qty('leg')).toBe(config.mount === 'legs' ? (config.elements.length + 1) * 2 : 0);
      expect(qty('hangingRail')).toBe(d.fittings.filter((f) => f.kind === 'rail').length);
    }
  });
});

describe('validation', () => {
  const base = defaultConfig('sideboard-1');
  const codes = (c: Config) => validate(c).map((i) => `${i.code}@${i.path}`);

  it('explains each limit with its range', () => {
    expect(validate({ ...base, width: 3000 })).toContainEqual({ code: 'sheetLimit', path: 'width', params: { max: 2780 } });
    expect(validate({ ...base, height: 200 })).toContainEqual({ code: 'range', path: 'height', params: { min: 300, max: 2000 } });
    expect(validate({ ...base, depth: 700 })).toContainEqual({ code: 'range', path: 'depth', params: { min: 150, max: 600 } });
    const narrow = { ...base, width: 700, elements: base.elements.map((e, i) => ({ ...e, width: i === 0 ? 234 : 233 })) };
    expect(codes(narrow)).toContain('widthForElements@width');
    expect(codes({ ...base, elements: base.elements.map((e) => ({ ...e, shelves: 3 })) })).toContain('shelvesMax@elements.0.shelves');
    expect(codes({ ...base, elements: [{ ...base.elements[0]!, width: 549 }, base.elements[1]!, base.elements[2]!] })).toContain('elementsSum@elements');
  });

  it('rejects malformed input', () => {
    expect(validate({ nope: true })[0]!.code).toBe('invalid');
    expect(validate({ ...base, model: 'missing' })[0]!.code).toBe('invalid');
    expect(validate({ ...base, bodyDecor: 'nope' }).map((i) => i.path)).toContain('bodyDecor');
  });

  it('drawers need enough depth', () => {
    const shallow = { ...base, depth: 200, elements: base.elements.map((e) => ({ ...e, front: 'drawers' as const })) };
    expect(codes(shallow)).toContain('drawersDepth@elements.0.front');
    expect(limits(shallow, requireModel('sideboard-1')).depth.min).toBe(285);
  });

  it('normalise clamps dependent values and reports it', () => {
    const tall = { ...base, elements: base.elements.map((e) => ({ ...e, shelves: 2 })) };
    const { config, notices } = normalise({ ...tall, height: 400 }, requireModel('sideboard-1'));
    expect(config.elements.map((e) => e.shelves)).toEqual([1, 1, 1]);
    expect(notices).toEqual([{ code: 'shelvesReduced', params: { max: 1 } }]);
  });

  it('the open sideboard rejects doors', () => {
    const shelf = defaultConfig('open-sideboard-1');
    expect(codes({ ...shelf, elements: shelf.elements.map((e) => ({ ...e, front: 'doors' as const })) })).toContain('unsupported@elements.0.front');
  });
});

describe('models', () => {
  it('every model has distinct rules and valid, buildable defaults', () => {
    expect(new Set(MODELS.map((m) => m.slug)).size).toBe(MODELS.length);
    for (const model of MODELS) {
      expect(model.mounts).toContain(model.defaults.mount);
      for (const el of model.defaults.elements) expect(model.fronts).toContain(el.front);
    }
  });

  it('legs lift the carcass and keep the overall height', () => {
    const config = defaultConfig('standing-sideboard-1');
    const d = derive(config);
    expect(d.parts.find((x) => x.id === 'e0.bottom')!.position[1]).toBe(config.legHeight);
    expect(d.parts.find((x) => x.id === 'top')!.position[1] + 18).toBe(config.height);
    expect(d.fittings.filter((f) => f.kind === 'leg')).toHaveLength((config.elements.length + 1) * 2);
    expect(validate({ ...config, legHeight: 137 }).map((i) => i.path)).toContain('legHeight');
    expect(validate({ ...config, mount: 'wall' }).map((i) => i.path)).toContain('mount');
  });

  it('a wardrobe rail keeps the hanging space clear and needs height and depth', () => {
    const config = defaultConfig('wardrobe-1');
    const p = requireModel('wardrobe-1').params;
    const d = derive(config);
    const rail = d.fittings.find((f) => f.id === 'e0.rail')!;
    const bottom = d.parts.find((x) => x.id === 'e0.bottom')!;
    expect(rail.position[1] - (bottom.position[1] + 18)).toBeGreaterThanOrEqual(p.hangingSpace);
    expect(railFits({ ...config, depth: 400 }, p)).toBe(false);
    expect(validate({ ...config, depth: 400 }).map((i) => i.code)).toContain('railSpace');
    const { config: lowered, notices } = normalise({ ...config, depth: 400 }, requireModel('wardrobe-1'));
    expect(lowered.elements.every((e) => !e.rail)).toBe(true);
    expect(notices.map((n) => n.code)).toContain('railRemoved');
    expect(validate({ ...defaultConfig('sideboard-1'), elements: defaultConfig('sideboard-1').elements.map((e) => ({ ...e, rail: true })) }).map((i) => i.code)).toContain('unsupported');
  });
});

describe('element width helpers', () => {
  it('distributes equally with the remainder on the left', () => {
    expect(distributeEqual(1651, 3)).toEqual([551, 550, 550]);
  });
  it('resizes one element and spreads the difference', () => {
    expect(resizeElement([550, 550, 550], 0, 700, 250)).toEqual([700, 475, 475]);
    expect(resizeElement([550, 550, 550], 0, 1200, 250)).toBeNull();
    expect(resizeElement([550, 550, 550], 1, 551, 250)!.reduce((s, w) => s + w, 0)).toBe(1650);
  });
  it('scales proportionally and keeps the sum', () => {
    const scaled = scaleWidths([700, 475, 475], 1800, 250);
    expect(scaled.reduce((s, w) => s + w, 0)).toBe(1800);
    expect(scaled[0]).toBeGreaterThan(scaled[1]!);
    expect(scaleWidths([1000, 250, 250], 800, 250)).toEqual([267, 267, 266]);
  });
});

describe('sharing and export', () => {
  it('round-trips every random configuration through the URL form', () => {
    for (const seed of SEEDS) {
      const config = randomConfig(seed);
      expect(decodeConfig(encodeConfig(config)), `seed ${seed}`).toEqual(config);
    }
  });
  it('still opens links made before mounting and rails existed', () => {
    const old = '1.' + Buffer.from(JSON.stringify(['sideboard-1', 1650, 650, 350, [[550, 'doors', 1, 1, 'auto', 2], [550, 'doors', 1, 1, 'auto', 2], [550, 'doors', 1, 1, 'auto', 2]], 'w01', 's02', 1, 0, 'handles', 'bar128', 'grey'])).toString('base64url');
    expect(decodeConfig(old)).toEqual(defaultConfig('sideboard-1'));
  });
  it('rejects tampered links', () => {
    expect(decodeConfig('1.not-base64')).toBeNull();
    expect(decodeConfig('9.abc')).toBeNull();
    expect(decodeConfig(null)).toBeNull();
    const bad = encodeConfig({ ...defaultConfig('sideboard-1'), width: 99999 });
    expect(decodeConfig(bad)).toBeNull();
  });
  it('writes a CSV row per cut-list row', () => {
    const rows = buildCutList(buildParts(defaultConfig('sideboard-1')));
    const csv = cutListCsv(rows, { header: ['a', 'b'], role: (r) => r, material: (r) => r.material, yes: 'y', no: 'n' }, ';');
    expect(csv.trim().split('\r\n')).toHaveLength(rows.length + 1);
  });
  it('a grained decor never rotates on the sheet, a plain one may', () => {
    const config = { ...defaultConfig('sideboard-1'), bodyDecor: 'w01', frontDecor: 's01' };
    const parts = buildParts(config);
    const result = nest(parts);
    const rotated = result.sheets.flatMap((s) => s.placements).filter((pl) => pl.rotated).map((pl) => parts.find((x) => x.id === pl.partId)!);
    expect(rotated.every((x) => !isGrained(x))).toBe(true);
  });
});
