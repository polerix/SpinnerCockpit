import { sampleRoute, movePosition, bearing, distance } from "./navigation.mjs";
export const LOOK_AHEAD_SECONDS = 10;
export function flightTarget(state, route, seconds = LOOK_AHEAD_SECONDS) {
  const point = state.auto
    ? sampleRoute(route, state.travel + state.speed * seconds)
    : movePosition(
        state.lon,
        state.lat,
        state.heading,
        state.speed * seconds,
      );
  return {
    lon: point.lon,
    lat: point.lat,
    altitude: state.altitude,
    seconds,
  };
}
export function placeFlightGate(state, route) {
  const target = flightTarget(state, route);
  const travel = state.auto
    ? state.travel + state.speed * LOOK_AHEAD_SECONDS
    : null;
  return {
    ...target,
    heading: state.auto ? sampleRoute(route, travel).heading : state.heading,
    travel,
  };
}
export function flightGatePassed(state, gate) {
  if (gate.travel !== null && state.auto) return state.travel >= gate.travel;
  const radians = Math.PI / 180;
  const east =
    (state.lon - gate.lon) * radians * 6371000 * Math.cos(gate.lat * radians);
  const north = (state.lat - gate.lat) * radians * 6371000;
  return east * Math.sin(gate.heading) + north * Math.cos(gate.heading) >= 0;
}
export function advanceFlightGate(gate, state, route) {
  if (gate && !flightGatePassed(state, gate)) return gate;
  return state.speed > 0 ? placeFlightGate(state, route) : null;
}

// Interstitial feature, 2026-09-30: the magenta target gate used to be a single marker fixed at
// exactly LOOK_AHEAD_SECONDS ahead. This generalises it to a queue of GATE_SERIES_LENGTH gates
// spaced GATE_SPACING_SECONDS apart out to the same horizon, so the series reads as progress
// markers converging on a destination rather than one lone target.
//
// Each gate is placed and held exactly like the single gate above -- fixed in world space
// (travel distance in auto, lon/lat in manual) until flightGatePassed says the spinner crossed
// it -- NOT a HUD overlay recomputed every frame. What's new is how a REPLACEMENT gate is placed
// once the nearest one is passed: it extends GATE_SPACING_SECONDS further from the current
// FARTHEST existing gate (not from the vehicle's live position), using CURRENT speed to convert
// that step into world distance. Already-placed gates never move once laid down, so a mid-flight
// speed change can't retroactively reposition them -- but every newly appended tail gate reflects
// speed as of the moment it's created. A full lap through the queue is GATE_SERIES_LENGTH
// respawns, i.e. roughly one look-ahead horizon's worth of travel, so spacing drift from a speed
// change never compounds past that one cycle.
export const GATE_SPACING_SECONDS = 2;
export const GATE_SERIES_LENGTH = Math.round(LOOK_AHEAD_SECONDS / GATE_SPACING_SECONDS);

function placeSeriesGate(reference, state, route) {
  const seconds = (reference ? reference.seconds : 0) + GATE_SPACING_SECONDS;
  if (state.auto) {
    const travel =
      (reference ? reference.travel : state.travel) + state.speed * GATE_SPACING_SECONDS;
    const point = sampleRoute(route, travel);
    return {
      lon: point.lon,
      lat: point.lat,
      altitude: state.altitude,
      seconds,
      heading: point.heading,
      travel,
    };
  }
  const basis = reference ?? state;
  const point = movePosition(
    basis.lon,
    basis.lat,
    state.heading,
    state.speed * GATE_SPACING_SECONDS,
  );
  return {
    lon: point.lon,
    lat: point.lat,
    altitude: state.altitude,
    seconds,
    heading: state.heading,
    travel: null,
  };
}

