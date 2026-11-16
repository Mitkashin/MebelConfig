import { BASE_PARAMS, PLINTH_HEIGHTS, PLINTH_SETBACKS, baseConfig, element, type ModelDef } from './base';

/** Sideboard standing on legs. The total height includes the legs. */
export const standingSideboard: ModelDef = {
  layout: 'row',
  slug: 'standing-sideboard-1',
  nameKey: 'standingSideboard',
  params: { ...BASE_PARAMS, heightMin: 450, heightMax: 1400 },
  fronts: ['doors', 'open', 'drawers'],
  mounts: ['legs', 'plinth'],
  legHeights: [100, 150, 200],
  plinthHeights: PLINTH_HEIGHTS,
  plinthSetbacks: PLINTH_SETBACKS,
  features: { doubleTop: true, back: true, handles: true, rail: false, shelfSetback: false, plinth: false, glass: false },
  wallHeight: 0,
  tags: ['size', 'elements', 'doors', 'legs'],
  defaults: baseConfig('standing-sideboard-1', {
    width: 1600,
    height: 800,
    depth: 400,
    mount: 'legs',
    elements: [element(600, 'doors'), element(400, 'open', { shelves: 2 }), element(600, 'doors')],
  }),
};
