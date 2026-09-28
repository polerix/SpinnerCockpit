// The cogitator: a procedural recreation of the "ENVIRON CTR" CRT readout filmed for Alien
// (1979), built from direct pixel measurement of the surviving footage rather than the original
// guessed spec. See ../MEASUREMENTS.md for the measurement pass this is built against, and
// ../VERIFY.md for the side-by-side check against real frames.
//
// Self-contained: no video, no image assets, no web fonts. Draws to any 2D canvas context you
// hand it. All layout constants are measured in a fixed 640x360 reference space (the resolution
// the source frames were measured at) and scaled to whatever canvas size you actually give it.

import { GLYPH_ROWS, drawBitmapText, measureBitmapText } from './cogitator-font.js';

// ---------------------------------------------------------------------------------------------
// Named constants carried over from MEASUREMENTS.md. Two of these are flagged there as
// medium-confidence or unverifiable, and are kept as named constants for exactly that reason --
// change them here, not by hunting through the drawing code, if better source material ever
// turns up.

/** Reference space every other constant below is measured in. */
export const REFERENCE_WIDTH = 640;
export const REFERENCE_HEIGHT = 360;

/**
 * UNVERIFIED. The camera framing crops the bottom edge of the screen in every frame of the
 * source, so the true screen proportions were never in shot. 4:3 is not contradicted by what's
 * visible (the visible area works out to ~1.34:1) but it is not confirmed either. Kept as a
 * named constant so a different ratio is a one-line change, same reasoning as ASPECT_RATIO in
 * the Bleunuit project.
 */
export const ASPECT_RATIO = 4 / 3;

/**
 * Medium confidence. Letter spacing and stroke width both land close to a ~6px cell at the
 * measured 48px title cap height (48/8 = 6), which reads as 5 wide x 8 tall -- one row taller
 * than a first 5x7 guess. The blur in the source is too heavy to count grid rows directly, only
 * to infer them from spacing, so this is a best reading, not a pixel count.
 */
export const GLYPH_GRID_ROWS = GLYPH_ROWS; // 8, re-exported from cogitator-font.js for visibility

// Field. Left and top edges measured sharp and straight; right edge a soft vignette fade; bottom
// never appears in frame (camera crop), so it's simply left to run to the canvas edge.
const FIELD_LEFT = 80;
const FIELD_TOP = 9;
const FIELD_RIGHT_FADE_START = 552;
const FIELD_RIGHT_FADE_END = 578;

/**
 * The lit field's own bounding box within the reference canvas, i.e. excluding the black margin
 * the source footage has around the CRT from being a camera shot of a physical monitor. A
 * consumer embedding just the screen's own content into a different physical frame (a cockpit
 * panel opening, say) should crop to this rather than the full canvas -- otherwise that camera
 * margin ends up nested inside the frame's own bezel, wasting most of a small opening on black
 * that was never part of the CRT. Right is FIELD_RIGHT_FADE_START, not _END: the vignette itself
 * (still lit, just dimming) is worth keeping; the fully-black remainder beyond it isn't.
 */
export const FIELD_BOUNDS = {
  left: FIELD_LEFT,
  top: FIELD_TOP,
  right: FIELD_RIGHT_FADE_START,
  bottom: REFERENCE_HEIGHT,
};

// Field colour, measured corners (see MEASUREMENTS.md #1). Not a flat fill: a diagonal gradient
// from the brightest corner (top-left) to the darkest measured point (right margin), plus the
// right-edge fade above.
const FIELD_BLUE_BRIGHT = 'rgb(5,13,132)'; // ~top margin
const FIELD_BLUE_DARK = 'rgb(4,16,90)'; // ~right margin
const FIELD_RED_BRIGHT = 'rgb(128,25,20)';
const FIELD_RED_DARK = 'rgb(105,20,10)';

// Text colour, measured stroke cores (see MEASUREMENTS.md #1 and #4). Two states: the cool
// baseline colour, and the warm pink-white the text shifts to for the whole duration of a PURGE
// alert (title and bottom band both -- not just the PURGE word itself).
const TEXT_COLOR_NORMAL = 'rgb(205,215,253)'; // #CDD7FD
const TEXT_COLOR_ALERT = 'rgb(255,215,210)'; // #FFD7D2
const GRID_DOT_COLOR = 'rgb(150,160,245)'; // dimmer than the letters, measured separately

