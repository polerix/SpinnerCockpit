// The OVRLOC FAIL / CEL-DON alarm: a procedural recreation of the hull/systems-failure CRT
// readout filmed for Alien (1979), built from direct pixel measurement of the surviving footage.
// See ../ALARM-MEASUREMENTS.md for the measurement pass this is built against.
//
// A sibling to cogitator.js, not a reskin of it. The cogitator's PURGE rendering is a field-colour
// crossfade keyed to a blink-pattern progress value on an otherwise-static panel; this screen is a
// genuinely different animal, confirmed by measurement, not assumed by analogy: a two-state STROBE
// (the whole field/shape polarity flips on a ~1.3Hz cycle -- see ALARM-MEASUREMENTS.md #1) over a
// shape that isn't the simple cross CONTRACT.md's own characterization described (it's a vertical
// dumbbell -- see ALARM-MEASUREMENTS.md #2). The one piece of the cogitator's code this module
// does legitimately reuse is the bitmap font (cogitator-font.js), measured against the same camera
// rig and extended here with the few glyphs (L, F, A, M, 1, 7) this screen's text needs that the
// ENVIRON CTR readout never did.
//
// Self-contained: no video, no image assets, no web fonts. Draws to any 2D canvas context you hand
// it. Layout constants are measured in a fixed 640x360 reference space and scaled to whatever
// canvas size you actually give it, same convention as cogitator.js.

import { GLYPH_ROWS, drawBitmapText, measureBitmapText } from './cogitator-font.js';

export const REFERENCE_WIDTH = 640;
export const REFERENCE_HEIGHT = 360;

/**
 * UNVERIFIED, same reasoning and same source footage as cogitator.js's own ASPECT_RATIO: the
 * camera crops this screen's bottom edge too, so true proportions were never in shot. The visible
 * lit area measures ~1.36:1 here (ALARM-MEASUREMENTS.md #4), close to 4:3 and closely matching
 * ENVIRON CTR's own ~1.34:1 reading from the same camera rig -- corroborating, not independently
 * confirming.
 */
export const ASPECT_RATIO = 4 / 3;

// Lit area (ALARM-MEASUREMENTS.md #4). Left/top sharp, right/bottom the same soft camera vignette
// fade already documented for ENVIRON CTR from this rig, not a hard screen edge.
const FIELD_LEFT = 80;
const FIELD_TOP = 4;
const FIELD_RIGHT_FADE_START = 540;
const FIELD_RIGHT_FADE_END = 568;
const FIELD_BOTTOM_FADE_START = 338;
const FIELD_BOTTOM_FADE_END = 360;

// Colour, both strobe states (ALARM-MEASUREMENTS.md #3). Not flat fills -- the lit field varies by
// position the same way ENVIRON CTR's does, attributed there to camera vignette rather than the
// screen itself; reused here on that same reasoning rather than re-litigating it.
const FIELD_LIT_BRIGHT = 'rgb(227,48,28)';
const FIELD_LIT_DARK = 'rgb(150,33,17)';
const FIELD_DIM = 'rgb(18,16,13)'; // state A's near-black field
const SHAPE_GLOW = 'rgb(243,63,45)'; // state A: the shape itself, glowing
const SHAPE_DARK = 'rgb(55,21,15)'; // state B: the shape as dark negative space, not pure black
// Corrected after the first render pass: visual inspection of cropped/zoomed reference frames
// (not the single noisy point-sample this constant first came from) shows text reading as a
// FIXED medium tone in both states -- dimmer than the glow but brighter than the near-black field
// in state A, darker than the lit field in state B -- not a bright, field-independent highlight.
// Approximate; precise text-only colour isolation is at this source's blur/resolution limit.
const TEXT_COLOR = 'rgb(110,45,30)';

