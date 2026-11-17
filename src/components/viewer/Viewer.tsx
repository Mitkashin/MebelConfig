'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { requireModel } from '@/engine/models';
import { rowColor, useFormat } from '@/lib/format';
import { useConfigurator } from '@/store/configurator';
import { useScene, WALL_COLORS, type WallColor } from '@/store/scene';

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
  const backdrop = useScene((s) => s.backdrop);
  const wall = useScene((s) => s.wall);
  const setBackdrop = useScene((s) => s.setBackdrop);
  const setWall = useScene((s) => s.setWall);
  const spin = useScene((s) => s.spin);
  const setSpin = useScene((s) => s.setSpin);
  const hydrateScene = useScene((s) => s.hydrate);
  useEffect(() => hydrateScene(), [hydrateScene]);

  const [sceneOpen, setSceneOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const captureRef = useRef<(() => Promise<string>) | null>(null);

  const saveImage = async () => {
    const capture = captureRef.current;
    if (!capture || saving) return;
    setSaving(true);
    try {
      const url = await capture();
      const link = document.createElement('a');
      link.href = url;
      link.download = `${config.model}-${config.width}x${config.height}x${config.depth}.png`;
      link.click();
    } finally {
      setSaving(false);
    }
  };

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
      data-backdrop={backdrop}
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
        backdrop={backdrop}
        wall={wall}
        spin={spin}
        captureRef={captureRef}
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
        <button type="button" className={sceneOpen ? toolOn : toolOff} aria-expanded={sceneOpen} aria-controls="viewer-scene-panel" onClick={() => setSceneOpen((o) => !o)} data-testid="toggle-scene">
          {t('scene')}
        </button>
        <button type="button" className={toolOff} disabled={!ready || saving} onClick={saveImage} data-testid="save-image">
          {saving ? t('saving') : t('saveImage')}
        </button>
        <button type="button" className={toolOff} onClick={() => setResetKey((k) => k + 1)}>
          {t('reset')}
        </button>
      </div>
      {sceneOpen && (
        <div
          id="viewer-scene-panel"
          className="no-print absolute bottom-12 left-2 z-20 w-72 rounded-2xl border border-line bg-surface/95 p-3 text-sm shadow-lg backdrop-blur sm:top-14 sm:right-3 sm:bottom-auto sm:left-auto"
          data-testid="scene-panel"
        >
          <div className="flex gap-1 rounded-full bg-line/40 p-1" role="radiogroup" aria-label={t('scene')}>
            {(['studio', 'room', 'free'] as const).map((b) => (
              <button
                key={b}
                type="button"
                role="radio"
                aria-checked={backdrop === b}
                className={`flex-1 rounded-full px-2 py-1 font-medium whitespace-nowrap transition ${backdrop === b ? 'bg-accent text-white shadow-sm' : 'hover:text-accent'}`}
                onClick={() => setBackdrop(b)}
                data-testid={`backdrop-${b}`}
              >
                {t(b)}
              </button>
            ))}
          </div>
          {backdrop === 'free' && (
            <label className="mt-3 flex cursor-pointer items-center justify-between gap-3">
              <span>{t('spin')}</span>
              <button
                type="button"
                role="switch"
                aria-checked={spin}
                className={`relative h-6 w-11 shrink-0 rounded-full transition ${spin ? 'bg-accent' : 'bg-line'}`}
                onClick={() => setSpin(!spin)}
                data-testid="toggle-spin"
              >
                <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${spin ? 'translate-x-5' : ''}`} />
              </button>
            </label>
          )}
          {backdrop === 'free' && <p className="mt-2 text-xs text-muted">{t('freeHint')}</p>}
          {backdrop === 'room' && (
            <div className="mt-3">
              <p className="mb-2 text-xs text-muted">{t('wall')}</p>
              <div className="flex gap-2" role="radiogroup" aria-label={t('wall')}>
                {(Object.keys(WALL_COLORS) as WallColor[]).map((w) => (
                  <button
                    key={w}
                    type="button"
                    role="radio"
                    aria-checked={wall === w}
                    aria-label={t(`walls.${w}`)}
                    title={t(`walls.${w}`)}
                    className={`size-8 rounded-full border shadow-sm transition ${wall === w ? 'border-accent ring-2 ring-accent ring-offset-2' : 'border-line hover:scale-105'}`}
                    style={{ backgroundColor: WALL_COLORS[w] }}
                    onClick={() => setWall(w)}
                    data-testid={`wall-${w}`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
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
