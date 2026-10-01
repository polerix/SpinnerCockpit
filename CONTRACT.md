# SpinnerCockpit — Contract

> Convention: this file is a locked design contract, not a running session
> log (see `progress.md` for that). It must be readable cold by a session
> with no history and produce the same understanding a full re-read of the
> design conversation would. Once committed, changes to this document are
> **change requests, not drift** — if something turns out wrong during the
> build, stop and say so; don't quietly deviate and leave this file stale.
>
> Locked: 2026-09-29. Everything below was decided across a multi-round
> design conversation (scoping → landmarks → assisted landing → catastrophic
> lock → training-sim reframe). Reasoning is recorded alongside outcomes on
> purpose — the reasoning is what stops a decision being relitigated by a
> future session that only sees the outcome and wonders why.

## The frame

**SpinnerCockpit is an in-fiction LAPD spinner training simulator.** Not a
game, not a joyride sim — a training rig a trainee officer sits in. Every
other decision in this document follows from that, and it resolves things
that would otherwise sit awkwardly:

- **Respawn/reset after a crash is diegetic, not a game-UI intrusion.** A
  training exercise resetting for the next run is exactly what a training
  exercise does. This was the frame's most direct payoff — "crash → debrief
  → respawn" only works as a design if the thing you're in is understood to
  be a simulator running exercises, not a vehicle that broke.
- **80/20 assisted landing is an instructor setting, not a compromise.**
  Training wheels are the correct posture for a trainee's default landing
  mode. This resolved the one part of the landing design that felt slightly
  imposed before the reframe (see "Assisted landing" below).
- **Catastrophic lock with full manual handover is an emergency-procedures
  drill** — the only realistic reason a police vehicle would ever hand a
  trainee full manual control at all.
- **It retroactively justifies choices already in the codebase before any of
  this design work started:** the flat-ground model, no traffic physics,
  simulated-not-live travel, and the HUD's own existing dry status lines
  (`LIVE WEATHER NOT CONNECTED`, `LIVE TRAFFIC NOT CONNECTED`, confirmed in
  `src/spinner.js`) already read as a training rig's honest disclaimers, not
  a broken live system. The frame fits the project that already existed; it
  wasn't bent to fit the frame.

## Collision

**All buildings loaded from `public/data/los-angeles.json`, in both DRIVE
and FLY.** No more flying or driving through anything.

- **Below a severity threshold:** a hard stop. Position is clamped at the
  collision boundary; you cannot pass through geometry. No separate
  consequence beyond that — the training-sim frame answers "what does a
  minor collision mean" by making it simply not possible to continue through
  it, same as a wall.
- **Above the severity threshold:** triggers catastrophic lock (below).
  Severity is read off the same collision check that produces the hard
  stop — an impact-speed threshold at minimum for the first cut, not a
  separate measurement.
- **No persistent damage model.** Deliberately not built. A cumulative
  damage/integrity meter was considered and explicitly rejected for this
  contract: real new state, decay/repair rules, balancing, and probably its
  own readout — a genuinely separate system, not needed for either the hard
  stop or the lock trigger, both of which are single-collision, not
  cumulative-history, decisions.
- **Spatial index: deferred, not part of this contract.** Earlier scoping
  work floated building the index now on the reasoning that it's shared
  infrastructure the later Greater LA stage will need anyway. That reasoning
  is **superseded here** — building index infrastructure to serve a stage
  that isn't in scope is exactly the kind of non-standalone scope the sprint
  structure below is designed to avoid. The current extract is 1,243
  buildings; a linear point-in-polygon scan against that is effectively
  free per frame. Build the index when Greater LA tiling actually happens
  (see "Explicitly deferred"), not before.
- Applies identically to drive (2D footprint test at ground level) and
  flight (2D footprint test plus altitude-vs-building-height, so flying
  above a roofline is legitimately clear airspace, not a collision).

## Assisted landing

**80/20: the operator's input shapes the descent, it does not control it.**
The automation cannot be made to miss the pad or crash under assist — that
is the entire point of it being a training-wheels instructor setting, not a
skill test.

