'use client';

import { useTranslations } from 'next-intl';
import { requireModel } from '@/engine/models';
import { QUANTITY_MAX } from '@/engine/rules';
import { useFormat } from '@/lib/format';
import { useConfigurator } from '@/store/configurator';

/** Step 6: what goes into the cut list, the live price, and the button that opens the results. */
export function Summary() {
  const t = useTranslations('summary');
  const ts = useTranslations('steps');
  const f = useFormat();
  const config = useConfigurator((s) => s.config);
  const derived = useConfigurator((s) => s.derived);
  const errors = useConfigurator((s) => s.errors);
  const setTab = useConfigurator((s) => s.setTab);
  const patch = useConfigurator((s) => s.patch);
  const model = requireModel(config.model);
  const closed = model.layout === 'grid' ? config.elements.flatMap((e) => e.cells).filter((c) => c.front !== 'open').length : config.elements.filter((e) => e.front !== 'open').length;
  const blocked = Object.values(errors);
  const showHandles = model.features.handles && closed > 0;

  const rows: [string, string][] = [
    [t('width'), f.length(config.width)],
    [t('height'), f.length(config.height)],
    [t('depth'), f.length(config.depth)],
    [model.layout === 'grid' ? t('columns') : t('elements'), model.layout === 'grid' ? t('gridValue', { columns: config.elements.length, rows: config.rows.length }) : String(config.elements.length)],
    model.layout === 'grid'
      ? [t('fronts'), ts('cells.summary', { count: config.elements.reduce((s2, e) => s2 + e.cells.length, 0), closed })]
      : [t('fronts'), ts('fronts.summary', { closed, total: config.elements.length })],
    [t('back'), config.back ? t('included') : t('none')],
    [t('mount'), config.mount === 'legs' ? t('mountLegs', { height: f.length(config.legHeight) }) : config.mount === 'plinth' ? t('mountPlinth', { height: f.length(config.legHeight) }) : ts(`details.mounts.${config.mount}`)],
  ];
  if (model.features.doubleTop) rows.push([t('top'), config.doubleTop ? t('topDouble') : t('topSingle')]);
  if (showHandles) {
    rows.push([t('opening'), ts(`details.${config.openingType}`)]);
    if (config.openingType === 'handles') {
      rows.push([t('handle'), t('handleValue', { shape: ts(`details.shapes.${config.handleShape}`), finish: ts(`details.finishes.${config.handleFinish}`) })]);
    }
  }

  return (
    <section className="grid gap-4 rounded-2xl border border-line bg-surface p-4" aria-labelledby="summary-title" data-testid="summary">
      <div>
        <h2 id="summary-title" className="text-xl font-semibold">
          {t('title')}
        </h2>
        <p className="text-sm text-muted">{t('intro')}</p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <ul className="grid gap-1 border-t border-line pt-3 text-sm">
        {model.layout === 'grid' && config.elements.map((e, i) => (
          <li key={i}>{t('columnLine', { n: i + 1, width: f.length(e.width), count: e.cells.length, rails: e.cells.reduce((s2, c) => s2 + (c.front === 'drawers' ? 0 : c.rails), 0) })}</li>
        ))}
        {model.layout !== 'grid' && config.elements.map((e, i) => (
          <li key={i}>
            {t('elementLine', {
              n: i + 1,
              width: f.length(e.width),
              front: e.front === 'drawers' ? t('withDrawers', { count: e.drawers }) : e.front === 'doors' ? t(e.doors === 2 ? 'withDoubleDoors' : 'withDoor') : t('openFront'),
              shelves: e.front === 'drawers' ? 0 : e.shelves,
            })}
            {e.rail && e.front !== 'drawers' ? t('withRail') : ''}
          </li>
        ))}
      </ul>
      <div className="grid gap-2 rounded-xl bg-accent-soft p-3" aria-live="polite">
        <div className="flex items-center justify-between gap-3" role="group" aria-label={t('quantity')} data-testid="quantity">
          <span className="text-sm text-accent-strong">{t('quantity')}</span>
          <div className="flex items-center gap-1">
            <button type="button" className="grid size-8 place-items-center rounded-full border border-accent/40 bg-surface text-lg leading-none text-accent-strong disabled:opacity-40" aria-label={t('quantityLess')} disabled={config.quantity <= 1} onClick={() => patch({ quantity: config.quantity - 1 })}>
              −
            </button>
            <output className="w-8 text-center text-lg font-semibold tabular-nums" data-testid="quantity-value">
              {config.quantity}
            </output>
            <button type="button" className="grid size-8 place-items-center rounded-full border border-accent/40 bg-surface text-lg leading-none text-accent-strong disabled:opacity-40" aria-label={t('quantityMore')} disabled={config.quantity >= QUANTITY_MAX} onClick={() => patch({ quantity: config.quantity + 1 })}>
              +
            </button>
          </div>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-accent-strong">{config.quantity > 1 ? t('livePriceAll', { count: config.quantity }) : t('livePrice')}</span>
          <span className="text-2xl font-semibold tabular-nums" data-testid="live-price">
            {f.money(derived.price.total)}
          </span>
        </div>
        {config.quantity > 1 && (
          <p className="text-sm text-accent-strong" data-testid="price-each">
            {t('priceEach', { price: f.money(Math.round(derived.price.total / config.quantity)) })}
          </p>
        )}
        <p className="text-sm text-accent-strong" data-testid="live-sheets">
          {t('liveSheets', { parts: derived.parts.length * config.quantity, sheets: derived.sheetCount, n: f.number(derived.sheetCount, { max: 1 }) })}
        </p>
      </div>
      <button
        type="button"
        className="h-12 rounded-full bg-accent px-6 text-base font-semibold text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
        disabled={blocked.length > 0}
        onClick={() => {
          setTab('results');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        data-testid="generate"
      >
        {t('generate')}
      </button>
      {blocked.length > 0 ? (
        <div role="alert" className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          <p className="font-medium">{t('fixFirst')}</p>
          <ul className="list-disc pl-5">
            {blocked.map((issue) => (
              <li key={issue.path}>{f.issueText(issue, issue.path in { width: 1, height: 1, depth: 1 } ? t(issue.path as 'width') : undefined)}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-muted">{t('generateHelp')}</p>
      )}
    </section>
  );
}
