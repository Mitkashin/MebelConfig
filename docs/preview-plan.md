# 3D preview upgrade — plan

Goal: the viewer should look like a product photo of real melamine furniture,
not a diagram, while staying fast on phones and keeping every existing feature
(click-to-select, open fronts, exploded view, dimensions, reset, keyboard
orbit, `frameloop="demand"`).

All work is in `src/components/viewer/` plus small additions to the catalogue,
store and message files. No CDN downloads at runtime: lighting and textures are
generated in code.

## Step 1 — Lighting and materials

| # | Change | Why | Where |
|---|--------|-----|-------|
| 1.1 | Drop `flat`; use Khronos **Neutral** tone mapping, exposure ≈ 1 | `flat` disables tone mapping, which washes out whites and woods. Neutral keeps decor colours true to the supplier swatch (important for a sales tool) | `Scene.tsx` `<Canvas>` |
| 1.2 | **Studio environment** from drei `<Environment>` + `<Lightformer>`s: big softbox overhead, two vertical strip lights at the sides, a weak front fill. Rendered once into a cube map | Soft reflections and edge highlights make the panels read as boards; no HDRI file to download | new `viewer/Lighting.tsx` |
| 1.3 | One **key light** (directional, upper-left-front) with soft PCF shadows, tighter shadow frustum fitted to the piece | Gives form (one side brighter than the other) and a soft shadow on the wall that "hangs" wall cabinets | `Lighting.tsx` |
| 1.4 | **Contact shadow** under floor-standing pieces (drei `<ContactShadows>`) | Darkens where the piece meets the floor, so it stops floating | `Lighting.tsx` |
| 1.5 | **Surface finish per decor** from the supplier code suffix (ST9 smooth matt, ST10 deepskin, ST12 omnipore, ST76 mineral, Kronospan SU/SM soft-matt …) → roughness, sheen, and a subtle grain relief (bump from the swatch) on wood and stone decors | Matt white and textured oak should catch light differently | `catalog.ts` (`decorFinish`), `Scene.tsx` materials |
| 1.6 | Lighter part outlines (only show strongly on the selected part) | With proper shading the drawn edge lines are no longer needed for readability | `PartMesh` |

## Step 2 — Background and room

| # | Change | Why |
|---|--------|-----|
| 2.1 | **Studio backdrop** (default): one warm off-white tone for floor and wall, vertical light gradient on the wall, floor that fades into the background towards the camera — no harsh diagonal horizon | Looks like a catalogue shot; the furniture is the only subject |
| 2.2 | **Room mode** (toggle): painted wall + skirting board, light oak plank floor (procedural texture, no download), warm "window" light from the side | Helps judge scale and how the decor sits in a home |
| 2.3 | **Wall colour** choice in room mode: white, warm grey, sage, terracotta, charcoal | Customers see their decor against their wall |
| 2.4 | Setting stored in the configurator store, kept in localStorage (try/catch), not in the share link | Personal viewing preference, not part of the piece |
| 2.5 | Viewer toolbar: one "Scene" button opening a small panel (Studio / Room + colour dots); EN + MK texts | Keeps the toolbar uncluttered on mobile |

## Step 3 — Polish (desktop GPU only)

| # | Change | Why |
|---|--------|-----|
| 3.1 | **Ambient occlusion** with N8AO (`@react-three/postprocessing`), half-resolution, desktop only | Darkens inner corners of open cabinets, under shelves, behind the rail |
| 3.2 | Very light vignette (desktop only) | Pulls the eye to the centre |
| 3.3 | **"Save image"** button: renders one frame at 2× resolution and downloads a PNG named after the piece and size | Customers can send the picture to a partner or to the workshop |
| 3.4 | Phones (`lowPower`): no post-processing, 1024 shadow map, same lighting and backdrop | Keeps it smooth on mid-range phones |

## Status (15.11.2026): built

All three steps are in. Notes from building it:

- **Quality tiers** (`Scene.tsx` → `Stage.tsx` `quality`):
  `high` = desktop GPU, everything on; `medium` = screens under 768 px, no
  post-processing, smaller shadow map; `low` = WebGL without a GPU
  (SwiftShader, llvmpipe, Microsoft Basic Render Driver — remote desktops, VMs,
  the test browser): plain materials, sky light in place of the environment
  map, no contact shadow, pixel ratio 1. Detected once before the scene mounts.
  The low tier renders as fast as the old viewer did.
- `?quality=high|medium|low` in the address forces a tier (the screenshot
  script uses `high`). The configurator now keeps such extra parameters when
  it rewrites the share link in the address bar.
- No rounded floor/wall cove in the studio: pieces stand with their back on
  the wall and would cut into it. Same tone + light falloff + AO instead.
- The effect composer turns the renderer's auto-clear off; the contact shadow
  needs it on (`Effects` sets it back each frame), otherwise door swings leave
  trails in the shadow.
- Save image raises the canvas `dpr` prop (not `setDpr`, which the next React
  render would undo), waits for the resize, reads the pixels, restores it.
- Backdrop meshes live on render layer 1: the camera sees them, the contact
  shadow camera and pointer picking do not.

## Round 2 (15.11.2026): 360° scene and viewer feel

- **360° scene** (`backdrop: 'free'`): gradient surroundings, an invisible
  ground that only catches the shadow, contact shadow all round, extra soft
  lights behind the piece so its back reads properly. The camera goes all the
  way round and down to 22° below the horizon. Wall pieces stand on the ground.
- **Auto-rotate** switch in the 360° scene (OrbitControls `autoRotate`; the
  frame loop is kept running only while it is on).
- **Smooth camera**: damped orbit; reset, scene changes and size changes glide
  in angles (round the piece, never through it); arrow keys glide 12° steps.
  Instant for the first framing and for `prefers-reduced-motion`. Orbit limits
  are set by `CameraRig` and lifted while gliding, so a glide from behind the
  piece back to the studio does not snap.
- **Hover outline** on boards, so it is clear what a click selects.

## Checks

- `npm run check` (types, lint, unit tests, build).
- E2E tests still pass (`data-ready`, selection, toggles).
- Regenerate `docs/screenshots/` and compare before/after on: default sideboard,
  open wardrobe, exploded view, wall cabinet, mobile.

## Later ideas (not in this round)

- Put the saved render on the PDF cover page.
- Small bevel on part edges (needs a UV-aware rounded box).
- More floors (concrete, dark oak) and a rug.
