import { BASE_PARAMS, baseConfig, element, type ModelDef } from './base';

/** Chest of drawers: drawers by default, on legs or hung on the wall. Deep enough for full-length slides. */
export const drawerSideboard: ModelDef = {
  slug: 'drawer-sideboard-1',
  nameKey: 'drawerSideboard',
  params: { ...BASE_PARAMS, heightMin: 400, heightMax: 1400, depthMin: 300 },
  fronts: ['drawers', 'doors', 'open'],
  mounts: ['legs', 'wall'],
  legHeights: [100, 150, 200],
  features: { doubleTop: true, back: true, handles: true, rail: false },
  wallHeight: 300,
  tags: ['size', 'elements', 'drawers', 'legs'],
  defaults: baseConfig('drawer-sideboard-1', {
    width: 1200,
    height: 850,
    depth: 450,
    mount: 'legs',
    legHeight: 100,
    elements: [element(600, 'drawers', { drawers: 3 }), element(600, 'drawers', { drawers: 3 })],
  }),
};
