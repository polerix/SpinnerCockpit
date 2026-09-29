import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  pointInPolygon,
  findCollidingBuilding,
  resolveMovement,
} from "../src/collision.mjs";

const data = JSON.parse(
  readFileSync(new URL("../public/data/los-angeles.json", import.meta.url)),
);
const buildings = data.buildings;

// A simple 4-corner (5-point closed-ring) building's own corner average is
// guaranteed interior for a convex quad -- avoids hand-picked magic
// coordinates that could silently drift from the real fixture.
const simpleBuilding = buildings.find((b) => b.points.length === 5);
assert.ok(simpleBuilding, "fixture must contain at least one 4-corner building");
const corners = simpleBuilding.points.slice(0, 4);
const interiorPoint = [
  corners.reduce((s, p) => s + p[0], 0) / 4,
  corners.reduce((s, p) => s + p[1], 0) / 4,
];
// Clearly outside the whole loaded extract's bbox (west of it).
const farOutsidePoint = [data.bounds[0] - 1, (data.bounds[1] + data.bounds[3]) / 2];

test("pointInPolygon: a building's own corner-average is interior, a point far outside the bbox is not", () => {
  assert.equal(pointInPolygon(interiorPoint, simpleBuilding.points), true);
  assert.equal(pointInPolygon(farOutsidePoint, simpleBuilding.points), false);
});

test("findCollidingBuilding: below the roof and inside the footprint collides; above the roof is clear", () => {
  const [lon, lat] = interiorPoint;
  assert.equal(findCollidingBuilding(lon, lat, 0, buildings), simpleBuilding);
  assert.equal(
    findCollidingBuilding(lon, lat, simpleBuilding.height + 1, buildings),
    null,
  );
});

test("findCollidingBuilding: outside every footprint is clear regardless of altitude", () => {
  const [lon, lat] = farOutsidePoint;
  assert.equal(findCollidingBuilding(lon, lat, 0, buildings), null);
});

test("resolveMovement: a move into a building is a hard stop -- origin unchanged, blocked flagged", () => {
  const from = { lon: farOutsidePoint[0], lat: farOutsidePoint[1], altitude: 0 };
  const to = { lon: interiorPoint[0], lat: interiorPoint[1], altitude: 0 };
  const result = resolveMovement(from, to, buildings);
  assert.equal(result.lon, from.lon);
  assert.equal(result.lat, from.lat);
  assert.equal(result.altitude, from.altitude);
  assert.equal(result.blocked, true);
  assert.equal(result.building, simpleBuilding);
});

test("resolveMovement: a move into clear space is unblocked and lands exactly at the destination", () => {
  const from = { lon: farOutsidePoint[0], lat: farOutsidePoint[1], altitude: 0 };
  const to = { lon: farOutsidePoint[0] + 0.001, lat: farOutsidePoint[1], altitude: 0 };
  const result = resolveMovement(from, to, buildings);
  assert.equal(result.lon, to.lon);
  assert.equal(result.lat, to.lat);
  assert.equal(result.blocked, false);
  assert.equal(result.building, null);
});

test("resolveMovement: flying above a building's roof through its footprint is unblocked -- clear airspace, not a collision", () => {
  const from = { lon: farOutsidePoint[0], lat: farOutsidePoint[1], altitude: simpleBuilding.height + 50 };
  const to = { lon: interiorPoint[0], lat: interiorPoint[1], altitude: simpleBuilding.height + 50 };
  const result = resolveMovement(from, to, buildings);
  assert.equal(result.blocked, false);
  assert.equal(result.lon, to.lon);
});

test("resolveMovement: descending straight down onto a roof, with no horizontal movement, is also blocked", () => {
  const from = { lon: interiorPoint[0], lat: interiorPoint[1], altitude: simpleBuilding.height + 10 };
  const to = { lon: interiorPoint[0], lat: interiorPoint[1], altitude: 0 };
  const result = resolveMovement(from, to, buildings);
  assert.equal(result.blocked, true);
  assert.equal(result.altitude, from.altitude);
});
