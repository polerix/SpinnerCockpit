import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  detectTriggers,
  createPanelState,
  tickPanel,
  purgeActive,
  snapActive,
  revealAmount,
  TRIGGER_MODE_CHANGE,
  TRIGGER_HOLD,
  TRIGGER_ARRIVAL,
  AUTO_HOLD_S,
  PURGE_HOLD_S,
  ARRIVAL_WINDOW_M,
} from "../src/cogitator-panel.mjs";
import { parseDashboard } from "../src/dashboard.mjs";

const route = { total: 1000 };

// spinner.js hardcodes COGITATOR_PANEL_INDEX = 3 rather than deriving it, so a redrawn dashboard
// SVG that reorders the six panels needs this to fail loudly, not commandeer the wrong window.
test("panel index 3 is the lower-left of the six main windows, in the live dashboard SVG", () => {
  const g = parseDashboard(
    readFileSync(new URL("../Spinner Dashboard.svg", import.meta.url), "utf8"),
  );
  assert.equal(g.panels.length, 6);
  const target = g.panels[3];
  const [x, y] = [target.box[0] + target.box[2] / 2, target.box[1] + target.box[3] / 2];
  for (const [i, p] of g.panels.entries()) {
    if (i === 3) continue;
    const [px, py] = [p.box[0] + p.box[2] / 2, p.box[1] + p.box[3] / 2];
    // "lower-left": nothing else is both further left (smaller x) AND further down (larger y).
    assert.ok(
      !(px < x - 0.1 && py > y + 0.1),
      `panel ${i} at (${px},${py}) is further down-left than panel 3 at (${x},${y})`,
    );
  }
});

// Same guard reasoning, same consequence (a redrawn SVG silently commandeers the wrong window)
// for the two panels Sprint 4 added: spinner.js hardcodes ALARM_PANEL_INDEX = 1 and
// DEBRIEF_PANEL_INDEX = 5 rather than deriving them.
test("panel index 1 is on the top row (row-major sort: 0-2 top, 3-5 bottom)", () => {
  const g = parseDashboard(
    readFileSync(new URL("../Spinner Dashboard.svg", import.meta.url), "utf8"),
  );
  const topRowMaxY = Math.max(...g.panels.slice(0, 3).map((p) => p.box[1] + p.box[3] / 2));
  const bottomRowMinY = Math.min(...g.panels.slice(3, 6).map((p) => p.box[1] + p.box[3] / 2));
  assert.ok(topRowMaxY < bottomRowMinY, "row-major sort assumption itself must hold");
  const [, y] = [g.panels[1].box[0], g.panels[1].box[1] + g.panels[1].box[3] / 2];
  assert.ok(y <= topRowMaxY + 0.1, "panel 1 must be in the top row");
});

test("panel index 5 is the rightmost of the bottom row", () => {
  const g = parseDashboard(
    readFileSync(new URL("../Spinner Dashboard.svg", import.meta.url), "utf8"),
  );
  const bottomRow = g.panels.slice(3, 6);
  const target = g.panels[5];
  const targetX = target.box[0] + target.box[2] / 2;
  for (const p of bottomRow) {
    const px = p.box[0] + p.box[2] / 2;
    assert.ok(px <= targetX + 0.1, "panel 5 must be at least as far right as every bottom-row panel");
  }
});

// Same guard reasoning again for Sprint 5's octagon panel: spinner.js hardcodes
// OCTAGON_PANEL_INDEX = 0 rather than deriving it.
test("panel index 0 is the leftmost of the top row", () => {
  const g = parseDashboard(
    readFileSync(new URL("../Spinner Dashboard.svg", import.meta.url), "utf8"),
  );
  const topRow = g.panels.slice(0, 3);
  const target = g.panels[0];
  const targetX = target.box[0] + target.box[2] / 2;
  for (const p of topRow) {
    const px = p.box[0] + p.box[2] / 2;
    assert.ok(px >= targetX - 0.1, "panel 0 must be at least as far left as every top-row panel");
  }
});

