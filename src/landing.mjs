// CONTRACT.md, "Assisted landing": 80/20 assist -- the operator's input shapes the
// descent, it does not control it. The automation cannot be made to miss the pad or
// crash under assist; that's a structural property of the numbers below (lateral
// authority well inside the pad radius), not something individual calls have to
// re-check.

import { distance, bearing, movePosition } from "./navigation.mjs";

export const CAPTURE_RADIUS_M = 150; // horizontal proximity that arms capture
export const CAPTURE_CEILING_M = 250; // must already be below this to be captured --
// keeps a normal cruise pass overhead (380m) from being swept into an approach

export const LATERAL_AUTHORITY_M = 3; // CONTRACT.md illustrative number
export const LATERAL_OVERSHOOT_M = LATERAL_AUTHORITY_M * 2; // how far the RAW request can
// wander past the authority before it stops meaning anything further -- bounds reversal lag
// (see below). Derived from authority, not a second independent constant: found during
// testing that an earlier version hardcoded this separately, and retuning authority upward
// without it would have left the SMALLER, unrelated overshoot value as the real limit on the
// applied offset instead of authority -- "cannot miss the pad" would have held only by
// accident, off a constant that has nothing to do with the pad. Deriving it here means that
// can't happen again by construction.
export const LATERAL_REQUEST_RATE_M_S = 10; // how fast the raw request grows while held
export const LATERAL_CORRECTION_RATE_M_S = 4; // how fast the APPLIED offset is allowed
// to move per tick -- deliberately slower than the request rate, which is the whole
// mechanism behind "visible correction, not silent clamp" (see advanceLandingApproach)

export const SINK_RATE_BASELINE_M_S = 3; // CONTRACT.md illustrative baseline
export const SINK_RATE_MIN_M_S = 2;
export const SINK_RATE_MAX_M_S = 5;
export const SINK_RATE_OVERSHOOT_M_S = 1; // same overshoot idea, one axis down
export const SINK_REQUEST_RATE_M_S2 = 6;
export const SINK_CORRECTION_RATE_M_S2 = 2;

export const PAD_CLEARANCE_M = 0.5; // landing gear stands this far above the roof deck

export const LANDING_PADS = [
  {
    // data.landmarks: {name:"Bradbury Building", lon:-118.2478, lat:34.0505}. That exact
    // coordinate sits INSIDE a real building footprint in los-angeles.json (id
    // 427942768, height 25.8m -- confirmed directly against the data file, not assumed).
    // CONTRACT.md's flat-ground model puts street level at altitude 0, so a literal
    // ground-level pad there would require descending BELOW that building's own roof
    // while still inside its footprint -- exactly collision.mjs's hard-stop condition.
    // Landing on the roof instead is the reading that's actually consistent with both
    // "pads at landmark coordinates" and the existing collision system, and fits a
    // flying-car fiction better besides: LAPD spinners land on rooftops, not in the
    // street. groundAltitude is the roof height plus a small clearance margin, not the
    // bare 25.8m figure -- clamping onto the exact same value collision.mjs reads as
    // "the roof" would put touchdown exactly on the >= boundary of a separate module's
    // check, one float rounding away from a spurious hard-stop at the moment of landing.
    name: "Bradbury Building",
    lon: -118.2478,
    lat: 34.0505,
    radius: 20, // CONTRACT.md illustrative pad radius
    groundAltitude: 25.8 + PAD_CLEARANCE_M,
  },
];

function stepToward(current, target, maxStep) {
  return current + Math.max(-maxStep, Math.min(maxStep, target - current));
}

/**
 * The nearest pad whose capture envelope currently contains `state`, or null. Pure
 * proximity + altitude check -- no mode/map gating here, that's the caller's business
 * (spinner.js only calls this in flight mode), same separation guidance.mjs already
 * uses for state.mode.
 */
export function findCaptureEnvelope(state, pads = LANDING_PADS) {
  let nearest = null;
  for (const pad of pads) {
    const d = distance([state.lon, state.lat], [pad.lon, pad.lat]);
    if (
      d <= CAPTURE_RADIUS_M &&
      state.altitude <= CAPTURE_CEILING_M &&
      state.altitude > pad.groundAltitude &&
      (!nearest || d < nearest.distance)
    )
      nearest = { pad, distance: d };
  }
  return nearest ? nearest.pad : null;
}

/**
 * True once the craft has genuinely left a pad's vicinity -- outside the capture
 * radius, or climbed back above the capture ceiling. Exists for exactly one purpose:
 * after an explicit liftoff, the caller excludes that pad from findCaptureEnvelope
 * until this goes true, then drops the exclusion for good. Found necessary testing a
 * real liftoff: a bare "altitude above ground" check, even with a fixed clearance
 * margin added, wasn't enough -- climbing straight up in place (little to no forward
 * speed) stays within the horizontal radius throughout, so it re-crossed any fixed
 * altitude margin, got re-captured, got forced back down by the assist's own
 * always-descending sink-rate band, and repeated -- a stable yo-yo a few metres above
 * the roof that never actually escaped. Requiring a genuine radius-or-ceiling exit
 * (the same two thresholds that define entry, just the other side of them) closes
 * that loop: the craft has to actually leave, not just twitch past a local threshold.
 */
export function hasDeparted(state, pad) {
  return (
    distance([state.lon, state.lat], [pad.lon, pad.lat]) > CAPTURE_RADIUS_M ||
    state.altitude > CAPTURE_CEILING_M
  );
}