// Title / bottom band layout (MEASUREMENTS.md #2).
const TITLE_CELL_PX = 6; // 48px cap height / 8 rows
const TITLE_X = 133;
const TITLE_Y = 17;
const TITLE_TEXT = 'ENVIRON CTR';

// The bottom-band pitch measurement was flagged noisy in MEASUREMENTS.md (digit shapes make
// "glyph start" ambiguous there); cell size is kept proportional to the measured ~42px cap height
// rather than chasing that pitch figure, and normal (1-cell) tracking is used as the more solid
// reading, same as the title.
const BOTTOM_CELL_PX = 5.25; // 42px cap height / 8 rows
const BOTTOM_X = 128;
const BOTTOM_Y = 272;
const BOTTOM_LEFT_TEXT = '24556';
const BOTTOM_RIGHT_TEXT = 'DR 5';
const BOTTOM_GAP_PX = 106; // measured gap between "24556" and "DR", not derived from cell size

// Dotted rules, top and bottom of the panel (MEASUREMENTS.md #2).
const RULE_Y_TOP = 80;
const RULE_Y_BOTTOM = 257;
const RULE_X_START = 134;
const RULE_X_END = 495;
const RULE_DOT_COUNT = 29;
const RULE_DOT_SIZE = 3;

// The 19x8 dot-matrix panel between the rules, one row of which carries live text.
const GRID_COLS = 19;
const GRID_ROWS = 8;
const GRID_COL_PITCH = (431 - 200) / (GRID_COLS - 1); // ~12.83px, measured column centres
const GRID_ROW_PITCH = (237 - 100) / (GRID_ROWS - 1); // ~19.57px, measured row centres
const GRID_LEFT = 200;
const GRID_TOP = 100;
const GRID_DOT_SIZE = 6;
const GRID_TEXT_ROW = 5; // 0-indexed; the row replaced by live text (measured centre ~y=188-200)
const GRID_TEXT_CELL_PX = 3; // 24px cap height / 8 rows
const GRID_TEXT = '92886599 I 95654085';

// Tick dashes flanking the panel, one per row, aligned with the rule's endpoints rather than the
// grid's own column pitch.
const TICK_X_LEFT = 133;
const TICK_X_RIGHT = 480;
const TICK_WIDTH = 6;
const TICK_HEIGHT = 2;

// PURGE alert text -- not a fourth band, an alert state that replaces the whole dot panel
// (MEASUREMENTS.md #4). ~1.3x the title cap height.
const PURGE_CELL_PX = 7.75; // 62px cap height / 8 rows
const PURGE_TEXT = 'PURGE';

// Measured blink cycle (MEASUREMENTS.md #4): four observed (on, off) pairs in seconds, looped.
// The fourth cycle's OFF wasn't observed (the alert ended mid-ON) so it's filled with the
// average OFF of the other three.
const PURGE_BLINK_PATTERN = [
  [0.33, 0.37],
  [0.7, 0.33],
  [0.67, 0.4],
  [0.6, 0.37],
];
const PURGE_RAMP_S = 0.067; // ~2 frames, measured transition time between on/off
const PURGE_OFF_LEVEL = 0.2; // PURGE never fully vanishes when "off" -- a dim ghost, measured
const FIELD_TRANSITION_S = 0.06; // measured blue<->red transition, ~1-2 frames

// Bloom. This is the one MEASUREMENTS.md called out as the largest fidelity gap in the original
// spec: edges rise over ~4-5px (10%-90%) at this reference scale, not the 1px a crisp
// nearest-neighbour bitmap upscale gives you. Two additive glow passes (a wide halo, drawn under
// everything) plus one core pass drawn with normal -- not additive -- compositing on top, so the
// brightest pixels land exactly on the measured text colour instead of clipping to white. See
// composeBloom() below and VERIFY.md for the measured rise and the clipping bug this fixed.
const BLOOM_GLOW_LAYERS = [
  { blur: 5.2, alpha: 0.28 },
  { blur: 2.4, alpha: 0.34 },
];
const BLOOM_CORE_BLUR = 0.7;

// Scanline roll and horizontal jitter. MEASUREMENTS.md #3 measured BOTH as absent from the
// surviving footage -- edge position held to within 0.07px across two 3-second windows, and no
// row of the frame showed any temporal variance beyond compression noise. That is the honest
// default: off. They exist here as switchable parameters, not built in, because the original
// spec wanted them as deliberate stylisation (to read as older than the rest of a cockpit UI),
// and the source tape itself may well have had them before three generations of video
// compression erased them from what's measurable now. Turning them on is a style choice, not a
// correction -- the values below are the spec's original guesses, unvalidated.
const DEFAULT_SCANLINE_ROLL_HZ = 0.8;
const DEFAULT_JITTER_AMPLITUDE_PX = 0.5;
const DEFAULT_JITTER_INTERVAL_S = 0.4;

