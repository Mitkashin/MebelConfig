'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { requireModel } from '@/engine/models';
import { decodeConfig, defaultConfig, encodeConfig } from '@/engine/share';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { useFormat } from '@/lib/format';
import { formatDate } from '@/lib/numbers';
import { useConfigurator } from '@/store/configurator';
import { listSaved, readUnit, removeSaved, saveDesign, writeUnit, type SavedDesign } from '@/store/saved';
import { Results } from './results/Results';
import { Steps } from './steps/Steps';
import { Summary } from './Summary';
import { cx } from './ui/controls';
import { Viewer } from './viewer/Viewer';

const headerButton = 'rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40';

function SavePanel({ onClose }: { onClose: () => void }) {
  const t = useTranslations('save');
  const config = useConfigurator((s) => s.config);
  const load = useConfigurator((s) => s.load);
  const [list, setList] = useState<SavedDesign[]>(() => listSaved());
  const [name, setName] = useState('');
  const locale = useLocale();
  const mine = list.filter((d) => decodeConfig(d.code)?.model === config.model);

  return (
    <div className="absolute top-full right-0 z-40 mt-2 grid w-80 max-w-[calc(100vw-1.5rem)] gap-3 rounded-2xl border border-line bg-surface p-4 shadow-xl" role="dialog" aria-label={t('title')}>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{t('title')}</h2>
        <button type="button" className="rounded-full px-2 text-lg leading-none hover:bg-paper" aria-label={t('close')} onClick={onClose}>
          ×
        </button>
      </div>
      <p className="text-sm text-muted">{t('help')}</p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          setList(saveDesign(name, config));
          setName('');
        }}
      >
        <input className="h-10 min-w-0 flex-1 rounded-lg border border-line px-3 text-sm" placeholder={t('placeholder')} aria-label={t('name')} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="rounded-full bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50" disabled={!name.trim()}>
          {t('save')}
        </button>
      </form>
      {mine.length === 0 ? (
        <p className="text-sm text-muted">{t('empty')}</p>
      ) : (
        <ul className="grid max-h-60 gap-1 overflow-y-auto" data-testid="saved-list">
          {mine.map((d) => (
            <li key={d.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-paper">
              <button
                type="button"
                className="min-w-0 flex-1 text-left text-sm"
                onClick={() => {
                  const saved = decodeConfig(d.code);
                  if (saved) load(saved);
                  onClose();
                }}
              >
                <span className="block truncate font-medium">{d.name}</span>
                <span className="text-xs text-muted">{formatDate(d.savedAt, locale)}</span>
              </button>
              <button type="button" className="rounded-full px-2 text-sm text-muted hover:text-warn" aria-label={t('remove', { name: d.name })} onClick={() => setList(removeSaved(d.id))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Notices() {
  const t = useTranslations('notices');
  const f = useFormat();
  const notices = useConfigurator((s) => s.notices);
  const dismiss = useConfigurator((s) => s.dismissNotices);
  const undo = useConfigurator((s) => s.undo);

  useEffect(() => {
    if (notices.length === 0) return;
    const timer = setTimeout(dismiss, 9000);
    return () => clearTimeout(timer);
  }, [notices, dismiss]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 grid justify-items-center gap-2 px-3" aria-live="polite">
      {notices.map((n) => (
        <div key={n.code} className="pointer-events-auto flex max-w-xl items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-white shadow-xl" data-testid="notice">
          <span>{n.code === 'doubleDoorsRemoved' ? t(n.code, { min: f.length(Number(n.params.min)) }) : n.code === 'restoredDefaults' || n.code === 'railRemoved' || n.code === 'turnRemoved' || n.code === 'plinthRemoved' ? t(n.code) : t(n.code, { max: Number(n.params.max) })}</span>
          {n.code !== 'restoredDefaults' && (
            <button type="button" className="shrink-0 rounded-full border border-white/40 px-3 py-1 font-medium hover:bg-white/10" onClick={undo}>
              {t('undo')}
            </button>
          )}
          <button type="button" className="shrink-0 rounded-full px-2 text-lg leading-none hover:bg-white/10" aria-label={t('dismiss')} onClick={dismiss}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export function Configurator({ slug }: { slug: string }) {
  const t = useTranslations('header');
  const tm = useTranslations('models');
  const tb = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const config = useConfigurator((s) => s.config);
  const tab = useConfigurator((s) => s.tab);
  const unit = useConfigurator((s) => s.unit);
  const canUndo = useConfigurator((s) => s.past.length > 0);
  const canRedo = useConfigurator((s) => s.future.length > 0);
  const { load, setTab, setUnit, undo, redo } = useConfigurator.getState();
  const [hydrated, setHydrated] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const model = requireModel(slug);
  const started = useRef(false);

  // Restore from the share link (or start from the model's defaults), then keep the URL in step.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const code = new URLSearchParams(window.location.search).get('c');
    const shared = decodeConfig(code);
    if (shared && shared.model === slug) load(shared);
    else load(defaultConfig(slug), code ? { code: 'restoredDefaults', params: {} } : undefined);
    const stored = readUnit();
    if (stored) setUnit(stored);
    setTab('settings');
    setHydrated(true);
  }, [slug, load, setUnit, setTab]);

  useEffect(() => {
    if (!hydrated) return;
    // Only the design code changes; other parameters (e.g. the 3D view's `quality`) stay in the address.
    const params = new URLSearchParams(window.location.search);
    params.delete('c');
    const rest = params.toString();
    const url = `${window.location.pathname}?${rest ? `${rest}&` : ''}c=${encodeConfig(config)}`;
    window.history.replaceState(window.history.state, '', url);
  }, [config, hydrated]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || (target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'range'))) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const copyLink = async () => {
    await navigator.clipboard?.writeText(`${window.location.origin}${window.location.pathname}?c=${encodeConfig(config)}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const otherLocale = routing.locales.find((l) => l !== locale) ?? routing.defaultLocale;

  return (
    <div className="min-h-dvh" data-testid="configurator" data-hydrated={hydrated ? '1' : '0'} data-config={hydrated ? encodeConfig(config) : ''}>
      <header className="no-print z-30 border-b border-line bg-surface/95 backdrop-blur lg:sticky lg:top-0">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 lg:px-4">
          <Link href="/" className="text-lg font-bold tracking-tight text-accent-strong">
            {tb('brand')}
          </Link>
          <Link href="/" className="rounded-full border border-line px-3 py-1 text-sm hover:border-accent hover:text-accent" data-testid="all-models">
            {t('models')}
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-sm font-medium sm:text-base">{tm(model.nameKey as 'sideboard')}</h1>
          <div className="flex rounded-full bg-paper p-1" role="tablist" aria-label={t('view')}>
            {(['settings', 'results'] as const).map((name) => (
              <button key={name} type="button" role="tab" aria-selected={tab === name} className={cx('rounded-full px-3 py-1 text-sm', tab === name ? 'bg-accent text-white' : 'hover:bg-surface')} onClick={() => setTab(name)} data-testid={`tab-${name}`}>
                {t(name)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={headerButton} disabled={!canUndo} onClick={undo} title={t('undoHint')} data-testid="undo">
              {t('undo')}
            </button>
            <button type="button" className={headerButton} disabled={!canRedo} onClick={redo} title={t('redoHint')} data-testid="redo">
              {t('redo')}
            </button>
            <div className="relative">
              <button type="button" className={headerButton} aria-expanded={saveOpen} onClick={() => setSaveOpen(!saveOpen)} data-testid="save">
                {t('save')}
              </button>
              {saveOpen && <SavePanel onClose={() => setSaveOpen(false)} />}
            </div>
            <button type="button" className={headerButton} onClick={copyLink} data-testid="share">
              {copied ? t('linkCopied') : t('share')}
            </button>
            <div className="flex rounded-full bg-paper p-1" role="radiogroup" aria-label={t('unit')}>
              {(['cm', 'mm'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  role="radio"
                  aria-checked={unit === u}
                  className={cx('rounded-full px-2.5 py-1 text-sm', unit === u ? 'bg-accent text-white' : 'hover:bg-surface')}
                  onClick={() => {
                    setUnit(u);
                    writeUnit(u);
                  }}
                  data-testid={`unit-${u}`}
                >
                  {u}
                </button>
              ))}
            </div>
            <button type="button" className={headerButton} lang={otherLocale} onClick={() => router.replace({ pathname, query: { c: encodeConfig(config) } }, { locale: otherLocale })} data-testid="locale-switch">
              {t(`languages.${otherLocale}`)}
            </button>
          </div>
        </div>
      </header>
      <main className={cx('mx-auto grid max-w-[1500px] gap-3 p-3 lg:gap-4 lg:p-4', tab === 'results' ? 'lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]' : 'lg:grid-cols-[minmax(0,1fr)_minmax(380px,460px)]')}>
        <div className="sticky top-2 z-20 h-[38dvh] min-h-56 lg:top-[4.25rem] lg:h-[calc(100dvh-5.25rem)]">
          <Viewer />
        </div>
        <div className="grid content-start gap-3">
          {tab === 'settings' ? (
            <>
              <Steps />
              <Summary />
            </>
          ) : (
            <Results />
          )}
        </div>
      </main>
      <Notices />
    </div>
  );
}
