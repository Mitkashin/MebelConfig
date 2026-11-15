'use client';

import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { DECOR_CATEGORIES, DECORS, getDecor, HANDLE_FINISHES, HANDLE_SHAPES, type Decor, type DecorBrand, type DecorCategory } from '@/engine/catalog';
import { requireModel } from '@/engine/models';
import { drawerDepthMin, elementMaxShelves, frontZone, limits, railHeightMin, shelfSpacing } from '@/engine/rules';
import type { Front, HandleFinish, Mount, Opening } from '@/engine/types';
import { useFormat } from '@/lib/format';
import { useConfigurator } from '@/store/configurator';
import { Counter, cx, NumberField, Segmented, StepCard, Switch } from '../ui/controls';

const PAGE = 12;

function useModel() {
  const config = useConfigurator((s) => s.config);
  const model = requireModel(config.model);
  return { config, model, lim: limits(config, model) };
}

function Dimensions() {
  const t = useTranslations('steps.dimensions');
  const { config, lim } = useModel();
  const setDimension = useConfigurator((s) => s.setDimension);
  return (
    <>
      {(['width', 'height', 'depth'] as const).map((key) => (
        <NumberField key={key} path={key} label={t(key)} value={config[key]} min={lim[key].min} max={lim[key].max} slider onCommit={(v) => setDimension(key, v)} />
      ))}
    </>
  );
}