- **What the operator's 20% governs — two axes, chosen for being
  continuously felt, not just present at touchdown:**
  - **Lateral position on the pad**, via the *existing* steer input,
    reinterpreted during approach as a bounded offset from the automation's
    own glide-path target rather than free heading control.
  - **Descent rate**, via the *existing* altitude input, bounded to a safe
    sink-rate band around an automated baseline.
  - Final heading and approach angle were considered and deliberately left
    to the automation — heading only reads at the last instant (doesn't
    serve "felt throughout the descent") and approach angle is largely
    redundant with descent-rate governance. Not built; easy to add later if
    two axes turns out to feel thin.
  - Illustrative starting numbers, not locked: pad radius ~20m, lateral
    authority ~±3m, baseline sink rate ~3 m/s within a ~2–5 m/s band. Tune
    during Sprint 2, don't relitigate the shape.
- **At the edges of the envelope: visible correction, not a silent clamp.**
  Pushing past the safe band doesn't dead-zone the input — the flight path
  visibly, gradually pulls back toward the safe corridor (eased over a short
  time constant, not a snap — reuses the same smoothing idiom already used
  elsewhere, e.g. `turnToward` in `src/navigation.mjs`). This is what makes
  the automation *legible* rather than invisible, which was the explicit
  design goal.
- **No new control to enter assist.** It engages automatically by proximity
  and context — inside a capture envelope around a registered pad, while
  descending — the same idiom already used for the flight gate's own
  auto-placement. Doesn't hang off `AUTO`: `AUTO` governs horizontal
  route-following, an orthogonal concern, and assist has to work identically
  whether the pad was reached via `AUTO` or manual flight.
- **Pads are placed at landmark coordinates, not arbitrary flat ground.**
  This is the proportionate version of "landmarks as training objectives"
  (see "Explicitly deferred" — a scenario/scoring system was considered and
  rejected): co-locating pads with named landmarks makes "fly to the
  Bradbury Building and land" an emergent objective for free, by
  construction, with no objective-tracking system needed. First pad: the
  **Bradbury Building** (-118.2478, 34.0505) — already a named point in
  `data.landmarks`, already confirmed inside the current bbox, zero
  additional data work to place it. (LAPD HQ/Union Station is *not*
  available yet — confirmed outside the current bbox by ~588m east, ~123m
  north; needs the small bbox nudge noted under "Explicitly deferred" before
  a pad can go there.)

## Catastrophic lock — the dead-man's switch

**Manual override is not unlocked, earned, or toggled. It is forced on the
operator at the moment the autopilot fails.** There is no override UI to
design; there is a failure state.

- **Trigger:** the collision severity threshold above. No scripted or
  random trigger is built for this contract, though the state (`lock =
  true`) supports either for free later if wanted — e.g. a scripted trigger
  tied to a specific future encounter costs nothing once the flag exists.
- **`HOLD` becomes the dead-man's switch grip.** This is a *contextual*
  reinterpretation of the existing button, active only while a lock
  sequence is in progress — `HOLD`'s ordinary tap behavior (pause/resume
  travel) is completely unchanged outside of one.
  - **Held:** caps the descent to a survivable rate. The assist envelope is
    gone entirely — lateral/heading authority is full (or near-full), not
    the bounded nudge from assisted landing, because there is no more "safe
    band"; the automation that provided one is what just failed.
  - **Released:** the cap comes off — sink rate uncaps toward free fall.
  - **Re-gripped:** re-caps back to the survivable rate. This is a
    deliberate recovery window, not an instant fail-on-release — modeled on
    how real dead-man's switches (rail, industrial) behave: release starts
    an escalating emergency condition, it doesn't detonate one. Letting go
    briefly and re-gripping in time is recoverable by design.
  - **Failure** = released, and altitude runs out before re-gripping.
    **Recovery** = re-gripped in time / altitude stabilizes.
  - No new physics. This is built entirely on the flight model's existing
    kinematic altitude control (`state.altitude` is already a bare
    per-frame value, no momentum) — the cap is just which rate gets applied
    each frame, held vs. released. A full momentum/glide model remains
    unbuilt and is not required for this contract.