/**
 * Begins an approach: a straight course line from the capture point to the pad,
 * locked in at this instant (the automation's own glide-path target, per CONTRACT.md --
 * not re-aimed every frame). The operator's lateral input offsets perpendicular to this
 * fixed line; it doesn't get to choose the line itself.
 */
export function startLandingApproach(state, pad) {
  return {
    pad,
    courseHeading: bearing([state.lon, state.lat], [pad.lon, pad.lat]),
    totalDistance: distance([state.lon, state.lat], [pad.lon, pad.lat]),
    startLon: state.lon,
    startLat: state.lat,
    traveled: 0,
    requestedLateralOffset: 0,
    lateralOffset: 0,
    requestedSinkRate: SINK_RATE_BASELINE_M_S,
    sinkRate: SINK_RATE_BASELINE_M_S,
    parked: false,
  };
}

/**
 * Advances one tick of an assisted approach. `input.lateral` / `input.descent` are
 * -1/0/1 -- the same steer and altitude axes the rest of the flight model already
 * uses, reinterpreted per CONTRACT.md: lateral becomes a bounded offset from the
 * automation's course line, descent becomes a bounded sink-rate nudge, instead of free
 * heading/altitude control.
 *
 * Two persisted values per axis, not one, is the actual mechanism behind "visible
 * correction, not a silent clamp": `requested*` is what the operator is asking for,
 * and keeps moving (up to a wide overshoot bound) for as long an axis is held, so
 * pushing past the edge still means something rather than going numb. The applied
 * value (`lateralOffset` / `sinkRate`) only ever eases toward the CLAMPED version of
 * that request, at a rate deliberately slower than the request itself can move -- so
 * pushing past the edge is felt immediately (the request keeps climbing) while the
 * applied value visibly, gradually catches up to the boundary rather than snapping to
 * it. Because it always eases toward an already-clamped target, the applied value
 * cannot structurally exceed the safe band, at any input speed or hold duration --
 * that's what makes "cannot be made to miss the pad" a property of the numbers
 * (lateral authority 3m, well inside a 20m pad radius) rather than something each call
 * site has to separately guard.
 *
 * Once touched down, `landing.parked` holds the position/altitude exactly where they
 * settled and ignores further input until the operator explicitly commands a climb
 * (input.descent === -1, the same "up" input that governed sink rate during descent).
 * That climb is the ONE tick `liftedOff` comes back true, telling the caller to clear
 * the approach and hand control back to normal flight. This exists because of a real
 * integration bug found testing this against the Bradbury pad: without it, touchdown
 * clearing the approach immediately on its own tick handed a still-held descend input
 * to the generic flight-altitude floor (spinner.js's `alt()`, clamped to a 40m minimum)
 * -- which sits ABOVE this pad's 26.3m rooftop, so the craft got yanked back up to 40m
 * and immediately re-captured, over and over, for as long as descend stayed held. A
 * parked hold-state is simpler and more robust than special-casing that floor: it
 * keeps the assist in charge of this altitude regime until the operator deliberately
 * leaves it, rather than quietly depending on one unrelated constant staying below
 * another across every pad this contract's Assisted landing section might ever add.
 */
export function advanceLandingApproach(landing, state, input, dt) {
  if (landing.parked) {
    if (input.descent === -1)
      return { landing, lon: state.lon, lat: state.lat, altitude: state.altitude, touchedDown: true, liftedOff: true };
    return { landing, lon: state.lon, lat: state.lat, altitude: state.altitude, touchedDown: true, liftedOff: false };
  }
  const requestedLateralOffset = Math.max(
    -LATERAL_OVERSHOOT_M,
    Math.min(
      LATERAL_OVERSHOOT_M,
      landing.requestedLateralOffset + input.lateral * LATERAL_REQUEST_RATE_M_S * dt,
    ),
  );
  const lateralTarget = Math.max(
    -LATERAL_AUTHORITY_M,
    Math.min(LATERAL_AUTHORITY_M, requestedLateralOffset),
  );
  const lateralOffset = stepToward(
    landing.lateralOffset,
    lateralTarget,
    LATERAL_CORRECTION_RATE_M_S * dt,
  );

  const requestedSinkRate = Math.max(
    SINK_RATE_MIN_M_S - SINK_RATE_OVERSHOOT_M_S,
    Math.min(
      SINK_RATE_MAX_M_S + SINK_RATE_OVERSHOOT_M_S,
      landing.requestedSinkRate + input.descent * SINK_REQUEST_RATE_M_S2 * dt,
    ),
  );
  const sinkTarget = Math.max(
    SINK_RATE_MIN_M_S,
    Math.min(SINK_RATE_MAX_M_S, requestedSinkRate),
  );
  const sinkRate = stepToward(landing.sinkRate, sinkTarget, SINK_CORRECTION_RATE_M_S2 * dt);

  const traveled = Math.min(landing.totalDistance, landing.traveled + state.speed * dt);
  const coursePoint = movePosition(
    landing.startLon,
    landing.startLat,
    landing.courseHeading,
    traveled,
  );
  const position = movePosition(
    coursePoint.lon,
    coursePoint.lat,
    landing.courseHeading + Math.PI / 2,
    lateralOffset,
  );
  const altitude = Math.max(landing.pad.groundAltitude, state.altitude - sinkRate * dt);
  const touchedDown = altitude <= landing.pad.groundAltitude && traveled >= landing.totalDistance;

  return {
    landing: {
      ...landing,
      traveled,
      requestedLateralOffset,
      lateralOffset,
      requestedSinkRate,
      sinkRate,
      parked: touchedDown,
    },
    lon: position.lon,
    lat: position.lat,
    altitude,
    touchedDown,
    liftedOff: false,
  };
}
