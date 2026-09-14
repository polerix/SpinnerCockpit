# SpinnerCockpit

Full-screen Blade Runner "Spinner" cockpit animation for a Samsung Galaxy S10+, geometrically aligned to a 3D-printed layer mask.

## What this is

A single-file Design Component (`Spinner Cockpit.dc.html`) that renders a driving cockpit HUD sized in real millimetres. All geometry is read from the mask SVG (`Spinner Dashboard hud.svg`) and applied at runtime, so on-screen cutouts line up with the physical printed plate:

- **Top strips** — 54.87 × 12.72 mm each. Left scrolls flight conditions and warnings; right scrolls turn-by-turn directions. White dot-matrix LCD type (DotGothic16).
- **Six centre panels** — 26.18 × 21.19 mm each, forming one continuous first-person wireframe view of a dense city grid with flanking buildings below.
- **Guidance gates** — seven magenta gates from the HUD path float ahead in a curved corridor, growing as they approach and vanishing as they pass the camera.
- **Keypads** — 7.73 mm square keys, left and right.

## Files

| File | Purpose |
| --- | --- |
| `Spinner Cockpit.dc.html` | Current cockpit animation |
| `Spinner Cockpit v1 instruments.dc.html` | v1 instrument-cluster version (kept for reference) |
| `support.js` | Design Component runtime |
| `assets/Spinner Dashboard hud.svg` | Physical mask geometry — source of all millimetre dimensions |
| `assets/Spinner Dashboard.svg` | Original dashboard artwork |

## Running

Open `Spinner Cockpit.dc.html` in a browser. On the phone, load it fullscreen in the browser with `showPlate` off.

## Calibration

If the printed plate is not perfectly centred on the S10+ screen, use the **Calibration** section in Tweaks: set `showPlate` to off, load fullscreen, then nudge `offsetX` / `offsetY` until the panel edges disappear evenly behind the mask.

## Tweakables

Gate speed, wireframe density, camera height, and LCD scroll rate.
# SpinnerCockpit