// Shape geometry (ALARM-MEASUREMENTS.md #2): a vertical dumbbell/hourglass -- a narrow continuous
// bar through the centre, flared into two wide caps top and bottom, each cap rounded ONLY on its
// outer corners. Not a 4-armed cross: a systematic boundary trace found no left/right arms at all,
// see the measurement doc for how that reading was checked.
const BAR_LEFT = 248;
const BAR_RIGHT = 364;
const BAR_TOP = 96; // slightly past the cap's own inner edge, so the two shapes overlap with no
const BAR_BOTTOM = 248; // seam -- see drawShape(). Medium confidence on the exact overlap amount.
const CAP_LEFT = 178;
const CAP_RIGHT = 446;
const CAP_TOP_OUTER = 18;
const CAP_BOTTOM_OUTER = 342;
const CAP_HEIGHT = 112; // outer edge to where it meets the bar
const CAP_CORNER_RADIUS = 66; // medium confidence -- blur-limited at this source resolution

// Text (ALARM-MEASUREMENTS.md #4). Two lines per label, positioned in the lit gaps around the
// shape rather than inside it. Cell size re-measured directly off cropped/zoomed reference
// crops after the first build pass ran text off the edge of the canvas entirely at a copied-over
// cellPx=6 -- this screen's text sits much smaller relative to the shape than ENVIRON CTR's title
// does relative to its layout, which an estimate carried over from that module missed. ~2.5px/cell
// is consistent independently from both the top label's measured height (~18px/8 rows) and the
// left label's measured width (~98px/6 chars) -- medium confidence, blur-limited source.
const TEXT_CELL_PX = 2.5;
const TEXT_LINE_GAP_PX = 6;
const TOP_TEXT = ['CEL', '004'];
const BOTTOM_TEXT = ['772', '101'];
const LEFT_TEXT = ['OVRLOC', 'FAIL'];
const RIGHT_TEXT = ['DAMP', '0011'];

// Strobe timing (ALARM-MEASUREMENTS.md #1): a genuinely measured two-state square wave, not a
// guessed blink rate. State A (dim field, glowing shape) and state B (lit field, dark shape) hold
// for different, consistent durations -- an asymmetric duty cycle, not a symmetric 50/50 blink.
const STATE_A_HOLD_S = 0.338;
const STATE_B_HOLD_S = 0.412;
const SNAP_S = 0.05; // measured transition: 1-2 frames, i.e. a snap, not a crossfade

// Bloom, same two-pass additive-glow-plus-normal-core technique as cogitator.js's composeBloom,
// tuned separately: this screen's glow (state A's shape) reads wider and softer in the source than
// ENVIRON CTR's text bloom does.
const BLOOM_GLOW_LAYERS = [
  { blur: 7, alpha: 0.3 },
  { blur: 3, alpha: 0.32 },
];
const BLOOM_CORE_BLUR = 0.8;

function lerp(a, b, t) {
  return a + (b - a) * t;
}
function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

export class Alarm {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this._ref = document.createElement('canvas');
    this._ref.width = REFERENCE_WIDTH;
    this._ref.height = REFERENCE_HEIGHT;
    this._refCtx = this._ref.getContext('2d');

    this._mask = document.createElement('canvas');
    this._mask.width = REFERENCE_WIDTH;
    this._mask.height = REFERENCE_HEIGHT;
    this._maskCtx = this._mask.getContext('2d');

