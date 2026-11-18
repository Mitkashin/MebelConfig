import { getModel, requireModel } from './models';
import { validate } from './rules';
import type { Config } from './types';

const VERSION = '3';

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

/** URL-safe form of a configuration for the `c` query parameter. */
export function encodeConfig(config: Config): string {
  return `${VERSION}.${toBase64Url(JSON.stringify(config))}`;
}

/** Decode and validate. Returns null for anything that is not a valid configuration. */
export function decodeConfig(value: string | null | undefined): Config | null {
  if (!value) return null;
  const [version, body] = value.split('.');
  // Versions 1 and 2 predate mounting, legs, rails and wardrobe compartments; those fields take the model's defaults.
  if (!body) return null;
  if (version === VERSION) {
    try {
      const parsed = JSON.parse(fromBase64Url(body)) as Partial<Config>;
      // Fields added later (plinth setback, front grain) take the model's defaults.
      const defaults = typeof parsed?.model === 'string' ? getModel(parsed.model)?.defaults : undefined;
      const config = defaults ? { ...structuredClone(defaults), ...parsed } : parsed;
      return validate(config).length === 0 ? (config as Config) : null;
    } catch {
      return null;
    }
  }
  if (version !== '2' && version !== '1') return null;
  try {
    const a = JSON.parse(fromBase64Url(body)) as unknown[];
    if (!Array.isArray(a) || !Array.isArray(a[4])) return null;
    const defaults = getModel(String(a[0]))?.defaults;
    if (!defaults) return null;
    const config = {
      model: a[0],
      width: a[1],
      height: a[2],
      depth: a[3],
      elements: (a[4] as unknown[][]).map((el) => ({ width: el[0], front: el[1], shelves: el[2], doors: el[3], opening: el[4], drawers: el[5], rail: el[6] === 1, cells: [], ownRows: false })),
      bodyDecor: a[5],
      frontDecor: a[6],
      back: a[7] === 1,
      doubleTop: a[8] === 1,
      openingType: a[9],
      handleShape: a[10],
      handleFinish: a[11],
      mount: a[12] ?? defaults.mount,
      legHeight: a[13] ?? defaults.legHeight,
      legFinish: a[14] ?? defaults.legFinish,
      rows: defaults.rows,
      shelfSetback: defaults.shelfSetback,
      plinth: defaults.plinth,
      plinthSetback: defaults.plinthSetback,
      frontGrain: defaults.frontGrain,
      quantity: 1,
      glassFrame: defaults.glassFrame,
      glassTint: defaults.glassTint,
    };
    return validate(config).length === 0 ? (config as unknown as Config) : null;
  } catch {
    return null;
  }
}

export function defaultConfig(slug: string): Config {
  return structuredClone(requireModel(slug).defaults);
}
