# Reference analysis — sklopisam.rs/konfigurator/komoda-1

Studied on 2026-11-15 in a real browser (desktop 1133×1266 and a 375×812 mobile
emulation), plus the page HTML, the canvas instrumentation attributes, the
network script list and the public JS bundles. All dimensions below are in
millimetres unless a unit is given. Serbian labels are quoted only to identify
controls; none of them are reused in our product.

**How to read the evidence column:** *UI* = observed by operating the page,
*canvas* = read from the `data-*` attributes the viewer writes on its
`<canvas>`, *bundle* = read from the minified production chunks.

> **Generated results:** generation is behind sign-in (a free account gets one
> generation). The owner registered an account and the default configuration
> was generated once in their Chrome; section 5a records what that showed.
> Only the default configuration could be generated, and the sheet-layout tab
> is a paid feature, so the nesting itself remains reconstructed from the
> bundle.

## 1. Product and page structure

- Product: wall-hung sideboard with doors, default 1650 × 650 × 350
  (*UI, canvas* `data-cabinet-size-mm="1650,650,350"`). It hangs 400 above the
  floor in the scene (*canvas* `data-cabinet-bottom-mm="400"`).
- Layout: 3D viewer left, an accordion of five numbered steps plus a summary
  card on the right, a sticky "generate" button under the summary. A top bar
  holds a Settings/Results switch, Save and a cm/mm toggle.
- Results tab is locked until generation; its text promises part dimensions,
  sheet layouts, a shopping list, assembly instructions, PDF and "send to
  cutting", and says the 3D view, materials and an indicative price are free.
- The site is a multi-model platform; this page is model slug `komoda-1`
  (*bundle*: model registry keyed by slug, with per-model `controls` flags).

## 2. Control inventory

### Global
| Control | Behaviour | Evidence |
|---|---|---|
| cm / mm toggle | Re-renders every length; cm shows one decimal (165,0), mm shows integers with thousands separator. Stored in `localStorage["konfigurator:unit"]`. | UI |
| Save | Opens a sign-in dialog; saved designs live in an account. The draft is kept in `localStorage["fc-work-stash:v1"]`; the URL never changes, so there is no shareable link without an account. | UI |
| Settings / Results | Switches the right-hand panel. | UI |
| Open all / Collapse all | Expands or collapses all accordion steps. | UI |

### Step 1 — Dimensions
Each dimension has a text field (decimal input mode), − / + steppers and a
range slider.

| Field | Min | Max | Step | Default | Evidence |
|---|---|---|---|---|---|
| Width | 600, or 250 × element count if larger (750 for 3 elements) | 2780 | 1 mm (0.1 cm) | 1650 | UI slider `min=75 max=278 step=0.1`; bundle `width_min:600, width_max:2780, element_width_min:250` |
| Height | 300 | 2000 | 1 mm | 650 | UI, bundle |
| Depth | 50 | 600 | 1 mm | 350 | UI, bundle |

- Depth is the overall depth including back panel and doors (*UI help text*).
- Out-of-range input is **not clamped**: the typed value stays in the field,
  an inline error appears, the step header gets a red dot, the model keeps the
  last valid value, and the generate button is disabled with a list of fields
  to fix (*UI*).
- Messages seen: allowed range ("from 60,0 to 278,0 cm"); "for 3 elements the
  width must be at least 75,0 cm"; "the top panel cannot be longer than the
  sheet (278,0 cm) — place two sideboards side by side" (*UI*). 2780 is the
  2800 sheet minus 2 × 10 trim (*bundle* `trimMm:10`, `widthFitsSheet:true`).
- Changing the total width re-equalises all element widths, discarding any
  custom widths (165 → 180 turned 66.3/55/43.7 into 60/60/60) (*UI*).

### Step 2 — Elements
| Control | Behaviour | Evidence |
|---|---|---|
| Element count | 1–6, also capped by floor(width / 250). + is disabled at the cap. Changing the count equalises widths. | UI, bundle `elements_min:1, elements_max:6` |
| Width of each element | Min 250. Editing one element spreads the difference equally over the others; rejected with "element must be at least 25,0 cm wide" if any other would fall below 250. Widths always sum to the total width. | UI, bundle `resizeElement` |
| Equalise widths | floor(width / n) each, remainder 1 mm at a time from the left. | UI, bundle `distributeEqual` |
| Proportion bar | A strip showing relative element widths. | UI |

