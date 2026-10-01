// CONTRACT.md "Catastrophic lock -- the dead-man's switch": manual override is not
// unlocked, earned, or toggled. It is forced on the operator at the moment the autopilot
// fails. The trigger is the collision severity threshold -- read off the SAME collision
// check that already produces Sprint 1's hard stop, not a separate measurement -- and no
// new physics: the forced descent is the same kinematic altitude model the rest of this
// project already uses (state.altitude is a bare per-frame value), just no longer
// optional once a lock is active.

export const SEVERE_IMPACT_SPEED_M_S = 20; // ~72 km/h. Judgment call, flagged: drive's own
// speed cap is 25 m/s and flight cruise is 42 m/s (flight max 120), so this sits below
// flight cruise -- virtually any flight-mode collision locks, which fits the frame
// (hitting a building while flying is inherently severe) -- while sitting below most but
// not all of drive's own range (a slow fender-bender stays a plain hard stop; a
// near-max-speed drive collision locks too). The single constant to retune if this reads
// wrong.

export const SURVIVABLE_SINK_RATE_M_S = 5; // matches assisted landing's own upper
// safe-band bound (SINK_RATE_MAX_M_S in landing.mjs) -- an already-established "fastest
// survivable descent" number, not a second one invented for this module.
export const FREEFALL_SINK_RATE_M_S = 40; // released: uncapped toward free fall. A fixed
// fast rate, not an accelerating one -- CONTRACT.md is explicit that this is the same
// bare-per-frame kinematic model as everywhere else, not a new momentum/glide system.

/**
 * True when a blocked movement's severity crosses the catastrophic threshold. `speed` is
 * whatever the tick that just got blocked was attempting -- state.speed is untouched by
 * resolveMovement's revert (only position/altitude are), so the caller can read it
 * straight off `state` at the same instant it checks `resolved.blocked`, with no separate
 * measurement.
 */
export function isSevereImpact(speed) {
  return speed >= SEVERE_IMPACT_SPEED_M_S;
}

/**
 * Starts a lock sequence. Captures the trigger-instant fields CONTRACT.md's Debrief
 * section calls for -- cause, speed, mode, auto-state, altitude, heading, position, and
 * whether an assisted approach was already underway (and how far into it) -- into
 * `incident`, completed with the outcome-time fields (hold duration, release count,
 * outcome, final heading) once the sequence resolves -- see advanceLock.
 *
 * `gripping` starts at whatever the dead-man's-switch input already reads at the trigger
 * instant, not a hardcoded false: if the operator happened to already be holding it when
 * the collision hit, that grip carries through rather than vanishing for one confusing
 * tick before they could possibly react to a failure they didn't know was coming.
 */
export function createLock(state, building, landingApproach, gripping) {
  return {
    gripping,
    holdDuration: 0,
    releaseCount: 0,
    incident: {
      cause: { type: "collision", buildingId: building.id },
      speed: state.speed,
      mode: state.mode,
      auto: state.auto,
      altitude: state.altitude,
      heading: state.heading,
      lon: state.lon,
      lat: state.lat,
      assistedApproach: landingApproach
        ? {
            pad: landingApproach.pad.name,
            progress: landingApproach.traveled / landingApproach.totalDistance,
          }
        : null,
    },
  };
}

/**
 * Advances one tick of an active lock sequence. Altitude is forced down every tick at
 * whichever rate the CURRENT grip state selects -- survivable while held, free-fall while
 * released -- no momentum, no easing, just which constant applies this frame. Heading and
 * lateral movement aren't touched here: CONTRACT.md leaves those to the caller's own
 * normal manual controls, full/near-full during a lock rather than assisted landing's
 * bounded nudge, because the automation that provided a safe band is what just failed.
 *
 * Resolves the instant altitude reaches the ground (0 -- the same flat-ground model
 * everywhere else in this project already uses): recovered if gripping at that instant
 * (the survivable cap was in effect), crashed if not (free fall). `incident` comes back
 * non-null only on the resolving tick, completed with the outcome-time fields.
 */
export function advanceLock(lock, state, dt, gripping) {
  const releaseCount = lock.releaseCount + (lock.gripping && !gripping ? 1 : 0);
  const holdDuration = lock.holdDuration + (gripping ? dt : 0);
  const sinkRate = gripping ? SURVIVABLE_SINK_RATE_M_S : FREEFALL_SINK_RATE_M_S;
  const altitude = Math.max(0, state.altitude - sinkRate * dt);
  const resolved = altitude <= 0;

  if (!resolved)
    return {
      lock: { gripping, holdDuration, releaseCount, incident: lock.incident },
      altitude,
      resolved: false,
      incident: null,
    };

  const incident = {
    ...lock.incident,
    holdDuration,
    releaseCount,
    outcome: gripping ? "recovered" : "crashed",
    finalHeading: state.heading,
  };
  return {
    lock: { gripping, holdDuration, releaseCount, incident },
    altitude,
    resolved: true,
    incident,
  };
}
