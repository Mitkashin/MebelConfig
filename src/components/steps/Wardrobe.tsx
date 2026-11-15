'use client';

import { useTranslations } from 'next-intl';
import { carcassHeight, cellCaps, cellCarcassDepth } from '@/engine/grid';
import { requireModel } from '@/engine/models';
import { limits } from '@/engine/rules';
import type { CellConfig, Turn } from '@/engine/types';
import { useFormat } from '@/lib/format';
import { useConfigurator } from '@/store/configurator';
import { Counter, cx, LockToggle, NumberField, Segmented, Switch } from '../ui/controls';

/** Compartments are numbered row by row, left to right, like the reading order of the drawing. */
function cellNumber(cells: number[], i: number, k: number): number {
  const before = cells.reduce((s, count) => s + Math.min(count, k), 0);
  const left = cells.slice(0, i).filter((count) => count > k).length;
  return before + left + 1;
}

function useGrid() {
  const config = useConfigurator((s) => s.config);
  const model = requireModel(config.model);
  return { config, model, p: model.params, lim: limits(config, model) };
}

/** Wardrobe step 2: columns and their widths, rows and their heights, and columns with their own heights. */
export function GridLayout() {
  const t = useTranslations('steps.layout');
  const te = useTranslations('steps.elements');
  const f = useFormat();
  const { config, p, lim } = useGrid();
  const setElementCount = useConfigurator((s) => s.setElementCount);
  const setElementWidth = useConfigurator((s) => s.setElementWidth);
  const equalise = useConfigurator((s) => s.equalise);
  const pinned = useConfigurator((s) => s.pinned);
  const pin = useConfigurator((s) => s.pin);
  const unpin = useConfigurator((s) => s.unpin);
  const setRowCount = useConfigurator((s) => s.setRowCount);
  const setRowHeight = useConfigurator((s) => s.setRowHeight);
  const resetRows = useConfigurator((s) => s.resetRows);
  const setOwnRows = useConfigurator((s) => s.setOwnRows);
  const setCellHeight = useConfigurator((s) => s.setCellHeight);
  const n = config.elements.length;
  const equal = Math.max(...config.elements.map((e) => e.width)) - Math.min(...config.elements.map((e) => e.width)) <= 1;

  return (
    <>
      <Counter label={t('columns')} value={n} min={lim.elements.min} max={lim.elements.max} onChange={(v) => setElementCount(v)} />
      <p className="text-sm text-muted">{t('columnsNote', { min: f.length(p.elementMin), max: f.length(p.elementMax) })}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {config.elements.map((e, i) => (
          <NumberField
            key={i}
            path={`elements.${i}.width`}
            label={t('columnWidth', { n: i + 1 })}
            value={e.width}
            min={lim.elementWidth.min}
            max={lim.elementWidth.max}
            onCommit={(v) => setElementWidth(i, v)}
            labelAside={n > 1 ? <LockToggle locked={pinned.includes(i)} label={pinned.includes(i) ? te('unlock', { n: i + 1 }) : te('lock', { n: i + 1 })} onToggle={() => (pinned.includes(i) ? unpin(i) : pin(i))} testId={`lock-${i}`} /> : null}
          />
        ))}
      </div>
      <button type="button" className="justify-self-start rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-accent hover:text-accent disabled:opacity-40" disabled={equal} onClick={equalise}>
        {te('equalise')}
      </button>

      <div className="grid gap-3 border-t border-line pt-4">
        <Counter label={t('rows')} value={config.rows.length} min={1} max={p.rowsMax} onChange={(v) => setRowCount(v)} />
        <div className="grid gap-3 sm:grid-cols-2">
          {config.rows.map((h, k) => (
            <NumberField key={k} path={`rows.${k}`} label={t('rowHeight', { n: k + 1 })} value={h} min={p.rowMin} max={config.height - (config.rows.length - 1) * p.rowMin} onCommit={(v) => setRowHeight(k, v)} />
          ))}
        </div>
        <p className="text-sm text-muted">{config.mount === 'legs' ? t('rowsHelpLegs', { legs: f.length(config.legHeight) }) : t('rowsHelp')}</p>
        <button type="button" className="justify-self-start rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-accent hover:text-accent" onClick={resetRows}>
          {t('defaultRows')}
        </button>
      </div>

      {n > 1 && (
        <div className="grid gap-3 border-t border-line pt-4">
          <div>
            <h4 className="text-sm font-semibold">{t('ownTitle')}</h4>
            <p className="text-sm text-muted">{t('ownHelp')}</p>
          </div>
          {config.elements.map((e, i) => (
            <div key={i} className="grid gap-2">
              <Switch label={t('ownSwitch', { n: i + 1 })} checked={e.ownRows} onChange={(own) => setOwnRows(i, own)} />
              {e.ownRows && (
                <div className="grid gap-3 rounded-xl bg-paper p-3 sm:grid-cols-2">
                  {e.cells.map((c, k) => (
                    <NumberField key={k} path={`elements.${i}.cells.${k}.height`} label={t('cellHeight', { k: k + 1 })} value={c.height} min={p.rowMin} max={config.height - (e.cells.length - 1) * p.rowMin} onCommit={(v) => setCellHeight(i, k, v)} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** Small drawing of the wardrobe: click a compartment to edit it. */
function CellPicker() {
  const t = useTranslations('steps.cells');
  const { config } = useGrid();
  const [ci, ck] = useConfigurator((s) => s.cell);
  const selectCell = useConfigurator((s) => s.selectCell);
  const counts = config.elements.map((e) => e.cells.length);
  return (
    <div className="flex h-56 gap-1 rounded-xl bg-paper p-2" role="radiogroup" aria-label={t('picker')} data-testid="cell-picker">
      {config.elements.map((el, i) => (
        <div key={i} className="flex min-w-0 flex-col gap-1" style={{ flexGrow: el.width, flexBasis: 0 }}>
          {el.cells.map((c, k) => {
            const number = cellNumber(counts, i, k);
            const on = ci === i && ck === k;
            const label = t('cellLabel', { n: number, r: k + 1, c: i + 1 });
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={label}
                title={label}
                onClick={() => selectCell([i, k])}
                style={{ flexGrow: c.height, flexBasis: 0 }}
                data-testid={`cell-${i}-${k}`}
                className={cx(
                  'relative grid min-h-6 place-items-center overflow-hidden rounded-md border text-[11px] font-semibold transition',
                  on ? 'border-accent bg-accent text-white' : 'border-line bg-surface text-muted hover:border-accent',
                )}
              >
                <CellGlyph cell={c} />
                <span className="relative">{number}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Hint of a compartment's contents inside the picker: rail, shelves or drawer lines. */
function CellGlyph({ cell }: { cell: CellConfig }) {
  const lines = cell.front === 'drawers' ? cell.drawers : cell.shelves;
  return (
    <span className="pointer-events-none absolute inset-1 opacity-35" aria-hidden="true">
      {cell.rails > 0 && <span className="absolute inset-x-1 top-1.5 h-0.5 rounded bg-current" />}
      {cell.rails === 2 && <span className="absolute inset-x-1 top-1/2 h-0.5 rounded bg-current" />}
      {Array.from({ length: Math.min(lines, 6) }, (_, j) => (
        <span key={j} className={cx('absolute inset-x-0 h-px bg-current', cell.front === 'drawers' && 'inset-x-2')} style={{ bottom: `${((j + 1) * 100) / (lines + 1)}%` }} />
      ))}
      {cell.turn !== 'front' && <span className={cx('absolute top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-current', cell.turn === 'left' ? 'left-0.5' : 'right-0.5')} />}
    </span>
  );
}

/** Wardrobe step 3: the selected compartment's front, shelves, rails, facing, and remove / split. */
export function Compartments() {
  const t = useTranslations('steps.cells');
  const tf = useTranslations('steps.fronts');
  const f = useFormat();
  const { config, model, p } = useGrid();
  const [ci0, ck0] = useConfigurator((s) => s.cell);
  const parts = useConfigurator((s) => s.derived.parts);
  const patchCell = useConfigurator((s) => s.patchCell);
  const removeCell = useConfigurator((s) => s.removeCell);
  const splitCell = useConfigurator((s) => s.splitCell);
  const i = Math.min(ci0, config.elements.length - 1);
  const k = Math.min(ck0, (config.elements[i]?.cells.length ?? 1) - 1);
  const el = config.elements[i];
  const c = el?.cells[k];
  if (!el || !c) return null;
  const caps = cellCaps(config, model, i, k);
  const ch = carcassHeight(config, i, k);
  const number = cellNumber(config.elements.map((e) => e.cells.length), i, k);
  const door = parts.find((x) => x.id === `c${i}.k${k}.door`);
  const set = (patch: Partial<CellConfig>) => patchCell(i, k, patch);
  const splitOk = el.cells.length < p.rowsMax && ch >= 2 * p.rowMin;
  const frontOptions = model.fronts.map((front) => ({ value: front, label: t(`fronts.${front}`), disabled: front === 'drawers' && (c.turn !== 'front' || caps.slide === null || caps.maxDrawers < 1) }));

  return (
    <>
      <CellPicker />
      <fieldset className="grid gap-3 rounded-xl border border-line p-3" data-testid="cell-panel">
        <legend className="px-1 text-sm font-semibold">{t('selected', { n: number, r: k + 1, c: i + 1, w: f.length(el.width), h: f.length(c.height) })}</legend>
        <Segmented label={t('front')} value={c.front} options={frontOptions} onChange={(front) => set({ front })} />
        {c.turn !== 'front' && <p className="text-sm text-muted">{t('turnedNoDrawers')}</p>}

        {c.front === 'doors' && (
          <>
            <Segmented
              label={tf('doorType')}
              value={c.doors}
              options={[
                { value: 1 as const, label: tf('single') },
                { value: 2 as const, label: tf('double'), disabled: !caps.doubleDoorsOk },
              ]}
              onChange={(doors) => set({ doors })}
            />
            {model.features.glass && (
              <>
                <Segmented
                  label={t('doorMaterial')}
                  value={c.glass ? 'glass' : 'board'}
                  options={[
                    { value: 'board' as const, label: t('board') },
                    { value: 'glass' as const, label: t('glass') },
                  ]}
                  onChange={(v) => set({ glass: v === 'glass' })}
                />
                {c.glass && <p className="text-sm text-muted">{t('glassHint')}</p>}
              </>
            )}
            {c.doors === 1 && (
              <>
                <Segmented label={tf('opening')} value={c.opening} options={(['auto', 'left', 'right'] as const).map((o) => ({ value: o, label: tf(`openings.${o}`) }))} onChange={(opening) => set({ opening })} />
                {c.opening === 'auto' && door?.hinge && <p className="text-sm text-muted">{tf('autoResult', { side: tf(`openings.${door.hinge}`) })}</p>}
              </>
            )}
          </>
        )}

        {c.front !== 'drawers' && (
          <>
            {model.features.rail && (
              <>
                <Segmented
                  label={t('rails')}
                  value={c.rails}
                  options={([0, 1, 2] as const).map((r) => ({ value: r, label: t(`railCount.${r}`), disabled: r > caps.railsMax }))}
                  onChange={(rails) => set({ rails })}
                />
                {caps.railsMax < 2 && (
                  <p className="text-sm text-muted">
                    {caps.railDepthOk
                      ? t('railsNeed', { one: f.length(p.railInnerMin + 2 * p.board), two: f.length(p.railDoubleInnerMin + 2 * p.board) })
                      : t('railsDepth', { depth: f.length(p.railDepthMin) })}
                  </p>
                )}
              </>
            )}
            <Counter label={c.rails === 1 ? t('shelvesBelowRail') : tf('shelves')} value={c.shelves} min={0} max={caps.maxShelves} onChange={(shelves) => set({ shelves })} />
            <p className="text-sm text-muted">{c.rails === 2 ? t('noShelvesDouble') : t('maxShelves', { max: caps.maxShelves, spacing: f.length(p.shelfSpacingMin) })}</p>
          </>
        )}

        {c.front === 'drawers' && (
          <>
            <Counter label={tf('drawerCount')} value={c.drawers} min={1} max={Math.max(1, caps.maxDrawers)} onChange={(drawers) => set({ drawers })} />
            <p className="text-sm text-muted">{t('drawerInfo', { max: caps.maxDrawers, slide: f.mm(caps.slide ?? 0) })}</p>
          </>
        )}

        {caps.turns.length > 1 && (
          <>
            <Segmented label={t('turn')} value={c.turn} options={caps.turns.map((turn: Turn) => ({ value: turn, label: t(`turns.${turn}`) }))} onChange={(turn) => set({ turn, ...(turn !== 'front' && c.front === 'drawers' ? { front: 'doors' as const } : {}) })} />
            <p className="text-sm text-muted">{t('turnHelp', { depth: f.length(Math.max(0, cellCarcassDepth(config, i, k, p))) })}</p>
          </>
        )}

        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          <button type="button" className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-warn hover:text-warn disabled:opacity-40" disabled={el.cells.length < 2} onClick={() => removeCell(i, k)} data-testid="remove-cell">
            {t('remove')}
          </button>
          <button type="button" className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-accent hover:text-accent disabled:opacity-40" disabled={!splitOk} onClick={() => splitCell(i, k)} data-testid="split-cell">
            {t('split')}
          </button>
        </div>
        <p className="text-sm text-muted">{el.cells.length < 2 ? t('removeOnly') : splitOk ? t('removeHelp') : t('splitUnavailable', { min: f.length(2 * p.rowMin) })}</p>
      </fieldset>
    </>
  );
}

/** Wardrobe-only details: shelf setback, plinth and the glass of glass doors. */
export function WardrobeDetails() {
  const t = useTranslations('steps.details');
  const f = useFormat();
  const { config, model } = useGrid();
  const patch = useConfigurator((s) => s.patch);
  const anyGlass = config.elements.some((e) => e.cells.some((c) => c.front === 'doors' && c.glass));
  return (
    <>
      {model.features.shelfSetback && (
        <>
          <Segmented label={t('setback')} value={config.shelfSetback} options={[10, 20, 30].map((v) => ({ value: v, label: f.length(v) }))} onChange={(shelfSetback) => patch({ shelfSetback })} />
          <p className="text-sm text-muted">{t('setbackHelp')}</p>
        </>
      )}
      {model.features.plinth && config.mount === 'legs' && (
        <div className="grid gap-2">
          <span className="text-sm font-medium">{t('plinth')}</span>
          <Switch label={t('plinthFront')} checked={config.plinth.front} onChange={(v) => patch({ plinth: { ...config.plinth, front: v } })} />
          <Switch label={t('plinthLeft')} checked={config.plinth.left} onChange={(v) => patch({ plinth: { ...config.plinth, left: v } })} />
          <Switch label={t('plinthRight')} checked={config.plinth.right} onChange={(v) => patch({ plinth: { ...config.plinth, right: v } })} />
          <p className="text-sm text-muted">{t('plinthHelp')}</p>
        </div>
      )}
      {model.features.glass && anyGlass && (
        <>
          <Segmented label={t('glassFrame')} value={config.glassFrame} options={(['black', 'white'] as const).map((v) => ({ value: v, label: t(`frames.${v}`) }))} onChange={(glassFrame) => patch({ glassFrame })} />
          <Segmented label={t('glassTint')} value={config.glassTint} options={(['clear', 'light', 'dark'] as const).map((v) => ({ value: v, label: t(`tints.${v}`) }))} onChange={(glassTint) => patch({ glassTint })} />
        </>
      )}
    </>
  );
}