// ---------------------------------------------------------------------------------------------
// detectTriggers: each edge fires exactly once, not on every tick it remains true.

test("mode change fires once on the transition, not on every subsequent tick in the new mode", () => {
  const a = { mode: "flight", paused: false, auto: true, travel: 0 };
  const b = { mode: "drive", paused: false, auto: true, travel: 0 };
  assert.deepEqual(detectTriggers(null, a, route), []); // no prior state, no edge
  assert.deepEqual(detectTriggers(a, b, route), [TRIGGER_MODE_CHANGE]);
  assert.deepEqual(detectTriggers(b, b, route), []); // staying in drive: no re-fire
  assert.deepEqual(detectTriggers(b, { ...b }, route), []);
});

test("hold fires on the rising edge only -- not on release, not while held", () => {
  const running = { mode: "flight", paused: false, auto: true, travel: 0 };
  const held = { ...running, paused: true };
  assert.deepEqual(detectTriggers(running, held, route), [TRIGGER_HOLD]);
  assert.deepEqual(detectTriggers(held, held, route), []); // still held: no re-fire
  assert.deepEqual(detectTriggers(held, running, route), []); // release: no fire either
});

test("arrival fires once on entering the destination window, not continuously inside it, and re-arms after a lap wraps", () => {
  const before = { mode: "flight", paused: false, auto: true, travel: route.total - ARRIVAL_WINDOW_M - 1 };
  const entering = { ...before, travel: route.total - 5 };
  const stillInside = { ...before, travel: route.total - 1 };
  assert.deepEqual(detectTriggers(before, entering, route), [TRIGGER_ARRIVAL]);
  assert.deepEqual(detectTriggers(entering, stillInside, route), []); // same window: no re-fire
  const wrapped = { ...before, travel: 2 }; // lap rolled over past 0
  assert.deepEqual(detectTriggers(stillInside, wrapped, route), []);
  const leftAgain = { ...before, travel: route.total - 200 };
  const reentering = { ...before, travel: route.total - 3 };
  assert.deepEqual(detectTriggers(wrapped, leftAgain, route), []);
  assert.deepEqual(
    detectTriggers(leftAgain, reentering, route),
    [TRIGGER_ARRIVAL],
    "a second lap's approach fires arrival again",
  );
});

test("arrival does not fire under manual driving, even inside the distance window", () => {
  const before = { mode: "drive", paused: false, auto: false, travel: route.total - 100 };
  const inside = { mode: "drive", paused: false, auto: false, travel: route.total - 1 };
  assert.deepEqual(detectTriggers(before, inside, route), []);
});

test("no route yields no arrival trigger, and other triggers are unaffected", () => {
  const a = { mode: "flight", paused: false, auto: true, travel: 0 };
  const b = { mode: "drive", paused: false, auto: true, travel: 0 };
  assert.deepEqual(detectTriggers(a, b, null), [TRIGGER_MODE_CHANGE]);
});

test("simultaneous mode change and hold both fire on the same tick", () => {
  const a = { mode: "flight", paused: false, auto: true, travel: 0 };
  const b = { mode: "drive", paused: true, auto: true, travel: 0 };
  const fired = detectTriggers(a, b, route);
  assert.deepEqual(new Set(fired), new Set([TRIGGER_MODE_CHANGE, TRIGGER_HOLD]));
});

// ---------------------------------------------------------------------------------------------
// Panel FSM: peek/auto precedence.

test("hover reveals peek from idle, and releases back to idle", () => {
  const panel = createPanelState();
  tickPanel(panel, 0.1, [], true);
  assert.equal(panel.phase, "peek");
  assert.equal(revealAmount(panel), 0.55);
  tickPanel(panel, 0.1, [], false);
  assert.equal(panel.phase, "idle");
  assert.equal(revealAmount(panel), 0);
});

test("an auto trigger pre-empts an active peek immediately", () => {
  const panel = createPanelState();
  tickPanel(panel, 0.1, [], true);
  assert.equal(panel.phase, "peek");
  tickPanel(panel, 0.1, [TRIGGER_HOLD], true);
  assert.equal(panel.phase, "auto");
  assert.equal(revealAmount(panel), 1);
});