function lerp(a, b, t) {
  return a + (b - a) * t;
}
function lerpColor(c1, c2, t) {
  const p1 = c1.match(/\d+/g).map(Number);
  const p2 = c2.match(/\d+/g).map(Number);
  return `rgb(${p1.map((v, i) => Math.round(lerp(v, p2[i], t))).join(',')})`;
}
function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

export class Cogitator {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [options]
   * @param {boolean} [options.scanlineRoll=false] measured-absent; off by default, see above
   * @param {boolean} [options.jitter=false] measured-absent; off by default, see above
   * @param {number} [options.scanlineRollHz]
   * @param {number} [options.jitterAmplitudePx]
   * @param {number} [options.jitterIntervalS]
   * @param {string} [options.gridText] overrides the live readout row's content
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.scanlineRoll = options.scanlineRoll ?? false;
    this.jitter = options.jitter ?? false;
    this.scanlineRollHz = options.scanlineRollHz ?? DEFAULT_SCANLINE_ROLL_HZ;
    this.jitterAmplitudePx = options.jitterAmplitudePx ?? DEFAULT_JITTER_AMPLITUDE_PX;
    this.jitterIntervalS = options.jitterIntervalS ?? DEFAULT_JITTER_INTERVAL_S;
    this.gridText = options.gridText ?? GRID_TEXT;

    // Reference-space offscreen canvas: everything is drawn here in measured pixel units, then
    // blitted (scaled) onto the caller's canvas. Keeps every constant above valid regardless of
    // the caller's actual canvas size.
    this._ref = document.createElement('canvas');
    this._ref.width = REFERENCE_WIDTH;
    this._ref.height = REFERENCE_HEIGHT;
    this._refCtx = this._ref.getContext('2d');

    // A second offscreen canvas used purely as the sharp glyph/dot mask that composeBloom()
    // blurs; kept separate from _ref so the field/vignette never gets blurred along with it.
    this._mask = document.createElement('canvas');
    this._mask.width = REFERENCE_WIDTH;
    this._mask.height = REFERENCE_HEIGHT;
    this._maskCtx = this._mask.getContext('2d');

