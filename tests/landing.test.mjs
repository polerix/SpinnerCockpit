import { test } from "node:test";
import assert from "node:assert/strict";
import { distance, movePosition } from "../src/navigation.mjs";
import {
  LANDING_PADS,
  CAPTURE_RADIUS_M,
  CAPTURE_CEILING_M,
  LATERAL_AUTHORITY_M,
  SINK_RATE_MIN_M_S,
  SINK_RATE_MAX_M_S,
  SINK_RATE_BASELINE_M_S,
  LATERAL_CORRECTION_RATE_M_S,
  findCaptureEnvelope,
  hasDeparted,
  startLandingApproach,
  advanceLandingApproach,
} from "../src/landing.mjs";

const pad = LANDING_PADS[0];
const NO_INPUT = { lateral: 0, descent: 0 };

function nearPad(offsetMeters, bearingRadians, altitude, speed = 20) {
  const p = movePosition(pad.lon, pad.lat, bearingRadians, offsetMeters);
  return { lon: p.lon, lat: p.lat, altitude, speed };
}

test("findCaptureEnvelope: finds the Bradbury pad when close and low, not when far or high", () => {
  const close = nearPad(80, 0, 200);
  assert.equal(findCaptureEnvelope(close), pad);

  const tooFar = nearPad(CAPTURE_RADIUS_M + 50, 0, 200);
  assert.equal(findCaptureEnvelope(tooFar), null);

  const tooHigh = nearPad(80, 0, CAPTURE_CEILING_M + 50);
  assert.equal(findCaptureEnvelope(tooHigh), null);

  const alreadyOnRoof = nearPad(80, 0, pad.groundAltitude - 1);
  assert.equal(findCaptureEnvelope(alreadyOnRoof), null);
});

test("hasDeparted: false while still within radius and below the ceiling, true once either is cleared", () => {
  const stillNear = nearPad(80, 0, 100);
  assert.equal(hasDeparted(stillNear, pad), false);

  const flewAway = nearPad(CAPTURE_RADIUS_M + 10, 0, 100);
  assert.equal(hasDeparted(flewAway, pad), true);

  const climbedOut = nearPad(80, 0, CAPTURE_CEILING_M + 10);
  assert.equal(hasDeparted(climbedOut, pad), true);
});

test("a liftoff climbing straight up in place cannot be re-captured until it genuinely departs", () => {
  // The actual regression: excluding the just-lifted-off pad from findCaptureEnvelope
  // until hasDeparted is true must hold even while altitude oscillates near the pad
  // with almost no horizontal movement -- exactly what an in-place vertical climb
  // looks like. This mirrors the caller's own loop (spinner.js), one level up from the
  // pure functions, to prove the two together actually close the loop found live.
  const state = nearPad(20, 0, 27, 0); // just above the roof, ~no forward speed
  let excluded = pad;
  for (let altitude = 27; altitude < CAPTURE_CEILING_M + 20; altitude += 3) {
    state.altitude = altitude;
    if (excluded && hasDeparted(state, excluded)) excluded = null;
    const captured = excluded ? null : findCaptureEnvelope(state);
    assert.equal(captured, null, `must not re-capture ${pad.name} at altitude ${altitude} before it has departed`);
  }
});

test("startLandingApproach: course line points from capture point straight at the pad", () => {
  const state = nearPad(100, Math.PI, 200); // 100m due south of the pad
  const approach = startLandingApproach(state, pad);
  // Heading from a point south of the pad, toward the pad, is due north (0 radians).
  assert.ok(Math.abs(approach.courseHeading) < 0.01);
  assert.ok(Math.abs(approach.totalDistance - 100) < 1);
});

