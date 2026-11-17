import { create } from 'zustand';

/** How the 3D view presents the piece. A viewing preference only: not part of the design or the share link. */
/** studio: catalogue backdrop; room: wall, skirting, floor; free: no surroundings, orbit all the way round. */
export type Backdrop = 'studio' | 'room' | 'free';
export type WallColor = 'white' | 'warmGrey' | 'sage' | 'terracotta' | 'charcoal';

export const WALL_COLORS: Record<WallColor, string> = {
  white: '#f3f1ec',
  warmGrey: '#d9d3ca',
  sage: '#b9c2ad',
  terracotta: '#c49a84',
  charcoal: '#4a4c4f',
};

const KEY = 'configurator:scene:v1';

interface SceneState {
  backdrop: Backdrop;
  wall: WallColor;
  /** Turntable: the free scene slowly turns the piece by itself. */
  spin: boolean;
  /** Exploded view: boards shown see-through, and how solid they stay (0.1–0.9). */
  seeThrough: boolean;
  opacity: number;
  setSeeThrough: (seeThrough: boolean) => void;
  setOpacity: (opacity: number) => void;
  setBackdrop: (backdrop: Backdrop) => void;
  setWall: (wall: WallColor) => void;
  setSpin: (spin: boolean) => void;
  /** Reads the stored preference; call once on the client after mounting. */
  hydrate: () => void;
}

function store(state: Pick<SceneState, 'backdrop' | 'wall' | 'spin'>) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ backdrop: state.backdrop, wall: state.wall, spin: state.spin }));
  } catch {
    // Storage can be unavailable (private mode); the preference is a convenience only.
  }
}

export const useScene = create<SceneState>((set, get) => ({
  backdrop: 'studio',
  wall: 'white',
  spin: false,
  seeThrough: false,
  opacity: 0.4,
  setSeeThrough: (seeThrough) => set({ seeThrough }),
  setOpacity: (opacity) => set({ opacity: Math.min(0.9, Math.max(0.1, opacity)) }),
  setBackdrop: (backdrop) => {
    set({ backdrop });
    store({ ...get(), backdrop });
  },
  setWall: (wall) => {
    set({ wall });
    store({ ...get(), wall });
  },
  setSpin: (spin) => {
    set({ spin });
    store({ ...get(), spin });
  },
  hydrate: () => {
    try {
      const raw = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as Partial<SceneState> | null;
      if (!raw) return;
      const backdrop = raw.backdrop === 'room' || raw.backdrop === 'studio' || raw.backdrop === 'free' ? raw.backdrop : get().backdrop;
      const wall = raw.wall && raw.wall in WALL_COLORS ? raw.wall : get().wall;
      set({ backdrop, wall, spin: raw.spin === true });
    } catch {
      // ignore broken or missing storage
    }
  },
}));
