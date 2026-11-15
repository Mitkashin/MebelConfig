import type { Config, Front } from '../types';
import { DEFAULT_BODY_DECOR, DEFAULT_FRONT_DECOR } from '../catalog';

/** Construction parameters shared by carcass-row furniture (mm). */
export interface ModelParams {
  board: number;
  back: number;
  frontGap: number;
  doorHeightReduction: number;
  doorWidthGap: number;
  railWidth: number;
  shelfInset: number;
  shelfSpacingMin: number;
  joinAllowance: number;
  joinAllowanceFrom: number;
  doubleDoorMin: number;
  hingeMax2: number;
  hingeMax3: number;
  drawerFrontMin: number;
  drawerFrontGap: number;
  drawerSlideClearance: number;
  drawerBoxReduction: number;
  drawerBoxLift: number;
  drawerSlides: number[];
  drawersMax: number;
  widthMin: number;
  widthMax: number;
  heightMin: number;
  heightMax: number;
  depthMin: number;
  depthMax: number;
  elementsMin: number;
  elementsMax: number;
  elementMin: number;
}

export interface ModelDef {
  slug: string;
  /** Message key under `models.*`. */
  nameKey: string;
  params: ModelParams;
  /** Which front options an element may have; controls are hidden when only one exists. */
  fronts: Front[];
  features: { doubleTop: boolean; back: boolean; handles: boolean };
  /** Presentation only: height of the underside above the floor in the 3D scene. */
  mountHeight: number;
  defaults: Config;
}

const BASE: ModelParams = {
  board: 18,
  back: 3,
  frontGap: 4,
  doorHeightReduction: 24,
  doorWidthGap: 2,
  railWidth: 80,
  shelfInset: 15,
  shelfSpacingMin: 150,
  joinAllowance: 1,
  joinAllowanceFrom: 3,
  doubleDoorMin: 300,
  hingeMax2: 900,
  hingeMax3: 1600,
  drawerFrontMin: 140,
  drawerFrontGap: 3,
  drawerSlideClearance: 13,
  drawerBoxReduction: 45,
  drawerBoxLift: 22,
  drawerSlides: [250, 300, 350, 400, 450, 500, 550],
  drawersMax: 6,
  widthMin: 600,
  widthMax: 2780,
  heightMin: 300,
  heightMax: 2000,
  depthMin: 150,
  depthMax: 600,
  elementsMin: 1,
  elementsMax: 6,
  elementMin: 250,
};

const element = (width: number, front: Front, shelves: number) => ({
  width,
  front,
  shelves,
  doors: 1 as const,
  opening: 'auto' as const,
  drawers: 2,
});

const SIDEBOARD: ModelDef = {
  slug: 'sideboard-1',
  nameKey: 'sideboard',
  params: BASE,
  fronts: ['doors', 'open', 'drawers'],
  features: { doubleTop: true, back: true, handles: true },
  mountHeight: 400,
  defaults: {
    model: 'sideboard-1',
    width: 1650,
    height: 650,
    depth: 350,
    elements: [element(550, 'doors', 1), element(550, 'doors', 1), element(550, 'doors', 1)],
    bodyDecor: DEFAULT_BODY_DECOR,
    frontDecor: DEFAULT_FRONT_DECOR,
    back: true,
    doubleTop: false,
    openingType: 'handles',
    handleShape: 'bar128',
    handleFinish: 'grey',
  },
};

/** Second model: proves that a model is data only. Open wall shelving, no fronts. */
const SHELF: ModelDef = {
  slug: 'shelf-1',
  nameKey: 'shelf',
  params: { ...BASE, depthMax: 400, heightMax: 1200 },
  fronts: ['open'],
  features: { doubleTop: false, back: true, handles: false },
  mountHeight: 900,
  defaults: {
    model: 'shelf-1',
    width: 1200,
    height: 800,
    depth: 250,
    elements: [element(600, 'open', 2), element(600, 'open', 2)],
    bodyDecor: DEFAULT_BODY_DECOR,
    frontDecor: DEFAULT_BODY_DECOR,
    back: true,
    doubleTop: false,
    openingType: 'push',
    handleShape: 'bar128',
    handleFinish: 'grey',
  },
};

export const MODELS: ModelDef[] = [SIDEBOARD, SHELF];
export const DEFAULT_MODEL = SIDEBOARD.slug;

export function getModel(slug: string): ModelDef | undefined {
  return MODELS.find((m) => m.slug === slug);
}

export function requireModel(slug: string): ModelDef {
  const model = getModel(slug);
  if (!model) throw new Error(`Unknown model: ${slug}`);
  return model;
}
