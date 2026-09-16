import { sampleRoute, movePosition, bearing, distance } from "./navigation.mjs";
export const LOOK_AHEAD_SECONDS = 7.5;
export function flightTarget(state, route) {
  const point = state.auto
    ? sampleRoute(route, state.travel + state.speed * LOOK_AHEAD_SECONDS)
    : movePosition(
        state.lon,
        state.lat,
        state.heading,
        state.speed * LOOK_AHEAD_SECONDS,
      );
  return {
    lon: point.lon,
    lat: point.lat,
    altitude: state.altitude,
    seconds: LOOK_AHEAD_SECONDS,
  };
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
