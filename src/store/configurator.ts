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
  /** Elements whose width the customer typed; later edits leave them alone where possible. */
  pinned: number[];
  /** Field path → issue, for inputs whose typed value was rejected. */
  errors: Record<string, Issue>;

  load: (config: Config, notice?: Notice) => void;
  /** Validate and apply. Returns the issues when the configuration is rejected. */
  commit: (next: Config) => Issue[];
  setDimension: (key: 'width' | 'height' | 'depth', value: number) => Issue[];
  setElementCount: (count: number) => Issue[];
  setElementWidth: (index: number, width: number) => Issue[];
  equalise: () => void;
  unpin: (index: number) => void;
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
    pinned: [],
    errors: {},

    load: (config, notice) => apply(config, { past: [], future: [], errors: {}, pinned: [], notices: notice ? [notice] : [] }),

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
      const { config, commit, pinned } = get();
      if (key !== 'width') return commit({ ...config, [key]: value });
      const p = requireModel(config.model).params;
      const current = config.elements.map((e) => e.width);
      // Elements the customer sized keep their width; the others take up the change in proportion.
      const free = current.map((_, i) => i).filter((i) => !pinned.includes(i));
      let widths: number[] | null = null;
      if (free.length > 0 && free.length < current.length) {
        const fixed = current.reduce((s, w, i) => (pinned.includes(i) ? s + w : s), 0);
        const scaled = scaleWidths(free.map((i) => current[i] as number), value - fixed, p.elementMin);
        if (value - fixed >= free.length * p.elementMin && scaled.every((w) => w >= p.elementMin && w <= p.elementMax)) {
          widths = [...current];
          free.forEach((i, k) => (widths![i] = scaled[k] as number));
        }
      }
      const release = widths === null && pinned.length > 0;
      widths ??= scaleWidths(current, value, p.elementMin);
      const issues = commit({ ...config, width: value, elements: config.elements.map((e, i) => ({ ...e, width: widths![i] ?? e.width })) });
      if (issues.length === 0 && release) set({ pinned: [] });
      return issues;
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
      const issues = commit({ ...config, elements });
      if (issues.length === 0) set({ pinned: [] });
      return issues;
    },

    setElementWidth: (index, width) => {
      const { config, commit, pinned } = get();
      const p = requireModel(config.model).params;
      const result = resizeElement(config.elements.map((e) => e.width), index, width, p.elementMin, pinned, p.elementMax);
      if (!result) {
        const max = Math.min(p.elementMax, config.width - (config.elements.length - 1) * p.elementMin);
        return [{ code: width > p.elementMax ? 'elementMax' : 'elementMin', path: `elements.${index}.width`, params: { min: p.elementMin, max } }];
      }
      const issues = commit({ ...config, elements: config.elements.map((e, i) => ({ ...e, width: result.widths[i] ?? e.width })) });
      if (issues.length === 0) set({ pinned: result.released ? [index] : [...pinned.filter((i) => i !== index), index] });
      return issues;
    },

    equalise: () => {
      const { config, commit } = get();
      const widths = distributeEqual(config.width, config.elements.length);
      commit({ ...config, elements: config.elements.map((e, i) => ({ ...e, width: widths[i] ?? e.width })) });
      set({ pinned: [] });
    },

    unpin: (index) => set((s) => ({ pinned: s.pinned.filter((i) => i !== index) })),

    patchElement: (index, patch) => {
      const { config, commit } = get();
      return commit({ ...config, elements: config.elements.map((e, i) => (i === index ? { ...e, ...patch } : e)) });
    },

    patch: (patch) => get().commit({ ...get().config, ...patch }),

    undo: () => {
      const { past, future, config } = get();
      const previous = past[past.length - 1];
      if (!previous) return;
      apply(previous, { past: past.slice(0, -1), future: [config, ...future], notices: [], errors: {}, pinned: [] });
    },

    redo: () => {
      const { past, future, config } = get();
      const next = future[0];
      if (!next) return;
      apply(next, { past: [...past, config], future: future.slice(1), notices: [], errors: {}, pinned: [] });
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
