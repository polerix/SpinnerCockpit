// The octagon/X disconnect readout: a procedural recreation of the shuttle-separation counter
// filmed for Alien (1979) (reused by Blade Runner as a cockpit display), built from direct pixel
// measurement of the surviving footage rather than the original guessed spec. See
// ../OCTAGON-MEASUREMENTS.md for the measurement pass this is built against; that document also
// covers the second, smaller blue readout included here as part of the same screen. No verify
// doc yet -- side-by-side comparison against real frames happens at the end of this build pass,
// written up inline rather than as a separate file this time (see the bottom of this file's
// history / the session that built it).
//
// Self-contained: no video, no image assets, no web fonts. Draws to any 2D canvas context you
// hand it. All layout constants are measured in a fixed reference space and scaled to whatever
// canvas size you actually give it -- same convention as cogitator.js, so both screens can sit
// behind one panel interface later.

import { drawDigit } from './octagon-digits.js';

// ---------------------------------------------------------------------------------------------
// Named constants carried over from OCTAGON-MEASUREMENTS.md. Several are flagged there as
// unverified or as layout choices rather than measurements -- kept as named constants with their
// confidence level in the comment for exactly the reason cogitator.js gives: change them here,
// not by hunting through the drawing code, if better source material or a firmer read turns up.

/** Reference space every other constant below is measured in. */
export const REFERENCE_WIDTH = 640;
export const REFERENCE_HEIGHT = 420;

/**
 * HIGH CONFIDENCE (OCTAGON-MEASUREMENTS.md #2). Not a regular (45 degree) octagon -- corners cut
 * steeper than 45 degrees, consistently on all four corners of the measured burst-1 frame.
 * Expressed as fractions of the octagon's own bounding box so they hold at any drawn size:
 * CORNER_CUT_X is the horizontal extent of a corner cut as a fraction of width, CORNER_CUT_Y the
 * vertical extent as a fraction of height. Averaged across the four measured corners
 * (18.8/18.5/15.3/15.7% horizontal, 32.3/28.8/28.8/29.6% vertical).
 */
export const CORNER_CUT_X = 0.171;
export const CORNER_CUT_Y = 0.299;

/**
 * HIGH CONFIDENCE (OCTAGON-MEASUREMENTS.md #2). Burst 1's measured bounding box, 973x756px,
 * which is where CORNER_CUT_X/Y and every other fraction below were derived from. Kept as a
 * named export so anything downstream that wants "the octagon's true proportions" doesn't have
 * to recompute it from the two constants above.
 */
export const OCTAGON_ASPECT_RATIO = 973 / 756; // ~1.287

/**
 * HIGH-MEDIUM CONFIDENCE (OCTAGON-MEASUREMENTS.md #2). The X does not reach either vertex on its
 * diagonal -- both measured ends of one arm fell ~77-80px short of the nearest vertex at the
 * 973px-wide measured scale, i.e. ~16% of the octagon's own centre-to-vertex radius, confirmed
 * to within 3px on two independent ends of the same arm. The second arm and burst 2 were not
 * re-verified to the same precision and are assumed symmetric.
 */
export const X_VERTEX_INSET_FRAC = 0.163;

/**
 * HIGH CONFIDENCE on the exterior (clean, against true black) measurement; the interior-side
 * figure was wider (~16.5px) but that's contaminated by the shared glow field itself, not a
 * separate falloff -- modelled here by the shared bloom pass, not a second number. Fractions of
 * octagon width, from the measured 9.5px core FWHM / ~9.8px clean 10-90% rise at 973px scale.
 */
export const STROKE_CORE_WIDTH_FRAC = 0.0098; // ~9.5px / 973px
export const STROKE_GLOW_WIDTH_FRAC = 0.0101; // ~9.8px / 973px, exterior-side measurement

/**
 * MEDIUM CONFIDENCE (OCTAGON-MEASUREMENTS.md #3). The X's own glow could not be cleanly isolated
 * from the octagon's shared field (there is no "X on flat black" cross-section anywhere on this
 * graphic) -- averaging perpendicular cuts on an isolated stretch of arm gave a green-channel
 * rise over roughly an 18-20px full width at 973px scale. Used only for the X's own core stroke
 * width; the surrounding glow is NOT a second independent pass, see composeSharedGlow() below.
 */
