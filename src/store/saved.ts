import { decodeConfig, encodeConfig } from '@/engine/share';
import type { Config } from '@/engine/types';

const KEY = 'configurator:saved:v1';
const UNIT_KEY = 'configurator:unit';

export interface SavedDesign {
  id: string;
  name: string;
  code: string;
  savedAt: number;
}

function read(): SavedDesign[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? '[]') as SavedDesign[];
    return Array.isArray(raw) ? raw.filter((d) => d && typeof d.code === 'string' && decodeConfig(d.code)) : [];
  } catch {
    return [];
  }
}

function write(list: SavedDesign[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    // Storage can be unavailable (private mode); saving is a convenience only.
  }
}

export const listSaved = read;

export function saveDesign(name: string, config: Config): SavedDesign[] {
  const list = [{ id: `${Date.now()}`, name: name.trim().slice(0, 80), code: encodeConfig(config), savedAt: Date.now() }, ...read()];
  write(list);
  return list;
}

export function removeSaved(id: string): SavedDesign[] {
  const list = read().filter((d) => d.id !== id);
  write(list);
  return list;
}

export function readUnit(): 'cm' | 'mm' | null {
  try {
    const v = window.localStorage.getItem(UNIT_KEY);
    return v === 'cm' || v === 'mm' ? v : null;
  } catch {
    return null;
  }
}

export function writeUnit(unit: 'cm' | 'mm') {
  try {
    window.localStorage.setItem(UNIT_KEY, unit);
  } catch {
    // ignore
  }
}
