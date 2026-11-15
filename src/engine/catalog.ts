import type { HandleFinish, HandleShape } from './types';

/** Catalogue, sheet sizes and rates. Board decors and their prices come from the supplier (below); other rates are placeholders. */
import decorData from './decors.json';

export const CURRENCY = 'MKD';

export type DecorCategory = 'wood' | 'solid' | 'concrete' | 'stone' | 'marble' | 'textile' | 'fantasy';
export type DecorBrand = 'egger' | 'kronospan';

export interface Decor {
  id: string;
  code: string;
  brand: DecorBrand;
  category: DecorCategory;
  /** Average colour of the swatch: used for the sheet diagrams and while the texture loads. */
  color: string;
  /** True when the decor has a direction, so parts may not rotate on the sheet. */
  grain: boolean;
  pricePerSheet: number;
  inStock: boolean;
  /** Product page at the supplier. */
  source: string;
  /** Swatch image (full size for the 3D texture, small for the picker). */
  image: string;
  thumb: string;
  /** Real-world size (mm) one copy of the swatch image covers on a part. */
  tile: number;
}

/**
 * 18 mm melamine-faced chipboard as listed by Soloprom (soloprom.com.mk,
 * category "Оплеменета иверка"), Egger and Kronospan, collected 15.11.2026.
 * Codes, categories, prices per sheet and stock come from the supplier;
 * images are the supplier's product photos. Refresh `decors.json` and
 * `public/decors/` to update.
 */
export const DECORS: Decor[] = (decorData as { id: string; code: string; brand: DecorBrand; category: DecorCategory; color: string; price: number; inStock: boolean; source: string }[]).map((d) => ({
  id: d.id,
  code: d.code,
  brand: d.brand,
  category: d.category,
  color: d.color,
  grain: d.category === 'wood',
  pricePerSheet: d.price,
  inStock: d.inStock,
  source: d.source,
  image: `/decors/${d.id}.jpg`,
  thumb: `/decors/thumb/${d.id}.jpg`,
  tile: d.category === 'wood' ? 600 : 800,
}));

export const DECOR_CATEGORIES: DecorCategory[] = ['wood', 'solid', 'concrete', 'stone', 'marble', 'textile', 'fantasy'];
export const DEFAULT_BODY_DECOR = 'h1145-st10';
export const DEFAULT_FRONT_DECOR = 'w1000-st9';

const DECOR_BY_ID = new Map(DECORS.map((d) => [d.id, d]));
export function getDecor(id: string): Decor | undefined {
  return DECOR_BY_ID.get(id);
}

export const HANDLE_SHAPES: HandleShape[] = ['bar128', 'bar320', 'longBar', 'knob', 'shell', 'edge', 'topPull'];
export const HANDLE_FINISHES: Record<HandleFinish, string> = {
  grey: '#8f9396',
  black: '#1e1f21',
  gold: '#b8975a',
  white: '#f2f1ee',
  brown: '#5b4636',
};

export const SHEET = {
  board: { length: 2800, width: 2070, thickness: 18 },
  hdf: { length: 2800, width: 2070, thickness: 3, price: 950 },
  kerf: 4,
  trim: 10,
};

export const RATES = {
  bandingPerM: 45,
  bandingAllowance: 30,
  cuttingPerM: 30,
};

export const HARDWARE_PRICES: Record<string, number> = {
  hinge: 65,
  flapStay: 240,
  handle: 140,
  pushLatch: 95,
  shelfPin: 4,
  wallBracket: 120,
  drawerSlide: 380,
  leg: 110,
  hangingRail: 260,
  railHolder: 35,
  screw3516: 1,
  screw430: 2,
  screw450: 3,
  screwCap: 1,
  handleScrew: 2,
  backNail: 1,
  wallPlug: 6,
};

export const HANDLE_PRICE_FACTOR: Record<HandleShape, number> = {
  bar128: 1,
  bar320: 1.6,
  longBar: 2.4,
  knob: 0.7,
  shell: 1.3,
  edge: 2.8,
  topPull: 1.5,
};
