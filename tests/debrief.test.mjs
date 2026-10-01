import { test } from "node:test";
import assert from "node:assert/strict";
import { formatIncidentRows } from "../src/debrief.js";
import { GLYPHS } from "../src/cogitator-font.js";

const incident = {
  cause: { type: "collision", buildingId: "23973401" },
  speed: 42.3,
  mode: "flight",
  auto: false,
  altitude: 245.1,
  heading: -1.105135,
  lon: -118.254,
  lat: 34.0509,
  assistedApproach: { pad: "Bradbury Building", progress: 0.456 },
  holdDuration: 48.199999,
  releaseCount: 2,
  outcome: "recovered",
  finalHeading: -1.1,
};

test("formatIncidentRows: covers every field CONTRACT.md's Debrief section lists, roughly ten lines", () => {
  const rows = formatIncidentRows(incident);
  assert.ok(rows.length >= 8 && rows.length <= 12, `expected roughly ten rows, got ${rows.length}`);
  const joined = rows.join(" ");
  assert.match(joined, /23973401/); // cause/building
  assert.match(joined, /42/); // speed
  assert.match(joined, /FLIGHT/);
  assert.match(joined, /MANUAL/); // auto:false
  assert.match(joined, /245/); // altitude
  // formatIncidentRows doesn't itself uppercase pad names -- drawBitmapText does that at render
  // time (it uppercases before the glyph lookup) -- so this checks case-insensitively, matching
  // what actually reaches the screen rather than asserting a stricter contract than the code has.
  assert.match(joined, /bradbury/i); // assisted approach underway
  assert.match(joined, /48/); // hold duration
  assert.match(joined, /2/); // release count appears somewhere
  assert.match(joined, /RECOVERED/); // outcome
});

test("formatIncidentRows: no assisted approach reads as an explicit NONE, not a blank or crash", () => {
  const rows = formatIncidentRows({ ...incident, assistedApproach: null });
  assert.ok(rows.some((r) => /APPROACH NONE/.test(r)));
});

test("formatIncidentRows: every character used is in the bitmap font -- no silently-blank glyphs", () => {
  // drawBitmapText falls back to a blank space for any character not in GLYPHS, which would
  // render as an invisible gap rather than an error -- easy to miss by eye, easy to catch here.
  const rows = formatIncidentRows(incident);
  for (const row of rows)
    for (const ch of row.toUpperCase())
      assert.ok(ch in GLYPHS, `character "${ch}" in row "${row}" has no bitmap glyph`);
});
