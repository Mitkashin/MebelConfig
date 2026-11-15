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

## Adding a model

Add a `ModelDef` to `src/engine/models/index.ts` (parameters, allowed fronts,
feature flags, defaults), add its name under `models` and `home` in both
message files. It appears on the home page and gets its own
`/configurator/<slug>` route.

## Replace before going live

Prices, decors and the brand name are placeholders (`docs/assumptions.md`).
The inquiry endpoint (`src/app/api/inquiry/route.ts`) validates and logs; wire
it to email or a CRM.
