import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseDashboard } from "../src/dashboard.mjs";
import { makeRoute, sampleRoute, distance } from "../src/navigation.mjs";
import {
  flightTarget,
  buildManeuvers,
  navigationNotice,
} from "../src/guidance.mjs";
const g = parseDashboard(
  readFileSync(new URL("../Spinner Dashboard.svg", import.meta.url), "utf8"),
);
const data = JSON.parse(
  readFileSync(new URL("../public/data/los-angeles.json", import.meta.url)),
);
const route = makeRoute(data.driveRoute),
  maneuvers = buildManeuvers(route, data.roads);
test("revised physical mask has six main, eighteen small and two controller openings", () => {
  assert.equal(g.panels.length, 6);
  assert.equal(g.small.length, 18);
  assert.equal(g.circles.length, 2);
  for (const strip of g.strips) {
    assert.ok(Math.abs(strip.box[2] - 50.5) < 0.01);
    assert.ok(Math.abs(strip.box[3] - 6) < 0.01);
  }
  assert.equal(g.small.filter((c) => c.box[0] < g.center[0]).length, 9);
});
test("decals are evenly spaced between dashboard edges and top displays", () => {
  assert.equal(g.decals.length, 3);
  const centers = g.decals.map((d) => d.box[0] + d.box[2] / 2);
  // Center decal is exactly aligned with dashboard center X
  assert.ok(Math.abs(centers[1] - g.center[0]) < 0.01);
  // Spacing between left and center equals spacing between center and right
  const gap1 = centers[1] - centers[0];
  const gap2 = centers[2] - centers[1];
  assert.ok(Math.abs(gap1 - gap2) < 0.01);

  const screenW = 146.6;
  const screenLeft = g.center[0] - screenW / 2;
  const screenRight = g.center[0] + screenW / 2;
  // Left decal is centered between dashboard left edge and left screen neighbor
  assert.ok(
    Math.abs(centers[0] - (screenLeft + g.strips[0].box[0]) / 2) < 0.01,
  );
  // Right decal is centered between right screen neighbor and dashboard right edge
  assert.ok(
    Math.abs(
      centers[2] -
        (g.strips[1].box[0] + g.strips[1].box[2] + screenRight) / 2,
    ) < 0.01,
  );

  // Decals share vertical center with top displays
  const stripCenterY = g.strips[0].box[1] + g.strips[0].box[3] / 2;
  for (const decal of g.decals) {
    const decalCenterY = decal.box[1] + decal.box[3] / 2;
    assert.ok(Math.abs(decalCenterY - stripCenterY) < 0.01);
    assert.ok(Math.abs(decal.box[2] - 6) < 0.01);
    assert.ok(Math.abs(decal.box[3] - 6) < 0.01);
  }
});
test("automatic flight target follows the actual route 7.5 seconds ahead, including lap wrap", () => {
  const state = {
    auto: true,
    travel: route.total - 12,
    speed: 42,
    altitude: 380,
  };
  const target = flightTarget(state, route),
    expected = sampleRoute(route, state.travel + 315);
  assert.equal(target.lon, expected.lon);
  assert.equal(target.lat, expected.lat);
  assert.equal(target.altitude, 380);
  assert.equal(target.seconds, 7.5);
});
test("manual flight target projects current heading and speed", () => {
  const state = {
    auto: false,
    lon: -118.25,
    lat: 34.05,
    speed: 20,
    heading: Math.PI / 2,
    altitude: 200,
  };
  const target = flightTarget(state, route);
  assert.ok(target.lon > state.lon);
  assert.ok(
    Math.abs(distance([state.lon, state.lat], [target.lon, target.lat]) - 150) <
      0.1,
  );
});
test("navigation changes from approach to turn to the following named street", () => {
  const first = maneuvers[0];
  assert.match(
    navigationNotice({ auto: true, travel: first.at - 80 }, route, maneuvers),
    /IN 80 M - RIGHT W 2ND ST/,
  );
  assert.match(
    navigationNotice({ auto: true, travel: first.at - 5 }, route, maneuvers),
    /^TURN RIGHT/,
  );
  assert.match(
    navigationNotice({ auto: true, travel: first.at + 10 }, route, maneuvers),
    /S SPRING ST/,
  );
  assert.match(
    navigationNotice(
      { auto: false, lon: -118.4, lat: 34.15 },
      route,
      maneuvers,
    ),
    /^RETURN TO ROUTE/,
  );
});