    this._t = 0;
    this._active = false;
    this._phase = 'A'; // 'A' | 'B', which strobe state is current
    this._phaseElapsed = 0;
    this._mix = 0; // 0 = fully state A, 1 = fully state B -- eased across SNAP_S, not instant
  }

  /**
   * Starts (or clears) the alarm. CONTRACT.md "Alarm": no acknowledgement -- the caller flips
   * this boolean and the screen reveals/clears itself, same idiom as cogitator.js's setPurge().
   */
  setActive(active) {
    if (active === this._active) return;
    this._active = active;
    if (active) {
      this._phase = 'A';
      this._phaseElapsed = 0;
      this._mix = 0;
    }
  }

  get active() {
    return this._active;
  }

  /** Advance animation state by dt seconds. Call once per frame before draw(). */
  update(dt) {
    this._t += dt;
    if (!this._active) return;

    this._phaseElapsed += dt;
    const hold = this._phase === 'A' ? STATE_A_HOLD_S : STATE_B_HOLD_S;
    if (this._phaseElapsed >= hold) {
      this._phase = this._phase === 'A' ? 'B' : 'A';
      this._phaseElapsed = 0;
    }

    const target = this._phase === 'B' ? 1 : 0;
    const rate = dt / SNAP_S;
    this._mix = clamp01(this._mix + (target - this._mix > 0 ? rate : -rate));
  }

  draw() {
    const rc = this._refCtx;
    rc.setTransform(1, 0, 0, 1, 0, 0);
    rc.clearRect(0, 0, REFERENCE_WIDTH, REFERENCE_HEIGHT);

    if (this._active) {
      this._drawField(rc);
      this._drawMask((mc) => this._paintContent(mc));
      composeBloom(rc, this._mask, this._mix);
    }

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this._ref, 0, 0, this.canvas.width, this.canvas.height);
  }

  _drawMask(paint) {
    const mc = this._maskCtx;
    mc.setTransform(1, 0, 0, 1, 0, 0);
    mc.clearRect(0, 0, REFERENCE_WIDTH, REFERENCE_HEIGHT);
    paint(mc);
  }

  _drawField(rc) {
    rc.fillStyle = '#000000';
    rc.fillRect(0, 0, REFERENCE_WIDTH, REFERENCE_HEIGHT);

    // Field: near-black in state A, lit red (with the same measured positional variation as
    // ENVIRON CTR's vignette) in state B -- crossfades with the same _mix as the shape.
    const litGrad = rc.createLinearGradient(FIELD_LEFT, FIELD_TOP, REFERENCE_WIDTH, REFERENCE_HEIGHT * 0.7);
    litGrad.addColorStop(0, FIELD_LIT_BRIGHT);
    litGrad.addColorStop(1, FIELD_LIT_DARK);

    rc.save();
    rc.fillStyle = FIELD_DIM;
    rc.fillRect(FIELD_LEFT, FIELD_TOP, REFERENCE_WIDTH - FIELD_LEFT, REFERENCE_HEIGHT - FIELD_TOP);
    rc.globalAlpha = this._mix;
    rc.fillStyle = litGrad;
    rc.fillRect(FIELD_LEFT, FIELD_TOP, REFERENCE_WIDTH - FIELD_LEFT, REFERENCE_HEIGHT - FIELD_TOP);
    rc.restore();

    this._fadeEdge(rc, FIELD_RIGHT_FADE_START, 0, FIELD_RIGHT_FADE_END, 0, true);
    this._fadeEdge(rc, 0, FIELD_BOTTOM_FADE_START, 0, FIELD_BOTTOM_FADE_END, false);
  }

  _fadeEdge(rc, x0, y0, x1, y1, horizontal) {
    const grad = rc.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,1)');
    rc.fillStyle = grad;
    if (horizontal) rc.fillRect(x0, FIELD_TOP, REFERENCE_WIDTH - x0, REFERENCE_HEIGHT - FIELD_TOP);
    else rc.fillRect(FIELD_LEFT, y0, REFERENCE_WIDTH - FIELD_LEFT, REFERENCE_HEIGHT - y0);
  }

  _paintContent(mc) {
    // The shape itself: glows (fills with SHAPE_GLOW, gets the full bloom treatment) in state A;
    // reads as dark negative space (SHAPE_DARK, no bloom) in state B. Both are drawn and the
    // caller's composeBloom only blooms the state-A layer -- see draw()/composeBloom.
    mc.fillStyle = lerpColorRgb(SHAPE_GLOW, SHAPE_DARK, this._mix);
    drawShape(mc);

    // Text sits in the lit gaps around the shape, not floating clear of it: the top/bottom labels
    // measured flush against (slightly overlapping) the cap's own rounded top/bottom edge, and
    // left/right sit beside the narrow BAR (not the wide caps -- at this height the shape IS the
    // bar, so the lit field reaches much further in than the caps' own width would suggest).
    const shapeCenterX = (CAP_LEFT + CAP_RIGHT) / 2;
    const lineHeight = GLYPH_ROWS * TEXT_CELL_PX + TEXT_LINE_GAP_PX;
    const barCenterY = (BAR_TOP + BAR_BOTTOM) / 2;

    mc.fillStyle = TEXT_COLOR;
    drawLabel(mc, TOP_TEXT, shapeCenterX, CAP_TOP_OUTER + 2, 'center-top');
    drawLabel(mc, BOTTOM_TEXT, shapeCenterX, CAP_BOTTOM_OUTER - 2 * lineHeight, 'center-top');
    drawLabel(mc, LEFT_TEXT, BAR_LEFT - 10, barCenterY - lineHeight, 'right-top');
    drawLabel(mc, RIGHT_TEXT, BAR_RIGHT + 10, barCenterY - lineHeight, 'left-top');
  }
}

