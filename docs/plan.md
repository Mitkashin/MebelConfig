# Plan

## Architecture

```
config (Zod-validated, URL-serialisable)
   │
   ▼
buildParts(config)            ← src/engine, pure TypeScript, no React/three
   │  Part[] : id, role, element, size, position, material, decor,
   │           grain, banded edges, hinge
   ├──► scene      (viewer renders one box per part)
   ├──► cut list   (group identical parts)
   ├──► nesting    (guillotine layouts per stock → sheet count)
   ├──► hardware   (hinges, handles, pins, brackets, slides, screws)
   └──► price      (sheets + banding + cutting + hardware line items)
```

`derive(config)` runs the whole chain once and returns everything, so the 3D
scene, cut list, sheet count and price cannot disagree.

- **Engine** (`src/engine`): framework-free. Lengths are integer millimetres.
  Origin is the cabinet's left-bottom-back corner; x right, y up, z to the
  front.
- **Models are data** (`src/engine/models`): a model definition holds its
  parameters, limits, defaults, feature flags and a `build` function. The
  registry is keyed by slug; the UI shell and viewer only read the
  definition. Adding a model = adding one file and registering it.
- **Config schema** (`src/engine/schema.ts`): Zod; structural validation plus
  model-level rule checks that return `{ code, path, params }` issues, which
  the UI translates. `share.ts` encodes the config as base64url JSON in `?c=`.
- **State** (`src/store`): Zustand store holding the last valid config, field
  drafts, an undo/redo history and view toggles.
- **UI** (`src/components`): Next.js App Router under `/[locale]`, next-intl
  for all text, Tailwind for styling. The viewer is `next/dynamic` with
  `ssr: false`.
- **Viewer**: react-three-fiber; one mesh per part; doors/drawers animate
  around hinge edges; exploded offsets by role.

## Data model

```ts
Config  { model, width, height, depth,
          elements: [{ width, front: 'doors'|'open'|'drawers', shelves,
                       doors: 1|2, opening: 'auto'|'left'|'right'|'bottom',
                       drawers }],
          bodyDecor, frontDecor, back, doubleTop,
          openingType: 'handles'|'push', handleShape, handleFinish }
Part    { id, role, element, material, decor, thickness, length, width,
          grain, edges{l1,l2,w1,w2}, position[3], size[3], hinge?, group? }
CutRow  { key, role, qty, length, width, thickness, material, decor,
          bandedEdges, partIds[] }
Sheet   { stock, index, placements[{partId,x,y,w,h,rotated}], used, waste }
Hardware{ key, qty, unit, unitPrice }
Price   { lines[{key, qty, unit, unitPrice, total}], total }
```

## Tasks and acceptance checks

| # | Task | Acceptance check |
|---|---|---|
| 1 | Scaffold: Next 16, TS, Tailwind, next-intl (en, mk), ESLint with a no-literal-strings rule, Vitest, Playwright | `npm run build` succeeds; `/` redirects to `/mk` |
| 2 | Config schema, model definition, limits and issue codes | Unit tests: defaults valid; each limit produces the right issue with min/max |
| 3 | Parts engine for the sideboard (top, bottoms, sides, rails, shelves, backs, doors) | Default config reproduces the reference geometry (door 547 × 626 at 3 above the bottom, carcass depth 325); invariants hold on 300 random configs |
| 4 | Cut list grouping, CSV | Σ row qty = part count; every part id appears in exactly one row |
| 5 | Guillotine nesting with kerf, trim and grain | No overlaps, all inside the trimmed sheet, kerf respected, grained parts unrotated |
| 6 | Hardware and price | Price total = Σ line items; hinge counts follow the height rule |
| 7 | Store with undo/redo, URL sync, element redistribution | Unit tests on redistribution; undo restores previous config |
| 8 | Configurator shell: six steps, summary, unit toggle, validation messages | E2E walks every step in both languages |
| 9 | 3D viewer: rotate, highlight ↔ cut list, open doors, exploded, reset | Screenshots of five configs reviewed |
| 10 | Results: cut list, sheet diagrams, hardware, price, PDF/CSV, inquiry | E2E downloads both files; PDF opens |
| 11 | Improvements 1–10 from the brief, in order | Each has a test or a screenshot |
| 12 | Final verification and report | type-check, lint, unit, e2e, build all pass |

## Risks

| Risk | Mitigation |
|---|---|
| Cut-list output of the reference could not be seen (sign-in wall) | Rules reconstructed from the bundle and cross-checked against canvas geometry; listed as unverified in the report |
| Headless WebGL for screenshots | System Chrome with SwiftShader flags; viewer exposes a `data-ready` flag |
| Cyrillic in PDF | pdfmake with its bundled Roboto (has Cyrillic), loaded on demand |
| Prices and decors are placeholders | Single `catalog.ts`; documented in assumptions |
| Drawer construction is our own design, not the reference's | Kept simple and conservative; rules documented in assumptions |
