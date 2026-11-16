import { BASE_PARAMS, baseConfig, element, type ModelDef } from './base';

/** Wall-hung sideboard with doors: the reference model, matched to its generated cut list. */
export const sideboard: ModelDef = {
  layout: 'row',
  slug: 'sideboard-1',
  nameKey: 'sideboard',
  params: BASE_PARAMS,
  fronts: ['doors', 'open', 'drawers'],
  mounts: ['wall'],
  legHeights: [],
  plinthHeights: [],
  plinthSetbacks: [],
  features: { doubleTop: true, back: true, handles: true, rail: false, shelfSetback: false, plinth: false, glass: false },
  wallHeight: 400,
  tags: ['size', 'elements', 'doors'],
  defaults: baseConfig('sideboard-1', {
    width: 1650,
    height: 650,
    depth: 350,
    elements: [element(550, 'doors'), element(550, 'doors'), element(550, 'doors')],
  }),
};