- **Interaction with assisted landing:** a hard interrupt. If lock triggers
  while an assisted approach is already in progress, lock supersedes it
  immediately — same precedence shape as `cogitator-panel.mjs`'s existing
  "auto pre-empts peek instantly, doesn't restart mid-cycle" rule. Not a new
  idiom, the same one applied to a new pair of states.

## Debrief

**Failure or recovery both end in a debrief — "crash, damage state, training
opportunity, respawn, reset," in his words.** The training opportunity is
the point: the sim tells the trainee what happened.

- **"Damage state" is not a numeric damage model.** It's the crashed/
  incident-in-progress state itself — a flag that gates normal controls
  until reset, not a health value. Consistent with "no persistent damage
  model" under Collision; the same decision, not a second one.
- **One incident record, snapshotted once at outcome** (recovered or
  crashed) — not a log, not a replay, not a running score. Deliberately
  proportionate: roughly ten fields, all either already live in `state`
  (snapshotted, not newly tracked) or small and self-contained to the lock
  sequence itself:
  - Cause (what was hit / which trigger fired)
  - Speed, mode (fly/drive), auto-state, altitude, heading, position — all
    snapshotted from existing `state` fields at the trigger instant
  - Whether an assisted approach was already underway, and how far into it
  - Dead-man's-switch hold duration
  - **Release count** — how many times the operator let go during the
    sequence. Called out specifically as the single most pedagogically
    useful field: "you released the dead-man's switch twice" is a concrete,
    actionable lesson in a way a duration alone isn't.
  - Outcome: recovered or crashed
  - A simple final-steering-direction summary (not a path trace)
- **Its own dedicated panel** — not the debrief text is inline with the
  alarm reveal, and not overloading the cogitator's existing panel slot.
  The alarm is live/reactive/mid-emergency; the debrief is static/readable/
  after-the-fact. Different instruments, different jobs, different panels.

## Alarm

**Its own dedicated panel, separate from the debrief panel and from the
cogitator's existing slot.** Content is the CEL-DON / OVRLOC-FAIL family
screen (`OVRLOC FAIL`, `DAMP 0011`, black field with a red/orange cross-like
shape) — the film's own "vehicle-wide emergency" readout, not
ENVIRON CTR's PURGE (which is specifically a cabin-air event, the wrong
scope for a hull/systems failure).

**Status, precisely — this is not a finished asset.** The screen has been
*located* (`ALIEN_1979_Nostromo_computer_test_screens.mp4`, ~t=195s) and
*roughly characterized* (red field, black cross/plus shape, legible text)
during earlier octagon-screen research, but it has not been through the
measurement pipeline: no `MEASUREMENTS.md`-style pass, no color/geometry/
glow numbers, no `VERIFY.md`-style check, no procedural build. Sprint 4
needs to do that work — the pipeline exists and is proven twice
(`spinner-pip/MEASUREMENTS.md` + `VERIFY.md` for ENVIRON CTR,
`OCTAGON-MEASUREMENTS.md` + `VERIFY-OCTAGON.md` for the octagon/X readout),
so this isn't starting the *method* from zero, but the screen-specific work
is not done.

