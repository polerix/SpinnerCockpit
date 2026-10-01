import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SEVERE_IMPACT_SPEED_M_S,
  SURVIVABLE_SINK_RATE_M_S,
  FREEFALL_SINK_RATE_M_S,
  isSevereImpact,
  createLock,
  advanceLock,
} from "../src/lock.mjs";
import { resolveMovement } from "../src/collision.mjs";

const building = { id: "999", height: 50, points: [] };

function baseState(overrides = {}) {
  return {
    speed: 42,
    mode: "flight",
    auto: true,
    altitude: 100,
    heading: 1.2,
    lon: -118.25,
    lat: 34.05,
    ...overrides,
  };
}

test("isSevereImpact: thresholds exactly at SEVERE_IMPACT_SPEED_M_S, not just near it", () => {
  assert.equal(isSevereImpact(SEVERE_IMPACT_SPEED_M_S - 0.001), false);
  assert.equal(isSevereImpact(SEVERE_IMPACT_SPEED_M_S), true);
  assert.equal(isSevereImpact(SEVERE_IMPACT_SPEED_M_S + 5), true);
});

test("createLock: snapshots the trigger-instant fields CONTRACT.md's Debrief section calls for", () => {
  const state = baseState();
  const lock = createLock(state, building, null, false);
  assert.deepEqual(lock.incident.cause, { type: "collision", buildingId: "999" });
  assert.equal(lock.incident.speed, state.speed);
  assert.equal(lock.incident.mode, state.mode);
  assert.equal(lock.incident.auto, state.auto);
  assert.equal(lock.incident.altitude, state.altitude);
  assert.equal(lock.incident.heading, state.heading);
  assert.equal(lock.incident.lon, state.lon);
  assert.equal(lock.incident.lat, state.lat);
  assert.equal(lock.incident.assistedApproach, null);
  assert.equal(lock.gripping, false);
  assert.equal(lock.holdDuration, 0);
  assert.equal(lock.releaseCount, 0);
});

test("createLock: starts gripping whatever the switch already read at the trigger instant, not hardcoded false", () => {
  const alreadyGripping = createLock(baseState(), building, null, true);
  assert.equal(alreadyGripping.gripping, true);
  const notGripping = createLock(baseState(), building, null, false);
  assert.equal(notGripping.gripping, false);
});

test("createLock: captures an underway assisted approach and how far into it", () => {
  const landingApproach = { pad: { name: "Bradbury Building" }, traveled: 45, totalDistance: 150 };
  const lock = createLock(baseState(), building, landingApproach, false);
  assert.equal(lock.incident.assistedApproach.pad, "Bradbury Building");
  assert.equal(lock.incident.assistedApproach.progress, 45 / 150);
});

test("advanceLock: no new physics -- altitude drops by exactly rate*dt, no acceleration, gripped vs released use different rates", () => {
  const state = baseState({ altitude: 100 });
  const lock = createLock(state, building, null, true);
  const held = advanceLock(lock, state, 1, true);
  assert.equal(held.altitude, 100 - SURVIVABLE_SINK_RATE_M_S);
  assert.equal(held.resolved, false);

  const released = advanceLock(lock, state, 1, false);
  assert.equal(released.altitude, 100 - FREEFALL_SINK_RATE_M_S);
});

test("advanceLock: releaseCount increments only on a gripping-to-released transition, not every ungripped tick", () => {
  const state = baseState({ altitude: 1000 });
  let lock = createLock(state, building, null, true); // starts gripping
  // held, held, release (1st), re-grip, release (2nd), re-grip, release (3rd) --
  // each `false` here is a genuine transition because the tick right before it was
  // `true`; three such transitions, so three releases, not one per ungripped tick.
  const sequence = [true, true, false, true, false, true, false];
  let releaseCount = 0;
  for (const gripping of sequence) {
    const step = advanceLock(lock, state, 0.01, gripping);
    lock = step.lock;
    releaseCount = lock.releaseCount;
  }
  assert.equal(releaseCount, 3);

  // Now prove the "not every ungripped tick" half directly: staying released for
  // several consecutive ticks must not keep incrementing the count.
  let steadyLock = createLock(state, building, null, true);
  steadyLock = advanceLock(steadyLock, state, 0.01, false).lock; // the one release
  for (let i = 0; i < 20; i++) steadyLock = advanceLock(steadyLock, state, 0.01, false).lock;
  assert.equal(steadyLock.releaseCount, 1);
});

test("advanceLock: holdDuration accumulates only while gripping, across multiple grip periods", () => {
  const state = baseState({ altitude: 1000 });
  let lock = createLock(state, building, null, false);
  const dt = 0.5;
  // 2 ticks held (1.0s), 3 ticks released (0), 1 tick held (0.5s) = 1.5s total held
  const sequence = [true, true, false, false, false, true];
  for (const gripping of sequence) lock = advanceLock(lock, state, dt, gripping).lock;
  assert.ok(Math.abs(lock.holdDuration - 1.5) < 1e-9);
});

test("advanceLock: resolves recovered when gripping at the instant altitude reaches the ground", () => {
  const state = baseState({ altitude: 3 }); // just above ground
  const lock = createLock(state, building, null, true);
  const step = advanceLock(lock, state, 1, true); // held: drops by SURVIVABLE_SINK_RATE_M_S (5) -- clamped to 0
  assert.equal(step.resolved, true);
  assert.equal(step.altitude, 0);
  assert.equal(step.incident.outcome, "recovered");
});

