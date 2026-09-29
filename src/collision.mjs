// Collision against the loaded OSM building extract (public/data/los-angeles.json).
// CONTRACT.md, "Collision": all buildings, both DRIVE and FLY. Below the (not-yet-
// wired) severity threshold this is a hard stop; the severity/catastrophic-lock side
// is Sprint 3, not here. This module only answers "does this candidate position
// collide", and resolves a single tick's proposed movement against that.
//
// Deliberately no spatial index -- CONTRACT.md is explicit that this is deferred to
// whenever Greater LA tiling actually lands. The current extract is 1,243 buildings;
// a linear scan against that is effectively free per frame.

/**
 * Ray-casting point-in-polygon test. `point` is [lon, lat]; `polygonPoints` is the
 * building footprint's own point list (closed ring, first === last, matching the
 * shape already used for `C.PolygonHierarchy` in spinner.js -- no format conversion
 * needed to reuse the same building records here).
 */
export function pointInPolygon(point, polygonPoints) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygonPoints.length - 1; i < polygonPoints.length; j = i++) {
    const [xi, yi] = polygonPoints[i];
    const [xj, yj] = polygonPoints[j];
    const crosses = yi > y !== yj > y;
    if (crosses && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * The building occupying (lon, lat, altitude), or null if the point is clear --
 * outside every footprint, or above every containing building's own roof. One
 * shared check for DRIVE and FLY, not two: CONTRACT.md deliberately doesn't
 * mode-branch this. DRIVE's altitude (~3.2m) is below virtually every real
 * building's height, so it behaves as a pure footprint test in practice; FLY's
 * altitude can legitimately exceed a roofline, which this treats as clear airspace
 * rather than a collision.
 */
export function findCollidingBuilding(lon, lat, altitude, buildings) {
  for (const b of buildings) {
    if (altitude >= b.height) continue; // above this building's own roof: clear
    if (pointInPolygon([lon, lat], b.points)) return b;
  }
  return null;
}

/**
 * Resolves one tick's proposed movement. `from`/`to` are {lon, lat, altitude}
 * triples for the position before and after this tick's tentative update (position
 * AND altitude both, checked together -- a player descending straight down onto a
 * roof is exactly as blocked as one flying sideways into a wall; this is one
 * combined check per tick, not a separate position check and altitude check, so a
 * move that changes both is accepted or rejected as a whole).
 *
 * Returns `to` unchanged if clear. Returns `from` unchanged (blocked: true) if the
 * destination collides -- a hard stop, not a slide or a boundary clamp: the
 * REJECTED tick's movement doesn't partially apply.
 *
 * Known, accepted limitation, not an oversight: this checks only the destination
 * point, not the swept path from `from` to `to`. A single tick's movement fast
 * enough to cross clean through a thin building can tunnel through it undetected.
 * Per-frame movement deltas are small relative to real building footprints at this
 * project's speeds (see CONTRACT.md's sprint notes); revisit only if this is
 * actually observed happening, not pre-emptively.
 */
export function resolveMovement(from, to, buildings) {
  const hit = findCollidingBuilding(to.lon, to.lat, to.altitude, buildings);
  if (hit) return { ...from, blocked: true, building: hit };
  return { ...to, blocked: false, building: null };
}
