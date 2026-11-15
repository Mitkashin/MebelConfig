'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { RATES, SHEET } from '@/engine/catalog';
import { cutListCsv } from '@/engine/cutlist';
import type { PriceOverrides } from '@/engine/derive';
import { requireModel } from '@/engine/models';
import { encodeConfig } from '@/engine/share';
import type { CutRow, HardwareItem, PriceLine, Sheet, Stock } from '@/engine/types';
import { rowColor, useFormat } from '@/lib/format';
import { formatDate } from '@/lib/numbers';
import { createPdfBlob, saveBlob, sheetSvg, type PdfInput } from '@/lib/pdf';
import { useConfigurator } from '@/store/configurator';
import { cx } from '../ui/controls';

type ResultTab = 'parts' | 'sheets' | 'price' | 'hardware';
const TABS: ResultTab[] = ['parts', 'sheets', 'price', 'hardware'];

const actionButton = 'rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:border-accent hover:text-accent disabled:opacity-50';
const th = 'px-2 py-2 text-left text-xs font-semibold tracking-wide text-muted uppercase';
const td = 'px-2 py-2 align-top text-sm';

/** Shared label builders, so the page, the CSV and the PDF say the same thing. */
function useLabels() {
  const t = useTranslations('results');
  const tp = useTranslations('parts');
  const thw = useTranslations('hardware');
  const ts = useTranslations('steps.details');
  const f = useFormat();

  const banding = (row: Pick<CutRow, 'edges'>) => {
    const long = Number(row.edges.l1) + Number(row.edges.l2);
    const short = Number(row.edges.w1) + Number(row.edges.w2);
    if (long + short === 0) return '–';
    if (long + short === 4) return t('parts.bandAll');
    return [long ? t('parts.bandLong', { count: long }) : '', short ? t('parts.bandShort', { count: short }) : ''].filter(Boolean).join(' + ');
  };
  const note = (row: CutRow) => [row.hinges ? t('parts.noteHinges', { count: row.hinges }) : '', row.grain ? t('parts.noteGrain') : ''].filter(Boolean).join(' · ');
  const hardwareName = (item: Pick<HardwareItem, 'key' | 'detail'>) => {
    const key = item.key.replace('hardware:', '');
    if (key === 'handle' && item.detail) {
      return thw('handleDetail', { shape: ts(`shapes.${item.detail.shape}` as 'shapes.bar128'), finish: ts(`finishes.${item.detail.finish}` as 'finishes.grey') });
    }
    if (key === 'leg' && item.detail) return thw('legDetail', { height: f.mm(Number(item.detail.height)), finish: ts(`finishes.${item.detail.finish}` as 'finishes.grey') });
    if (key === 'drawerSlide' && item.detail) return thw('drawerSlideDetail', { length: f.mm(Number(item.detail.length)) });
    return thw(`items.${key}` as 'items.hinge');
  };
  const unit = (u: PriceLine['unit'], qty: number) => (u === 'm' ? f.meters(qty) : t(`units.${u}`, { count: qty }));
  const stockName = (stock: Pick<Stock, 'material' | 'decor' | 'thickness'>) => t('stockName', { name: f.material(stock), thickness: f.mm(stock.thickness) });
  const lineName = (line: PriceLine) => {
    if (line.kind === 'sheet') return stockName({ material: line.detail?.material === 'hdf' ? 'hdf' : 'board', decor: String(line.detail?.decor ?? '') || null, thickness: Number(line.detail?.thickness) });
    if (line.kind === 'banding') return t('price.banding');
    if (line.kind === 'cutting') return t('price.cutting');
    return hardwareName(line);
  };
  return { t, tp, f, banding, note, hardwareName, unit, stockName, lineName };
}

function EdgeIcon({ row }: { row: CutRow }) {
  const on = '#0f6b5c';
  const off = '#c9c6bd';
  const e = row.edges;
  return (
    <svg viewBox="0 0 34 22" className="h-5 w-8 shrink-0" aria-hidden="true">
      <rect x="4" y="4" width="26" height="14" fill="#f3f2ee" />
      <line x1="4" y1="4" x2="30" y2="4" stroke={e.l2 ? on : off} strokeWidth={e.l2 ? 3 : 1} />
      <line x1="4" y1="18" x2="30" y2="18" stroke={e.l1 ? on : off} strokeWidth={e.l1 ? 3 : 1} />
      <line x1="4" y1="4" x2="4" y2="18" stroke={e.w1 ? on : off} strokeWidth={e.w1 ? 3 : 1} />
      <line x1="30" y1="4" x2="30" y2="18" stroke={e.w2 ? on : off} strokeWidth={e.w2 ? 3 : 1} />
    </svg>
  );
}