function Elements() {
  const t = useTranslations('steps.elements');
  const f = useFormat();
  const { config, lim } = useModel();
  const setElementCount = useConfigurator((s) => s.setElementCount);
  const setElementWidth = useConfigurator((s) => s.setElementWidth);
  const equalise = useConfigurator((s) => s.equalise);
  const n = config.elements.length;
  const equal = Math.max(...config.elements.map((e) => e.width)) - Math.min(...config.elements.map((e) => e.width)) <= 1;
  return (
    <>
      <Counter label={t('count')} value={n} min={lim.elements.min} max={lim.elements.max} onChange={(v) => setElementCount(v)} />
      <p className="text-sm text-muted">{t('maxNote', { max: lim.elements.max, min: f.length(lim.elementWidth.min) })}</p>
      <div className="flex h-3 overflow-hidden rounded-full" aria-hidden="true">
        {config.elements.map((e, i) => (
          <span key={i} style={{ flexGrow: e.width }} className={cx('border-r-2 border-surface last:border-r-0', i % 2 ? 'bg-accent/50' : 'bg-accent')} />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {config.elements.map((e, i) => (
          <NumberField key={i} path={`elements.${i}.width`} label={t('widthOf', { n: i + 1 })} value={e.width} min={lim.elementWidth.min} max={lim.elementWidth.max} onCommit={(v) => setElementWidth(i, v)} />
        ))}
      </div>
      <button type="button" className="justify-self-start rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-accent hover:text-accent disabled:opacity-40" disabled={equal} onClick={equalise}>
        {t('equalise')}
      </button>
    </>
  );
}

function Fronts() {
  const t = useTranslations('steps.fronts');
  const f = useFormat();
  const { config, model, lim } = useModel();
  const parts = useConfigurator((s) => s.derived.parts);
  const patchElement = useConfigurator((s) => s.patchElement);
  const p = model.params;
  const zone = frontZone(config, p);

  return (
    <>
      <p className="rounded-lg bg-paper px-3 py-2 text-sm">{t('maxShelves', { max: lim.maxShelves, spacing: f.length(p.shelfSpacingMin) })}</p>
      {model.fronts.includes('drawers') && !lim.drawersAvailable && (
        <p className="rounded-lg bg-paper px-3 py-2 text-sm">{t('drawersUnavailable', { min: f.length(drawerDepthMin(config, p)) })}</p>
      )}
      {config.elements.map((el, i) => {
        const door = parts.find((x) => x.id === `e${i}.door`);
        const frontOptions = model.fronts.map((front: Front) => ({ value: front, label: t(front), disabled: front === 'drawers' && !lim.drawersAvailable }));
        const doubleOk = el.width >= p.doubleDoorMin;
        const frontHeight = Math.floor((zone - (el.drawers - 1) * p.drawerFrontGap) / el.drawers);
        return (
          <fieldset key={i} className="grid gap-3 rounded-xl border border-line p-3" data-testid={`element-${i}`}>
            <legend className="px-1 text-sm font-semibold">{t('element', { n: i + 1, width: f.length(el.width) })}</legend>
            {frontOptions.length > 1 && <Segmented label={t('front')} value={el.front} options={frontOptions} onChange={(front) => patchElement(i, { front })} />}
            {el.front !== 'drawers' && (
              <>
                {model.features.rail && (
                  <>
                    <Switch label={t('rail')} help={t('railHelp', { space: f.length(p.hangingSpace) })} checked={el.rail} onChange={(rail) => lim.railAvailable && patchElement(i, { rail })} />
                    {!lim.railAvailable && <p className="text-sm text-muted">{t('railUnavailable', { height: f.length(railHeightMin(config, p)), depth: f.length(p.railDepthMin) })}</p>}
                  </>
                )}
                <Counter label={el.rail ? t('shelvesAboveRail') : t('shelves')} value={el.shelves} min={0} max={elementMaxShelves(config, el, p)} onChange={(shelves) => patchElement(i, { shelves })} />
                {el.shelves > 0 && !el.rail && <p className="text-sm text-muted">{t('spacing', { value: f.length(Math.round(shelfSpacing(config, el.shelves, p))) })}</p>}
              </>
            )}
            {el.front === 'doors' && (
              <>
                <Segmented
                  label={t('doorType')}
                  value={el.doors}
                  options={[
                    { value: 1 as const, label: t('single') },
                    { value: 2 as const, label: t('double'), disabled: !doubleOk },
                  ]}
                  onChange={(doors) => patchElement(i, { doors })}
                />
                {!doubleOk && <p className="text-sm text-muted">{t('doubleUnavailable', { min: f.length(p.doubleDoorMin) })}</p>}
                {el.doors === 1 && (
                  <>
                    <Segmented
                      label={t('opening')}
                      value={el.opening}
                      options={(['auto', 'left', 'right', 'bottom'] as Opening[]).map((o) => ({ value: o, label: t(`openings.${o}`) }))}
                      onChange={(opening) => patchElement(i, { opening })}
                    />
                    {el.opening === 'auto' && door?.hinge && <p className="text-sm text-muted">{t('autoResult', { side: t(`openings.${door.hinge}`) })}</p>}
                  </>
                )}
              </>
            )}
            {el.front === 'drawers' && (
              <>
                <Counter label={t('drawerCount')} value={el.drawers} min={1} max={Math.max(1, lim.maxDrawers)} onChange={(drawers) => patchElement(i, { drawers })} />
                <p className="text-sm text-muted">{t('drawerFront', { value: f.length(frontHeight), max: lim.maxDrawers })}</p>
              </>
            )}
          </fieldset>
        );
      })}
    </>
  );
}

function Swatch({ decor, size = 'size-12' }: { decor: Decor; size?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- small static swatches; the optimiser adds nothing here
    <img src={decor.thumb} alt="" loading="lazy" decoding="async" width={160} height={160} className={cx('block rounded-lg border border-black/10 object-cover', size)} style={{ backgroundColor: decor.color }} />
  );
}

function DecorPicker({ slot }: { slot: 'bodyDecor' | 'frontDecor' }) {
  const t = useTranslations('steps.colours');
  const tb = useTranslations();
  const f = useFormat();
  const value = useConfigurator((s) => s.config[slot]);
  const patch = useConfigurator((s) => s.patch);
  const current = getDecor(value);
  const [category, setCategory] = useState<DecorCategory>(current?.category ?? 'wood');
  const [brand, setBrand] = useState<'all' | DecorBrand>('all');
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [copied, setCopied] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return DECORS.filter((d) => (brand === 'all' || d.brand === brand) && (q ? `${d.code} ${d.code.replace(/\s/g, '')} ${f.decorName(d.id)}`.toLowerCase().includes(q) : d.category === category));
  }, [query, category, brand, f]);
  const counts = useMemo(() => Object.fromEntries(DECOR_CATEGORIES.map((c) => [c, DECORS.filter((d) => d.category === c && (brand === 'all' || d.brand === brand)).length])), [brand]);
  const label = slot === 'bodyDecor' ? t('body') : t('front');

  return (
    <div className="grid gap-3" data-testid={`decor-${slot}`}>
      <h4 className="text-sm font-semibold">{label}</h4>
      <input
        type="search"
        className="h-10 rounded-lg border border-line bg-surface px-3 text-sm"
        placeholder={t('search')}
        aria-label={t('searchFor', { slot: label })}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setShown(PAGE);
        }}
      />
      <Segmented
        label={t('brand')}
        value={brand}
        options={(['all', 'egger', 'kronospan'] as const).map((b) => ({ value: b, label: b === 'all' ? t('allBrands') : tb(`brands.${b}`) }))}
        onChange={(b) => {
          setBrand(b);
          setShown(PAGE);
        }}
      />
      {!query && (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('category')}>
          {DECOR_CATEGORIES.filter((c) => (counts[c] ?? 0) > 0).map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={c === category}
              className={cx('rounded-full border px-3 py-1 text-sm', c === category ? 'border-accent bg-accent text-white' : 'border-line hover:border-accent')}
              onClick={() => {
                setCategory(c);
                setShown(PAGE);
              }}
            >
              {t('categoryCount', { name: t(`categories.${c}`), count: counts[c] ?? 0 })}
            </button>
          ))}
        </div>
      )}
      {matches.length === 0 ? (
        <p className="text-sm text-muted">{t('none')}</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="radiogroup" aria-label={label}>
          {matches.slice(0, shown).map((d) => (
            <button
              key={d.id}
              type="button"
              role="radio"
              aria-checked={d.id === value}
              aria-label={d.inStock ? f.decorName(d.id) : t('outOfStockLabel', { name: f.decorName(d.id) })}
              disabled={!d.inStock}
              title={d.inStock ? undefined : t('outOfStock')}
              className={cx('grid justify-items-start gap-1 rounded-xl border p-1.5 text-left disabled:cursor-not-allowed disabled:opacity-45', d.id === value ? 'border-accent ring-2 ring-accent/30' : 'border-line hover:border-accent')}
              onClick={() => patch({ [slot]: d.id })}
            >
              <Swatch decor={d} size="h-12 w-full" />
              <span className="text-xs font-semibold">{d.code}</span>
              <span className="line-clamp-2 text-xs text-muted">{f.decorShort(d.id)}</span>
            </button>
          ))}
        </div>
      )}
      {matches.length > shown && (
        <button type="button" className="justify-self-start text-sm font-medium text-accent underline-offset-2 hover:underline" onClick={() => setShown(shown + PAGE)}>
          {t('showMore', { count: Math.min(PAGE, matches.length - shown) })}
        </button>
      )}
      {current && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Swatch decor={current} size="size-5" />
          <span>{t('selected', { slot: label, name: f.decorName(current.id) })}</span>
          <a href={current.source} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-accent underline-offset-2 hover:underline">
            {t('atSupplier')}
          </a>
          <button
            type="button"
            className="rounded-full border border-line px-2 py-0.5 text-xs hover:border-accent"
            onClick={() => {
              void navigator.clipboard?.writeText(current.code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? t('copied') : t('copyCode', { code: current.code })}
          </button>
        </p>
      )}
    </div>
  );
}

