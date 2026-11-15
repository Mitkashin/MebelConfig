import { create } from 'zustand';
import { derive, type PriceOverrides } from '@/engine/derive';
import { getModel, requireModel } from '@/engine/models';
import { distributeEqual, limits, normalise, resizeElement, scaleWidths, validate } from '@/engine/rules';
import { defaultConfig } from '@/engine/share';
import type { Config, Derived, ElementConfig, Issue, Notice } from '@/engine/types';

export type Unit = 'cm' | 'mm';
export type Tab = 'settings' | 'results';

const HISTORY_LIMIT = 100;

interface State {
  config: Config;
  derived: Derived;
  overrides: PriceOverrides;
  past: Config[];
  future: Config[];
  unit: Unit;
  tab: Tab;
  doorsOpen: boolean;
  exploded: boolean;
  showDimensions: boolean;
  /** Part ids highlighted in the viewer and the cut list. */
  selected: string[];
  notices: Notice[];
  /** Field path → issue, for inputs whose typed value was rejected. */
  errors: Record<string, Issue>;

  load: (config: Config, notice?: Notice) => void;
  /** Validate and apply. Returns the issues when the configuration is rejected. */
  commit: (next: Config) => Issue[];
  setDimension: (key: 'width' | 'height' | 'depth', value: number) => Issue[];
  setElementCount: (count: number) => Issue[];
  setElementWidth: (index: number, width: number) => Issue[];
  equalise: () => void;
  patchElement: (index: number, patch: Partial<ElementConfig>) => Issue[];
  patch: (patch: Partial<Config>) => Issue[];
  undo: () => void;
  redo: () => void;
  setError: (path: string, issue: Issue | null) => void;
  setUnit: (unit: Unit) => void;
  setTab: (tab: Tab) => void;
  setOverrides: (overrides: PriceOverrides) => void;
  toggle: (key: 'doorsOpen' | 'exploded' | 'showDimensions') => void;
  select: (ids: string[]) => void;
  dismissNotices: () => void;
}

const same = (a: Config, b: Config) => JSON.stringify(a) === JSON.stringify(b);

export const useConfigurator = create<State>((set, get) => {
  const initial = defaultConfig('sideboard-1');

  const apply = (config: Config, extra: Partial<State> = {}) =>
    set((s) => ({ config, derived: derive(config, s.overrides), selected: [], ...extra }));

  return {
    config: initial,
    derived: derive(initial),
    overrides: {},
    past: [],
    future: [],
    unit: 'cm',
    tab: 'settings',
    doorsOpen: false,
    exploded: false,
    showDimensions: false,
    selected: [],
    notices: [],
    errors: {},

    load: (config, notice) => apply(config, { past: [], future: [], errors: {}, notices: notice ? [notice] : [] }),

    commit: (next) => {
      // Dependent values are brought back into range first (and reported), then the result is checked.
      const model = getModel(next.model);
      const { config, notices } = model ? normalise(next, model) : { config: next, notices: [] };
      const issues = validate(config);
      if (issues.length > 0) return issues;
      const current = get().config;
      if (same(config, current)) return [];
      apply(config, { past: [...get().past, current].slice(-HISTORY_LIMIT), future: [], notices });
      return [];
    },

    setDimension: (key, value) => {
      const { config, commit } = get();
      if (key !== 'width') return commit({ ...config, [key]: value });
      const p = requireModel(config.model).params;
      // Keep the customer's proportions when the overall width changes.
      const widths = scaleWidths(config.elements.map((e) => e.width), value, p.elementMin);
      return commit({ ...config, width: value, elements: config.elements.map((e, i) => ({ ...e, width: widths[i] ?? e.width })) });
    },

    setElementCount: (count) => {
      const { config, commit } = get();
      const model = requireModel(config.model);
      const lim = limits(config, model);
      if (!Number.isInteger(count) || count < lim.elements.min || count > lim.elements.max) {
        return [{ code: 'elementCount', path: 'elements', params: { min: lim.elements.min, max: lim.elements.max } }];
      }
      const widths = distributeEqual(config.width, count);
      const template = model.defaults.elements[0] as ElementConfig;
      const elements = widths.map((width, i) => ({ ...(config.elements[i] ?? { ...template, shelves: Math.min(template.shelves, lim.maxShelves) }), width }));
      return commit({ ...config, elements });
    },

    setElementWidth: (index, width) => {
      const { config, commit } = get();
      const p = requireModel(config.model).params;
      const widths = resizeElement(config.elements.map((e) => e.width), index, width, p.elementMin);
      if (!widths) {
        const max = config.width - (config.elements.length - 1) * p.elementMin;
        return [{ code: 'elementMin', path: `elements.${index}.width`, params: { min: p.elementMin, max } }];
      }
      return commit({ ...config, elements: config.elements.map((e, i) => ({ ...e, width: widths[i] ?? e.width })) });
    },

    equalise: () => {
      const { config, commit } = get();
      const widths = distributeEqual(config.width, config.elements.length);
      commit({ ...config, elements: config.elements.map((e, i) => ({ ...e, width: widths[i] ?? e.width })) });
    },

    patchElement: (index, patch) => {
      const { config, commit } = get();
      return commit({ ...config, elements: config.elements.map((e, i) => (i === index ? { ...e, ...patch } : e)) });
    },

    patch: (patch) => get().commit({ ...get().config, ...patch }),

    undo: () => {
      const { past, future, config } = get();
      const previous = past[past.length - 1];
      if (!previous) return;
      apply(previous, { past: past.slice(0, -1), future: [config, ...future], notices: [], errors: {} });
    },

    redo: () => {
      const { past, future, config } = get();
      const next = future[0];
      if (!next) return;
      apply(next, { past: [...past, config], future: future.slice(1), notices: [], errors: {} });
    },

    setError: (path, issue) =>
      set((s) => {
        if (!issue && !(path in s.errors)) return s;
        const errors = { ...s.errors };
        if (issue) errors[path] = issue;
        else delete errors[path];
        return { errors };
      }),

    setUnit: (unit) => set({ unit }),
    setTab: (tab) => set({ tab }),
    setOverrides: (overrides) => set((s) => ({ overrides, derived: derive(s.config, overrides) })),
    toggle: (key) =>
      set((s) => {
        const value = !s[key];
        // Doors cannot swing while the piece is taken apart.
        if (key === 'exploded' && value) return { exploded: true, doorsOpen: false };
        if (key === 'doorsOpen' && value) return { doorsOpen: true, exploded: false };
        return { [key]: value } as Partial<State>;
      }),
    select: (ids) => set({ selected: ids }),
    dismissNotices: () => set({ notices: [] }),
  };
});