/**
 * Advances (or, given an empty/null series, seeds) the progress-gate queue. Same calling
 * convention as advanceFlightGate: pass the previous series and get back either the SAME array
 * reference (nothing passed this tick -- lets callers skip re-touching Cesium entities) or a new
 * one with passed gates dropped and fresh tail gates appended to restore the full length. Passing
 * `[]` or `null` seeds the initial queue, exactly as advanceFlightGate(null, ...) seeds the first
 * single gate.
 *
 * The last element (`series.at(-1)`) is always the farthest gate -- the destination marker.
 * Everything before it is an intermediate progress marker. This is a property of array position,
 * not a flag baked into a gate at creation, because a given gate's role changes over its
 * lifetime: it's laid down as the destination, and stays physically put while newer gates never
 * get placed beyond it (it's never passed until every gate ahead of it already has been) --
 * so by the time it's about to be passed, it's necessarily the nearest gate, not the farthest.
 */
export function advanceFlightGateSeries(series, state, route) {
  const current = series ?? [];
  if (state.speed <= 0) return current.length ? [] : current;
  const anyPassed = current.some((gate) => flightGatePassed(state, gate));
  if (!anyPassed && current.length === GATE_SERIES_LENGTH) return current;
  let next = current.filter((gate) => !flightGatePassed(state, gate));
  while (next.length < GATE_SERIES_LENGTH)
    next = [...next, placeSeriesGate(next.at(-1) ?? null, state, route)];
  return next;
}
export function buildManeuvers(route, roads) {
  const edgeNames = new Map();
  const key = (a, b) => JSON.stringify([a, b]);
  for (const road of roads)
    for (let i = 1; i < road.points.length; i++) {
      edgeNames.set(key(road.points[i - 1], road.points[i]), road.name);
      edgeNames.set(key(road.points[i], road.points[i - 1]), road.name);
    }
  const instructions = [];
  let at = 0;
  for (let i = 1; i < route.points.length - 1; i++) {
    at += route.lengths[i - 1];
    const before = bearing(route.points[i - 1], route.points[i]),
      after = bearing(route.points[i], route.points[i + 1]);
    const delta =
      (Math.atan2(Math.sin(after - before), Math.cos(after - before)) * 180) /
      Math.PI;
    if (Math.abs(delta) > 30)
      instructions.push({
        at,
        direction: delta > 0 ? "RIGHT" : "LEFT",
        street:
          edgeNames.get(key(route.points[i], route.points[i + 1])) ||
          "NEXT STREET",
      });
  }
  instructions.push({
    at: route.total,
    direction: "ARRIVE",
    street: "BROADWAY / 5TH",
  });
  return instructions;
}
export function routePosition(route, position) {
  let nearest = { distance: Infinity, along: 0 };
  let along = 0;
  for (let i = 0; i < route.lengths.length; i++) {
    const a = route.points[i],
      b = route.points[i + 1],
      sx = 92000,
      sy = 111000;
    const dx = (b[0] - a[0]) * sx,
      dy = (b[1] - a[1]) * sy,
      px = (position.lon - a[0]) * sx,
      py = (position.lat - a[1]) * sy;
    const t = Math.max(
      0,
      Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1)),
    );
    const d = Math.hypot(px - t * dx, py - t * dy);
    if (d < nearest.distance)
      nearest = { distance: d, along: along + t * route.lengths[i] };
    along += route.lengths[i];
  }
  return nearest;
}
export function navigationNotice(state, route, maneuvers) {
  const located = state.auto
    ? {
        along: ((state.travel % route.total) + route.total) % route.total,
        distance: 0,
      }
    : routePosition(route, state);
  if (located.distance > 35)
    return `RETURN TO ROUTE - ${Math.round(located.distance)} M`;
  const next = maneuvers.find((m) => m.at >= located.along) || maneuvers.at(-1),
    remaining = Math.max(0, next.at - located.along);
  const street = next.street
    .toUpperCase()
    .replace(/WEST /g, "W ")
    .replace(/SOUTH /g, "S ")
    .replace(/STREET/g, "ST")
    .replace(/AVENUE/g, "AVE");
  if (next.direction === "ARRIVE")
    return remaining < 15
      ? "DESTINATION - BROADWAY / 5TH"
      : `IN ${Math.round(remaining / 5) * 5} M - ARRIVE ${street}`;
  return remaining < 15
    ? `TURN ${next.direction} - ${street}`
    : `IN ${Math.round(remaining / 5) * 5} M - ${next.direction} ${street}`;
}
