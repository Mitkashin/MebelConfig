import type { HandleFinish, HandleShape } from './types';

/**
 * Placeholder catalogue and prices. Nothing here comes from a supplier:
 * codes, names (see messages) and colours are invented. Replace this file
 * when a real catalogue and price list are available.
 */
export const CURRENCY = 'MKD';

export type DecorCategory = 'wood' | 'material' | 'solid' | 'matt';

export interface Decor {
  id: string;
  code: string;
  category: DecorCategory;
  /** Base colour used for the swatch and the 3D material. */
  color: string;
  /** True when the decor has a direction, so parts may not rotate on the sheet. */
  grain: boolean;
  pricePerSheet: number;
}

const PRICE: Record<DecorCategory, number> = { solid: 4200, wood: 4900, material: 4900, matt: 5600 };

function make(category: DecorCategory, prefix: string, colors: string[]): Decor[] {
  return colors.map((color, i) => {
    const n = String(i + 1).padStart(2, '0');
    return {
      id: `${prefix.toLowerCase()}${n}`,
      code: `${prefix}-${n}`,
      category,
      color,
      grain: category === 'wood',
      pricePerSheet: PRICE[category],
    };
  });
}

export const DECORS: Decor[] = [
  ...make('wood', 'W', ['#c9ab86', '#b08a5e', '#8a5f3c', '#d9c3a3', '#6b4a33', '#a9785a', '#e3d2b8', '#54392a', '#bf9a6d', '#9a7b5f']),
  ...make('material', 'M', ['#9a9c9a', '#c8c4bb', '#5d6063', '#b7a895', '#7d7468', '#d8d5cf']),
  ...make('solid', 'S', ['#f6f4ef', '#ece5d6', '#d9d2c3', '#bfc4c2', '#8d9796', '#3f4a4d', '#1f2426', '#c9d3c5']),
  ...make('matt', 'X', ['#f1efea', '#2a2d2f', '#5a6b62', '#37465b', '#8c5b4a', '#c7b8a4']),
];

export const DECOR_CATEGORIES: DecorCategory[] = ['wood', 'material', 'solid', 'matt'];
export const DEFAULT_BODY_DECOR = 'w01';
export const DEFAULT_FRONT_DECOR = 's02';

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
