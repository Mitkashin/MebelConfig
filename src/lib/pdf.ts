import type { Placement, Sheet, Stock } from '@/engine/types';
import { rowColor } from './format';

export interface PdfTable {
  title: string;
  head: string[];
  rows: string[][];
  /** Column indexes that should be right-aligned. */
  numeric?: number[];
}

export interface PdfInput {
  fileName: string;
  title: string;
  subtitle: string;
  meta: [string, string][];
  cutList: PdfTable;
  sheets: { title: string; note: string; items: { caption: string; svg: string }[] };
  hardware: PdfTable;
  price: PdfTable & { total: [string, string]; disclaimer: string };
  link: { label: string; url: string };
}

/** Sheet layout as a standalone SVG string (used for the PDF; the page renders the same data as JSX). */
export function sheetSvg(sheet: Sheet, stock: Stock, rowNoByPart: Record<string, number>, trim: number): string {
  const L = sheet.length;
  const W = sheet.width;
  const rect = (pl: Placement) => {
    const no = rowNoByPart[pl.partId] ?? 0;
    const size = Math.max(28, Math.min(70, Math.min(pl.w, pl.h) * 0.45));
    return (
      `<rect x="${pl.x}" y="${pl.y}" width="${pl.w}" height="${pl.h}" fill="${rowColor(no)}" fill-opacity="0.82" stroke="#ffffff" stroke-width="3"/>` +
      `<text x="${pl.x + pl.w / 2}" y="${pl.y + pl.h / 2 + size * 0.35}" font-size="${size}" text-anchor="middle" fill="#ffffff">${no}</text>`
    );
  };
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} ${W}" width="${Math.round((520 * L) / stock.sheetLength)}" height="${Math.round((520 * W) / stock.sheetLength)}">` +
    `<rect x="0" y="0" width="${L}" height="${W}" fill="#f4f1e8" stroke="#8a8f8c" stroke-width="6"/>` +
    `<rect x="${trim}" y="${trim}" width="${L - 2 * trim}" height="${W - 2 * trim}" fill="none" stroke="#8a8f8c" stroke-width="3" stroke-dasharray="24 16"/>` +
    sheet.placements.map(rect).join('') +
    `</svg>`
  );
}

interface PdfMakeLike {
  addVirtualFileSystem: (vfs: unknown) => void;
  createPdf: (definition: unknown) => { getBlob: () => Promise<Blob> };
}

function table(t: PdfTable) {
  const numeric = new Set(t.numeric ?? []);
  const cell = (text: string, i: number, bold = false) => ({ text, bold, alignment: numeric.has(i) ? 'right' : 'left' });
  return {
    table: { headerRows: 1, widths: t.head.map((_, i) => (i === 1 ? '*' : 'auto')), body: [t.head.map((h, i) => cell(h, i, true)), ...t.rows.map((r) => r.map((c, i) => cell(c, i)))] },
    layout: 'lightHorizontalLines',
    fontSize: 9,
  };
}

/** Build the PDF in the browser. pdfmake and its fonts (Roboto, which covers Cyrillic) load only when called. */
export async function createPdfBlob(input: PdfInput): Promise<Blob> {
  const [{ default: pdfMakeModule }, fonts] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')]);
  const pdfMake = pdfMakeModule as unknown as PdfMakeLike;
  pdfMake.addVirtualFileSystem((fonts as { default?: unknown }).default ?? fonts);

  const heading = (text: string) => ({ text, fontSize: 13, bold: true, margin: [0, 16, 0, 6] });
  const definition = {
    pageSize: 'A4',
    pageMargins: [36, 40, 36, 44],
    defaultStyle: { font: 'Roboto', fontSize: 10 },
    footer: (page: number, pages: number) => ({ text: `${input.title} · ${page} / ${pages}`, alignment: 'center', fontSize: 8, color: '#666666', margin: [0, 16, 0, 0] }),
    content: [
      { text: input.title, fontSize: 18, bold: true },
      { text: input.subtitle, color: '#555555', margin: [0, 2, 0, 10] },
      { columns: [{ width: '*', table: { widths: ['auto', '*'], body: input.meta.map(([k, v]) => [{ text: k, color: '#555555' }, v]) }, layout: 'noBorders' }] },
      heading(input.cutList.title),
      table(input.cutList),
      heading(input.sheets.title),
      { text: input.sheets.note, color: '#555555', fontSize: 9, margin: [0, 0, 0, 6] },
      ...input.sheets.items.map((item) => ({ unbreakable: true, stack: [{ text: item.caption, fontSize: 9, margin: [0, 6, 0, 3] }, { svg: item.svg }] })),
      heading(input.hardware.title),
      table(input.hardware),
      heading(input.price.title),
      table(input.price),
      { columns: [{ text: input.price.total[0], bold: true, fontSize: 12 }, { text: input.price.total[1], bold: true, fontSize: 12, alignment: 'right' }], margin: [0, 8, 0, 4] },
      { text: input.price.disclaimer, color: '#555555', fontSize: 8 },
      { text: input.link.label, margin: [0, 14, 0, 2], fontSize: 9, color: '#555555' },
      { text: input.link.url, link: input.link.url, fontSize: 8, color: '#0f6b5c' },
    ],
  };
  return pdfMake.createPdf(definition).getBlob();
}

export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
