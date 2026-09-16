import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  distance,
  makeRoute,
  sampleRoute,
  movePosition,
  turnToward,
} from "../src/navigation.mjs";
const data = JSON.parse(
  readFileSync(new URL("../public/data/los-angeles.json", import.meta.url)),
);
const route = makeRoute(data.driveRoute);
test("demo route closes and every step follows a real street segment", () => {
  assert.deepEqual(data.driveRoute[0], data.driveRoute.at(-1));
  const edges = new Set();
  for (const road of data.roads)
    for (let i = 1; i < road.points.length; i++) {
      edges.add(JSON.stringify([road.points[i - 1], road.points[i]]));
      edges.add(JSON.stringify([road.points[i], road.points[i - 1]]));
    }
  for (let i = 1; i < data.driveRoute.length; i++)
    assert.ok(
      edges.has(JSON.stringify([data.driveRoute[i - 1], data.driveRoute[i]])),
    );
  assert.ok(route.total > 500 && route.total < 5000);
});
test("lap boundary is continuous and negative offsets wrap", () => {
  const a = sampleRoute(route, route.total - 0.01),
    b = sampleRoute(route, 0.01);
  assert.ok(distance([a.lon, a.lat], [b.lon, b.lat]) < 0.03);
  assert.deepEqual(sampleRoute(route, -2), sampleRoute(route, route.total - 2));
});
test("manual movement uses metres and compass heading", () => {
  const north = movePosition(-118.25, 34.05, 0, 100),
    east = movePosition(-118.25, 34.05, Math.PI / 2, 100);
  assert.ok(north.lat > 34.05);
  assert.ok(east.lon > -118.25);
  assert.ok(
    Math.abs(distance([-118.25, 34.05], [east.lon, east.lat]) - 100) < 0.1,
  );
});
test("steering crosses north by the short turn", () => {
  assert.ok(
    turnToward((359 * Math.PI) / 180, Math.PI / 180, 0.1) >
      (359 * Math.PI) / 180,
  );
});