export const X_CORE_WIDTH_FRAC = 0.0196; // ~19px / 973px

// Colour, measured (OCTAGON-MEASUREMENTS.md #1). Field is genuinely near-black away from stroke
// bloom -- not a flat glowing fill, contra my own first (wrong) impression mid-measurement.
const FIELD_COLOR = 'rgb(10,8,8)';

// Octagon stroke core, HIGH-MEDIUM CONFIDENCE -- patch-mean across 6 frames to avoid clipping
// bias; spec's guess (#FF5A00) was close but undershot green badly (real reads more amber/gold).
const STROKE_COLOR = 'rgb(210,150,20)'; // #D29614

// X stroke core, HIGH CONFIDENCE -- consistent to a few RGB units across both bursts, verified
// against zoomed crops against the octagon-corner/counter-digit contamination that fouled the
// first two measurement attempts. THE central correction this build carries: green, not red.
const X_CORE_COLOR = 'rgb(163,252,169)'; // #A3FCA9

// Counter frame and digit colours, HIGH CONFIDENCE (top-30-brightest-pixel sampling, confirmed
// on 3 different digit values so it's not a value-dependent artifact). Positional, not the
// spec's outer-two/inner-three split.
const COUNTER_FRAME_COLOR = STROKE_COLOR; // measured indistinguishable from the octagon stroke
const COUNTER_AMBER = 'rgb(255,249,126)';
const COUNTER_WHITE = 'rgb(241,252,233)';
const COUNTER_AMBER_POSITIONS = new Set([0, 1, 4]); // 0-indexed: measured positions 1, 2, 5
const COUNTER_WHITE_POSITIONS = new Set([2, 3]); // measured positions 3, 4

// Blue secondary readout, HIGH CONFIDENCE colour (X core rgb(164,255,154) at burst 2, matches
// the main readout's X core almost exactly -- see the note on X_CORE_COLOR reuse below), LOW
// CONFIDENCE geometry/position (OCTAGON-MEASUREMENTS.md #6: "not independently measured to the
// precision in section 2... too soft-focus"). Its own octagon stroke and counter digits read
// uniformly cyan; no amber/white split observed (no separate field to contrast against).
const BLUE_STROKE_COLOR = 'rgb(70,200,235)';
const BLUE_COUNTER_COLOR = 'rgb(150,235,255)';
// The X core measured on the blue readout was near-identical to the main readout's -- both
// plausibly draw the X in the same fixed green/mint colour, with the very different overall
// impression (amber-orange halo vs. clean cyan) coming entirely from each readout's own stroke
// colour tinting the SHARED glow field they sit in, not from the X itself being drawn in two
// different colours. Reusing X_CORE_COLOR for both is a direct implementation of that reading,
// not a simplification of it.

/**
 * LOW CONFIDENCE / LAYOUT CHOICE, not a measurement. OCTAGON-MEASUREMENTS.md #6 explicitly says
 * the blue readout's own position and scale relative to the main one were not measured to any
 * precision -- it's smaller and to the left in the source framing, partially cut off by the
 * console housing in one of the two bursts. This is a reasonable placement consistent with what
 * IS visible, not a recovered number. Change freely.
 */
export const BLUE_READOUT_SCALE = 0.42;

// Counter layout, MEDIUM CONFIDENCE -- read directly off a coordinate-gridded crop rather than
// algorithmic edge detection (the thin divider lines didn't survive automated isolation from the
// glyph strokes cleanly; see OCTAGON-MEASUREMENTS.md's method note in #2 for the same problem on
// the X line). Position as fractions of the octagon's own bounding box; cell widths as fractions
// of the counter box's own total width, deliberately non-uniform -- the two amber "00" cells
// measured narrower than the three active-digit cells, not a typo.
const COUNTER_LEFT_FRAC = 0.0144; // from octagon left edge
const COUNTER_RIGHT_FRAC = 0.364;
const COUNTER_CENTER_Y_FRAC = 0.48; // from octagon top edge, of octagon height
const COUNTER_HEIGHT_FRAC = 0.140;
const COUNTER_CELL_WIDTH_FRACS = [0.153, 0.126, 0.226, 0.250, 0.244]; // sums to ~1, left to right

