# Made-to-measure furniture configurator

A 3D configurator for carcass furniture (wall-hung sideboard, wall shelf unit)
in Macedonian and English. The customer sets the size, elements, fronts,
colours and details, sees the price and sheet count live, and gets a cut
list, guillotine sheet layouts, a hardware list and a price breakdown, with
PDF and CSV export and a link that restores the exact design.

## Run

```bash
npm install
npm run dev          # http://localhost:3000  → redirects to /mk or /en
npm run build && npm start
```

Node 20 or newer.

In `npm run dev`, open the app at `http://localhost:3000`. The dev server only
serves its scripts to addresses it trusts; `next.config.ts` adds 127.0.0.1 and
this computer's own name and network addresses. For any other address (a
tunnel, a custom host name) set `DEV_ORIGINS=host1,host2` before starting, or
the page will load but stay unresponsive with "Loading 3D view…". The
production build (`npm run build && npm start`) has no such restriction.

## Checks

```bash
npm run typecheck    # tsc
npm run lint         # ESLint, incl. "no literal strings in components"
npm test             # Vitest: engine invariants, catalogues, formatting
npm run build
npm run test:e2e     # Playwright against the production build (uses installed Chrome)
npm run screenshots  # regenerates docs/screenshots and docs/sample-cut-list-mk.pdf
```

## Layout

| Path | What |
|---|---|
| `src/engine` | Framework-free core: models, rules, `buildParts`, cut list, nesting, hardware, price, share link |
| `src/engine/models` | Model definitions (data). Add a model here; no UI or viewer change needed |
| `src/engine/catalog.ts` | Decors, sheet sizes, prices (placeholders) |
| `src/store` | Zustand store: config, undo/redo, view state; saved designs |
| `src/components` | Shell, steps, summary, viewer (react-three-fiber), results |
| `messages` | `mk.json`, `en.json` — all user-facing text |
| `tests/unit`, `tests/e2e` | Vitest and Playwright |
| `docs` | Reference analysis, plan, assumptions, final report, screenshots |

`derive(config)` in `src/engine/derive.ts` is the single chain every view reads
from: parts → handles → cut list → sheet layouts → hardware → price.

## Models are modules

`/` is the chooser ("What are we building?"). Each furniture type is one file
in `src/engine/models/` and owns everything that differs between types:

| In the model file | Effect |
|---|---|
| `params` | Limits (width, height, depth, elements, widest element) and construction values |
| `fronts` | Which of doors / open / drawers an element may have; controls for the rest are not shown |
| `mounts`, `legHeights` | Wall-hung, on legs, or on the floor; the mounting and leg controls appear only when there is a choice |
| `features` | Back panel, double top, handles, hanging rail — each switches its control on or off |
| `tags`, `nameKey` | The chooser card |
| `defaults` | The starting design |

Current models: wall-hung sideboard with doors, open sideboard, standing
sideboard on legs, chest of drawers, wardrobe, nightstand, wall cabinet.

To add one: copy a model file, adjust it, register it in
`src/engine/models/index.ts`, add its name and description under `models`
and `home.desc` in both message files, then run `npm run screenshots` to
render its chooser image into `public/models/`. The unit tests pick the new
model up automatically and run every invariant against it.

## Replace before going live

Board decors and their prices come from the supplier Soloprom (`src/engine/decors.json`, images in `public/decors/`); HDF, banding, cutting and hardware prices and the brand name are placeholders (`docs/assumptions.md`).
The inquiry endpoint (`src/app/api/inquiry/route.ts`) validates and logs; wire
it to email or a CRM.
