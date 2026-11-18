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

## Materials and prices
All prices are Soloprom's (soloprom.com.mk), checked against the shop on
16.11.2026. Each hardware line links to the product its price comes from.

| Item | Value |
|---|---|
| Board | 18 mm melamine chipboard, 2800 × 2070 mm; the supplier's price per sheet for each decor (all 183 re-checked, unchanged) |
| Back / drawer bottom | 3 mm white HDF, Kronospan 8685, 2800 × 2070 mm, 1 190 MKD/sheet |
| Cutting | Per sheet bought: 770 MKD per board sheet, 350 MKD per HDF sheet (the supplier does not charge per metre) |
| Edge band | 22–23 mm ABS band, 0.8 mm, in the decor's own code (35–55 MKD/m); 30 mm allowance per banded edge |
| Edge banding | PUR gluing as a service, 80 MKD per metre of edge (band bought separately) |
| Hinge drilling | 40 MKD per hinge cup |
| Hinges | Häfele Metalla 310 soft-close + 3D plate, 85 MKD; glass doors: Grass MIRRO + Tiomos plate, 580 MKD |
| Drawer slides | Telescopic DD4509 per pair: 350 → 190, 400 → 210, 450 → 240, 500 → 280 MKD; other lengths take the nearest |
| Legs | 1Q20 100/150/200 mm (250/265/285), LAILA 50 (192), Albufera 60 (43), COFREN 300 (438) |
| Handles | One representative product per shape (574.10/128 and /320, UA112/556, GN56 knob by colour, UN59, APL10/704, Perfila 1/160) |
| Other hardware | Flap stay 90, push latch 210, shelf pin 2, wall bracket 18, rail 250/m + holders 9, plinth clip 11, plinth leveller 25, screws 1, HDF nails 57 per 120 |
| Not sold by Soloprom | Adhesive screw caps (1), handle screws (2), wall plugs (6), glass doors (9 500/m²): placeholders |
| Saw kerf / edge trim | 4 mm / 10 mm per side (same as the reference) |

The last sheet of each board decor is bought as a half (1400 × 2070 or
2800 × 1035) when its parts fit, at half the sheet price and half the
cutting (Soloprom sells board as whole or half sheets; HDF only whole). Several identical pieces (1–10) are cut
together, so their parts share the sheets. Prices exclude delivery and assembly; the UI says
so.

Edge band matching: 134 decors have a band with the same code, 19 a band in
the same colour with another surface code, and 30 have no 22 mm band listed
(only 43 mm or none); those use the usual price for the brand and are marked
"typical price" in the quote.

## Decor catalogue
The decors are the owner's supplier's: all 183 decors of 18 mm
melamine-faced chipboard listed by Soloprom (soloprom.com.mk, category
"Оплеменета иверка": 103 Egger, 80 Kronospan), collected on 15.11.2026 with
code, category, price per sheet, stock and the product photo. Stored in
`src/engine/decors.json` and `public/decors/`.

- **Prices** are Soloprom's listed price per 18 mm sheet and replace the
  earlier placeholders; sheet size is assumed to be 2800 × 2070 mm for both
  brands (not stated on the site).
- **Names:** the site lists codes only, so decors are shown as brand + code
  (e.g. "Egger H1145 ST10"), with a link to the product page.
- **Out of stock** decors (one at collection time) are shown but cannot be
  chosen.
- **Textures:** each photo is mapped at real-world scale (one photo per
  600 mm for wood, 800 mm otherwise), with the grain along the part's length
  as in the cut list, mirrored at the repeats to hide seams. On doors and
  drawer fronts the customer chooses vertical or horizontal grain
  (separately); the cut list and the sheet layouts follow. The photos are
  600 × 600 px, so very close views look soft.
- **Rights:** the photos belong to Soloprom and the manufacturers. Using
  them on a public site needs their agreement.
- To refresh: re-collect from the supplier site and replace `decors.json`
  and `public/decors/` (full images and `thumb/`).

## Plinth base
The standing row models (standing sideboard, chest of drawers, nightstand)
can stand on a plinth instead of legs. The plinth is a frame of 18 mm board
in the body decor, 60, 80, 100, 120 or 150 mm tall (the total height
includes it, as with legs), set back 0 (flush with the fronts), 30 or 50 mm
on all four sides (front, back and both ends):

- front panel across the width, banded all round; back panel across the
  width; side panels between them; a support under each joint between
  carcasses and in the middle of any carcass wider than 1 m;
- two 18 mm panel levellers under each side panel and support; the frame is
  screwed together (two 4 × 50 per panel end) and to each carcass bottom
  (four per carcass);
- switching between legs and plinth keeps the nearest offered height.

The wardrobe keeps its own plinth panels over the legs.

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
- **Typed element widths are kept.** Once the customer types an element's
  width, later edits to other elements (or to the total width) are absorbed
  by the elements not yet typed. Only if those cannot take the change
  without going below the minimum do the typed ones adjust too. "Let it
  adjust" releases one element; Equalise, a new element count, undo and
  redo release all.