// Counter step rate, HIGH CONFIDENCE (OCTAGON-MEASUREMENTS.md #5) -- every transition in ~30
// read frames across both bursts held for exactly 2 native frames at 23.976fps, i.e. one step
// per ~83ms, bar one unexplained anomaly flagged in the doc and NOT reproduced here (see
// update() below -- it's noted, not modelled, since it wasn't part of a repeating pattern).
const STEP_INTERVAL_S = (2 * 1001) / 24000; // ~0.0834s, two native frames at 23.976fps

/**
 * HIGH-MEDIUM CONFIDENCE. OCTAGON-MEASUREMENTS.md #6: orange and blue agree exactly outside the
 * instant of a digit transition; at that instant, blue was observed holding its old value for up
 * to one native frame after orange had already rolled. A small phase offset on blue's own step
 * timer reproduces exactly that shape (same value almost all the time, briefly behind right at
 * the roll) without claiming a stronger relationship (a fixed count offset, a different rate)
 * that the measurement doesn't support.
 */
export const BLUE_LAG_S = 1001 / 24000; // one native frame, ~0.0417s

/**
 * UNVERIFIED (OCTAGON-MEASUREMENTS.md #3 and #8). A fine moire/dither texture is visible under
 * magnification on every stroke in the source, structured rather than random, but its provenance
 * -- a real feature of the physical prop's display technology, vs. an artifact introduced by
 * this file's own compression/scaling chain -- could not be determined from a single compressed
 * file. Off by default for exactly that reason, same posture as cogitator.js's scanlineRoll/
 * jitter: a switchable parameter, not a built-in guess.
 */
const DEFAULT_MOIRE_TEXTURE = false;
const MOIRE_TILE_PX = 3; // arbitrary if enabled; not measured to a pitch, just plausible at scale
const MOIRE_ALPHA = 0.12;

/**
 * UNVERIFIED / EXPLICITLY NOT MODELLED. The spec's 2Hz X-strobe claim was checked directly
 * against every available frame and disproved -- the X is solid within both bursts, at native
 * 24fps, no flicker. There is no strobe parameter here; adding one back in as an option would
 * misrepresent a checked-and-rejected claim as an open stylistic choice, unlike scanlineRoll/
 * jitter above (which are genuinely unmeasured, not measured-and-false). A "docked, solid" vs.
 * "release" distinction was asked about in the measurement pass; there is no footage of a docked
 * state to build one from, so this module has exactly one state: solid, matching every frame
 * that exists.
 */

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

export class OctagonReadout {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [options]
   * @param {number} [options.startValue=199] initial counter value, both readouts
   * @param {boolean} [options.moireTexture=false] measured-unverified-provenance; off by default, see above
   * @param {number} [options.moireTilePx]
   * @param {number} [options.moireAlpha]
   * @param {number} [options.blueLagS] see BLUE_LAG_S
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.moireTexture = options.moireTexture ?? DEFAULT_MOIRE_TEXTURE;
    this.moireTilePx = options.moireTilePx ?? MOIRE_TILE_PX;
    this.moireAlpha = options.moireAlpha ?? MOIRE_ALPHA;
    this.blueLagS = options.blueLagS ?? BLUE_LAG_S;

    this._ref = document.createElement('canvas');
    this._ref.width = REFERENCE_WIDTH;
    this._ref.height = REFERENCE_HEIGHT;
    this._refCtx = this._ref.getContext('2d');

    // One mask canvas per readout (main, blue) so each gets its own bloom pass scaled to its own
    // size -- a smaller readout's stroke should bloom by proportionally the same fraction of ITS
    // width, not the same fixed pixel radius as the main one. Kept separate from cogitator's
    // single-mask approach for that reason; see composeSharedGlow() below.
    this._maskMain = document.createElement('canvas');
    this._maskMain.width = REFERENCE_WIDTH;
    this._maskMain.height = REFERENCE_HEIGHT;
    this._maskMainCtx = this._maskMain.getContext('2d');

