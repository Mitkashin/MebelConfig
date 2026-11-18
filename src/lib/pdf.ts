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
  /** Page 1: the assembled piece with its sizes (oblique view, then front and side views). */
  unit: { title: string; svgs: string[] };
  /** Page 2: exploded wireframe with the cut-list numbers. */
  exploded: { title: string; note: string; svg: string };
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
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} ${W}" width="${Math.round((520 * L) / stock.sheetLength)}" height="${Math.round((520 * W) / stock.sheetLength)}" style="width:${Math.round((1000 * L) / stock.sheetLength) / 10}%">` +
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
      // 1. The piece and its sizes.
      { text: input.title, fontSize: 18, bold: true },
      { text: input.subtitle, color: '#555555', margin: [0, 2, 0, 10] },
      { columns: [{ width: '*', table: { widths: ['auto', '*'], body: input.meta.map(([k, v]) => [{ text: k, color: '#555555' }, v]) }, layout: 'noBorders' }] },
      heading(input.unit.title),
      ...input.unit.svgs.map((svg, i) => ({ svg, fit: [523, i === 0 ? 300 : 210], alignment: 'center', margin: [0, 4, 0, 4] })),
      // 2. Exploded view with the part numbers.
      { ...heading(input.exploded.title), pageBreak: 'before' },
      { text: input.exploded.note, color: '#555555', fontSize: 9, margin: [0, 0, 0, 6] },
      { svg: input.exploded.svg, fit: [523, 700], alignment: 'center' },
      // 3. Cut list.
      { ...heading(input.cutList.title), pageBreak: 'before' },
      table(input.cutList),
      // 4. Sheets.
      { ...heading(input.sheets.title), pageBreak: 'before' },
      { text: input.sheets.note, color: '#555555', fontSize: 9, margin: [0, 0, 0, 6] },
      ...input.sheets.items.map((item) => ({ unbreakable: true, stack: [{ text: item.caption, fontSize: 9, margin: [0, 6, 0, 3] }, { svg: item.svg }] })),
      // 5. Price.
      { ...heading(input.price.title), pageBreak: 'before' },
      table(input.price),
      { columns: [{ text: input.price.total[0], bold: true, fontSize: 12 }, { text: input.price.total[1], bold: true, fontSize: 12, alignment: 'right' }], margin: [0, 8, 0, 4] },
      { text: input.price.disclaimer, color: '#555555', fontSize: 8 },
      // 6. Hardware.
      { ...heading(input.hardware.title), pageBreak: 'before' },
      table(input.hardware),
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

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function htmlTable(t: PdfTable): string {
  const numeric = new Set(t.numeric ?? []);
  const cell = (tag: 'th' | 'td', text: string, i: number) => `<${tag}${numeric.has(i) ? ' class="num"' : ''}>${esc(text)}</${tag}>`;
  return `<table><thead><tr>${t.head.map((h, i) => cell('th', h, i)).join('')}</tr></thead><tbody>${t.rows.map((row) => `<tr>${row.map((c, i) => cell('td', c, i)).join('')}</tr>`).join('')}</tbody></table>`;
}

/**
 * The printable document: the same content and order as the PDF, as one
 * self-contained HTML page with a page break before each section.
 */
export function printHtml(input: PdfInput, lang: string): string {
  const section = (title: string, body: string, first = false) => `<section class="${first ? 'first' : ''}"><h2>${esc(title)}</h2>${body}</section>`;
  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><title>${esc(input.title)}</title><style>
@page { size: A4; margin: 14mm 12mm 16mm; }
* { box-sizing: border-box; }
body { font: 10pt/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1b2422; margin: 0; }
h1 { font-size: 18pt; margin: 0; }
h2 { font-size: 13pt; margin: 0 0 6pt; }
.sub, .note { color: #555; }
.note { font-size: 9pt; margin: 0 0 6pt; }
section { break-before: page; page-break-before: always; padding-top: 2pt; }
section.first { break-before: auto; page-break-before: auto; }
dl { display: grid; grid-template-columns: auto 1fr; gap: 2pt 14pt; margin: 8pt 0 10pt; }
dt { color: #555; }
dd { margin: 0; }
.drawing { display: flex; justify-content: center; margin: 6pt 0; }
.drawing svg { width: auto; height: auto; max-width: 100%; max-height: 66mm; }
.drawing.main svg { max-height: 105mm; }
.drawing.exploded svg { width: 100%; max-height: 235mm; }
table { width: 100%; border-collapse: collapse; font-size: 9pt; }
th, td { text-align: left; padding: 3pt 5pt; border-bottom: 0.5pt solid #ccc; vertical-align: top; }
th { border-bottom: 1pt solid #1b2422; }
.num { text-align: right; white-space: nowrap; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
.sheet { break-inside: avoid; margin: 6pt 0 10pt; }
.sheet p { font-size: 9pt; margin: 0 0 3pt; }
.sheet svg { max-width: 100%; height: auto; }
.total { display: flex; justify-content: space-between; font-weight: 700; font-size: 12pt; margin: 8pt 0 4pt; }
.disclaimer { color: #555; font-size: 8pt; }
.link { font-size: 8pt; color: #0f6b5c; word-break: break-all; }
</style></head><body>
<section class="first"><h1>${esc(input.title)}</h1><p class="sub">${esc(input.subtitle)}</p><dl>${input.meta.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl><h2>${esc(input.unit.title)}</h2>${input.unit.svgs.map((svg, i) => `<div class="drawing${i === 0 ? ' main' : ''}">${svg}</div>`).join('')}</section>
${section(input.exploded.title, `<p class="note">${esc(input.exploded.note)}</p><div class="drawing exploded">${input.exploded.svg}</div>`)}
${section(input.cutList.title, htmlTable(input.cutList))}
${section(input.sheets.title, `<p class="note">${esc(input.sheets.note)}</p>${input.sheets.items.map((item) => `<div class="sheet"><p>${esc(item.caption)}</p>${item.svg}</div>`).join('')}`)}
${section(input.price.title, `${htmlTable(input.price)}<div class="total"><span>${esc(input.price.total[0])}</span><span>${esc(input.price.total[1])}</span></div><p class="disclaimer">${esc(input.price.disclaimer)}</p>`)}
${section(input.hardware.title, `${htmlTable(input.hardware)}<p class="note" style="margin-top:12pt">${esc(input.link.label)}</p><p class="link">${esc(input.link.url)}</p>`)}
</body></html>`;
}
