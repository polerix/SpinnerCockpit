import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Bug, 2026-09-30: the cogitator panel's reveal animation only ever moved the CANVAS
// (translateY bound to --cogitator-reveal). The wrapper <div>'s own background was a flat
// `background:#000`, permanently opaque -- so retracting the canvas genuinely worked, but the
// window it commandeered stayed solid black forever instead of showing the shared globe view the
// other five main panels show. "Cut in, cut out" requires the WRAPPER's own background to be
// bound to reveal state too, not just its child's transform.
//
// This repo has no DOM/CSS test harness (no jsdom, no browser automation in devDependencies) --
// node:test can't execute spinner.css and observe a rendered background colour. This asserts
// against the committed CSS *source* instead: the .cogitator-panel rule's background property
// must be an alpha value driven by --cogitator-reveal, not a fixed colour. That's weaker than
// executing the stylesheet, and this comment says so on purpose -- but it does genuinely
// discriminate the specific regression, confirmed by running the same assertion against the
// pre-fix source (`background: #000;`, no reveal reference) and watching it fail before trusting
// it here.
const css = readFileSync(new URL("../spinner.css", import.meta.url), "utf8");

function cogitatorPanelRule(source) {
  // Match the bare ".cogitator-panel { ... }" rule, not its ".cogitator-panel canvas { ... }"
  // descendant rule (which has its own, unrelated transform-based reveal binding).
  const blocks = [...source.matchAll(/\.cogitator-panel(?<selectorTail>[^{]*)\{([^}]*)\}/g)];
  const bare = blocks.find((m) => m.groups.selectorTail.trim() === "");
  assert.ok(bare, "expected a bare `.cogitator-panel { ... }` rule in spinner.css");
  return bare[2];
}

test("cogitator panel wrapper's background is bound to --cogitator-reveal, not a fixed colour -- proves the cut-out actually restores the window", () => {
  const rule = cogitatorPanelRule(css);
  assert.match(
    rule,
    /background:\s*rgba\(\s*0,\s*0,\s*0,\s*var\(--cogitator-reveal/,
    "the wrapper's background must be an alpha value driven by --cogitator-reveal -- a flat " +
      "background colour here (even one that matches the field, e.g. #000) reintroduces the bug: " +
      "the canvas's own reveal animation can work perfectly while this div still permanently " +
      "blocks the shared globe view underneath",
  );
});

test("sanity check: this assertion genuinely fails against the pre-fix source, not just a tautology", () => {
  const preFixRule = `
  position: absolute;
  overflow: hidden;
  background: #000;
  pointer-events: auto;
`;
  assert.doesNotMatch(
    preFixRule,
    /background:\s*rgba\(\s*0,\s*0,\s*0,\s*var\(--cogitator-reveal/,
    "the pre-fix rule (flat #000, no reveal binding) must NOT satisfy the check above -- if it " +
      "does, the check above cannot actually catch this regression",
  );
});