An "element" is a complete carcass (own bottom, two sides, two top rails), not
a bay between shared dividers: 3 elements = 25 meshes = 1 top + 3 × (bottom +
2 sides + 2 rails + shelf + back + door) (*canvas* `data-mesh-count`, *bundle*).

### Step 3 — Doors and shelves (per element)
| Control | Options | Dependencies | Evidence |
|---|---|---|---|
| Front | Doors / Open | Open hides door type and opening. | UI |
| Shelves | 0 … max, default 1 | max = floor((H − 36 − 18) / (150 + 18)) − 1 → 2 at H = 650, 0 at H = 330, 10 at H = 2000. Shown as "max shelves per element: N". Lowering the height silently reduces shelves and they do not come back when the height is raised again. | UI, bundle `shelf_spacing_min:150` |
| Shelf spacing (read-only) | (H − 36 − n·18) / (n + 1): 298 for one shelf, 193 for two | | UI |
| Door type | Single / Double | Double needs element width ≥ 300; it hides the opening control (left leaf hinges left, right leaf right). | UI, bundle `double_door_width_min:300` |
| Opening | Auto / Left / Right / Bottom flap | Auto: elements in the left half hinge left, the rest right (index < ceil(n/2)). A door wider than tall becomes a flap automatically. | UI, canvas `data-door-hinges`, bundle |

### Step 4 — Colours
- Separate body and front decor, each with: search by code or name, four
  category chips with counts (wood 80, materials 29, solid and white 92, a
  matt-lacquer line 37), 12 swatches then "show 12 more", a copy-code button
  per swatch and a link to the manufacturer page (*UI*).
- Decors are one manufacturer's licensed catalogue with photo thumbnails
  (`/decors/<brand>/<code>/thumb-480.webp`); the page carries a disclaimer that
  textures are illustrative (*UI*). **We do not reuse any of this.**
- Wood decors carry a grain flag that drives part orientation on the sheet
  (*bundle* `grain`).

### Step 5 — Details
| Control | Behaviour | Evidence |
|---|---|---|
| HDF back panel (switch, default on) | Adds one 3 mm back per element, element width × (H − 18). Without it the carcass is 3 deeper. | UI, canvas `data-back-count`, bundle |
| Double top 36 mm (switch, default off) | Top becomes two glued 18 boards; overall height unchanged, carcass and doors 18 lower. | UI, canvas door bounds |
| Opening method | Handles / Push-to-open. Push hides handle controls and removes handles. | UI, canvas `data-handle-count` |
| Handle shape | 128 bar, 320 bar, long vertical bar (half the door height), knob, recessed shell, profile along the top edge, top-edge pull | UI, canvas `data-handle-meshes` |
| Handle colour | grey (default), black, gold, white, brown | UI |

Handle placement on a 547 × 626 door (*canvas*): 128 bar is horizontal,
centred, 40 below the door top; 320 and long bars are vertical, 35 in from the
opening edge; knob 40 in and 45 down; edge profile spans the full door width.

### Summary and generation
- Summary lists W/H/D, element count, doors closed count, back, top, opening,
  handle style and one line per element (*UI*).
- Generate → sign-in wall (*UI*).

## 3. 3D viewer

| Aspect | Finding | Evidence |
|---|---|---|
| Engine | three.js r186, used directly; no react-three-fiber markers in any chunk | canvas `data-engine`, `window.__THREE__ === "186"`, bundle search |
| Model | Fully procedural: one box mesh per part, generated from the same part placements as the cut list (5 shared geometries, 25 meshes by default). No GLTF loader or model files requested. | canvas, bundle, network |
| Scene | Wall + floor "room", fog, PCF shadows (2048 map on desktop, 1024 on mobile, `data-quality`) | canvas |
| Camera | Orbit: drag to rotate, wheel/pinch to zoom, clamped distance; reset button | UI, canvas `data-camera-*` |
| Open doors | Side-hung doors swing 100°, flaps drop 90°; animated; button label flips | canvas `data-door-angles="100,100,100,90"` |
| Exploded view | Parts translate along a per-role direction (top up, bottoms down, sides outwards, shelves and doors forwards, backs backwards); disables the open-doors button | UI, bundle |
| Click a part | Tints it with the colour of its cut-list row, shows the row number as a badge, and swings that one door open | UI, canvas `data-highlighted-*` |
| AI render | "Generate image" asks a server for a rendered room picture (not explored; account feature) | UI |
| Accessibility | Canvas is exposed as an image with a description | UI a11y tree |

