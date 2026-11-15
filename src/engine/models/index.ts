import type { ModelDef } from './base';
import { drawerSideboard } from './drawerSideboard';
import { nightstand } from './nightstand';
import { openSideboard } from './openSideboard';
import { sideboard } from './sideboard';
import { standingSideboard } from './standingSideboard';
import { wallCabinet } from './wallCabinet';
import { wardrobe } from './wardrobe';

export type { ModelDef, ModelParams } from './base';

/** The catalogue, in the order shown on the chooser. Register a new model here. */
export const MODELS: ModelDef[] = [sideboard, openSideboard, standingSideboard, drawerSideboard, wardrobe, nightstand, wallCabinet];
export const DEFAULT_MODEL = sideboard.slug;

export function getModel(slug: string): ModelDef | undefined {
  return MODELS.find((m) => m.slug === slug);
}

export function requireModel(slug: string): ModelDef {
  const model = getModel(slug);
  if (!model) throw new Error(`Unknown model: ${slug}`);
  return model;
}
