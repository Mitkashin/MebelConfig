import { DEFAULT_BODY_DECOR } from '../catalog';
import { BASE_PARAMS, baseConfig, element, type ModelDef } from './base';

/** Wall-hung open sideboard: no fronts, so no door, drawer or handle controls. */
export const openSideboard: ModelDef = {
  layout: 'row',
  slug: 'open-sideboard-1',
  nameKey: 'openSideboard',
  params: { ...BASE_PARAMS, depthMax: 450, heightMax: 1400 },
  fronts: ['open'],
  mounts: ['wall'],
  legHeights: [],
  plinthHeights: [],
  plinthSetbacks: [],
  features: { doubleTop: true, back: true, handles: false, rail: false, shelfSetback: false, plinth: false, glass: false },
  wallHeight: 450,
  tags: ['size', 'elements', 'shelves'],
  defaults: baseConfig('open-sideboard-1', {
    width: 1650,
    height: 450,
    depth: 300,
    frontDecor: DEFAULT_BODY_DECOR,
    openingType: 'push',
    elements: [element(550, 'open'), element(550, 'open'), element(550, 'open')],
  }),
};
