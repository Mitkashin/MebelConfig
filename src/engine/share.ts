import { requireModel } from './models';
import { validate } from './rules';
import type { Config } from './types';

const VERSION = '1';

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

/** Compact, URL-safe form of a configuration for the `c` query parameter. */
export function encodeConfig(config: Config): string {
  const e = config.elements.map((el) => [el.width, el.front, el.shelves, el.doors, el.opening, el.drawers]);
  const payload = [
    config.model,
    config.width,
    config.height,
    config.depth,
    e,
    config.bodyDecor,
    config.frontDecor,
    +config.back,
    +config.doubleTop,
    config.openingType,
    config.handleShape,
    config.handleFinish,
  ];
  return `${VERSION}.${toBase64Url(JSON.stringify(payload))}`;
}

/** Decode and validate. Returns null for anything that is not a valid configuration. */
export function decodeConfig(value: string | null | undefined): Config | null {
  if (!value) return null;
  const [version, body] = value.split('.');
  if (version !== VERSION || !body) return null;
  try {
    const a = JSON.parse(fromBase64Url(body)) as unknown[];
    if (!Array.isArray(a) || !Array.isArray(a[4])) return null;
    const config = {
      model: a[0],
      width: a[1],
      height: a[2],
      depth: a[3],
      elements: (a[4] as unknown[][]).map((el) => ({ width: el[0], front: el[1], shelves: el[2], doors: el[3], opening: el[4], drawers: el[5] })),
      bodyDecor: a[5],
      frontDecor: a[6],
      back: a[7] === 1,
      doubleTop: a[8] === 1,
      openingType: a[9],
      handleShape: a[10],
      handleFinish: a[11],
    };
    return validate(config).length === 0 ? (config as Config) : null;
  } catch {
    return null;
  }
}

export function defaultConfig(slug: string): Config {
  return structuredClone(requireModel(slug).defaults);
}