test("advanceLandingApproach: with no operator input, descends at the baseline rate and holds the course centerline", () => {
  const state = nearPad(100, Math.PI, 200);
  let landing = startLandingApproach(state, pad);
  const dt = 1 / 60;
  const step = advanceLandingApproach(landing, state, NO_INPUT, dt);
  assert.equal(step.landing.lateralOffset, 0);
  assert.ok(Math.abs(step.altitude - (200 - SINK_RATE_BASELINE_M_S * dt)) < 1e-9);
  // Still exactly on the course line (no lateral drift) -- within the state's own heading.
  const expected = movePosition(state.lon, state.lat, 0, state.speed * dt);
  assert.ok(Math.abs(step.lon - expected.lon) < 1e-9);
  assert.ok(Math.abs(step.lat - expected.lat) < 1e-9);
});

test("lateral offset is felt immediately but eases gradually toward the boundary, not an instant clamp", () => {
  const state = nearPad(150, Math.PI, 200);
  const landing = startLandingApproach(state, pad);
  const dt = 1 / 60; // one realistic frame
  const first = advanceLandingApproach(landing, state, { lateral: 1, descent: 0 }, dt);
  assert.ok(first.landing.lateralOffset > 0, "input must be felt on the very next tick");

  // At 18 ticks (0.3s) the RAW REQUEST has already reached the authority boundary (10 m/s x
  // 0.3s = 3m), so from this point on the automation's target is pegged at full authority. An
  // instant clamp would therefore already show the applied offset AT the boundary here. The
  // real, eased implementation should still be well short of it -- proven against this
  // specific implementation, not asserted by construction: with LATERAL_CORRECTION_RATE_M_S=4,
  // 18 ticks of easing toward an (effectively, for most of that window) sub-boundary target
  // accumulates to 1.2m, not 3m.
  let current = first.landing;
  for (let i = 1; i < 18; i++)
    current = advanceLandingApproach(current, state, { lateral: 1, descent: 0 }, dt).landing;
  assert.ok(
    current.lateralOffset < LATERAL_AUTHORITY_M * 0.7,
    `at t=0.3s the applied offset (${current.lateralOffset.toFixed(3)}) must still be well short ` +
      `of the ${LATERAL_AUTHORITY_M}m boundary the request has already pegged at -- an instant ` +
      "clamp would already show it at the boundary here",
  );

  // Held long enough, it DOES converge to the boundary -- this isn't just perpetually lagging.
  for (let i = 0; i < 300; i++)
    current = advanceLandingApproach(current, state, { lateral: 1, descent: 0 }, dt).landing;
  assert.ok(
    Math.abs(current.lateralOffset - LATERAL_AUTHORITY_M) < 0.01,
    "held long enough, the applied offset should settle at the boundary",
  );
});

test("lateral offset never exceeds its authority, under sustained maximal input in either direction", () => {
  const state = nearPad(150, Math.PI, 200);
  let landing = startLandingApproach(state, pad);
  const dt = 1 / 30;
  for (let i = 0; i < 600; i++) {
    landing = advanceLandingApproach(landing, state, { lateral: 1, descent: 0 }, dt).landing;
    assert.ok(
      Math.abs(landing.lateralOffset) <= LATERAL_AUTHORITY_M + 1e-9,
      `tick ${i}: lateralOffset ${landing.lateralOffset} exceeded authority ${LATERAL_AUTHORITY_M}`,
    );
  }
  for (let i = 0; i < 600; i++) {
    landing = advanceLandingApproach(landing, state, { lateral: -1, descent: 0 }, dt).landing;
    assert.ok(
      Math.abs(landing.lateralOffset) <= LATERAL_AUTHORITY_M + 1e-9,
      `tick ${i}: lateralOffset ${landing.lateralOffset} exceeded authority ${LATERAL_AUTHORITY_M}`,
    );
  }
});