function Colours() {
  const t = useTranslations('steps.colours');
  const { model } = useModel();
  const hasFronts = model.fronts.some((x) => x !== 'open');
  return (
    <>
      <DecorPicker slot="bodyDecor" />
      {hasFronts && <DecorPicker slot="frontDecor" />}
      <p className="text-xs text-muted">{t('disclaimer')}</p>
    </>
  );
}

function Details() {
  const t = useTranslations('steps.details');
  const f = useFormat();
  const { config, model } = useModel();
  const patch = useConfigurator((s) => s.patch);
  const hasFronts = config.elements.some((e) => e.front !== 'open');
  return (
    <>
      {model.mounts.length > 1 && (
        <Segmented label={t('mount')} value={config.mount} options={model.mounts.map((m: Mount) => ({ value: m, label: t(`mounts.${m}`) }))} onChange={(mount) => patch({ mount })} />
      )}
      {config.mount === 'legs' && (
        <>
          <Segmented label={t('legHeight')} value={config.legHeight} options={model.legHeights.map((h) => ({ value: h, label: f.length(h) }))} onChange={(legHeight) => patch({ legHeight })} />
          <p className="text-sm text-muted">{t('legHelp')}</p>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">{t('legFinish')}</span>
            <div role="radiogroup" aria-label={t('legFinish')} className="flex flex-wrap gap-2">
              {(['black', 'grey', 'white', 'gold'] as HandleFinish[]).map((finish) => (
                <button
                  key={finish}
                  type="button"
                  role="radio"
                  aria-checked={finish === config.legFinish}
                  className={cx('flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm', finish === config.legFinish ? 'border-accent bg-accent-soft font-medium' : 'border-line hover:border-accent')}
                  onClick={() => patch({ legFinish: finish })}
                >
                  <span className="size-6 rounded-full border border-black/15" style={{ backgroundColor: HANDLE_FINISHES[finish] }} aria-hidden="true" />
                  {t(`finishes.${finish}`)}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      {model.features.back && <Switch label={t('back')} help={t('backHelp')} checked={config.back} onChange={(back) => patch({ back })} />}
      {model.features.doubleTop && <Switch label={t('doubleTop')} help={t('doubleTopHelp')} checked={config.doubleTop} onChange={(doubleTop) => patch({ doubleTop })} />}
      {model.features.handles && hasFronts && (
        <>
          <Segmented
            label={t('opening')}
            value={config.openingType}
            options={[
              { value: 'handles' as const, label: t('handles') },
              { value: 'push' as const, label: t('push') },
            ]}
            onChange={(openingType) => patch({ openingType })}
          />
          <p className="text-sm text-muted">{config.openingType === 'handles' ? t('handlesHelp') : t('pushHelp')}</p>
          {config.openingType === 'handles' && (
            <>
              <div className="grid gap-1.5">
                <span className="text-sm font-medium">{t('handleShape')}</span>
                <div role="radiogroup" aria-label={t('handleShape')} className="grid gap-1.5 sm:grid-cols-2">
                  {HANDLE_SHAPES.map((shape) => (
                    <button
                      key={shape}
                      type="button"
                      role="radio"
                      aria-checked={shape === config.handleShape}
                      className={cx('rounded-lg border px-3 py-2 text-left text-sm', shape === config.handleShape ? 'border-accent bg-accent-soft font-medium' : 'border-line hover:border-accent')}
                      onClick={() => patch({ handleShape: shape })}
                    >
                      {t(`shapes.${shape}`)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-1.5">
                <span className="text-sm font-medium">{t('handleFinish')}</span>
                <div role="radiogroup" aria-label={t('handleFinish')} className="flex flex-wrap gap-2">
                  {(Object.keys(HANDLE_FINISHES) as HandleFinish[]).map((finish) => (
                    <button
                      key={finish}
                      type="button"
                      role="radio"
                      aria-checked={finish === config.handleFinish}
                      className={cx('flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm', finish === config.handleFinish ? 'border-accent bg-accent-soft font-medium' : 'border-line hover:border-accent')}
                      onClick={() => patch({ handleFinish: finish })}
                    >
                      <span className="size-6 rounded-full border border-black/15" style={{ backgroundColor: HANDLE_FINISHES[finish] }} aria-hidden="true" />
                      {t(`finishes.${finish}`)}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}

const STEP_PATHS: ((path: string) => boolean)[] = [
  (p) => p === 'width' || p === 'height' || p === 'depth',
  (p) => p.startsWith('elements') && p.endsWith('width'),
  (p) => p.startsWith('elements') && !p.endsWith('width'),
  () => false,
  () => false,
];

export function Steps() {
  const t = useTranslations('steps');
  const f = useFormat();
  const { config, model } = useModel();
  const errors = useConfigurator((s) => s.errors);
  const [open, setOpen] = useState<boolean[]>([true, false, false, false, false]);
  const allOpen = open.every(Boolean);
  const toggle = (i: number) => setOpen(open.map((o, k) => (k === i ? !o : o)));

  const closed = config.elements.filter((e) => e.front !== 'open').length;
  const summaries = [
    t('dimensions.summary', { w: f.length(config.width), h: f.length(config.height), d: f.length(config.depth) }),
    t('elements.summary', { count: config.elements.length, widths: config.elements.map((e) => f.lengthValue(e.width)).join(' / ') }),
    t('fronts.summary', { closed, total: config.elements.length }),
    model.fronts.some((x) => x !== 'open')
      ? t('colours.summary', { body: f.decorName(config.bodyDecor), front: f.decorName(config.frontDecor) })
      : f.decorName(config.bodyDecor),
    [t(`details.mounts.${config.mount}`), config.back ? t('details.summaryBack') : t('details.summaryNoBack'), closed > 0 && model.features.handles ? t(`details.${config.openingType}`) : null].filter(Boolean).join(' · '),
  ];
  const bodies = [<Dimensions key="d" />, <Elements key="e" />, <Fronts key="f" />, <Colours key="c" />, <Details key="x" />];
  const names = ['dimensions', 'elements', 'fronts', 'colours', 'details'] as const;

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{t('title')}</h2>
        <button type="button" className="rounded-full border border-line px-3 py-1.5 text-sm hover:border-accent" onClick={() => setOpen(open.map(() => !allOpen))}>
          {allOpen ? t('collapseAll') : t('expandAll')}
        </button>
      </div>
      {names.map((name, i) => (
        <StepCard
          key={name}
          index={i + 1}
          title={t(`${name}.title`)}
          help={t(`${name}.help`)}
          summary={summaries[i] ?? ''}
          open={open[i] ?? false}
          invalid={Object.keys(errors).some((path) => STEP_PATHS[i]?.(path))}
          onToggle={() => toggle(i)}
        >
          {bodies[i]}
        </StepCard>
      ))}
    </div>
  );
}
