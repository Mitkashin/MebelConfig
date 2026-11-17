/** All lengths are integer millimetres. Origin: left-bottom-back corner; x right, y up, z front. */
export type Vec3 = [number, number, number];
export type Axis = 0 | 1 | 2;

export type Front = 'doors' | 'open' | 'drawers';
export type Opening = 'auto' | 'left' | 'right' | 'bottom';
export type Hinge = 'left' | 'right' | 'bottom';
export type OpeningType = 'handles' | 'push';
export type HandleShape = 'bar128' | 'bar320' | 'longBar' | 'knob' | 'shell' | 'edge' | 'topPull';
export type HandleFinish = 'grey' | 'black' | 'gold' | 'white' | 'brown' | 'graphite';
/** Which way a wardrobe compartment faces: forwards, or turned to open at the left or right end. */
export type Turn = 'front' | 'left' | 'right';
export type GlassFrame = 'black' | 'white';
export type GlassTint = 'clear' | 'light' | 'dark';

/** One compartment (carcass) in a wardrobe column, listed top to bottom. */
export interface CellConfig {
  /** Height of the compartment in mm, legs included for the bottom one. */
  height: number;
  front: Front;
  doors: 1 | 2;
  glass: boolean;
  opening: 'auto' | 'left' | 'right';
  shelves: number;
  /** Hanging rails: none, one, or two (one above the other). */
  rails: 0 | 1 | 2;
  drawers: number;
  turn: Turn;
}
/** How the piece is supported: hung on the wall, standing on legs, on a plinth (a recessed base frame of board), or directly on the floor. */
export type Mount = 'wall' | 'legs' | 'plinth' | 'floor';
/** Which way the decor pattern (wood grain) runs on a front. */
export type GrainDirection = 'vertical' | 'horizontal';

export interface ElementConfig {
  width: number;
  front: Front;
  shelves: number;
  doors: 1 | 2;
  opening: Opening;
  drawers: number;
  /** Hanging rail for clothes (models that offer it). */
  rail: boolean;
  /** Wardrobe compartments in this column, top to bottom; empty for row furniture. */
  cells: CellConfig[];
  /** True when this column's compartment heights differ from the shared rows. */
  ownRows: boolean;
}

export interface Config {
  model: string;
  width: number;
  height: number;
  depth: number;
  elements: ElementConfig[];
  bodyDecor: string;
  frontDecor: string;
  back: boolean;
  doubleTop: boolean;
  openingType: OpeningType;
  handleShape: HandleShape;
  handleFinish: HandleFinish;
  mount: Mount;
  /** Height of the base in mm: the legs when `mount` is `legs`, the plinth when it is `plinth`. The total height includes it. */
  legHeight: number;
  legFinish: HandleFinish;
  /** Wardrobes: shared row heights, top to bottom, adding up to the total height. Empty for row furniture. */
  rows: number[];
  /** How much shorter shelves are than the carcass depth (mm), so they clear the back. */
  shelfSetback: number;
  /** Wardrobes: panels covering the legs at the front and ends. */
  plinth: { front: boolean; left: boolean; right: boolean };
  /** How far the plinth base sits back from the front and the ends (mm), when `mount` is `plinth`. */
  plinthSetback: number;
  /** Pattern direction on door leaves and on drawer fronts. */
  frontGrain: { doors: GrainDirection; drawers: GrainDirection };
  glassFrame: GlassFrame;
  glassTint: GlassTint;
}

export type Role =
  | 'top'
  | 'bottom'
  | 'side'
  | 'rail'
  | 'shelf'
  | 'back'
  | 'door'
  | 'drawerFront'
  | 'drawerSide'
  | 'drawerInner'
  | 'drawerBottom'
  | 'plinth';

/** `glass` doors are bought ready-made in an aluminium frame: listed, not cut from sheets. */
export type Material = 'board' | 'hdf' | 'glass';
export type DecorSlot = 'body' | 'front';

/** l1/l2: the two edges running along `length` (low/high end of the width axis); w1/w2: the edges running along `width`. */
export interface Edges {
  l1: boolean;
  l2: boolean;
  w1: boolean;
  w2: boolean;
}