test("hovering during a running auto cycle has no effect -- peek never interrupts it", () => {
  const panel = createPanelState();
  tickPanel(panel, 0.1, [TRIGGER_MODE_CHANGE], false);
  assert.equal(panel.phase, "auto");
  for (let i = 0; i < 10; i++) tickPanel(panel, 0.1, [], true); // hovering throughout
  assert.equal(panel.phase, "auto", "still running the auto cycle, not diverted to peek");
  assert.equal(revealAmount(panel), 1);
});

test("a second trigger arriving mid-cycle does not restart or extend it", () => {
  const panel = createPanelState();
  tickPanel(panel, 0.1, [TRIGGER_MODE_CHANGE], false); // the transitioning tick resets elapsed to 0
  tickPanel(panel, 2, [], false); // 2s into a 5s cycle
  assert.equal(panel.elapsed, 2);
  tickPanel(panel, 0.1, [TRIGGER_HOLD], false); // second trigger fires mid-cycle
  assert.equal(panel.phase, "auto");
  assert.ok(panel.elapsed > 2, "elapsed was not reset by the second trigger");
  assert.equal(panel.trigger, TRIGGER_MODE_CHANGE, "still the original trigger, not replaced");
});

test("auto cycle holds for AUTO_HOLD_S then retracts to idle, once, without re-triggering", () => {
  const panel = createPanelState();
  tickPanel(panel, 0.1, [TRIGGER_ARRIVAL], false);
  let steps = 0;
  while (panel.phase === "auto" && steps < 1000) {
    tickPanel(panel, 0.05, [], false);
    steps++;
  }
  assert.equal(panel.phase, "idle");
  assert.ok(steps * 0.05 >= AUTO_HOLD_S - 0.05 && steps * 0.05 <= AUTO_HOLD_S + 0.1);
  // does not spontaneously re-enter auto on the next few idle ticks
  for (let i = 0; i < 5; i++) tickPanel(panel, 0.1, [], false);
  assert.equal(panel.phase, "idle");
});

// ---------------------------------------------------------------------------------------------
// purgeActive / snapActive: which triggers alert, which snap.

test("mode-change and hold run a PURGE alert; arrival never does", () => {
  for (const trigger of [TRIGGER_MODE_CHANGE, TRIGGER_HOLD]) {
    const panel = createPanelState();
    tickPanel(panel, 0.01, [trigger], false);
    assert.equal(purgeActive(panel), true, `${trigger} should start a purge`);
  }
  const arrivalPanel = createPanelState();
  tickPanel(arrivalPanel, 0.01, [TRIGGER_ARRIVAL], false);
  assert.equal(purgeActive(arrivalPanel), false, "arrival should not purge");
});

test("purge clears after PURGE_HOLD_S even though the panel stays up until AUTO_HOLD_S", () => {
  assert.ok(PURGE_HOLD_S < AUTO_HOLD_S, "test assumes the purge is shorter than the full hold");
  const panel = createPanelState();
  tickPanel(panel, 0.01, [TRIGGER_HOLD], false);
  tickPanel(panel, PURGE_HOLD_S - 0.02, [], false);
  assert.equal(purgeActive(panel), true);
  tickPanel(panel, 0.05, [], false);
  assert.equal(purgeActive(panel), false, "purge has ended");
  assert.equal(panel.phase, "auto", "but the panel is still up");
});

test("only arrival gets the one-frame snap, and only briefly", () => {
  const panel = createPanelState();
  tickPanel(panel, 0.01, [TRIGGER_ARRIVAL], false);
  assert.equal(snapActive(panel), true);
  tickPanel(panel, 1, [], false);
  assert.equal(snapActive(panel), false, "snap window has passed");

  const holdPanel = createPanelState();
  tickPanel(holdPanel, 0.01, [TRIGGER_HOLD], false);
  assert.equal(snapActive(holdPanel), false, "hold never snaps");
});