test("sink rate never leaves its safe band, under sustained maximal input in either direction", () => {
  const state = nearPad(150, Math.PI, 300);
  let landing = startLandingApproach(state, pad);
  const dt = 1 / 30;
  for (let i = 0; i < 600; i++) {
    landing = advanceLandingApproach(landing, state, { lateral: 0, descent: 1 }, dt).landing;
    assert.ok(landing.sinkRate <= SINK_RATE_MAX_M_S + 1e-9);
    assert.ok(landing.sinkRate >= SINK_RATE_MIN_M_S - 1e-9);
  }
  for (let i = 0; i < 600; i++) {
    landing = advanceLandingApproach(landing, state, { lateral: 0, descent: -1 }, dt).landing;
    assert.ok(landing.sinkRate <= SINK_RATE_MAX_M_S + 1e-9);
    assert.ok(landing.sinkRate >= SINK_RATE_MIN_M_S - 1e-9);
  }
});

test("an assisted approach cannot be made to miss the pad, even under sustained adverse lateral input", () => {
  const state = nearPad(130, Math.PI * 0.35, 220, 22);
  const approachStart = startLandingApproach(state, pad);
  let landing = approachStart,
    altitude = state.altitude,
    lon = state.lon,
    lat = state.lat,
    touchedDown = false;
  const dt = 1 / 30;
  let ticks = 0;
  while (!touchedDown && ticks < 20000) {
    const step = advanceLandingApproach(
      landing,
      { ...state, altitude },
      { lateral: 1, descent: 1 },
      dt,
    );
    landing = step.landing;
    altitude = step.altitude;
    lon = step.lon;
    lat = step.lat;
    touchedDown = step.touchedDown;
    ticks++;
  }
  assert.ok(touchedDown, "approach must reach touchdown within a bounded number of ticks");
  assert.ok(
    Math.abs(altitude - pad.groundAltitude) < 1e-6,
    "touchdown altitude must be exactly the pad's ground altitude, not merely close",
  );
  const finalDistance = distance([lon, lat], [pad.lon, pad.lat]);
  assert.ok(
    finalDistance <= pad.radius,
    `touchdown must land within the pad radius (${pad.radius}m) -- got ${finalDistance.toFixed(2)}m, ` +
      `worst-case lateral authority is ${LATERAL_AUTHORITY_M}m`,
  );
});

function runToTouchdown(state, dt = 1 / 30) {
  let landing = startLandingApproach(state, pad),
    altitude = state.altitude,
    touchedDown = false,
    ticks = 0;
  while (!touchedDown && ticks < 20000) {
    const step = advanceLandingApproach(landing, { ...state, altitude }, NO_INPUT, dt);
    landing = step.landing;
    altitude = step.altitude;
    touchedDown = step.touchedDown;
    ticks++;
  }
  return { landing, altitude };
}

test("once parked, holding descend does not push altitude below the pad, nor restart a fresh approach", () => {
  const state = nearPad(60, Math.PI, 150, 22);
  const { landing: parked, altitude: touchdownAltitude } = runToTouchdown(state);
  assert.ok(parked.parked, "should be parked immediately after touchdown");

  let landing = parked,
    altitude = touchdownAltitude;
  const dt = 1 / 30;
  for (let i = 0; i < 120; i++) {
    const step = advanceLandingApproach(landing, { ...state, altitude }, { lateral: 0, descent: 1 }, dt);
    assert.equal(step.altitude, touchdownAltitude, `tick ${i}: altitude must stay exactly at touchdown, not bounce`);
    assert.equal(step.touchedDown, true);
    assert.equal(step.liftedOff, false, "holding descend must not be read as a climb-out command");
    assert.equal(step.landing.pad, pad, "must still be the same parked approach, not a freshly restarted one");
    landing = step.landing;
    altitude = step.altitude;
  }
});

test("an explicit climb command while parked lifts off, handing control back to normal flight", () => {
  const state = nearPad(60, Math.PI, 150, 22);
  const { landing: parked, altitude: touchdownAltitude } = runToTouchdown(state);
  const step = advanceLandingApproach(parked, { ...state, altitude: touchdownAltitude }, { lateral: 0, descent: -1 }, 1 / 30);
  assert.equal(step.liftedOff, true);
  assert.equal(step.altitude, touchdownAltitude, "liftoff hands back control from exactly where it was parked, no jump");
});