    this._maskBlue = document.createElement('canvas');
    this._maskBlue.width = REFERENCE_WIDTH;
    this._maskBlue.height = REFERENCE_HEIGHT;
    this._maskBlueCtx = this._maskBlue.getContext('2d');

    // Separate, thicker-stroked masks feeding only the wide ambient-wash glow layer (see
    // composeSharedGlow). A CSS blur() at the ~60-100px radius that wash needs dilutes a normal
    // ~4px-wide line's total brightness down to nearly nothing -- gaussian blur conserves energy,
    // so it has to start from a thicker source to still read as a wash rather than vanishing.
    // Confirmed by direct measurement while tuning this (see VERIFY notes at the bottom of this
    // file): the same blur radius on a 4px source line reads as (4,3,0) at 60px away; on a
    // proportionally thick source it reads as a visible, gradually fading wash instead.
    this._maskMainWide = document.createElement('canvas');
    this._maskMainWide.width = REFERENCE_WIDTH;
    this._maskMainWide.height = REFERENCE_HEIGHT;
    this._maskMainWideCtx = this._maskMainWide.getContext('2d');

    this._maskBlueWide = document.createElement('canvas');
    this._maskBlueWide.width = REFERENCE_WIDTH;
    this._maskBlueWide.height = REFERENCE_HEIGHT;
    this._maskBlueWideCtx = this._maskBlueWide.getContext('2d');

