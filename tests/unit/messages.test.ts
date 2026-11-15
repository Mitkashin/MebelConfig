import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import mk from '../../messages/mk.json';
import { formatDate, formatNumber } from '@/lib/numbers';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((out, [key, value]) => {
    const id = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? { ...out, [id]: value } : { ...out, ...flatten(value, id) };
  }, {});
}

const E = flatten(en);
const M = flatten(mk);
const args = (text: string) => [...new Set([...text.matchAll(/\{(\w+)\s*[,}]/g)].map((m) => m[1]))].sort();

describe('message catalogues', () => {
  it('have the same keys in both languages', () => {
    expect(Object.keys(M).sort()).toEqual(Object.keys(E).sort());
  });

  it('use the same placeholders for every key', () => {
    for (const key of Object.keys(E)) expect(args(M[key]!), key).toEqual(args(E[key]!));
  });

  it('Macedonian texts are Cyrillic', () => {
    const latinOnly = ['brand', 'decorLabel', 'brands.egger', 'brands.kronospan', 'header.languages.en', 'steps.dimensions.summary', 'steps.colours.summary', 'steps.colours.categoryCount', 'steps.colours.selected', 'summary.handleValue', 'viewer.selected', 'results.stockName', 'results.sheets.dims', 'results.units.m', 'results.export.pdf', 'results.export.csv'];
    for (const [key, text] of Object.entries(M)) {
      if (latinOnly.includes(key) || (key.startsWith('units.') && key !== 'units.money.MKD')) continue;
      expect(/[Ѐ-ӿ]/.test(text), `${key}: ${text}`).toBe(true);
    }
  });

  it('contain no Serbian text', () => {
    // Letters that exist in Serbian but not in Macedonian or English, and words from the reference UI.
    const letters = /[čćđšžČĆĐŠŽђћЂЋ]/;
    const words = /\b(širina|visina|dubina|vrata|police|sačuvaj|generiši|komoda|korpus|podešavanja|rezultati|šarke|ručke|leđa)\b/i;
    for (const [key, text] of [...Object.entries(E), ...Object.entries(M)]) {
      expect(letters.test(text), `${key}: ${text}`).toBe(false);
      expect(words.test(text), `${key}: ${text}`).toBe(false);
    }
  });

  it('source files contain no Serbian text either', () => {
    const letters = /[čćđšžČĆĐŠŽђћЂЋ]/;
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
    for (const file of walk(path.resolve(import.meta.dirname, '../../src'))) {
      expect(letters.test(readFileSync(file, 'utf8')), file).toBe(false);
    }
  });
});

describe('number formatting', () => {
  it('follows each language', () => {
    expect(formatNumber(1650, 'mk')).toBe('1.650');
    expect(formatNumber(1650, 'en')).toBe('1,650');
    expect(formatNumber(165, 'mk', { min: 1, max: 1 })).toBe('165,0');
    expect(formatNumber(21.04, 'en', { min: 1, max: 2 })).toBe('21.04');
    expect(formatNumber(21.5, 'mk', { min: 1, max: 2 })).toBe('21,5');
    expect(formatNumber(25242, 'mk', { grouping: false })).toBe('25242');
    expect(formatDate(new Date(2026, 10, 15), 'mk')).toBe('15.11.2026');
    expect(formatDate(new Date(2026, 10, 15), 'en')).toBe('15 November 2026');
  });
});
