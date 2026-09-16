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

The newer Los Angeles cockpit uses `app.html` as its Vite entry point. Run
`npm ci` and `npm run dev`, then open `http://localhost:4186/`; the development
server serves `app.html` at that address. The production build writes
`dist/app.html`. The original instrument demo remains in the root `index.html`.

GitHub Pages publishes the newer cockpit from `docs/index.html`. Run
`npm run build:pages` to regenerate the committed static site. This build sets
the `/SpinnerCockpit/` asset base needed by the project Pages URL and uses the
adjacent `../gods-eye-view` checkout declared in `package.json`.

## Calibration

If the printed plate is not perfectly centred on the S10+ screen, use the **Calibration** section in Tweaks: set `showPlate` to off, load fullscreen, then nudge `offsetX` / `offsetY` until the panel edges disappear evenly behind the mask.

## Tweakables

Gate speed, wireframe density, camera height, and LCD scroll rate.


## God’s Eye View integration — Los Angeles

Run `npm ci` then `npm run dev`. Open **http://localhost:4186** on the Mac mini.
The adjacent `../gods-eye-view` installation is required; this project imports its
public viewer and imagery modules directly. No changes to the GEV checkout are required.

- **FLY / DRIVE:** first-person flight (380 m) or street-level driving (3.2 m).
- **AUTO:** travel around a connected Broadway / Spring Street loop; toggle off for manual travel.
- **MAP / NAV:** north-up overview at the vehicle’s current position.
- **AMBER / SAT:** amber road/building schematic inspired by the supplied reference, or online satellite imagery.
- **HOLD:** pause; **HOME:** return to the route start; **FULL:** fullscreen.
- **SET:** keyboard controls and saved millimetre calibration for the printed mask.
- Keyboard: F / D / M, Space to hold, A for auto/manual, arrows to steer/change flight altitude, W/S for speed, R to reset.

The same 3×2 panel geometry and 146.6 × 69.4 mm defaults are retained from the
original design. A single scene spans all six openings, keeping the perspective
continuous and using one WebGL context. Existing `.dc.html` designs remain available.

Travel is simulated, not tracked live. Driving is free movement without collision
or traffic physics; the automatic demo follows OSM street centre lines. The local
model uses flat ground. Building heights use OSM heights/levels when present and
estimates otherwise. This first extract covers downtown Los Angeles, not the entire
metropolitan area. It does not require API keys or load GEV’s voice/live-traffic UI.
Satellite imagery requires network access. Real geography does not imply photorealistic buildings.

### Data and verification

`public/data/los-angeles.json`: derived from © OpenStreetMap contributors, licensed
under [ODbL 1.0](https://www.openstreetmap.org/copyright), downloaded 2026-09-15.
The editable derived database is distributed as JSON under ODbL 1.0.
Source extract: https://api.openstreetmap.org/api/0.6/map?bbox=-118.260,34.040,-118.240,34.060
Regenerate from a downloaded XML extract with `python3 scripts/import-osm.py path/to/extract.osm`.
Satellite factories and viewer come from [God’s Eye View](https://github.com/bilawalsidhu/gods-eye-view) (MIT).

`npm test` checks the connected street route, lap continuity, distance units, and heading wrap.
`npm run build` builds browser assets. The default server is localhost-only.
A phone connection requires a separately configured LAN server; it has not been enabled here.


### Revised physical dashboard (September 15)

The current renderer reads the actual contours from `Spinner Dashboard.svg`:
six 27 × 21 mm main windows, nine 8.2 × 8.5 mm function displays per side,
two 50.5 × 6 mm notice strips, and two black 10 mm controller openings.
`Spinner Dashboard.stl` is the physical fabrication reference. The SVG coordinates
are used directly; the old design component geometry is not used by this renderer.

The top strips use the supplied `Seven Segment.ttf` locally, in white, on a single
scrolling line. Left: environment/traffic notices (live feeds are currently not
connected). Right: upcoming turns and distance to the Broadway / 5th destination
on the saved downtown route. Manual travel off the route shows a return-to-route notice.

The magenta flight gate uses `Spinner Dashboard hud.svg` unchanged in shape. It
is placed at the route position 10 seconds ahead at the current speed and altitude,
then stays fixed in world space until the spinner passes it. Meter-sized rendering
lets it grow with perspective. Manual flight projects the current heading when
placing a gate. It is hidden in Drive and Map.

Small displays show names and animated dot patterns. Left: FLY, DRIVE, AUTO,
LEFT, HOLD, RIGHT, ALT+, ALT-, SPD+. Right: SPD-, AMBER, SAT, ROAD, BLDG,
NAV9, FULL, SET, HOME. SPD+ sets a cruising speed; SPD- resumes that speed.
The two lower circular controller spaces remain completely black.

Three red distressed insignia decals (`Spinner_Dash_Logo001.png`, `Spinner_Dash_Logo002.png`, `Spinner_Dash_Logo003.png`) are positioned on the dashboard top tier, evenly spaced across the outer edges and the notice strips along their common horizontal centerline.