**No acknowledgment button — the screen just changes.** This is the film's
own grammar (a police hail arrives with zero manual activation on the
pilot's part, per the source-analysis article read during design) and it's
already how `cogitator.js`'s `setPurge()` works: the caller flips a
boolean, the panel handles its own reveal. A new top-priority trigger tier
is needed in the panel-trigger precedence above the existing three
(mode-change, hold, arrival) — a hull-breach alarm shouldn't wait for a
PURGE cycle to finish — but the reveal mechanism itself is the same
pattern, not a new one.

## Reset

**`HOME`, extended to also clear the incident record.** No new control.
`HOME` already means "return to the route start" (`src/spinner.js`,
`reset()`) — respawn rides that unchanged, with one small addition: `reset()`
also clears the incident record so a stale debrief can't bleed into the
next attempt.

**The trainee presses it. No auto-clear, no timeout-driven dismissal.** A
real training debrief ends with the trainee (or instructor) resetting for
the next run on their own initiative, not a countdown.

## Gamepad mapping

Physical target: two modified controller halves (Xbox or PS4 derived),
mounted in the two circular dashboard openings already reserved for real
hardware (confirmed in `app.html`: *"The bottom circles are reserved for
physical controllers"*). No on-screen drawn controls.

Grounded in three converging sources: the source-analysis article's
description of the film's split yoke (*"Gaff keeps his hands on each handle
of a split yoke"*, functioning like a helicopter cyclic), a hobbyist
reference build (`@chromemakesprops`) independently arriving at the same
two-grip-flanking-a-center-display physical configuration, and the existing
18-function on-screen vocabulary (`keysLeft`/`keysRight` in
`src/spinner.js`).

One deliberate decoupling: the on-screen dashboard panels are *status
displays* (`sync()` just reflects booleans, wherever the input actually
comes from) — which physical grip a function displays on and which grip
*drives* its input don't have to match, and don't always below.

**Left grip — cyclic-equivalent (steer + speed):**
| Control | Function |
|---|---|
| Stick X | Steer (replaces `LEFT`/`RIGHT` + arrow-key steer) |
| Stick Y | Speed nudge, forward=accelerate/back=decelerate (replaces held W/S) |
| Face button | `FLY`/`DRIVE` — one toggle, not two buttons (mutually exclusive state) |
| Face button | `AUTO` toggle |
| Face button | `HOLD` — tap pauses/resumes travel; **held, during an active lock, is the dead-man's switch grip** |
| Bumper | `SPD+` (opens the exact cruising-speed dialog — distinct from stick-based nudging, not redundant) |

**Right grip — collective-equivalent (altitude + landing fine control):**
| Control | Function |
|---|---|
| Stick Y | Altitude climb/descend (replaces `ALT+`/`ALT-` + arrow-key altitude); same axis the dead-man's-switch capped/uncapped rate applies to |
| Stick X | Idle in normal flight; the assisted-landing lateral nudge, active only inside a pad's capture envelope |
| Face button | `AMBER`/`SAT` — one toggle, same reasoning as `FLY`/`DRIVE` |
| Face button | `ROAD` toggle |
| Face button | `BLDG` toggle |
| Face button | `NAV9` (overhead map) |
| Bumper | `SPD-` (resume saved cruising speed) |
| D-pad / menu | `FULL`, `SET`, `HOME` — lowest-frequency, most administrative functions; first candidates to consolidate further if the final yoke shape ends up button-constrained |

`LEFT`, `RIGHT`, `ALT+`, `ALT-` are absorbed into the two stick axes, not
kept as separate discrete inputs — they exist today only because there's no
analog stick yet. Antitorque pedals (yaw) from the article's helicopter
model have no equivalent here and aren't mapped — the game has no separate
yaw axis (heading change *is* steering).

**Wiring actual gamepad hardware (the Gamepad API, physical build) is not
part of the four sprints below.** This section records the target mapping;
keyboard input remains what the sprints are built and tested against.

## Explicitly deferred — named so they can't leak in

- **Tyrell pyramid.** Dimension conflict unresolved (stated numbers read
  1:4 height:base, the actual 3D model reads roughly 3:1 the other way) and
  still open; glTF/OBJ export from the model still pending confirmation,
  which decides whether the build is an imported asset or a procedural
  reconstruction. Nothing here to build until both resolve.
- **Greater LA tiling.** ~318× the current extract's area by the numbers
  already run (≈400,000 buildings, ≈5M vertices, ≈200MB raw JSON) — needs
  spatial tiling, LOD, and probably a real streaming data source, none of
  which exist. This is also where the spatial index deferred under
  "Collision" actually gets built.
- **Blimps** (flight hazards) — depend on a hazard/collision integration
  decision not made in this contract.
- **Neon signage** — decoration, no blocking dependency, just not scoped
  into these four sprints.
- **Street market at 2nd & Spring** — coordinates already verified
  (intersection confirmed at -118.2456231, 34.0517051, inside the current
  bbox), but content-authoring work not started.
- **A scenario or scoring system.** Explicitly considered and rejected this
  round. Landmarks-as-objectives is satisfied proportionately by co-locating
  landing pads with landmarks (see "Assisted landing") — no briefing text,
  no pass/fail beyond crash/no-crash, no objective tracker. Revisit only if
  the pad-at-landmark approach turns out to want more structure once it
  exists.
- **An assist-level setting in `SET`.** The training-sim frame makes this a
  cheap, well-motivated addition whenever it's wanted (heavy assist for
  early training, none for a checkride) — flagged, not built. Stage 1 ships
  one fixed 80/20 level.
- **Water landing / flooding.** Sprint 5 checked `public/data/los-angeles.json`
  directly: no water data of any kind — no `water` key in the schema, no
  water-tagged roads, nothing. The bbox is 2km of downtown; the LA River
  isn't in this extract. His own framing, for when water data exists: a
  water landing isn't refused — the system targets the solid ground *beneath*
  the water (riverbed), same `groundAltitudeAt` mechanism Sprint 5 already
  built for unrestricted landing generally. The spinner floats in an
  emergency; flooding only happens if the environment is opened. **That
  connection is the reason this is worth recording even though nothing is
  built**: ENVIRON CTR (the cogitator panel) *is* the environment control, so
  "open the environment while floating" is what floods the cabin — a real
  consequence hung off a screen that's otherwise decorative, not a numeric
  damage model (consistent with "no persistent damage model" under
  Collision — this would be a discrete flooded/not-flooded state change, the
  same shape as the crashed/incident-in-progress flag already is, not a
  second damage system). Deliberately not scoped into Sprint 5 — "finish the
  software as is" — and blocked on water data existing at all regardless.

## Sprint plan

Each sprint leaves the app working, tested, built, and deployable on its
own — not a waterfall wearing sprint labels. `npm test` green and the
Pages build live at the end of every one, checked, not assumed.

**Sprint 1 — Collision, drive and flight.**
Ships: point-in-polygon + height lookup against
`public/data/los-angeles.json`'s buildings; hard stop in both DRIVE (2D
footprint at ground level) and FLY (2D footprint + altitude-vs-height);
linear scan, no spatial index (see "Collision" for why). Tests: known-point
lookup cases (inside/outside/above-roof/below-roof a real footprint), a
stop-doesn't-clip-through-geometry case. DoD: existing 26 tests +
new collision tests green, build succeeds, Pages live and confirmed serving
the new commit, manual browser check that driving/flying into a real
building actually stops.