/** Draws the two rounded-rect caps plus the connecting bar as one shape, in the context's current fillStyle. */
function drawShape(ctx) {
  ctx.beginPath();
  roundRectPath(ctx, CAP_LEFT, CAP_TOP_OUTER, CAP_RIGHT - CAP_LEFT, CAP_HEIGHT, [
    CAP_CORNER_RADIUS,
    CAP_CORNER_RADIUS,
    0,
    0,
  ]);
  ctx.fill();
  ctx.beginPath();
  roundRectPath(ctx, CAP_LEFT, CAP_BOTTOM_OUTER - CAP_HEIGHT, CAP_RIGHT - CAP_LEFT, CAP_HEIGHT, [
    0,
    0,
    CAP_CORNER_RADIUS,
    CAP_CORNER_RADIUS,
  ]);
  ctx.fill();
  // Bar overlaps both caps' inner edges slightly (BAR_TOP/BAR_BOTTOM vs. where the caps actually
  // end) so the union reads as one continuous silhouette with no visible seam at the junction --
  // the real footage shows a smooth concave taper there that this approximates rather than traces
  // exactly (ALARM-MEASUREMENTS.md #2's medium-confidence corner radius note applies here too).
  ctx.fillRect(BAR_LEFT, BAR_TOP, BAR_RIGHT - BAR_LEFT, BAR_BOTTOM - BAR_TOP);
}

function roundRectPath(ctx, x, y, w, h, radii) {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, radii);
    return;
  }
  // Fallback for contexts without roundRect (e.g. some headless test environments).
  const [tl, tr, br, bl] = radii;
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h);
  ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl);
  ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

/** label: [line1, line2]; x: reference x; y: reference y of the FIRST line's top; align controls
 * which edge x refers to and whether lines stack below (top) y. */
function drawLabel(mc, lines, x, y, align) {
  let cy = y;
  for (const line of lines) {
    const w = measureBitmapText(line, TEXT_CELL_PX);
    let lx = x;
    if (align === 'center-top') lx = x - w / 2;
    else if (align === 'right-top') lx = x - w;
    // 'left-top': lx = x, already correct
    drawBitmapText(mc, line, lx, cy, TEXT_CELL_PX);
    cy += GLYPH_ROWS * TEXT_CELL_PX + TEXT_LINE_GAP_PX;
  }
}

function lerpColorRgb(c1, c2, t) {
  const p1 = c1.match(/\d+/g).map(Number);
  const p2 = c2.match(/\d+/g).map(Number);
  return `rgb(${p1.map((v, i) => Math.round(lerp(v, p2[i], t))).join(',')})`;
}

/** Same technique as cogitator.js's composeBloom (see there for the full rationale): wide additive
 * glow passes underneath, a normal-compositing core on top so solid interior pixels land on the
 * configured colour rather than clipping to white. `mix` is the same 0=state A / 1=state B value
 * update() tracks; glow strength is (1-mix) -- full halo in state A (the shape glows), none in
 * state B (the shape is dark negative space, which still draws its sharp core so the silhouette
 * stays crisp, just without a halo). */
function composeBloom(destCtx, maskCanvas, mix) {
  const glow = 1 - mix;
  destCtx.save();
  if (glow > 0.01) {
    destCtx.globalCompositeOperation = 'lighter';
    for (const { blur, alpha } of BLOOM_GLOW_LAYERS) {
      destCtx.filter = `blur(${blur}px)`;
      destCtx.globalAlpha = alpha * glow;
      destCtx.drawImage(maskCanvas, 0, 0);
    }
  }
  destCtx.globalCompositeOperation = 'source-over';
  destCtx.globalAlpha = 1;
  destCtx.filter = `blur(${BLOOM_CORE_BLUR}px)`;
  destCtx.drawImage(maskCanvas, 0, 0);
  destCtx.restore();
}
