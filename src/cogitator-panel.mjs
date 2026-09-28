// Wires the cogitator (src/cogitator.js) into the lower-left of the six main window openings.
// See ../../spinner-pip/MEASUREMENTS.md and VERIFY.md for the CRT recreation itself; this module
// is SpinnerCockpit-specific glue: which cockpit events reveal the panel, and how it moves.
//
// The original spec's events (dock.engage, dock.release, purge.start, canopy.unlock) don't exist
// in this build -- there's no docking and no canopy. Remapped to the real state vocabulary:
//
//   FLY <-> DRIVE transition  -- the 380m/3.2m altitude change. Primary purge trigger: a real
//                                spinner would cycle cabin air exactly then.
//   HOLD engaging             -- stationary purge, same alert, different cause.
//   Route arrival             -- reaching Broadway/5th under AUTO. NOT a purge (nothing about
//                                arriving cycles cabin air); the reveal gets a one-frame CRT sync
//                                snap instead, per the original spec's arrival behaviour.
//
// That purge/no-purge split for arrival isn't explicit in the brief -- it's read from "one-frame
// CRT sync snap on arrival" being called out on its own, separate from the general slide-in. If
// that reading's wrong, TRIGGER_PURGES below is the one place to change it.

export const ARRIVAL_WINDOW_M = 15; // matches guidance.mjs's own "DESTINATION" threshold, so the
// panel and the seven-segment readout agree on what "arrived" means.

export const TRIGGER_MODE_CHANGE = "mode-change";
export const TRIGGER_HOLD = "hold";
export const TRIGGER_ARRIVAL = "arrival";

// Which triggers run a PURGE alert on the cogitator itself, vs. just revealing it.
export const TRIGGER_PURGES = new Set([TRIGGER_MODE_CHANGE, TRIGGER_HOLD]);

/**
 * Edge-detects cogitator triggers between two consecutive state snapshots. Pure function, no
 * timers -- called once per simulation tick with whatever `state` already is, same pattern as
 * guidance.mjs. Returns an array (usually empty, occasionally one entry; never fires the same
 * trigger twice for the same edge).
 *
 * @param {{mode:string, paused:boolean, auto:boolean, travel:number}|null} prev null on the very
 *   first call -- no trigger fires off a null baseline, since there's no real transition yet.
 * @param {{mode:string, paused:boolean, auto:boolean, travel:number}} next
 * @param {{total:number}|null} route
 */
export function detectTriggers(prev, next, route) {
  const fired = [];
  if (prev && prev.mode !== next.mode) fired.push(TRIGGER_MODE_CHANGE);
  if (prev && !prev.paused && next.paused) fired.push(TRIGGER_HOLD);
  if (route && route.total > 0) {
    const arrivedNow = next.auto && isNearArrival(next.travel, route.total);
    const arrivedBefore = !!prev && prev.auto && isNearArrival(prev.travel, route.total);
    if (arrivedNow && !arrivedBefore) fired.push(TRIGGER_ARRIVAL);
  }
  return fired;
}

function isNearArrival(travel, total) {
  const along = ((travel % total) + total) % total;
  return total - along < ARRIVAL_WINDOW_M;
}

// ------------------------------------------------------------------------------------------
// Panel reveal state machine.
//
// States: "idle" (retracted, peek allowed), "peek" (hover only, no alert), "auto" (a triggered
// cycle: reveal, hold, retract -- uninterruptible once started). Peek can only be entered from
// idle and is pre-empted instantly by an auto-trigger; an auto-trigger firing while ALREADY in
// "auto" is ignored (auto-events don't fire twice from a single edge, and a second edge arriving
// mid-cycle doesn't restart or extend it -- it simply has no effect until the panel is idle
// again). That's "peek never interrupts a running cycle" and "an auto-event locks out peek for
// its duration" from the brief, both handled by the same two rules.

export const AUTO_HOLD_S = 5.0; // how long a triggered reveal stays fully up before retracting
// 3.6s is not an arbitrary number: MEASUREMENTS.md measured the real footage's one alert episode
// held red for ~3.6s. Reusing it here is a deliberate callback, not a coincidence.
export const PURGE_HOLD_S = 3.6;
export const SNAP_DURATION_S = 0.12; // one-frame CRT sync snap, arrival only

/**
 * Framework-free reveal FSM. No DOM, no canvas -- `tick()` returns what the caller should show
 * (reveal amount 0..1, whether a PURGE alert should be running, whether the one-shot "snap" class
 * should be applied this tick) and the DOM-facing code in spinner.js turns that into CSS state
 * and cogitator.setPurge() calls.
 */
export function createPanelState() {
  return {
    phase: "idle", // "idle" | "peek" | "auto"
    elapsed: 0, // seconds into the current phase
    trigger: null, // which trigger started the current "auto" phase
    snapUntil: 0, // elapsed-time cutoff for the one-shot snap flag
    hovering: false,
  };
}

/**
 * Advances the FSM by dt seconds, applying any triggers that fired this tick (from
 * detectTriggers) and the current hover flag. Mutates and returns `panel` for convenience.
 */
export function tickPanel(panel, dt, triggers, hovering) {
  panel.hovering = hovering;
  const incomingAuto = triggers.find((t) => t === TRIGGER_MODE_CHANGE || t === TRIGGER_HOLD || t === TRIGGER_ARRIVAL);

  if (incomingAuto && panel.phase !== "auto") {
    // A running auto cycle is uninterruptible; from idle or peek, any trigger takes over.
    panel.phase = "auto";
    panel.elapsed = 0;
    panel.trigger = incomingAuto;
    panel.snapUntil = incomingAuto === TRIGGER_ARRIVAL ? SNAP_DURATION_S : 0;
    return panel;
  }

  panel.elapsed += dt;

  if (panel.phase === "auto") {
    if (panel.elapsed >= AUTO_HOLD_S) {
      panel.phase = "idle";
      panel.elapsed = 0;
      panel.trigger = null;
      panel.snapUntil = 0;
    }
    return panel;
  }

  // idle <-> peek, hover-driven, only reachable when nothing else is running.
  panel.phase = hovering ? "peek" : "idle";
  return panel;
}

/** True while the current "auto" phase should keep the cogitator's PURGE alert running. */
export function purgeActive(panel) {
  return panel.phase === "auto" && TRIGGER_PURGES.has(panel.trigger) && panel.elapsed < PURGE_HOLD_S;
}

/** True for the one-shot CRT sync snap window at the start of an arrival reveal. */
export function snapActive(panel) {
  return panel.phase === "auto" && panel.trigger === TRIGGER_ARRIVAL && panel.elapsed < panel.snapUntil;
}

/** 0 (retracted) / 0.55 (peek) / 1 (fully revealed) -- the CSS layer maps this to a transform. */
export function revealAmount(panel) {
  if (panel.phase === "auto") return 1;
  if (panel.phase === "peek") return 0.55;
  return 0;
}
