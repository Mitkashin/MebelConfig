# Final report

## What was built

A made-to-measure furniture configurator in Macedonian (default) and English,
on Next.js 16 (App Router), TypeScript, react-three-fiber, Zustand, Zod,
next-intl and Tailwind.

**Parity with the reference** (every control in `reference-analysis.md` §2):

- Six steps: dimensions (field, steppers, slider), elements (count, width of
  each, equalise, proportion bar), fronts and shelves per element (doors or
  open, shelf count with the height-dependent maximum, single or double door,
  opening auto/left/right/bottom flap), colours (separate body and front
  decor, category filter with counts, search, show more, copy code), details
  (HDF back, double 36 mm top, handles or push-to-open, seven handle shapes,
  five colours), summary.
- cm/mm toggle (remembered), save, settings/results switch, open/close all.
- 3D viewer built procedurally from the parts list: drag to rotate, zoom,
  reset, click a part to highlight its cut-list row (and the reverse), a door
  or drawer opens when clicked, open fronts, exploded view.
- Results: cut list grouped like the reference's, sheet count, price, the
  customer's own prices, hardware list, CSV, PDF, copy table, print.

For the reference's default configuration the engine reproduces the generated
cut list row for row (8 rows, 25 parts), the edge-banding length (21.04 m vs
"21 m"), the sheet count (3) with the same utilisation per sheet (52 %, 18 %,
18 %), and the shopping-list quantities. This is locked in by a unit test.

**Improvements, in the brief's order:**

1. Live price and sheet count in the summary while configuring.
2. The address bar always holds a link that restores the exact design; Copy
   link in the header and results.
3. PDF and CSV export with banding per part (and an edge diagram on screen).
4. Sheet layout diagrams: guillotine nesting, 4 mm kerf, 10 mm trim, grain
   respected; clickable, colour-matched to the cut list. (Paid-only in the
   reference.)
5. Hardware list: hinges, flap stays, handles or push latches, shelf pins,
   wall brackets, drawer slides, screws, caps, nails, plugs.
6. Drawers as a third front option per element, with a full drawer box.
7. Dimension labels in the 3D view; undo/redo (buttons, Ctrl+Z, Ctrl+Shift+Z).
8. Mobile: the viewer stays pinned at the top while the controls scroll.
9. Validation messages state the limit and the allowed range, and offer the
   nearest allowed value in one click; automatic adjustments are announced
   with Undo.
10. three.js (about 950 KB) and the PDF library load on demand — the first
    load is about 810 KB of uncompressed script without them. All controls
    are native buttons and inputs; the viewer rotates with the arrow keys.

Also: a second model (open wall shelf) defined purely as data, to show the
shell and viewer need no changes for a new model.

## How to run

```bash
npm install
npm run dev            # http://localhost:3000
npm run check          # type-check, lint, unit tests, production build
npm run test:e2e       # Playwright on the production build
```

## Verification done

| Check | Result |
|---|---|
| Type-check (`tsc --noEmit`) | pass |
| Lint, including no literal strings in components and a framework-free engine | pass, 0 problems |
| Unit tests | 31 pass — invariants over 300 random configurations |
| Production build | pass |
| End-to-end | 10 pass: full flow in mk and en (configure every step, generate, CSV, PDF, inquiry, reopen from the link, switch language), root redirects, broken link, shelf clamp with undo, second model, mobile pinning, keyboard |
| 3D screenshots | 8 configurations reviewed by eye (`docs/screenshots`): no gaps, z-fighting or misplaced doors seen |
| PDF | Opened and read: Cyrillic, tables, sheet diagrams and totals render (`docs/sample-cut-list-mk.pdf`) |

Invariants tested: element widths plus panel thicknesses equal the total
width; no overlapping parts; all parts inside the outer dimensions; every
scene part is in exactly one cut-list row and vice versa; every part placed
once on a sheet, inside the trim, a kerf apart, grained parts unrotated; price
equals the sum of its lines; hardware counts follow the parts.

Problems the checks caught and that were fixed: wide drawer fronts that could
not be cut with vertical grain; Macedonian numbers shown with English
separators in Chrome; a height change being rejected instead of reducing
shelves; active toolbar buttons with invisible labels; exploded view moving
the backs behind the wall.

## Assumptions

See `assumptions.md`. The ones that most need a decision: prices and the
decor catalogue are placeholders; the brand name "PoMerka" is a placeholder;
the inquiry form validates and logs but does not send email; there are no
accounts, so "Save" is per browser.

## Not verified about the reference

- Generated results were seen for the default configuration only (one free
  generation per account). Double doors, flaps, double top and other sizes
  are matched to the 3D geometry and the bundle, not to a generated list.
- The reference's sheet layouts are paid-only and were not seen; only its
  sheet count and utilisation for the default were compared.
- Its cutting length for the default is 56.2 m; ours is 57.2 m (different
  nesting).
- The AI room render, assembly instructions and workshop picker were not
  explored.
- Mobile was checked in a 375 px emulation only.

## Known gaps

- Not rebuilt from the reference: accounts, AI room render, assembly
  instructions, send-to-workshop, shopping-list tick-off and tool list,
  half-sheet purchase.
- Nesting is a greedy guillotine heuristic tried with four orderings; it is
  valid but not guaranteed optimal, and larger jobs may use more sheets than
  an optimiser would.
- Tested in Chrome with software WebGL. Not run in Firefox, Safari or on a
  physical phone.
- No formal accessibility audit; screen-reader output of the 3D view is a
  description only.
- Handles are simple shapes; hinges and slides are not drawn.
- The app needs a Node host (it uses a language redirect and one API route),
  so it is not deployed anywhere yet.