    this._t = 0; // running clock, seconds
    this._purgeActive = false;
    this._purgeSince = 0; // this._t when the current active/inactive state began
    this._fieldMix = 0; // 0 = blue, 1 = red
    this._textMix = 0; // 0 = normal text colour, 1 = alert text colour
    this._jitterOffset = 0;
    this._jitterNextAt = 0;
  }

  /** Starts (or clears) the PURGE alert state. Call with false to return to normal. */
  setPurge(active) {
    if (active === this._purgeActive) return;
    this._purgeActive = active;
    this._purgeSince = this._t;
  }

  get purgeActive() {
    return this._purgeActive;
  }

  /** Advance animation state by dt seconds. Call once per frame before draw(). */
  update(dt) {
    this._t += dt;

    const targetMix = this._purgeActive ? 1 : 0;
    const rate = dt / FIELD_TRANSITION_S;
    this._fieldMix = clamp01(this._fieldMix + (targetMix - this._fieldMix > 0 ? rate : -rate));
    this._textMix = this._fieldMix; // field and text colour transition together, measured

    if (this.jitter) {
      if (this._t >= this._jitterNextAt) {
        this._jitterOffset = (Math.random() * 2 - 1) * this.jitterAmplitudePx;
        this._jitterNextAt = this._t + this.jitterIntervalS;
      }
    } else {
      this._jitterOffset = 0;
    }
  }

  /** Where we are in the measured PURGE blink pattern right now: brightness in [0,1]. */
  _purgeBlinkLevel() {
    if (!this._purgeActive) return 0;
    const elapsed = this._t - this._purgeSince;
    let cycleStart = 0;
    for (let i = 0; ; i++) {
      const [on, off] = PURGE_BLINK_PATTERN[i % PURGE_BLINK_PATTERN.length];
      const onEnd = cycleStart + on;
      const cycleEnd = onEnd + off;
      if (elapsed < onEnd) {
        const into = elapsed - cycleStart;
        if (into < PURGE_RAMP_S) return lerp(PURGE_OFF_LEVEL, 1, into / PURGE_RAMP_S);
        return 1;
      }
      if (elapsed < cycleEnd) {
        const into = elapsed - onEnd;
        if (into < PURGE_RAMP_S) return lerp(1, PURGE_OFF_LEVEL, into / PURGE_RAMP_S);
        return PURGE_OFF_LEVEL;
      }
      cycleStart = cycleEnd;
      if (i > 64) return PURGE_OFF_LEVEL; // safety valve, shouldn't be reachable
    }
  }

  /** Draws the current state to the canvas passed to the constructor. */
  draw() {
    const rc = this._refCtx;
    rc.setTransform(1, 0, 0, 1, 0, 0);
    rc.clearRect(0, 0, REFERENCE_WIDTH, REFERENCE_HEIGHT);

    this._drawField(rc);

    const textColor = lerpColor(TEXT_COLOR_NORMAL, TEXT_COLOR_ALERT, this._textMix);
    this._drawMask((mc) => this._paintContent(mc, textColor));
    composeBloom(rc, this._mask);

    if (this.scanlineRoll) this._drawScanlineRoll(rc);

    // Blit reference-space render to the caller's canvas, applying jitter as a horizontal shift.
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
      this._ref,
      this._jitterOffset * (this.canvas.width / REFERENCE_WIDTH),
      0,
      this.canvas.width,
      this.canvas.height
    );
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

    const bright = lerpColor(FIELD_BLUE_BRIGHT, FIELD_RED_BRIGHT, this._fieldMix);
    const dark = lerpColor(FIELD_BLUE_DARK, FIELD_RED_DARK, this._fieldMix);

    const grad = rc.createLinearGradient(FIELD_LEFT, FIELD_TOP, REFERENCE_WIDTH, REFERENCE_HEIGHT * 0.7);
    grad.addColorStop(0, bright);
    grad.addColorStop(1, dark);
    rc.fillStyle = grad;
    rc.fillRect(FIELD_LEFT, FIELD_TOP, REFERENCE_WIDTH - FIELD_LEFT, REFERENCE_HEIGHT - FIELD_TOP);

    // Soft right-edge vignette fade into the surrounding black, measured centred x=545-555.
    const fade = rc.createLinearGradient(FIELD_RIGHT_FADE_START, 0, FIELD_RIGHT_FADE_END, 0);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    rc.fillStyle = fade;
    rc.fillRect(FIELD_RIGHT_FADE_START, FIELD_TOP, REFERENCE_WIDTH - FIELD_RIGHT_FADE_START, REFERENCE_HEIGHT - FIELD_TOP);
  }

  _paintContent(mc, textColor) {
    mc.fillStyle = textColor;

    drawBitmapText(mc, TITLE_TEXT, TITLE_X, TITLE_Y, TITLE_CELL_PX);
    const leftWidth = drawBitmapText(mc, BOTTOM_LEFT_TEXT, BOTTOM_X, BOTTOM_Y, BOTTOM_CELL_PX);
    // BOTTOM_GAP_PX is the measured gap from the end of "24556" to the start of "DR", not from
    // BOTTOM_X -- add the left text's actual drawn width first.
    drawBitmapText(mc, BOTTOM_RIGHT_TEXT, BOTTOM_X + leftWidth + BOTTOM_GAP_PX, BOTTOM_Y, BOTTOM_CELL_PX);

    this._drawRule(mc, RULE_Y_TOP);
    this._drawRule(mc, RULE_Y_BOTTOM);
    this._drawTicks(mc);

    const purgeLevel = this._purgeBlinkLevel(); // 0 whenever not in an alert
    // The panel cross-fades between the dot grid and PURGE as the alert engages (field/text
    // colour transition, FIELD_TRANSITION_S) -- not an instant content swap.
    if (this._fieldMix > 0.01) {
      mc.save();
      mc.globalAlpha = this._fieldMix * purgeLevel;
      const w = measureBitmapText(PURGE_TEXT, PURGE_CELL_PX);
      const h = GLYPH_ROWS * PURGE_CELL_PX;
      const panelCX = (RULE_X_START + RULE_X_END) / 2;
      const panelCY = (RULE_Y_TOP + RULE_Y_BOTTOM) / 2;
      drawBitmapText(mc, PURGE_TEXT, panelCX - w / 2, panelCY - h / 2, PURGE_CELL_PX);
      mc.restore();
    }
    if (this._fieldMix < 0.99) {
      mc.save();
      mc.globalAlpha = 1 - this._fieldMix;
      this._drawDotGrid(mc);
      mc.restore();
    }
  }

  _drawRule(mc, y) {
    const pitch = (RULE_X_END - RULE_X_START) / (RULE_DOT_COUNT - 1);
    for (let i = 0; i < RULE_DOT_COUNT; i++) {
      const x = RULE_X_START + i * pitch;
      mc.fillRect(x - RULE_DOT_SIZE / 2, y - RULE_DOT_SIZE / 2, RULE_DOT_SIZE, RULE_DOT_SIZE);
    }
  }

  _drawTicks(mc) {
    for (let row = 0; row < GRID_ROWS; row++) {
      const y = GRID_TOP + row * GRID_ROW_PITCH;
      mc.fillRect(TICK_X_LEFT - TICK_WIDTH / 2, y - TICK_HEIGHT / 2, TICK_WIDTH, TICK_HEIGHT);
      mc.fillRect(TICK_X_RIGHT - TICK_WIDTH / 2, y - TICK_HEIGHT / 2, TICK_WIDTH, TICK_HEIGHT);
    }
  }

  _drawDotGrid(mc) {
    const textColor = mc.fillStyle;
    for (let row = 0; row < GRID_ROWS; row++) {
      const y = GRID_TOP + row * GRID_ROW_PITCH;
      if (row === GRID_TEXT_ROW) {
        mc.fillStyle = textColor; // the live readout uses the main text colour, not the dimmer dots
        const w = measureBitmapText(this.gridText, GRID_TEXT_CELL_PX);
        const panelCX = (RULE_X_START + RULE_X_END) / 2;
        drawBitmapText(
          mc,
          this.gridText,
          panelCX - w / 2,
          y - (GLYPH_ROWS * GRID_TEXT_CELL_PX) / 2,
          GRID_TEXT_CELL_PX
        );
        continue;
      }
      // Grid dots measured dimmer than the surrounding letters (MEASUREMENTS.md #1) -- a fixed
      // colour rather than a fraction of textColor, since it didn't track the alert colour shift
      // distinctly in the samples taken.
      mc.fillStyle = GRID_DOT_COLOR;
      for (let col = 0; col < GRID_COLS; col++) {
        const x = GRID_LEFT + col * GRID_COL_PITCH;
        mc.fillRect(x - GRID_DOT_SIZE / 2, y - GRID_DOT_SIZE / 2, GRID_DOT_SIZE, GRID_DOT_SIZE);
      }
    }
    mc.fillStyle = textColor;
  }

  _drawScanlineRoll(rc) {
    const bandHeight = 40;
    const phase = (this._t * this.scanlineRollHz) % 1;
    const y = phase * (REFERENCE_HEIGHT + bandHeight * 2) - bandHeight;
    const grad = rc.createLinearGradient(0, y - bandHeight, 0, y + bandHeight);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0.18)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    rc.fillStyle = grad;
    rc.fillRect(0, 0, REFERENCE_WIDTH, REFERENCE_HEIGHT);
  }
}