function PartsTable() {
  const { t, tp, f, banding, note } = useLabels();
  const rows = useConfigurator((s) => s.derived.cutList);
  const selected = useConfigurator((s) => s.selected);
  const select = useConfigurator((s) => s.select);
  const body = useRef<HTMLTableSectionElement>(null);
  const active = rows.find((r) => selected.length > 0 && r.partIds.includes(selected[0] as string));

  useEffect(() => {
    if (active) body.current?.querySelector(`[data-row="${active.no}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [active]);

  return (
    <div className="grid gap-2">
      <p className="text-sm text-muted">{t('parts.hint')}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse" data-testid="cut-list">
          <thead>
            <tr className="border-b border-line">
              {(['no', 'part', 'qty', 'length', 'width', 'thickness', 'material', 'banding', 'note'] as const).map((c) => (
                <th key={c} scope="col" className={cx(th, ['qty', 'length', 'width', 'thickness'].includes(c) && 'text-right')}>
                  {t(`parts.cols.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody ref={body}>
            {rows.map((row) => {
              const isActive = active?.key === row.key;
              // A row whose parts are all lit clears on click; a row with one part lit (picked in 3D) lights the rest.
              const allLit = isActive && row.partIds.every((id) => selected.includes(id));
              return (
                <tr
                  key={row.key}
                  data-row={row.no}
                  data-active={isActive ? '1' : '0'}
                  tabIndex={0}
                  aria-selected={isActive}
                  className={cx('cursor-pointer border-b border-line/70 outline-offset-[-2px] hover:bg-paper', isActive && 'bg-accent-soft')}
                  onClick={() => select(allLit ? [] : row.partIds)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      select(allLit ? [] : row.partIds);
                    }
                  }}
                >
                  <td className={td}>
                    <span className="grid size-6 place-items-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: rowColor(row.no) }}>
                      {row.no}
                    </span>
                  </td>
                  <td className={cx(td, 'font-medium')}>{tp(row.role)}</td>
                  <td className={cx(td, 'text-right tabular-nums')}>{row.qty}</td>
                  <td className={cx(td, 'text-right tabular-nums')}>{f.length(row.length)}</td>
                  <td className={cx(td, 'text-right tabular-nums')}>{f.length(row.width)}</td>
                  <td className={cx(td, 'text-right tabular-nums')}>{f.mm(row.thickness)}</td>
                  <td className={td}>{f.material(row)}</td>
                  <td className={td}>
                    <span className="flex items-center gap-1.5">
                      <EdgeIcon row={row} />
                      {banding(row)}
                    </span>
                  </td>
                  <td className={cx(td, 'text-muted')}>{note(row) || '–'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">{t('parts.lengthNote')}</p>
    </div>
  );
}

function SheetDiagram({ sheet, stock, rowNoByPart }: { sheet: Sheet; stock: Stock; rowNoByPart: Record<string, number> }) {
  const { t, f } = useLabels();
  const selected = useConfigurator((s) => s.selected);
  const rows = useConfigurator((s) => s.derived.cutList);
  const select = useConfigurator((s) => s.select);
  const L = stock.sheetLength;
  const W = stock.sheetWidth;
  return (
    <figure className="grid gap-1.5" data-testid="sheet">
      <figcaption className="text-sm">{t('sheets.caption', { n: sheet.index + 1, used: f.percent(sheet.utilisation), parts: sheet.placements.length })}</figcaption>
      <svg viewBox={`0 0 ${L} ${W}`} className="w-full rounded-lg border border-line bg-[#f4f1e8]" role="img" aria-label={t('sheets.aria', { n: sheet.index + 1, parts: sheet.placements.length })}>
        <rect x={SHEET.trim} y={SHEET.trim} width={L - 2 * SHEET.trim} height={W - 2 * SHEET.trim} fill="none" stroke="#8a8f8c" strokeWidth="3" strokeDasharray="24 16" />
        {sheet.placements.map((pl) => {
          const no = rowNoByPart[pl.partId] ?? 0;
          const row = rows.find((r) => r.no === no);
          const on = selected.includes(pl.partId);
          const size = Math.max(30, Math.min(72, Math.min(pl.w, pl.h) * 0.42));
          const dims = pl.w > 330 && pl.h > 150;
          return (
            <g key={pl.partId} className="cursor-pointer" onClick={() => select(row ? row.partIds : [pl.partId])}>
              <rect x={pl.x} y={pl.y} width={pl.w} height={pl.h} fill={rowColor(no)} fillOpacity={on ? 1 : 0.8} stroke={on ? '#1b2422' : '#ffffff'} strokeWidth={on ? 10 : 3} />
              <text x={pl.x + pl.w / 2} y={pl.y + pl.h / 2 + (dims ? 0 : size * 0.35)} fontSize={size} fontWeight="700" textAnchor="middle" fill="#ffffff">
                {no}
              </text>
              {dims && (
                <text x={pl.x + pl.w / 2} y={pl.y + pl.h / 2 + 48} fontSize="34" textAnchor="middle" fill="#ffffff">
                  {t('sheets.dims', { w: pl.w, h: pl.h })}
                </text>
              )}
            </g>
          );
        })}
        {stock.grain && (
          <g stroke="#1b2422" strokeWidth="6" fill="none" opacity="0.55">
            <line x1={L - 420} y1={W - 70} x2={L - 80} y2={W - 70} />
            <path d={`M ${L - 130} ${W - 100} L ${L - 80} ${W - 70} L ${L - 130} ${W - 40}`} />
          </g>
        )}
      </svg>
    </figure>
  );
}

function Sheets() {
  const { t, f, stockName } = useLabels();
  const derived = useConfigurator((s) => s.derived);
  const rowNoByPart = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of derived.cutList) for (const id of row.partIds) map[id] = row.no;
    return map;
  }, [derived.cutList]);
  return (
    <div className="grid gap-5">
      <p className="text-sm text-muted">{t('sheets.note', { kerf: f.mm(SHEET.kerf), trim: f.mm(SHEET.trim) })}</p>
      {derived.nest.stocks.map((stock) => {
        const sheets = derived.nest.sheets.filter((s) => s.stockKey === stock.key);
        return (
          <section key={stock.key} className="grid gap-3">
            <h3 className="text-base font-semibold">
              {t('sheets.stock', { name: stockName(stock), count: sheets.length, size: `${stock.sheetLength} × ${stock.sheetWidth}` })}
              {stock.grain && <span className="ml-2 text-sm font-normal text-muted">{t('sheets.grain')}</span>}
            </h3>
            {sheets.map((sheet) => (
              <SheetDiagram key={sheet.index} sheet={sheet} stock={stock} rowNoByPart={rowNoByPart} />
            ))}
          </section>
        );
      })}
    </div>
  );
}

function PriceTable() {
  const { t, f, unit, lineName } = useLabels();
  const price = useConfigurator((s) => s.derived.price);
  const overrides = useConfigurator((s) => s.overrides);
  const setOverrides = useConfigurator((s) => s.setOverrides);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const custom = Object.keys(overrides).length > 0;

  const sheetLines = price.lines.filter((l) => l.kind === 'sheet');
  const used = sheetLines.reduce((s, l) => s + (l.total * Number(l.detail?.utilisation ?? 0)) / 100, 0);
  const sheetsTotal = sheetLines.reduce((s, l) => s + l.total, 0);

  const apply = (e: FormEvent) => {
    e.preventDefault();
    const num = (key: string) => {
      const v = Number((draft[key] ?? '').replace(',', '.'));
      return draft[key] && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined;
    };
    const next: PriceOverrides = {};
    const sheet: Record<string, number> = {};
    for (const line of sheetLines) {
      const v = num(line.key);
      if (v !== undefined) sheet[line.key.replace('sheet:', '')] = v;
    }
    if (Object.keys(sheet).length) next.sheet = sheet;
    const b = num('banding');
    const c = num('cutting');
    if (b !== undefined) next.bandingPerM = b;
    if (c !== undefined) next.cuttingPerM = c;
    setOverrides(next);
  };

  return (
    <div className="grid gap-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse" data-testid="price-table">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className={th}>{t('price.cols.item')}</th>
              <th scope="col" className={cx(th, 'text-right')}>{t('price.cols.qty')}</th>
              <th scope="col" className={cx(th, 'text-right')}>{t('price.cols.unitPrice')}</th>
              <th scope="col" className={cx(th, 'text-right')}>{t('price.cols.total')}</th>
            </tr>
          </thead>
          <tbody>
            {price.lines.map((line) => (
              <tr key={line.key} className="border-b border-line/70" data-line={line.key}>
                <td className={td}>
                  {lineName(line)}
                  {line.kind === 'sheet' && <span className="block text-xs text-muted">{t('price.used', { used: f.percent(Number(line.detail?.utilisation ?? 0) / 100) })}</span>}
                </td>
                <td className={cx(td, 'text-right tabular-nums')}>{unit(line.unit, line.qty)}</td>
                <td className={cx(td, 'text-right tabular-nums')}>{f.money(line.unitPrice)}</td>
                <td className={cx(td, 'text-right tabular-nums')} data-line-total={line.total}>{f.money(line.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={3} className="px-2 py-3 text-left text-base font-semibold">{t('price.total')}</th>
              <td className="px-2 py-3 text-right text-lg font-semibold tabular-nums" data-testid="price-total" data-total={price.total}>{f.money(price.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="rounded-lg bg-paper px-3 py-2 text-sm">{t('price.waste', { used: f.money(Math.round(used)), waste: f.money(Math.round(sheetsTotal - used)) })}</p>
      <form className="grid gap-3 rounded-xl border border-line p-3" onSubmit={apply}>
        <div>
          <h3 className="text-sm font-semibold">{t('price.ownTitle')}</h3>
          <p className="text-sm text-muted">{t('price.ownHelp')}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {[...sheetLines.map((l) => ({ key: l.key, label: t('price.ownSheet', { name: lineName(l) }), current: l.unitPrice })), { key: 'banding', label: t('price.ownBanding'), current: overrides.bandingPerM ?? RATES.bandingPerM }, { key: 'cutting', label: t('price.ownCutting'), current: overrides.cuttingPerM ?? RATES.cuttingPerM }].map((field) => (
            <label key={field.key} className="grid gap-1 text-sm">
              {field.label}
              <input type="text" inputMode="decimal" className="h-9 rounded-lg border border-line px-2 tabular-nums" placeholder={String(field.current)} value={draft[field.key] ?? ''} onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })} />
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={actionButton}>{t('price.ownApply')}</button>
          <button type="button" className={actionButton} disabled={!custom} onClick={() => { setDraft({}); setOverrides({}); }}>{t('price.ownReset')}</button>
        </div>
      </form>
      <p className="text-xs text-muted">{t('price.disclaimer')}</p>
    </div>
  );
}

function HardwareTable() {
  const { t, hardwareName, unit } = useLabels();
  const hardware = useConfigurator((s) => s.derived.hardware);
  return (
    <div className="grid gap-2">
      <p className="text-sm text-muted">{t('hardware.note')}</p>
      <table className="w-full border-collapse" data-testid="hardware-table">
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className={th}>{t('hardware.item')}</th>
            <th scope="col" className={cx(th, 'text-right')}>{t('hardware.qty')}</th>
          </tr>
        </thead>
        <tbody>
          {hardware.map((item) => (
            <tr key={item.key} className="border-b border-line/70" data-item={item.key} data-qty={item.qty}>
              <td className={td}>{hardwareName(item)}</td>
              <td className={cx(td, 'text-right tabular-nums')}>{unit(item.unit, item.qty)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Inquiry({ link }: { link: () => string }) {
  const t = useTranslations('results.inquiry');
  const locale = useLocale();
  const total = useConfigurator((s) => s.derived.price.total);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setState('sending');
    try {
      const res = await fetch('/api/inquiry', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: data.get('name'), contact: data.get('contact'), message: data.get('message'), link: link(), locale, total }),
      });
      setState(res.ok ? 'sent' : 'error');
    } catch {
      setState('error');
    }
  };

  if (state === 'sent') {
    return (
      <p role="status" className="rounded-xl bg-accent-soft p-4 text-sm text-accent-strong" data-testid="inquiry-sent">
        {t('sent')}
      </p>
    );
  }
  const input = 'h-10 rounded-lg border border-line bg-surface px-3 text-sm';
  return (
    <form className="grid gap-3 rounded-2xl border border-line bg-surface p-4" onSubmit={submit} data-testid="inquiry-form">
      <div>
        <h3 className="text-base font-semibold">{t('title')}</h3>
        <p className="text-sm text-muted">{t('help')}</p>
      </div>
      <label className="grid gap-1 text-sm font-medium">
        {t('name')}
        <input name="name" required maxLength={120} autoComplete="name" className={input} />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        {t('contact')}
        <input name="contact" required maxLength={160} autoComplete="email" className={input} />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        {t('message')}
        <textarea name="message" rows={3} maxLength={2000} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
      </label>
      {state === 'error' && <p role="alert" className="text-sm text-warn">{t('error')}</p>}
      <button type="submit" disabled={state === 'sending'} className="h-11 justify-self-start rounded-full bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
        {state === 'sending' ? t('sending') : t('send')}
      </button>
    </form>
  );
}

export function Results() {
  const labels = useLabels();
  const { t, tp, f } = labels;
  const tm = useTranslations('models');
  const ts = useTranslations('summary');
  const locale = useLocale();
  const config = useConfigurator((s) => s.config);
  const derived = useConfigurator((s) => s.derived);
  const setTab = useConfigurator((s) => s.setTab);
  const [tab, setLocalTab] = useState<ResultTab>('parts');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<'link' | 'table' | null>(null);
  const model = requireModel(config.model);

  const area = derived.nest.sheets.reduce((s, sh) => s + sh.usedArea, 0);
  const total = derived.nest.sheets.reduce((s, sh) => s + sh.usedArea / Math.max(sh.utilisation, 1e-9), 0);
  const shareLink = () => `${window.location.origin}${window.location.pathname}?c=${encodeConfig(config)}`;
  const flash = (what: 'link' | 'table') => {
    setCopied(what);
    setTimeout(() => setCopied(null), 1800);
  };
  const fileBase = `${model.slug}-${config.width}x${config.height}x${config.depth}`;

  const csv = () => {
    const header = [...(['no', 'part', 'qty', 'length', 'width', 'thickness', 'material', 'grain'] as const).map((c) => t(`parts.cols.${c}`)), t('parts.csv.l1'), t('parts.csv.l2'), t('parts.csv.w1'), t('parts.csv.w2'), t('parts.csv.banding')];
    return cutListCsv(derived.cutList, { header, role: (r) => tp(r), material: (r) => f.material(r), yes: t('parts.csv.yes'), no: t('parts.csv.no') }, locale === 'mk' ? ';' : ',');
  };

  const pdf = async () => {
    setBusy(true);
    try {
      const rowNoByPart: Record<string, number> = {};
      for (const row of derived.cutList) for (const id of row.partIds) rowNoByPart[id] = row.no;
      const input: PdfInput = {
        fileName: `${fileBase}.pdf`,
        title: t('pdf.title', { model: tm(model.nameKey as 'sideboard') }),
        subtitle: t('summaryLine', { parts: derived.parts.length, sheets: derived.sheetCount, used: f.percent(area / Math.max(total, 1)), price: f.money(derived.price.total) }),
        meta: [
          [ts('width'), f.length(config.width)],
          [ts('height'), f.length(config.height)],
          [ts('depth'), f.length(config.depth)],
          [ts('elements'), config.elements.map((e) => f.length(e.width)).join(' / ')],
          [t('pdf.body'), f.decorName(config.bodyDecor)],
          [t('pdf.front'), f.decorName(config.frontDecor)],
          [t('pdf.date'), formatDate(new Date(), locale)],
        ],
        cutList: {
          title: t('tabs.parts'),
          head: (['no', 'part', 'qty', 'length', 'width', 'thickness', 'material', 'banding', 'note'] as const).map((c) => t(`parts.cols.${c}`)),
          rows: derived.cutList.map((r) => [String(r.no), tp(r.role), String(r.qty), f.mm(r.length), f.mm(r.width), f.mm(r.thickness), f.material(r), labels.banding(r), labels.note(r) || '–']),
          numeric: [2, 3, 4, 5],
        },
        sheets: {
          title: t('tabs.sheets'),
          note: t('sheets.note', { kerf: f.mm(SHEET.kerf), trim: f.mm(SHEET.trim) }),
          items: derived.nest.sheets.map((sheet) => {
            const stock = derived.nest.stocks.find((s) => s.key === sheet.stockKey) as Stock;
            return {
              caption: `${labels.stockName(stock)} · ${t('sheets.caption', { n: sheet.index + 1, used: f.percent(sheet.utilisation), parts: sheet.placements.length })}`,
              svg: sheetSvg(sheet, stock, rowNoByPart, SHEET.trim),
            };
          }),
        },
        hardware: {
          title: t('tabs.hardware'),
          head: [t('hardware.item'), t('hardware.qty')],
          rows: derived.hardware.map((h) => [labels.hardwareName(h), labels.unit(h.unit, h.qty)]),
          numeric: [1],
        },
        price: {
          title: t('tabs.price'),
          head: [t('price.cols.item'), t('price.cols.qty'), t('price.cols.unitPrice'), t('price.cols.total')],
          rows: derived.price.lines.map((l) => [labels.lineName(l), labels.unit(l.unit, l.qty), f.money(l.unitPrice), f.money(l.total)]),
          numeric: [1, 2, 3],
          total: [t('price.total'), f.money(derived.price.total)],
          disclaimer: t('price.disclaimer'),
        },
        link: { label: t('pdf.link'), url: shareLink() },
      };
      // Columns: stretch the second one (name) in every table.
      saveBlob(await createPdfBlob(input), input.fileName);
    } finally {
      setBusy(false);
    }
  };

  const copyTable = async () => {
    const lines = derived.cutList.map((r) => [r.no, tp(r.role), r.qty, r.length, r.width, r.thickness, f.material(r), labels.banding(r)].join('\t'));
    await navigator.clipboard?.writeText(lines.join('\n'));
    flash('table');
  };

  return (
    <div className="grid gap-4" data-testid="results">
      <section className="grid gap-3 rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{t('title')}</h2>
            <p className="text-sm text-muted" data-testid="results-summary">
              {t('summaryLine', { parts: derived.parts.length, sheets: derived.sheetCount, used: f.percent(area / Math.max(total, 1)), price: f.money(derived.price.total) })}
            </p>
          </div>
          <button type="button" className={actionButton} onClick={() => setTab('settings')}>
            {t('backToSettings')}
          </button>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <button type="button" className="rounded-full border border-accent bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-strong disabled:opacity-50" disabled={busy} onClick={pdf} data-testid="download-pdf">
            {busy ? t('export.preparing') : t('export.pdf')}
          </button>
          <button type="button" className={actionButton} onClick={() => saveBlob(new Blob([csv()], { type: 'text/csv;charset=utf-8' }), `${fileBase}.csv`)} data-testid="download-csv">
            {t('export.csv')}
          </button>
          <button type="button" className={actionButton} onClick={copyTable}>
            {copied === 'table' ? t('export.copied') : t('export.copyTable')}
          </button>
          <button type="button" className={actionButton} onClick={() => window.print()}>
            {t('export.print')}
          </button>
          <button
            type="button"
            className={actionButton}
            onClick={async () => {
              await navigator.clipboard?.writeText(shareLink());
              flash('link');
            }}
            data-testid="copy-link"
          >
            {copied === 'link' ? t('export.copied') : t('export.link')}
          </button>
        </div>
        <div role="tablist" aria-label={t('title')} className="flex flex-wrap gap-1 rounded-xl bg-paper p-1">
          {TABS.map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              id={`tab-${name}`}
              aria-selected={tab === name}
              aria-controls={`panel-${name}`}
              className={cx('flex-1 rounded-lg px-3 py-1.5 text-sm', tab === name ? 'bg-accent text-white shadow-sm' : 'hover:bg-surface')}
              onClick={() => setLocalTab(name)}
            >
              {t(`tabs.${name}`)}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === 'parts' && <PartsTable />}
          {tab === 'sheets' && <Sheets />}
          {tab === 'price' && <PriceTable />}
          {tab === 'hardware' && <HardwareTable />}
        </div>
      </section>
      <Inquiry link={shareLink} />
    </div>
  );
}
