import { BASE_PARAMS, baseConfig, element, type ModelDef } from './base';

/** Nightstand: small, with drawers and/or an open shelf, on legs or hung on the wall. */
export const nightstand: ModelDef = {
  slug: 'nightstand-1',
  nameKey: 'nightstand',
  params: { ...BASE_PARAMS, widthMin: 300, widthMax: 900, heightMin: 300, heightMax: 800, depthMin: 300, depthMax: 500, elementsMax: 2 },
  fronts: ['drawers', 'open', 'doors'],
  mounts: ['legs', 'wall'],
  legHeights: [100, 150, 200],
  features: { doubleTop: false, back: true, handles: true, rail: false },
  wallHeight: 300,
  tags: ['size', 'elements', 'drawers', 'legs'],
  defaults: baseConfig('nightstand-1', {
    width: 450,
    height: 550,
    depth: 400,
    mount: 'legs',
    legHeight: 150,
    handleShape: 'knob',
    elements: [element(450, 'drawers', { drawers: 2 })],
  }),
};
