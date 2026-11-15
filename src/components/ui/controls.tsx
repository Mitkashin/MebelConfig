'use client';

import { useTranslations } from 'next-intl';
import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Issue } from '@/engine/types';
import { parseLength, useFormat } from '@/lib/format';
import { useConfigurator } from '@/store/configurator';

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

const roundButton =
  'grid size-9 shrink-0 place-items-center rounded-full border border-line bg-surface text-lg leading-none text-ink transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40';

interface NumberFieldProps {
  path: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (mm: number) => Issue[];
  slider?: boolean;
}

/**
 * Length input with steppers and an optional slider. A rejected value stays
 * in the field with an explanation; the model keeps its last valid value.
 */
export function NumberField({ path, label, value, min, max, onCommit, slider = false }: NumberFieldProps) {
  const t = useTranslations('field');
  const f = useFormat();
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const error = useConfigurator((s) => s.errors[path]);
  const setError = useConfigurator((s) => s.setError);

  const attempt = (mm: number | null): boolean => {
    if (mm === null) {
      setError(path, { code: 'invalid', path, params: {} });
      return false;
    }
    const issues = onCommit(mm);
    const issue = issues.find((i) => i.path === path) ?? issues[0];
    setError(path, issue ?? null);
    return !issue;
  };

  const step = (delta: number) => {
    if (attempt(value + delta)) setDraft(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const big = e.shiftKey ? 10 : 1;
    const delta = e.key === 'ArrowUp' ? big : e.key === 'ArrowDown' ? -big : e.key === 'PageUp' ? 100 : e.key === 'PageDown' ? -100 : 0;
    if (delta !== 0) {
      e.preventDefault();
      step(delta);
    }
  };

  const typed = draft !== null ? parseLength(draft, f.unit) : null;
  const nearest = typed !== null ? Math.min(max, Math.max(min, typed)) : null;

  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <button type="button" className={roundButton} aria-label={t('decrease', { field: label })} title={t('stepHint')} disabled={value <= min} onClick={(e) => step(e.shiftKey ? -10 : -1)}>
          −
        </button>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className={cx(
            'h-10 w-full min-w-0 rounded-lg border bg-surface px-3 text-right text-base tabular-nums',
            error ? 'border-warn text-warn' : 'border-line',
          )}
          value={draft ?? f.lengthValue(value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            attempt(parseLength(e.target.value, f.unit));
          }}
          onBlur={() => {
            if (!error) setDraft(null);
          }}
          onKeyDown={onKeyDown}
        />
        <span className="w-7 text-sm text-muted">{f.unit}</span>
        <button type="button" className={roundButton} aria-label={t('increase', { field: label })} title={t('stepHint')} disabled={value >= max} onClick={(e) => step(e.shiftKey ? 10 : 1)}>
          +
        </button>
      </div>
      {slider && (
        <input
          type="range"
          className="w-full"
          aria-label={t('slider', { field: label })}
          min={min}
          max={max}
          step={1}
          value={value}
          onChange={(e) => {
            if (attempt(Number(e.target.value))) setDraft(null);
          }}
        />
      )}
      {error && (
        <div id={`${id}-error`} role="alert" className="flex flex-wrap items-center gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          <span>{f.issueText(error, label)}</span>
          {nearest !== null && nearest !== typed && (
            <button
              type="button"
              className="rounded-full border border-warn px-2.5 py-0.5 text-xs font-medium hover:bg-warn hover:text-white"
              onClick={() => {
                if (attempt(nearest)) setDraft(null);
              }}
            >
              {t('useNearest', { value: f.length(nearest) })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface CounterProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

export function Counter({ label, value, min, max, onChange }: CounterProps) {
  const t = useTranslations('field');
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" className={roundButton} aria-label={t('decrease', { field: label })} disabled={value <= min} onClick={() => onChange(value - 1)}>
          −
        </button>
        <output className="w-8 text-center text-base tabular-nums" aria-live="polite">
          {value}
        </output>
        <button type="button" className={roundButton} aria-label={t('increase', { field: label })} disabled={value >= max} onClick={() => onChange(value + 1)}>
          +
        </button>
      </div>
    </div>
  );
}

interface SegmentedProps<T extends string | number> {
  label: string;
  value: T;
  options: { value: T; label: string; disabled?: boolean; hint?: string }[];
  onChange: (value: T) => void;
  hideLabel?: boolean;
}

export function Segmented<T extends string | number>({ label, value, options, onChange, hideLabel = false }: SegmentedProps<T>) {
  return (
    <div className="grid gap-1.5">
      {!hideLabel && <span className="text-sm font-medium">{label}</span>}
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1 rounded-xl bg-paper p-1">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            disabled={o.disabled}
            title={o.hint}
            className={cx(
              'min-h-9 flex-1 rounded-lg px-3 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-40',
              o.value === value ? 'bg-accent text-white shadow-sm' : 'text-ink hover:bg-surface',
            )}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Switch({ label, help, checked, onChange }: { label: string; help?: string; checked: boolean; onChange: (checked: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="grid gap-0.5">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {help && <p className="text-sm text-muted">{help}</p>}
      </div>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="relative mt-0.5 h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-line transition before:absolute before:top-0.5 before:left-0.5 before:size-5 before:rounded-full before:bg-white before:shadow before:transition checked:bg-accent checked:before:translate-x-5"
      />
    </div>
  );
}

interface StepCardProps {
  index: number;
  title: string;
  summary: string;
  help: string;
  open: boolean;
  invalid: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function StepCard({ index, title, summary, help, open, invalid, onToggle, children }: StepCardProps) {
  const t = useTranslations('steps');
  const id = useId();
  return (
    <section className="rounded-2xl border border-line bg-surface" data-testid={`step-${index}`}>
      <h3>
        <button type="button" className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left" aria-expanded={open} aria-controls={id} onClick={onToggle}>
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent-strong tabular-nums" aria-hidden="true">
            {String(index).padStart(2, '0')}
          </span>
          <span className="grid min-w-0 flex-1">
            <span className="flex items-center gap-2 font-semibold">
              <span className="sr-only">{t('stepN', { n: index })}</span>
              {title}
              {invalid && <span className="size-2 rounded-full bg-warn" role="img" aria-label={t('needsAttention')} />}
            </span>
            <span className="truncate text-sm text-muted">{summary}</span>
          </span>
          <svg viewBox="0 0 20 20" className={cx('size-5 shrink-0 text-muted transition-transform', open && 'rotate-180')} aria-hidden="true">
            <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </h3>
      <div id={id} hidden={!open} className="grid gap-4 border-t border-line px-4 py-4">
        <p className="text-sm text-muted">{help}</p>
        {children}
      </div>
    </section>
  );
}

export { cx };
