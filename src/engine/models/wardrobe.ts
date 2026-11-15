import { BASE_PARAMS, baseConfig, element, type ModelDef } from './base';

/** Wardrobe: tall, floor-standing columns with doors, shelves and optional hanging rails. */
export const wardrobe: ModelDef = {
  slug: 'wardrobe-1',
  nameKey: 'wardrobe',
  params: { ...BASE_PARAMS, widthMin: 400, heightMin: 1600, heightMax: 2400, depthMin: 350, depthMax: 650, elementMin: 400, elementMax: 1200, elementsMax: 6 },
  fronts: ['doors', 'open'],
  mounts: ['floor'],
  legHeights: [],
  features: { doubleTop: false, back: true, handles: true, rail: true },
  wallHeight: 0,
  tags: ['size', 'columns', 'doors', 'rails'],
  defaults: baseConfig('wardrobe-1', {
    width: 2000,
    height: 2200,
    depth: 580,
    mount: 'floor',
    handleShape: 'bar320',
    elements: [
      element(500, 'doors', { shelves: 1, rail: true }),
      element(500, 'doors', { shelves: 1, rail: true }),
      element(500, 'doors', { shelves: 5 }),
      element(500, 'doors', { shelves: 5 }),
    ],
  }),
};