/**
 * Composites a sharp mask onto the destination context as a bloomed glow: two wide, blurred,
 * additive glow passes underneath, then the mask itself redrawn with a touch of softening using
 * normal (not additive) compositing on top. This is what gets the ~4-5px measured edge rise
 * (MEASUREMENTS.md #6) -- a single blur pass alone reads as uniformly soft rather than "bright
 * core, soft glow around it". The core pass is deliberately NOT additive: stacking three additive
 * passes at near-full alpha clipped every solid glyph interior to pure white, which the source
 * never does (its brightest measured points top out around rgb(215,223,255), not 255,255,255) --
 * see VERIFY.md. Drawing the core with normal compositing last fixes that: solid interior pixels
 * land on exactly the configured text colour, and only the halo beyond the glyph's own edge is
 * additive on top of the field.
 */
function composeBloom(destCtx, maskCanvas) {
  destCtx.save();
  destCtx.globalCompositeOperation = 'lighter';
  for (const { blur, alpha } of BLOOM_GLOW_LAYERS) {
    destCtx.filter = `blur(${blur}px)`;
    destCtx.globalAlpha = alpha;
    destCtx.drawImage(maskCanvas, 0, 0);
  }
  destCtx.globalCompositeOperation = 'source-over';
  destCtx.globalAlpha = 1;
  destCtx.filter = `blur(${BLOOM_CORE_BLUR}px)`;
  destCtx.drawImage(maskCanvas, 0, 0);
  destCtx.restore();
}