- **Reducing height clamps shelves and says so**; undo restores them.
- **Join allowance** (1 mm per carcass from 3 elements) is kept, but the slack
  is split left/right instead of all on the right.
- **Uneven splits build identical carcasses.** When elements differ by exactly
  1 mm (2000 / 3 gives 667 / 667 / 666), the wider ones are built 1 mm
  narrower so all their parts are identical and share cut-list rows; the
  spare millimetres join the slack under the ends of the top. Differences of
  2 mm or more are kept, as separate rows.
- **The cut list names the elements** each row's parts belong to ("1, 2",
  or "all" for the top); the same column is in the PDF and CSV.
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
- Drawers need an overall depth of at least 285 mm with a back panel (282
  without); the option is disabled with an explanation below that.
- Elements with drawers have no shelves.

## Hardware quantities
Matched to the shopping list the reference generated for its default (see
reference-analysis 5a): hinges per door by height; one handle per door leaf
or drawer front (a push latch each with push-to-open); 4 shelf pins per
shelf; 2 wall brackets per element; screws 3.5×16 (4 per hinge, 8 per pair of
slides), 4×30 (4 per carcass for the top, 2 per bracket, 4 per drawer front),
carcass screws 4×50 (2 per joint, 3 above 400 mm carcass depth) with a cap
each; 2 screws per handle (1 per knob); a nail every 150 mm of back
perimeter; 2 wall plugs per bracket. Screws, caps, nails and plugs carry a
10 % reserve. Our own additions: one pair of slides per drawer, one flap stay
per bottom-hinged door. Unlike the reference, hardware is priced as separate
lines in the total.

## The seven models
The chooser offers the same seven furniture types as the reference. Only the
wall-hung sideboard was studied control by control and checked against a
generated cut list; the other six follow the same carcass construction with
their own limits and options, chosen by us:

| Model | Fronts | Mounting | Size limits (W / H / D, mm) | Notes |
|---|---|---|---|---|
| Wall-hung sideboard | doors, open, drawers | wall | 600–2780 / 300–2000 / 150–600 | the verified reference model |
| Open sideboard | open | wall | 600–2780 / 300–1400 / 150–450 | no door, drawer or handle controls |
| Standing sideboard | doors, open, drawers | legs 100/150/200 or plinth | 600–2780 / 450–1400 / 150–600 | total height includes the legs |
| Chest of drawers | drawers, doors, open | legs, plinth or wall | 600–2780 / 400–1400 / 300–900 | drawers stay at most 550 mm deep (longest slide) |
| Wardrobe | doors, open | floor | 400–2780 / 1600–2400 / 350–650 | columns 400–1200 wide; hanging rails |
| Nightstand | drawers, open, doors | legs, plinth or wall | 300–900 / 300–800 / 300–500 | 1–2 elements |
| Wall cabinet | doors, open | wall | 300–1800 / 300–1200 / 150–400 | 1–4 elements |

- **Legs:** two per carcass boundary (front and back), bought in; they are in
  the hardware list and the 3D view, not the cut list.
- **Wardrobe:** rebuilt after the reference's wardrobe (reference-analysis
  5b): a grid of separate carcasses, with every option in that table. Our
  own choices: two rails split the compartment in half and leave no room for
  shelves; with one rail, shelves go below 80 cm of hanging space; a turned
  compartment cannot have drawers, hinges on the room side by default and
  opens 90°; compartments are numbered row by row; a front plinth longer
  than a sheet is cut in equal pieces; glass doors are priced at
  9 500 MKD/m² (placeholder) and listed, not nested; minimum depth 30 cm.
- **Handles on tall doors** (over 1300 mm) sit at about 1 m from the door's
  lower edge instead of near the top.
- Share links made before these models existed still open.

## Other
- Wall-hung at 400 mm above the floor in the 3D scene (as in the reference);
  this is presentation only.
- Grain: wood decors run along the part's length. Doors and drawer fronts are
  cut with vertical grain so fronts match across the row; a front too wide to
  fit across the sheet (over 2050 mm) is turned. Parts in solid decors may
  rotate on the sheet.
- Language at `/`: the browser's language picks English or Macedonian;
  anything else gets Macedonian. Numbers and dates are formatted by explicit
  per-language rules (1.650 / 165,0 cm / 15.11.2026 in Macedonian), not by
  the browser's locale data, so every browser shows the same text.
- Changing a dimension brings dependent values back into range (fewer
  shelves or drawers, double doors to single) and shows a notice with Undo.
- The reference's "your own prices" recalculation is included; its
  shopping-list tick-off, tool list and half-sheet purchase option are not.
- The AI room render, assembly instructions and workshop picker of the
  reference are out of scope (account/server features that are not part of
  the configurator's control inventory).
