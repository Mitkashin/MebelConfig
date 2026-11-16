import type { HandleFinish, HandleShape } from './types';
import decorData from './decors.json';

/**
 * Catalogue, sheet sizes and prices. Boards, edge band, HDF, workshop services
 * and hardware are priced as listed by the supplier Soloprom
 * (soloprom.com.mk), checked 16.11.2026. The few items Soloprom does not sell
 * are marked as placeholders below.
 */
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
  /** Matching 22–23 mm ABS edge band, 0.8 mm (1 mm where only that is listed), price per metre. */
  band: number;
  /** `exact`: same code; `colour`: same colour in another surface; `estimate`: no 22 mm band listed, typical price used. */
  bandMatch: 'exact' | 'colour' | 'estimate';
  /** Supplier's name of the band, e.g. "H1145 ST10 23/0.8". */
  bandTape?: string;
}

/**
 * 18 mm melamine-faced chipboard as listed by Soloprom (soloprom.com.mk,
 * category "Оплеменета иверка"), Egger and Kronospan, collected 15.11.2026.
 * Codes, categories, prices per sheet and stock come from the supplier;
 * images are the supplier's product photos. Board prices re-checked against
 * the shop on 16.11.2026 (all 183 unchanged); matching edge bands added the
 * same day. Refresh `decors.json` and `public/decors/` to update.
 */
