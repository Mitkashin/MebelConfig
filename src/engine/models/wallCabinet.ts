import { BASE_PARAMS, baseConfig, element, type ModelDef } from './base';

/** Wall cabinet: shallow, hung high, one or two doors per element. */
export const wallCabinet: ModelDef = {
  layout: 'row',
  slug: 'wall-cabinet-1',
  nameKey: 'wallCabinet',
  params: { ...BASE_PARAMS, widthMin: 300, widthMax: 1800, heightMin: 300, heightMax: 1200, depthMin: 150, depthMax: 400, elementsMax: 4 },
  fronts: ['doors', 'open'],
  mounts: ['wall'],
  legHeights: [],
  plinthHeights: [],
  plinthSetbacks: [],
  features: { doubleTop: false, back: true, handles: true, rail: false, shelfSetback: false, plinth: false, glass: false },
  wallHeight: 1350,
  tags: ['size', 'elements', 'doors', 'shelves'],
  defaults: baseConfig('wall-cabinet-1', {
    width: 800,
    height: 720,
    depth: 320,
    elements: [element(800, 'doors', { doors: 2, shelves: 2 })],
  }),
};
