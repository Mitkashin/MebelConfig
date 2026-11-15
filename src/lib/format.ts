'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';
import { CURRENCY, getDecor } from '@/engine/catalog';
import type { CutRow, Issue } from '@/engine/types';
import { useConfigurator, type Unit } from '@/store/configurator';
import { formatNumber } from './numbers';

/** Colours that tie a cut-list row to its parts in the 3D view and on the sheet diagrams. */
export const ROW_COLORS = ['#1f6f8b', '#b3541e', '#3b7d4f', '#7a4fa3', '#a8323c', '#4a5fa8', '#8a6d1c', '#2d7f7a', '#9c4a7c', '#5c6b3a'];
export const rowColor = (no: number) => ROW_COLORS[(no - 1) % ROW_COLORS.length] as string;

/** Parse what a customer typed into a length field. Accepts comma or dot decimals. Returns millimetres or null. */
export function parseLength(text: string, unit: Unit): number | null {
  const cleaned = text.trim().replace(/\s/g, '').replace(',', '.');
  if (cleaned === '' || !/^\d*\.?\d+$|^\d+\.$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(unit === 'cm' ? value * 10 : value);
}

/** Locale-aware formatting of lengths, money and the catalogue names. */
export function useFormat() {
  const locale = useLocale();
  const number = useCallback((value: number, options?: { min?: number; max?: number; grouping?: boolean }) => formatNumber(value, locale, options), [locale]);
  const t = useTranslations();
  const unit = useConfigurator((s) => s.unit);

  /** Bare number in the active unit, for inputs. */
  const lengthValue = useCallback(
    (mm: number) =>
      unit === 'cm'
        ? number(mm / 10, { min: 1, max: 1, grouping: false })
        : number(mm, { grouping: false }),
    [number, unit],
  );

  const length = useCallback(
    (mm: number) =>
      unit === 'cm'
        ? t('units.cmValue', { value: number(mm / 10, { min: 1, max: 1 }) })
        : t('units.mmValue', { value: number(mm) }),
    [number, t, unit],
  );

  const mm = useCallback((value: number) => t('units.mmValue', { value: number(value) }), [number, t]);
  const meters = useCallback((value: number) => t('units.mValue', { value: number(value, { min: 1, max: 2 }) }), [number, t]);
  const money = useCallback((value: number) => t(`units.money.${CURRENCY}` as 'units.money.MKD', { value: number(Math.round(value)) }), [number, t]);
  const percent = useCallback((value: number) => t('units.percent', { value: number(Math.round(value * 100)) }), [number, t]);
  const count = useCallback((value: number) => number(value, { max: 2 }), [number]);

  const decorName = useCallback(
    (id: string | null) => {
      if (!id) return t('materials.hdf');
      const decor = getDecor(id);
      return decor ? t('decorLabel', { brand: t(`brands.${decor.brand}`), code: decor.code }) : id;
    },
    [t],
  );

  const decorShort = useCallback((id: string) => { const d = getDecor(id); return d ? t(`brands.${d.brand}`) : ''; }, [t]);

  const material = useCallback(
    (row: Pick<CutRow, 'material' | 'decor'>) => (row.material === 'hdf' ? t('materials.hdf') : row.material === 'glass' ? t('materials.glass') : decorName(row.decor)),
    [t, decorName],
  );

  /** Turn an engine issue into a sentence that states the limit and the allowed range. */
  const issueText = useCallback(
    (issue: Issue, field?: string) => {
      const p = issue.params;
      const len = (v: unknown) => length(Number(v));
      switch (issue.code) {
        case 'range':
          return t('issues.range', { field: field ?? '', min: len(p.min), max: len(p.max) });
        case 'sheetLimit':
          return t('issues.sheetLimit', { max: len(p.max) });
        case 'widthForElements':
          return t('issues.widthForElements', { count: Number(p.count), min: len(p.min), max: len(p.max) });
        case 'elementMin':
          return t('issues.elementMin', { min: len(p.min), max: len(p.max) });
        case 'elementMax':
          return t('issues.elementMax', { max: len(p.max) });
        case 'railSpace':
          return t('issues.railSpace', { height: len(p.height), depth: len(p.depth) });
        case 'rowMin':
          return t('issues.rowMin', { min: len(p.min) });
        case 'rowsSum':
          return t('issues.rowsSum', { height: len(p.height) });
        case 'turn':
          return t('issues.turn');
        case 'plinthLegs':
          return t('issues.plinthLegs');
        case 'elementCount':
          return t('issues.elementCount', { min: Number(p.min), max: Number(p.max) });
        case 'shelvesMax':
          return t('issues.shelvesMax', { max: Number(p.max), spacing: len(p.spacing) });
        case 'drawersMax':
          return t('issues.drawersMax', { max: Number(p.max), min: len(p.min) });
        case 'doubleDoorMin':
          return t('issues.doubleDoorMin', { min: len(p.min) });
        case 'drawersDepth':
          return t('issues.drawersDepth', { min: len(p.min), max: len(p.max) });
        default:
          return t('issues.invalid');
      }
    },
    [t, length],
  );

  return useMemo(
    () => ({ unit, length, lengthValue, mm, meters, money, percent, count, decorName, decorShort, material, issueText }),
    [unit, length, lengthValue, mm, meters, money, percent, count, decorName, decorShort, material, issueText],
  );
}
