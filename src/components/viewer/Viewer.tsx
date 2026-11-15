'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { requireModel } from '@/engine/models';
import { rowColor, useFormat } from '@/lib/format';
import { useConfigurator } from '@/store/configurator';

function Placeholder({ text }: { text: string }) {
  return (
    <div className="grid size-full place-items-center text-sm text-muted" role="status">
      {text}
    </div>
  );
}

// three.js is only fetched once the page shell is interactive.
const Scene = dynamic(() => import('./Scene'), { ssr: false });

const NONE: string[] = [];

const toolBase = 'shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium sm:px-3 sm:py-1.5 sm:text-sm shadow-sm backdrop-blur transition disabled:cursor-not-allowed disabled:opacity-50';
const toolOff = `${toolBase} border-line bg-surface/95 hover:border-accent hover:text-accent`;
const toolOn = `${toolBase} border-accent bg-accent text-white`;

export function Viewer() {
  const t = useTranslations('viewer');
  const tp = useTranslations('parts');
  const f = useFormat();
  const config = useConfigurator((s) => s.config);
  const derived = useConfigurator((s) => s.derived);
  const doorsOpen = useConfigurator((s) => s.doorsOpen);
  const exploded = useConfigurator((s) => s.exploded);
  const showDimensions = useConfigurator((s) => s.showDimensions);
  const selected = useConfigurator((s) => s.selected);
  const toggle = useConfigurator((s) => s.toggle);
  const select = useConfigurator((s) => s.select);
  const selectCell = useConfigurator((s) => s.selectCell);
  const model = requireModel(config.model);

  const [resetKey, setResetKey] = useState(0);
  const [ready, setReady] = useState(false);
  // Fronts opened one by one are forgotten when the piece or the global toggles change.
  const stamp = useMemo(() => ({ config, doorsOpen, exploded }), [config, doorsOpen, exploded]);
  const [toggledState, setToggledState] = useState<{ stamp: object; ids: string[] }>({ stamp, ids: [] });
  const toggled = toggledState.stamp === stamp ? toggledState.ids : NONE;

  const rowNoByPart = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of derived.cutList) for (const id of row.partIds) map[id] = row.no;
    return map;
  }, [derived.cutList]);

  const hasFronts = derived.parts.some((p) => p.role === 'door' || p.role === 'drawerFront');
  const selectedRow = derived.cutList.find((r) => selected.length > 0 && r.partIds.includes(selected[0] as string));

  const onSelect = (partId: string | null) => {
    if (!partId) return select([]);
    const part = derived.parts.find((p) => p.id === partId);
    // Clicking a wardrobe compartment opens it in the compartment panel.
    if (part && part.element !== null && part.cell !== undefined) selectCell([part.element, part.cell]);
    // Only the clicked part lights up; its cut-list row is still marked, and clicking the row shows all its parts.
    select([partId]);
    if (part && (part.role === 'door' || part.role === 'drawerFront') && !exploded) {
      const mover = part.role === 'door' ? part.id : (part.group ?? part.id);
      setToggledState({ stamp, ids: toggled.includes(mover) ? toggled.filter((id) => id !== mover) : [...toggled, mover] });
    }
  };

  const labels = {
    width: f.length(config.width),
    height: f.length(config.height),
    depth: f.length(config.depth),
    elements: config.elements.map((e) => f.length(e.width)),
  };

  return (
    <div
      className="relative size-full overflow-hidden rounded-2xl border border-line bg-[#f1efea]"
      data-testid="viewer"
      data-ready={ready ? '1' : '0'}
      data-part-count={derived.parts.length}
      data-handle-count={derived.handles.length}
      data-fitting-count={derived.fittings.length}
      data-doors-open={doorsOpen ? '1' : '0'}
      data-exploded={exploded ? '1' : '0'}
      data-selected={selected.join(',')}
    >
      {!ready && (
        <div className="absolute inset-0 z-0">
          <Placeholder text={t('loading')} />
        </div>
      )}
      <Scene
        config={config}
        parts={derived.parts}
        handles={derived.handles}
        fittings={derived.fittings}
        mountHeight={config.mount === 'wall' ? model.wallHeight : 0}
        doorsOpen={doorsOpen}
        toggled={toggled}
        exploded={exploded}
        showDimensions={showDimensions}
        selected={selected}
        rowNoByPart={rowNoByPart}
        resetKey={resetKey}
        ariaLabel={t('aria', { model: t('ariaPiece') })}
        labels={labels}
        onSelect={onSelect}
        onReady={() => setReady(true)}
        fallback={<Placeholder text={t('unsupported')} />}
      />
      <div className="no-print absolute right-2 bottom-2 left-2 z-10 flex gap-1.5 overflow-x-auto sm:top-3 sm:right-3 sm:bottom-auto sm:left-3 sm:flex-wrap sm:justify-end sm:gap-2 sm:overflow-visible">
        {hasFronts && (
          <button type="button" className={doorsOpen ? toolOn : toolOff} aria-pressed={doorsOpen} disabled={exploded} onClick={() => toggle('doorsOpen')} data-testid="toggle-doors">
            {doorsOpen ? t('closeFronts') : t('openFronts')}
          </button>
        )}
        <button type="button" className={exploded ? toolOn : toolOff} aria-pressed={exploded} onClick={() => toggle('exploded')} data-testid="toggle-exploded">
          {t('exploded')}
        </button>
        <button type="button" className={showDimensions ? toolOn : toolOff} aria-pressed={showDimensions} onClick={() => toggle('showDimensions')} data-testid="toggle-dimensions">
          {t('dimensions')}
        </button>
        <button type="button" className={toolOff} onClick={() => setResetKey((k) => k + 1)}>
          {t('reset')}
        </button>
      </div>
      {selectedRow && (
        <div className="absolute top-2 left-2 z-10 flex items-center sm:top-auto sm:bottom-3 sm:left-3 gap-2 rounded-full bg-surface/95 py-1 pr-3 pl-1 text-sm shadow" role="status" data-testid="selection-badge">
          <span className="grid size-7 place-items-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: rowColor(selectedRow.no) }}>
            {selectedRow.no}
          </span>
          {t('selected', { name: tp(selectedRow.role), length: f.length(selectedRow.length), width: f.length(selectedRow.width) })}
          {selectedRow.qty > 1 && <span className="text-muted">{t('selectedQty', { shown: selected.length, qty: selectedRow.qty })}</span>}
        </div>
      )}
      <p className="no-print pointer-events-none absolute right-3 bottom-3 z-10 hidden rounded-full bg-surface/90 px-3 py-1 text-xs text-muted shadow-sm sm:block">{t('hint')}</p>
    </div>
  );
}