    const start = options.startValue ?? 199;
    this._orangeValue = start;
    this._blueValue = start;
    this._orangeTimer = 0;
    this._blueTimer = -this.blueLagS; // phase offset -- see BLUE_LAG_S doc above
    this._t = 0;
  }

  /** Advance the counter(s) by dt seconds. Call once per frame before draw(). */
  update(dt) {
    this._t += dt;

    this._orangeTimer += dt;
    while (this._orangeTimer >= STEP_INTERVAL_S) {
      this._orangeTimer -= STEP_INTERVAL_S;
      this._orangeValue = Math.max(0, this._orangeValue - 1);
    }

    this._blueTimer += dt;
    while (this._blueTimer >= STEP_INTERVAL_S) {
      this._blueTimer -= STEP_INTERVAL_S;
      this._blueValue = Math.max(0, this._blueValue - 1);
    }
  }

  /** Current displayed value of the main (orange) counter. */
  get value() {
    return this._orangeValue;
  }

  /** Reset both counters to a value, e.g. for a new countdown. Clears any accumulated phase. */
  setValue(value) {
    this._orangeValue = value;
    this._blueValue = value;
    this._orangeTimer = 0;
    this._blueTimer = -this.blueLagS;
  }

  /** Draws the current state to the canvas passed to the constructor. */
  draw() {
    const rc = this._refCtx;
    rc.setTransform(1, 0, 0, 1, 0, 0);
    rc.clearRect(0, 0, REFERENCE_WIDTH, REFERENCE_HEIGHT);
    rc.fillStyle = FIELD_COLOR;
    rc.fillRect(0, 0, REFERENCE_WIDTH, REFERENCE_HEIGHT);

    const main = this._layoutMain();
    const blue = this._layoutBlue();

    this._drawMask(this._maskMainCtx, (mc) =>
      this._paintReadout(mc, main, STROKE_COLOR, this._orangeValue, {
        amber: COUNTER_AMBER,
        white: COUNTER_WHITE,
        frame: COUNTER_FRAME_COLOR,
      })
    );
    this._drawMask(this._maskMainWideCtx, (mc) => this._paintWideSource(mc, main, STROKE_COLOR));
    composeSharedGlow(rc, this._maskMain, this._maskMainWide, main.width);

    this._drawMask(this._maskBlueCtx, (mc) =>
      this._paintReadout(mc, blue, BLUE_STROKE_COLOR, this._blueValue, {
        amber: BLUE_COUNTER_COLOR,
        white: BLUE_COUNTER_COLOR,
        frame: BLUE_STROKE_COLOR,
      })
    );
    this._drawMask(this._maskBlueWideCtx, (mc) => this._paintWideSource(mc, blue, BLUE_STROKE_COLOR));
    composeSharedGlow(rc, this._maskBlue, this._maskBlueWide, blue.width);

    if (this.moireTexture) this._drawMoire(rc);

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this._ref, 0, 0, this.canvas.width, this.canvas.height);
  }

  _layoutMain() {
    const width = REFERENCE_WIDTH * 0.6875; // 440/640, right-aligned with a margin -- see below
    const height = width / OCTAGON_ASPECT_RATIO;
    const right = REFERENCE_WIDTH - 20;
    const left = right - width;
    const top = (REFERENCE_HEIGHT - height) / 2;
    return { cx: left + width / 2, cy: top + height / 2, width, height, left, top };
  }

  _layoutBlue() {
    const main = this._layoutMain();
    const width = main.width * BLUE_READOUT_SCALE;
    const height = width / OCTAGON_ASPECT_RATIO;
    // Positioned immediately left of, and slightly overlapping, the main readout -- matching the
    // "immediately adjacent" framing visible in the source (OCTAGON-MEASUREMENTS.md #6), not a
    // measured offset. Vertically centred on the main readout for lack of a better-supported
    // number.
    const right = main.left + width * 0.15;
    const left = right - width;
    const top = main.cy - height / 2;
    return { cx: left + width / 2, cy: top + height / 2, width, height, left, top };
  }

  _drawMask(mc, paint) {
    mc.setTransform(1, 0, 0, 1, 0, 0);
    mc.clearRect(0, 0, REFERENCE_WIDTH, REFERENCE_HEIGHT);
    paint(mc);
  }

  _paintReadout(mc, layout, strokeColor, counterValue, counterColors) {
    const { cx, cy, width, height } = layout;

    octagonPath(mc, cx, cy, width, height, CORNER_CUT_X, CORNER_CUT_Y);
    mc.strokeStyle = strokeColor;
    mc.lineWidth = width * STROKE_CORE_WIDTH_FRAC;
    mc.lineJoin = 'round';
    mc.stroke();

    this._drawX(mc, layout);
    this._drawCounter(mc, layout, counterValue, counterColors);
  }

  /**
   * A much thicker-stroked version of just the octagon edge and X (no counter -- the wash it
   * feeds is meant to read as ambient fill near the big strokes, not a halo around the small
   * digits), used only as the source for the wide glow layer in composeSharedGlow. See the
   * constructor comment for why this needs its own thicker source rather than reusing the sharp
   * mask.
   */
  _paintWideSource(mc, layout, strokeColor) {
    octagonPath(mc, layout.cx, layout.cy, layout.width, layout.height, CORNER_CUT_X, CORNER_CUT_Y);
    mc.strokeStyle = strokeColor;
    mc.lineWidth = layout.width * 0.05;
    mc.lineJoin = 'round';
    mc.stroke();
    this._drawX(mc, layout, layout.width * 0.045);
  }

  _drawX(mc, layout, widthOverride) {
    const { cx, cy, width, height } = layout;
    const left = cx - width / 2;
    const right = cx + width / 2;
    const top = cy - height / 2;
    const bottom = cy + height / 2;
    const topLeft = { x: left + width * CORNER_CUT_X, y: top };
    const topRight = { x: right - width * CORNER_CUT_X, y: top };
    const bottomLeft = { x: left + width * CORNER_CUT_X, y: bottom };
    const bottomRight = { x: right - width * CORNER_CUT_X, y: bottom };

    const inset = (v) => ({
      x: v.x + (cx - v.x) * X_VERTEX_INSET_FRAC,
      y: v.y + (cy - v.y) * X_VERTEX_INSET_FRAC,
    });

    mc.strokeStyle = X_CORE_COLOR;
    mc.lineWidth = widthOverride ?? width * X_CORE_WIDTH_FRAC;
    mc.lineCap = 'round';
    mc.beginPath();
    let p = inset(topLeft);
    mc.moveTo(p.x, p.y);
    p = inset(bottomRight);
    mc.lineTo(p.x, p.y);
    mc.stroke();
    mc.beginPath();
    p = inset(topRight);
    mc.moveTo(p.x, p.y);
    p = inset(bottomLeft);
    mc.lineTo(p.x, p.y);
    mc.stroke();
  }

  _drawCounter(mc, layout, value, colors) {
    const { cx, cy, width, height } = layout;
    const left = cx - width / 2;
    const top = cy - height / 2;
    const boxLeft = left + width * COUNTER_LEFT_FRAC;
    const boxRight = left + width * COUNTER_RIGHT_FRAC;
    const boxCY = top + height * COUNTER_CENTER_Y_FRAC;
    const boxHeight = height * COUNTER_HEIGHT_FRAC;
    const boxTop = boxCY - boxHeight / 2;
    const boxWidth = boxRight - boxLeft;

    const digits = String(Math.max(0, Math.round(value)))
      .padStart(COUNTER_CELL_WIDTH_FRACS.length, '0')
      .slice(-COUNTER_CELL_WIDTH_FRACS.length)
      .split('');

    mc.strokeStyle = colors.frame;
    mc.lineWidth = Math.max(1, boxHeight * 0.03);
    mc.strokeRect(boxLeft, boxTop, boxWidth, boxHeight);

    let x = boxLeft;
    const cellPad = boxHeight * 0.12;
    digits.forEach((digit, i) => {
      const cellWidth = boxWidth * COUNTER_CELL_WIDTH_FRACS[i];
      if (i > 0) {
        mc.beginPath();
        mc.moveTo(x, boxTop);
        mc.lineTo(x, boxTop + boxHeight);
        mc.stroke();
      }
      const glyphColor = COUNTER_AMBER_POSITIONS.has(i)
        ? colors.amber
        : COUNTER_WHITE_POSITIONS.has(i)
          ? colors.white
          : colors.amber;
      mc.fillStyle = glyphColor;
      const cellPx = (boxHeight - cellPad * 2) / 8;
      const glyphWidth = cellPx * 5;
      const gx = x + (cellWidth - glyphWidth) / 2;
      const gy = boxTop + cellPad;
      drawDigit(mc, digit, gx, gy, cellPx);
      x += cellWidth;
    });
  }

  _drawMoire(rc) {
    rc.save();
    rc.globalAlpha = this.moireAlpha;
    rc.strokeStyle = '#000000';
    rc.lineWidth = 1;
    for (let x = 0; x < REFERENCE_WIDTH; x += this.moireTilePx) {
      rc.beginPath();
      rc.moveTo(x, 0);
      rc.lineTo(x, REFERENCE_HEIGHT);
      rc.stroke();
    }
    for (let y = 0; y < REFERENCE_HEIGHT; y += this.moireTilePx) {
      rc.beginPath();
      rc.moveTo(0, y);
      rc.lineTo(REFERENCE_WIDTH, y);
      rc.stroke();
    }
    rc.restore();
  }
}

