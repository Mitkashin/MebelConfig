# Assumptions

The brief left several project-context fields as placeholders. Each choice
below is isolated in one place so it can be changed without touching the
engine or the UI.

## Project context
| Topic | Assumption | Where to change |
|---|---|---|
| Repository | Greenfield; default stack from the brief (Next.js App Router, TypeScript, react-three-fiber, Zustand, Zod, next-intl, Tailwind, Vitest, Playwright) | — |
| Market / currency | North Macedonia, MKD, prices shown without decimals | `src/engine/catalog.ts` (`CURRENCY`) |
| Languages | Macedonian (default, Cyrillic) and English | `src/i18n/routing.ts`, `messages/` |
| Brand | Placeholder name "PoMerka" and a neutral look of our own | `messages/*.json` (`brand`) |
| After the cut list | Download PDF, download CSV, copy share link, and a "send inquiry" form. The inquiry endpoint validates and logs the request; it does not send email. No payment. | `src/app/api/inquiry/route.ts` |
| Accounts | None. "Save" stores named designs in the browser; the share link is the portable form. | `src/store/saved.ts` |

## Materials and prices (all placeholders)
| Item | Value |
|---|---|
| Board | 18 mm melamine chipboard, 2800 × 2070 mm; 4 200 MKD/sheet for solid decors, 4 900 for wood and material decors, 5 600 for matt |
| Back / drawer bottom | 3 mm HDF, 2800 × 2070 mm, 950 MKD/sheet |
| Edge banding | 45 MKD/m applied, 30 mm allowance per banded edge |
| Cutting | 30 MKD per metre of cut |
| Hardware | Unit prices in `catalog.ts`; included in the price as separate lines |
| Saw kerf / edge trim | 4 mm / 10 mm per side (same as the reference) |

Whole sheets are charged. Prices are indicative and exclude delivery and
assembly; the UI says so.

## Decor catalogue
No supplier or licensed swatches were provided, so the catalogue is 30
neutral placeholder decors with invented codes (W-xx wood, M-xx materials,
S-xx solid, X-xx matt), drawn as flat colours with a procedural grain. No
manufacturer names, codes or images are used.

## Construction rules
Taken from the reference where observed: 18 mm board, 3 mm back, 4 mm front
gap, doors 24 mm shorter than the cabinet and 2 mm narrower than the element,
80 mm top rails, shelves set back 15 mm, minimum shelf spacing 150 mm, hinge
counts by door height (2 ≤ 900, 3 ≤ 1600, else 4), element minimum 250 mm,
double doors from 300 mm, 1–6 elements, width 600–2780, height 300–2000.

Deliberate differences:
- **Depth minimum is 150 mm** (reference: 50 mm, which leaves a 25 mm carcass).
- **Changing the total width keeps element proportions** instead of resetting
  them to equal widths.
- **Reducing height clamps shelves and says so**; undo restores them.
- **Join allowance** (1 mm per carcass from 3 elements) is kept, but the slack
  is split left/right instead of all on the right.
- Out-of-range typing behaves like the reference (value kept, error shown,
  model unchanged), but the message always states the limit and the range,
  and the field offers a one-click "use nearest allowed value".

## Drawers (our own design; the reference model has none)
- Front option per element: doors, open or drawers (1–6, limited by height:
  each front at least 140 mm).
- Fronts share the door zone with 3 mm gaps.
- Box: 18 mm body-decor sides, inner front and back; 3 mm HDF bottom fixed
  underneath; 13 mm slide clearance each side; box height = front − 45 mm;
  box length = longest standard slide (250–550 in 50 mm steps) that fits
  10 mm short of the carcass depth.
- Drawers need an overall depth of at least 290 mm with a back panel; the
  option is disabled with an explanation below that.
- Elements with drawers have no shelves.

## Hardware quantities
Hinges per door by height; one handle per door leaf or drawer front (none
with push-to-open, which adds one push latch per leaf/front); 4 shelf pins
per shelf; 2 wall brackets per element with 2 screws and 2 plugs each; one
pair of slides per drawer; carcass screws 2 per joint (3 above 400 mm
carcass depth); back nails every 150 mm of back perimeter; one flap stay per
bottom-hinged door.

## Other
- Wall-hung at 400 mm above the floor in the 3D scene (as in the reference);
  this is presentation only.
- Grain: wood decors run along the part's length; doors and drawer fronts are
  cut with grain vertical/horizontal respectively so fronts match across the
  row. Solid decors may rotate on the sheet.
- The AI room render, assembly instructions and workshop picker of the
  reference are out of scope (account/server features that are not part of
  the configurator's control inventory).