## 4. How parts are derived (bundle, confirmed by the generated cut list for the default)

Parameters for this model: board 18, back 3, front gap 4, door height
reduction 24, door width gap 2, top rail height 80, shelf front inset 15,
join allowance 1 per element when there are 3 or more elements.

| Part | Qty | Length × width | Edges banded | Position notes |
|---|---|---|---|---|
| Top | 1 | W × D, 18 or 36 thick | 1 long + 2 short | Covers everything; nothing overhangs it |
| Bottom | 1 per element | element width × carcass depth | front; plus outer short edge on end elements | Under the sides |
| Side | 2 per element | (H − 36, or − 54 with double top) × carcass depth | front | Stand on the bottom |
| Top rail | 2 per element | (element width − 36) × min(80, depth/2) | 1 long | Front and back, under the top |
| Shelf | n per element | (element width − 36) × (carcass depth − 15) | front | Evenly spaced |
| Back | 1 per element | element width × (H − 18), HDF 3 | none | Behind the carcass |
| Door | 1 or 2 per element | (element width − 2) × (H − 24); double: floor((w − 4)/2) each | all four | 4 in front of the carcass, 3 above the cabinet bottom |

- Carcass depth = D − (18 + 4 if any element has a front) − (3 if back) = 325
  by default. Open elements keep the same depth as closed ones.
- With 3+ elements each carcass is built 1 narrower than typed, so the row of
  carcasses is 1647 under a 1650 top; the slack is all on the right
  (*canvas*: doors at 1 from the left edge, 4 from the right).
- Hinges per door: 2 up to 900 on the hinge side, 3 up to 1600, otherwise 4.
- Cut list rows merge identical parts (same name, size, thickness, edges and
  note) and sum quantities.

## 5. Sheets and price (reconstructed from the bundle)

| Setting | Value |
|---|---|
| Board sheet | 2800 × 2070 |
| HDF sheet | 2800 × 2070 |
| Saw kerf | 4 |
| Edge trim | 10 per side |
| Reusable offcut | ≥ 300 × 300 |
| Fallback prices | board 12 000 RSD/sheet, HDF 2 500 RSD/sheet |
| Edge banding | 200 RSD/m, 30 allowance per banded edge |
| Cutting | 100 RSD per metre of cut, trim cuts counted |

- Nesting is guillotine strip packing tried along both axes with two sort
  orders, then a time-boxed improvement pass; parts on grained decors are not
  rotated; a half-sheet purchase option exists.
- Quote = Σ(sheet price × sheets per stock) + banding + cutting, with a
  per-element breakdown and a waste share. Hardware is listed in a shopping
  list (hinges, handles, shelf pins 4 per shelf, wall brackets 2 per element,
  screws, edge band with 10 % waste) rather than priced in the quote.
- Results also offer CSV, PDF, assembly steps and a workshop picker for
  sending the job to be cut.

## 5a. Generated results for the default configuration (observed)

Header: "25 parts · 3 sheets · utilisation 29 % · approx. 38 276 RSD", with
Copy table, CSV, Print, PDF and Send-to-cutting actions. Five tabs:

**Parts** — columns: part, quantity, length, width, thickness, edge banding,
note; grouped Carcass / Shelves / Fronts / Back / Hardware. Each row has a
coloured number that matches the highlight in the 3D view.

