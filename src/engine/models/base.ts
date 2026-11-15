import { DEFAULT_BODY_DECOR, DEFAULT_FRONT_DECOR } from '../catalog';
import type { Config, ElementConfig, Front, Mount } from '../types';

/** Construction parameters and limits of a model (mm). Every model owns a full set. */
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
  /** Clear hanging height kept under a clothes rail, and the pitch of the shelves above it. */
  hangingSpace: number;
  railShelfPitch: number;
  railDepthMin: number;
  widthMin: number;
  widthMax: number;
  heightMin: number;
  heightMax: number;
  depthMin: number;
  depthMax: number;
  elementsMin: number;
  elementsMax: number;
  elementMin: number;
  /** Widest single element; tall models need this so backs and doors still fit a sheet. */
  elementMax: number;
}

/**
 * A furniture type. Everything that differs between types lives here: its
 * limits, which fronts and mountings it offers, which optional controls it
 * shows, and its starting configuration. The UI shell and the 3D viewer read
 * this definition and need no changes when a model is added.
 */
export interface ModelDef {
  slug: string;
  /** Message key under `models.*` (name, description). */
  nameKey: string;
  params: ModelParams;
  fronts: Front[];
  mounts: Mount[];
  legHeights: number[];
  features: { doubleTop: boolean; back: boolean; handles: boolean; rail: boolean };
  /** Height of the underside above the floor when hung on the wall (3D scene only). */
  wallHeight: number;
  /** What the customer can adjust, as message keys under `home.tags.*`. */
  tags: string[];
  defaults: Config;
}

export const BASE_PARAMS: ModelParams = {
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
  hangingSpace: 900,
  railShelfPitch: 300,
  railDepthMin: 450,
  widthMin: 600,
  widthMax: 2780,
  heightMin: 300,
  heightMax: 2000,
  depthMin: 150,
  depthMax: 600,
  elementsMin: 1,
  elementsMax: 6,
  elementMin: 250,
  elementMax: 2780,
};

export function element(width: number, front: Front, patch: Partial<ElementConfig> = {}): ElementConfig {
  return { width, front, shelves: 1, doors: 1, opening: 'auto', drawers: 2, rail: false, ...patch };
}

/** Starting configuration; a model overrides only what differs. */
export function baseConfig(model: string, patch: Partial<Config> & Pick<Config, 'width' | 'height' | 'depth' | 'elements'>): Config {
  return {
    model,
    bodyDecor: DEFAULT_BODY_DECOR,
    frontDecor: DEFAULT_FRONT_DECOR,
    back: true,
    doubleTop: false,
    openingType: 'handles',
    handleShape: 'bar128',
    handleFinish: 'grey',
    mount: 'wall',
    legHeight: 150,
    legFinish: 'black',
    ...patch,
  };
}