**Sprint 2 — Assisted landing + pads at landmark coordinates.**
Ships: landing-pad data (Bradbury Building at minimum), capture-envelope
detection, the two-axis bounded descent, visible-correction behavior,
touchdown detection. Tests: envelope entry/exit, bounded-offset clamping
and correction direction, touchdown at a known pad. DoD: same standing
checks, manual browser check of a full landing sequence.

**Sprint 3 — Catastrophic lock + dead-man's switch.**
Ships: severity-threshold trigger off Sprint 1's collision check;
held/released/re-gripped descent-rate behavior; recovery vs. failure
resolution. Tests: lock state-machine transitions, capped-vs-uncapped rate
values under held/released. DoD: same standing checks, manual browser check
of triggering a lock and surviving it by holding.

**Sprint 4 — Alarm panel, debrief panel, reset loop.**
Ships: the CEL-DON/OVRLOC-FAIL screen, *measured first* (a real
`MEASUREMENTS.md`-style pass, same rigor as ENVIRON CTR/the octagon) then
built as a new procedural module in `spinner-pip/src/`, then integrated as
its own panel; the debrief screen, a new procedural readout for the
incident record; `HOME` extended to clear the record, trainee-triggered.
Tests: incident-record snapshot correctness against a known lock sequence,
reset-clears-record, the new alarm trigger's precedence over the existing
three. DoD: same standing checks, manual browser check of the full
crash → alarm → debrief → `HOME` → reset loop end to end.

No sprint depends on the pyramid, Greater LA, blimps, neon, the market, a
scenario system, or an assist-level setting. If a sprint turns out to need
any of those to actually ship, that's a sign the sprint is scoped wrong,
not a reason to pull a deferred item back in quietly.