/**
 * Traces the irregular-octagon outline measured in OCTAGON-MEASUREMENTS.md #2: flat top/bottom/
 * left/right edges joined by four corners cut steeper than 45 degrees (cutFracY > cutFracX,
 * unlike a regular octagon where they're equal). Exported so a caller building a panel frame or
 * a hit-test region around the readout can reuse the exact same shape.
 */
export function octagonPath(ctx, cx, cy, w, h, cutFracX, cutFracY) {
  const left = cx - w / 2;
  const right = cx + w / 2;
  const top = cy - h / 2;
  const bottom = cy + h / 2;
  const cutX1 = left + w * cutFracX;
  const cutX2 = right - w * cutFracX;
  const cutY1 = top + h * cutFracY;
  const cutY2 = bottom - h * cutFracY;
  ctx.beginPath();
  ctx.moveTo(cutX1, top);
  ctx.lineTo(cutX2, top);
  ctx.lineTo(right, cutY1);
  ctx.lineTo(right, cutY2);
  ctx.lineTo(cutX2, bottom);
  ctx.lineTo(cutX1, bottom);
  ctx.lineTo(left, cutY2);
  ctx.lineTo(left, cutY1);
  ctx.closePath();
}

/**
 * Composites a sharp mask (octagon stroke + X + counter, all drawn in their true colours) onto
 * the destination as ONE shared bloomed glow, then redraws the mask sharp on top. This is the
 * structural correction OCTAGON-MEASUREMENTS.md #3/#6 called for: the X's visible glow is not
 * separable from the octagon's own field-filling bloom (there's no "X on flat black" anywhere in
 * the source to measure it against), so it isn't given an independent shadowBlur pass here. One
 * mask, containing both the amber octagon stroke and the green X core in their real colours, is
 * blurred together -- the result is naturally amber-dominant near the octagon (which covers far
 * more area) and green-tinted near the X, which is exactly the red-orange-halo-around-a-green-
 * core look measured in the source, without hand-tuning a red glow specifically around the X.
 *
 * Three glow layers, not two, and that third one is a judgement call worth flagging explicitly.
 * OCTAGON-MEASUREMENTS.md #3 quantifies only the TIGHT falloff -- how sharp the stroke's own edge
 * is (~9.8-16.5px at 973px scale, EDGE_TIGHT/EDGE_MID below). That number describes how fast
 * brightness drops immediately next to the line, not how far the softer wash beyond it reaches.
 * The reference frames plainly show a much broader ambient fill fading gradually across most of
 * the octagon's interior -- real and visible, but not something OCTAGON-MEASUREMENTS.md put a
 * falloff-width number on. EDGE_WIDE below is matched by eye against the reference crops (see
 * VERIFY notes at the bottom of this file), not decomposed from a measured profile the way the
 * other two are -- lower confidence than EDGE_TIGHT/EDGE_MID, kept as a separate named constant
 * for exactly that reason rather than folded into them.
 *
 * Same glow-layers-plus-sharp-core structure as cogitator.js's composeBloom, same reasoning for
 * why the core pass is normal (not additive) compositing: additive glow at high alpha clips every
 * stroke interior to a colour brighter than what was actually measured (see
 * OCTAGON-MEASUREMENTS.md #1's note on patch-mean vs. single-pixel-argmax sampling for the same
 * clipping problem measured directly in the source).
 *
 * Blur radii are computed from octagonWidthPx so a smaller readout (the blue one) blooms by
 * proportionally the same fraction of its own size, not the main readout's fixed pixel radius --
 * cogitator.js only has one instance so didn't need this; this screen has two at different
 * scales sharing one drawing routine.
 */