export interface Part {
  id: string;
  role: Role;
  /** Index of the element the part belongs to; null for parts shared by the whole piece. */
  element: number | null;
  material: Material;
  decorSlot: DecorSlot | null;
  /** Resolved decor id (null for HDF). */
  decor: string | null;
  /** Min corner and extent of the part's box. */
  position: Vec3;
  size: Vec3;
  /** `length` runs along the decor grain. */
  lengthAxis: Axis;
  widthAxis: Axis;
  thicknessAxis: Axis;
  length: number;
  width: number;
  thickness: number;
  edges: Edges;
  hinge?: Hinge;
  /** Number of hinges on a door (cup holes to drill on the hinged edge). */
  hinges?: number;
  /** Wardrobe compartment (index in its column, top first). */
  cell?: number;
  /** Fronts of compartments turned to open sideways. */
  facing?: 'left' | 'right';
  /** Parts sharing a group move together (a drawer box and its front). */
  group?: string;
}

export interface HandlePlacement {
  id: string;
  frontId: string;
  shape: HandleShape;
  position: Vec3;
  size: Vec3;
}

/** Bought-in fittings that are drawn in the 3D view but are not sheet parts. */
export interface Fitting {
  id: string;
  kind: 'leg' | 'rail';
  element: number | null;
  position: Vec3;
  size: Vec3;
}

export interface Issue {
  code:
    | 'range'
    | 'widthForElements'
    | 'sheetLimit'
    | 'elementMin'
    | 'elementMax'
    | 'elementsSum'
    | 'elementCount'
    | 'shelvesMax'
    | 'drawersMax'
    | 'doubleDoorMin'
    | 'drawersDepth'
    | 'railSpace'
    | 'rowMin'
    | 'rowsSum'
    | 'turn'
    | 'plinthLegs'
    | 'unsupported'
    | 'invalid';
  /** Dot path of the offending field, e.g. `width` or `elements.1.width`. */
  path: string;
  params: Record<string, number | string>;
}

export interface Notice {
  code: 'shelvesReduced' | 'drawersReduced' | 'doubleDoorsRemoved' | 'railRemoved' | 'restoredDefaults' | 'turnRemoved' | 'plinthRemoved';
  params: Record<string, number | string>;
}

export interface CutRow {
  key: string;
  no: number;
  role: Role;
  qty: number;
  length: number;
  width: number;
  thickness: number;
  material: Material;
  decor: string | null;
  grain: boolean;
  /** Canonical pattern: a panel can be flipped, so only the number of banded long and short edges matters. */
  edges: Edges;
  /** Hinge cup holes per piece (doors only). */
  hinges?: number;
  /** Edge banding for one piece, allowance included (mm). */
  bandingPerPiece: number;
  /** Elements (0-based) the row's parts belong to; empty for parts shared by the whole piece, such as the top. */
  elements: number[];
  partIds: string[];
}

export interface Stock {
  key: string;
  material: Material;
  thickness: number;
  decor: string | null;
  grain: boolean;
  sheetLength: number;
  sheetWidth: number;
  price: number;
}

export interface Placement {
  partId: string;
  /** Position on the sheet, trim included; x runs along the sheet length. */
  x: number;
  y: number;
  w: number;
  h: number;
  rotated: boolean;
}

export interface Sheet {
  stockKey: string;
  index: number;
  placements: Placement[];
  usedArea: number;
  utilisation: number;
}

export interface NestResult {
  stocks: Stock[];
  sheets: Sheet[];
  unplaced: string[];
  /** Total length of saw cuts (mm), trim cuts included. */
  cutLength: number;
}

export interface HardwareItem {
  key: string;
  /** Pieces, pairs, or metres for items sold by length. */
  qty: number;
  unit: 'pcs' | 'pair' | 'm';
  unitPrice: number;
  /** Supplier's product page the price comes from. */
  source?: string;
  /** Extra detail for the label: handle shape/finish or slide length. */
  detail?: Record<string, string | number>;
}

export interface PriceLine {
  key: string;
  kind: 'sheet' | 'banding' | 'cutting' | 'service' | 'hardware';
  qty: number;
  unit: 'sheet' | 'm' | 'pcs' | 'pair';
  unitPrice: number;
  total: number;
  detail?: Record<string, string | number>;
}

export interface Price {
  lines: PriceLine[];
  total: number;
  currency: string;
}

export interface Derived {
  parts: Part[];
  handles: HandlePlacement[];
  fittings: Fitting[];
  cutList: CutRow[];
  nest: NestResult;
  hardware: HardwareItem[];
  price: Price;
  /** Banded edge length (m), allowance included. */
  bandingMeters: number;
  sheetCount: number;
}
