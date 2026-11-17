import { BASE_PARAMS, baseConfig, cell, element, type ModelDef } from './base';

/**
 * Wardrobe: columns of stacked compartments, each its own carcass. Each
 * compartment has doors (board or glass), drawers or none, shelves, up to
 * two hanging rails, and at the ends it can be turned to open sideways.
 */
export const wardrobe: ModelDef = {
  layout: 'grid',
  slug: 'wardrobe-1',
  nameKey: 'wardrobe',
  params: { ...BASE_PARAMS, widthMin: 300, widthMax: 3600, heightMin: 600, heightMax: 2780, depthMin: 300, depthMax: 700, elementMin: 300, elementMax: 1200, elementsMax: 6, doorWidthGap: 3, drawersMax: 4, drawerFrontMin: 120 },
  fronts: ['doors', 'drawers', 'open'],
  mounts: ['floor', 'legs'],
  legHeights: [50, 60, 100, 150, 200, 300],
  plinthHeights: [],
  plinthSetbacks: [],
  features: { doubleTop: false, back: true, handles: true, rail: true, shelfSetback: true, plinth: true, glass: true },
  wallHeight: 0,
  tags: ['size', 'columns', 'doors', 'rails'],
  defaults: baseConfig('wardrobe-1', {
    width: 1200,
    height: 2400,
    depth: 600,
    mount: 'legs',
    legHeight: 100,
    legFinish: 'graphite',
    handleShape: 'longBar',
    rows: [400, 1400, 600],
    elements: [
      element(400, 'doors', { cells: [cell(400, 'doors'), cell(1400, 'doors', { rails: 1 }), cell(600, 'drawers', { drawers: 2 })] }),
      element(400, 'doors', { cells: [cell(400, 'doors'), cell(1400, 'doors', { rails: 1 }), cell(600, 'drawers', { drawers: 2 })] }),
      element(400, 'doors', { cells: [cell(400, 'doors'), cell(1400, 'doors', { shelves: 4 }), cell(600, 'doors', { shelves: 1 })] }),
    ],
  }),
};