| Part | Qty | Length × width × thickness | Banding | Note |
|---|---|---|---|---|
| Top | 1 | 1650 × 350 × 18 | one long + both short | |
| Bottom, middle element | 1 | 549 × 325 × 18 | one long | |
| Bottom, end element | 2 | 549 × 325 × 18 | one long + one short | |
| Side | 6 | 614 × 325 × 18 | one long | |
| Top rail | 6 | 513 × 80 × 18 | one long | |
| Shelf | 3 | 513 × 310 × 18 | one long | |
| Door | 3 | 626 × 547 × 18 | all four | 2 hinge cup holes Ø35 on the long edge |
| Back | 3 | 632 × 549 × 3 | none | |
| Hinges | 6 | | | 2, 3 or 4 per door by height |
| Handles | 3 | | | one per door or drawer front |

This matches section 4 exactly, including the 1 mm join allowance.

**Sheets** — locked on the free plan (blurred preview, upsell to paid plans).

**Quote** — total 38 276 RSD = body decor 1 sheet × 15 000 (52 % used) + front
decor 1 sheet × 12 000 (18 %) + HDF 1 sheet × 2 500 (18 %) + edge band 21 m ×
150 RSD/m = 3 155 + cutting 56.2 m × 100 RSD/m = 5 620. It also splits the
total into "value of the piece" 19 202 and "unused material" 19 074 (50 %),
and lets the customer type their own sheet, banding and cutting prices and
recalculate. The 21 m equals Σ(banded edge + 30 mm) over all parts (21.04 m).

**What to buy** — a tick-off shopping list with a 10 % reserve on screws,
caps and plugs: hinges 6, handles 3, shelf pins 12 (4 per shelf), metal wall
brackets 6 (2 per carcass); screws 3.5×16 ×27 (4 per hinge), 4×30 ×27 (12 for
the top, 12 for the brackets), carcass screws 4×50 ×40 (2 per joint up to
400 mm depth), handle screws ×7, HDF nails ×53 (48 for the backs), screw caps
×40, wall plugs ×14; edge band per decor with 10 % reserve (14.5 m and 8 m);
a tool list.

**Assembly** — 38 illustrated steps with a part-labelling scheme, and a PDF.

## 6. Tech stack

| Claim | Evidence |
|---|---|
| Next.js App Router | `/_next/static/chunks/app/konfigurator/[slug]/page-*.js`, `app/layout-*.js`, `main-app-*.js`, `/_next/image` URLs |
| React with a context-provided store | error string "ConfiguratorStoreProvider is missing" |
| three.js r186, no r3f | see section 3 |
| Tailwind CSS with a `cn()` helper | utility class strings such as `rounded-[22px] p-4 ring-1` in component chunks |
| Zod validation | zod internals in two chunks; schema objects around the configuration |
| ICU-message i18n with namespaces, Serbian only | message catalogue chunk with `{count, plural, …}` strings; `<html lang="sr-Latn">` |
| Sentry | `sentry-trace` / `baggage` meta tags, `_sentryDebugIds` preamble in every chunk |
| PostHog (proxied under `/ingest`) and Google Ads tag | script URLs |
| Parts, nesting and quote run client-side | the functions are present in the page's chunks |

## 7. Weaknesses we can improve on

1. **Cut list and exports are behind sign-in and one free credit; sheet
   layouts are paid-only**; no price is visible while configuring.
2. **No shareable link** — state lives in localStorage and accounts only.
3. **Width changes wipe custom element widths**; lowering the height silently
   removes shelves with no message and no undo.
4. **No undo/redo.**
5. Validation text is good for width but generic elsewhere, and the depth
   minimum of 50 is not buildable with an 18 door, 4 gap and 3 back.
6. **No dimension labels** in the 3D view.
7. Carcass slack from the join allowance is placed entirely on one side.
8. The page requests about 2.8 MB of uncompressed script across 41 chunks,
   three.js included (sizes measured by fetching each chunk; whether the
   viewer chunk is deferred was not measured).
9. On reload the page reopened a "save" dialog from a stashed pending action
   although no sign-in had happened (seen once, mobile emulation).
10. Steppers move 1 mm per click only — slow for large changes without the
    slider; no keyboard shortcut for coarser steps.
11. Single language, single currency.
12. Mobile keeps the viewer above a bottom sheet, which works, but the sheet
    covers about a third of the screen and step content needs a lot of
    scrolling inside it.