test("advanceLock: resolves crashed when released at the instant altitude reaches the ground", () => {
  const state = baseState({ altitude: 3 });
  const lock = createLock(state, building, null, false);
  const step = advanceLock(lock, state, 1, false); // released: free-fall rate, clamped to 0
  assert.equal(step.resolved, true);
  assert.equal(step.altitude, 0);
  assert.equal(step.incident.outcome, "crashed");
});

test("advanceLock: incident stays null on every non-resolving tick, and is completed only on the resolving one", () => {
  const state = baseState({ altitude: 50 });
  let lock = createLock(state, building, null, false);
  let step;
  for (let i = 0; i < 100; i++) {
    step = advanceLock(lock, state, 1, i % 2 === 0); // alternate grip each tick
    lock = step.lock;
    state.altitude = step.altitude; // feed the new altitude back in, same as the real caller does
    if (step.resolved) break;
    assert.equal(step.incident, null, `tick ${i}: incident must be null before resolution`);
  }
  assert.equal(step.resolved, true);
  assert.ok(step.incident, "incident must be populated on the resolving tick");
  assert.equal(step.incident.holdDuration, lock.holdDuration);
  assert.equal(step.incident.releaseCount, lock.releaseCount);
  assert.equal(step.incident.finalHeading, state.heading);
});

function runToResolution(startAltitude, gripping, dt = 1 / 30, maxTicks = 100000) {
  const state = baseState({ altitude: startAltitude });
  let lock = createLock(state, building, null, gripping);
  let step,
    ticks = 0;
  do {
    step = advanceLock(lock, state, dt, gripping);
    lock = step.lock;
    state.altitude = step.altitude; // feed the new altitude back in each tick
    ticks++;
  } while (!step.resolved && ticks < maxTicks);
  return { step, ticks };
}

test("a full survivable sequence: held throughout never crashes, even from a realistic cruise altitude", () => {
  const { step } = runToResolution(380, true);
  assert.equal(step.resolved, true);
  assert.equal(step.incident.outcome, "recovered");
});

test("a fully released sequence crashes, and does so much faster than a held one from the same altitude", () => {
  const { step: heldStep, ticks: heldTicks } = runToResolution(380, true);
  const { step: releasedStep, ticks: releasedTicks } = runToResolution(380, false);
  assert.equal(releasedStep.incident.outcome, "crashed");
  assert.equal(heldStep.incident.outcome, "recovered");
  assert.ok(
    releasedTicks < heldTicks,
    `free fall (${releasedTicks} ticks) should resolve faster than the survivable cap (${heldTicks} ticks)`,
  );
});

// Integration bug found live, flying a real sequence (not predicted from reading the
// code): once locked, the craft is still horizontally inside the triggering building's
// footprint. spinner.js runs the SAME resolveMovement hard-stop every tick regardless of
// lock state; applying it while locked means every subsequent tick's lower (still
// below-that-roof) altitude re-collides with the SAME building and gets reverted right
// back to the trigger altitude -- forever. The fix is for spinner.js to skip
// resolveMovement entirely for the duration of an active lock (see its own comment at
// the call site). These tests reconstruct that orchestration directly against the real
// resolveMovement, without needing spinner.js/Cesium/DOM, to prove the failure mode is
// real and that the fix actually closes it.
const tallBuildingFootprint = {
  id: "tall-1",
  height: 55,
  // A simple closed-ring square footprint, ~110m across, centred on (-118.25, 34.05).
  points: [
    [-118.2505, 34.0495],
    [-118.2495, 34.0495],
    [-118.2495, 34.0505],
    [-118.2505, 34.0505],
    [-118.2505, 34.0495],
  ],
};

test("without the fix: re-applying the hard stop every tick traps a locked craft at the trigger altitude", () => {
  const state = { lon: -118.25, lat: 34.05, altitude: 40, speed: 42 };
  const before = { lon: state.lon, lat: state.lat, altitude: state.altitude };
  const triggerCheck = resolveMovement(before, state, [tallBuildingFootprint]);
  assert.equal(triggerCheck.blocked, true, "the fixture must actually collide to set up this scenario");
  assert.ok(isSevereImpact(state.speed));

  let lock = createLock(state, tallBuildingFootprint, null, false);
  const dt = 1 / 30;
  for (let i = 0; i < 30; i++) {
    const step = advanceLock(lock, state, dt, false); // released -- should be free-falling
    lock = step.lock;
    // The bug: naively re-checking collision against the SAME building every tick.
    const resolved = resolveMovement(before, { ...state, altitude: step.altitude }, [
      tallBuildingFootprint,
    ]);
    state.altitude = resolved.altitude; // reverted back to `before.altitude` every time
  }
  assert.equal(state.altitude, before.altitude, "demonstrates the trap: altitude never actually moves");
});

test("with the fix: skipping the hard stop while locked lets the forced descent actually proceed and resolve", () => {
  const state = { lon: -118.25, lat: 34.05, altitude: 40, speed: 42 };
  const before = { lon: state.lon, lat: state.lat, altitude: state.altitude };
  const triggerCheck = resolveMovement(before, state, [tallBuildingFootprint]);
  assert.equal(triggerCheck.blocked, true);

  let lock = createLock(state, tallBuildingFootprint, null, false);
  const dt = 1 / 30;
  let step,
    ticks = 0;
  do {
    step = advanceLock(lock, state, dt, false); // released, same as the trapped scenario above
    lock = step.lock;
    state.altitude = step.altitude; // NOT passed back through resolveMovement -- this is the fix
    ticks++;
  } while (!step.resolved && ticks < 10000);
  assert.equal(step.resolved, true, "the sequence must actually reach the ground, not loop forever");
  assert.equal(step.incident.outcome, "crashed"); // released throughout, from only 40m
  assert.ok(ticks < 100, `should resolve quickly from 40m released -- took ${ticks} ticks`);
});