function composeSharedGlow(destCtx, maskCanvas, wideMaskCanvas, octagonWidthPx) {
  const EDGE_TIGHT = 0.0082; // ~8px/973px -- close to the measured ~9.5px core FWHM. High confidence.
  const EDGE_MID = 0.0165; // ~16px/973px -- close to the measured ~16.5px interior-side 10-90% rise. High confidence.
  const EDGE_WIDE = 0.1; // matched by eye against reference crops, not a measured falloff. Low confidence -- see doc comment above.
  const coreBlur = octagonWidthPx * 0.001;

  destCtx.save();
  destCtx.globalCompositeOperation = 'lighter';
  // Wide wash first, from the separate thicker-stroked source (see _paintWideSource) -- a normal
  // blur radius this large would read as almost nothing starting from the thin sharp mask, see
  // the constructor comment for the direct measurement that established this.
  destCtx.filter = `blur(${octagonWidthPx * EDGE_WIDE}px)`;
  destCtx.globalAlpha = 0.5;
  destCtx.drawImage(wideMaskCanvas, 0, 0);
  destCtx.globalAlpha = 0.26;
  destCtx.filter = `blur(${octagonWidthPx * EDGE_WIDE * 0.4}px)`;
  destCtx.drawImage(wideMaskCanvas, 0, 0);
  // Tight/mid layers from the true sharp mask -- these two are the ones with a real measured
  // falloff width behind them (OCTAGON-MEASUREMENTS.md #2/#3).
  destCtx.filter = `blur(${octagonWidthPx * EDGE_MID}px)`;
  destCtx.globalAlpha = 0.4;
  destCtx.drawImage(maskCanvas, 0, 0);
  destCtx.filter = `blur(${octagonWidthPx * EDGE_TIGHT}px)`;
  destCtx.globalAlpha = 0.44;
  destCtx.drawImage(maskCanvas, 0, 0);
  destCtx.globalCompositeOperation = 'source-over';
  destCtx.globalAlpha = 1;
  destCtx.filter = `blur(${coreBlur}px)`;
  destCtx.drawImage(maskCanvas, 0, 0);
  destCtx.restore();
}