type DecorRecord = { id: string; code: string; brand: DecorBrand; category: DecorCategory; color: string; price: number; band: number; bandMatch: Decor['bandMatch']; bandTape?: string; inStock: boolean; source: string };
export const DECORS: Decor[] = (decorData as DecorRecord[]).map((d) => ({
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
  band: d.band,
  bandMatch: d.bandMatch,
  ...(d.bandTape ? { bandTape: d.bandTape } : {}),
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
  graphite: '#3a3d40',
};

export const SHEET = {
  board: { length: 2800, width: 2070, thickness: 18 },
  /** White 3 mm HDF, Kronospan 8685 ("Лесонит 8685, Бел"). */
  hdf: { length: 2800, width: 2070, thickness: 3, price: 1190 },
  kerf: 4,
  trim: 10,
};

/** Waste added to every banded edge (mm): the band is cut longer than the edge. */
export const BANDING_ALLOWANCE = 30;

/** Soloprom's workshop services ("Услуги"). */
export const SERVICES = {
  /** Cutting, per sheet bought ("Кроење Оплеменета иверка / Медијапан 2800 х 2070", "Кроење Лесонит"). */
  cuttingPerSheet: { board: 770, hdf: 350 },
  /** PUR edge banding of 22 mm band, 0.8 or 1 mm, per metre; the band itself is bought separately ("Кантирање со PUR лепак 22/08, 22/1"). */
  bandingPerM: 80,
  /** Drilling one hinge cup ("Бушење за шарки"). */
  hingeDrilling: 40,
};

const SHOP = 'https://soloprom.com.mk/prodavnica/';

/**
 * Hardware, priced per piece (drawer slides per pair, nails per pack) as the
 * supplier lists it. `source` is the product the price comes from; items
 * without one are not sold by Soloprom and keep a placeholder price.
 */
export const HARDWARE: Record<string, { price: number; source?: string }> = {
  /** Häfele Metalla 310 soft-close (65) + Häfele 3D mounting plate (20). */
  hinge: { price: 85, source: `${SHOP}prava-sharka-metalla-310-so-meko-zatvaranje/` },
  /** Grass MIRRO glass-door hinge, soft-close (535) + Tiomos 18 mm plate (45). */
  glassHinge: { price: 580, source: `${SHOP}prava-sharka-za-stakleni-vrati-mirro-so-mek/` },
  flapStay: { price: 90, source: `${SHOP}drzhach-za-bife-vratichka-nadolu/` },
  pushLatch: { price: 210, source: `${SHOP}magneten-piston-za-push-vratichki-80-mm/` },
  shelfPin: { price: 2, source: `${SHOP}drzhach-za-drveni-policzi-vo-element-f5-od/` },
  wallBracket: { price: 18, source: `${SHOP}drzhach-za-visechki-element-30kg/` },
  /** Elliptic aluminium rail LT0452, per metre (the line is priced by the rail's length). */
  hangingRail: { price: 250, source: `${SHOP}elipsovidna-oklagija-od-aluminium-lt0452-3-m/` },
  railHolder: { price: 9, source: `${SHOP}drzhachi-za-elipsovidna-oklagija/` },
  plinthClip: { price: 11, source: `${SHOP}drzhach-za-drvena-czokla-dvonamenski/` },
  /** Adjustable foot pressed into the lower edge of an 18 mm plinth panel. */
  plinthLeveller: { price: 25, source: `${SHOP}nivelator-za-panel-18mm/` },
  screw3516: { price: 1, source: `${SHOP}hol-shtraf-3-5-x-16-mm-miton-na-parche/` },
  screw430: { price: 1, source: `${SHOP}hol-shtraf-4-x-30-mm-miton-na-parche/` },
  screw450: { price: 1, source: `${SHOP}hol-shtraf-4-x-50-mm-miton-na-parche/` },
  /** Pack of 120 nails 1.3 × 20 for HDF. */
  backNail: { price: 57, source: `${SHOP}shajki-za-lesonit-1-3-x-20mm-120-kom/` },
  /** Placeholders: Soloprom does not sell adhesive screw caps, separate handle screws or wall plugs. */
  screwCap: { price: 1 },
  handleScrew: { price: 2 },
  wallPlug: { price: 6 },
};
export const NAILS_PER_PACK = 120;

/** Telescopic ball-bearing slides DD4509, price per pair by length. Other lengths take the nearest listed price. */
export const SLIDE_PRICES: Record<number, { price: number; source: string }> = {
  350: { price: 190, source: `${SHOP}teleskopski-lizgach-350-mm-dd4509/` },
  400: { price: 210, source: `${SHOP}teleskopski-lizgach-400-mm-dd4509/` },
  450: { price: 240, source: `${SHOP}teleskopski-lizgach-450-mm-dd4509/` },
  500: { price: 280, source: `${SHOP}teleskopski-lizgach-500-mm-dd4509/` },
};

/** Furniture legs by height: 1Q20 (100–200), LAILA 50, Albufera 60, COFREN 300. */
export const LEG_PRICES: Record<number, { price: number; source: string }> = {
  50: { price: 192, source: `${SHOP}nogarka-laila-50-mm-czrna/` },
  60: { price: 43, source: `${SHOP}nogarka-albufera-60-mm-bela/` },
  100: { price: 250, source: `${SHOP}nogarka-1q20-100-mm-inoks/` },
  150: { price: 265, source: `${SHOP}nogarka-1q20-150-mm-czrna/` },
  200: { price: 285, source: `${SHOP}nogarka-1q20-200-mm-bela/` },
  300: { price: 438, source: `${SHOP}nogarka-cofren-300-mm-inoks/` },
};

/** Price of the listed size nearest to `size` (ties go to the larger size). */
export function nearestPrice<T extends { price: number }>(table: Record<number, T>, size: number): T & { size: number } {
  const sizes = Object.keys(table).map(Number);
  const best = sizes.reduce((a, b) => (Math.abs(b - size) < Math.abs(a - size) || (Math.abs(b - size) === Math.abs(a - size) && b > a) ? b : a));
  return { ...(table[best] as T), size: best };
}

/** One representative Soloprom handle per shape (the shapes are drawn generically). */
export const HANDLE_PRICES: Record<HandleShape, { price: number; source: string }> = {
  bar128: { price: 300, source: `${SHOP}racka-574-10128-hrom-mat/` },
  bar320: { price: 385, source: `${SHOP}racka-574-10320-hrom-mat/` },
  longBar: { price: 735, source: `${SHOP}rachka-ua112556/` },
  knob: { price: 140, source: `${SHOP}rachka-gn56-chelik/` },
  shell: { price: 150, source: `${SHOP}rachka-un59/` },
  edge: { price: 233, source: `${SHOP}rachka-apl10704/` },
  topPull: { price: 217, source: `${SHOP}rachka-profil-perfila-1160-czrna/` },
};
/** The GN56 knob is listed in most of our finishes, at different prices. */
export const KNOB_PRICES: Partial<Record<HandleFinish, { price: number; source: string }>> = {
  white: { price: 163, source: `${SHOP}rachka-gn56-bela-mat/` },
  black: { price: 88, source: `${SHOP}rachka-gn56-czrna-mat/` },
  graphite: { price: 115, source: `${SHOP}rachka-gn56-grafit/` },
  grey: { price: 140, source: `${SHOP}rachka-gn56-chelik/` },
  gold: { price: 166, source: `${SHOP}rachka-gn56-zlatna/` },
};
