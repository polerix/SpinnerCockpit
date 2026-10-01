// Bitmap glyphs for the cogitator display, 5 columns x 8 rows per cell.
//
// MEASUREMENTS.md found this screen's letterforms consistent with a bitmap grid at roughly 6px
// cells, 5 cells wide -- but 8 cells tall, not the 7 a first guess would assume (cap height ~48px
// / ~6px = 8, not 7). That reading is medium confidence: the source is too blurred to count rows
// directly, only to fit spacing and stroke width against a cell size. GLYPH_ROWS is a named
// constant in cogitator.js for exactly that reason -- change it there if a cleaner source ever
// turns up 7 rows instead.
//
// Letterforms are uniform-stroke, square-cornered, no serifs, with stepped (not smoothed)
// diagonals on R and N -- also from MEASUREMENTS.md. Only the characters actually used by the
// default content are defined; add more the same way (8 rows of a 5-char '0'/'1' string each).

export const GLYPH_COLS = 5;
export const GLYPH_ROWS = 8;

const G = (...rows) => rows.map((r) => r.split('').map(Number));

export const GLYPHS = {
  ' ': G('00000', '00000', '00000', '00000', '00000', '00000', '00000', '00000'),
  '0': G('11111', '10001', '10001', '10001', '10001', '10001', '10001', '11111'),
  '2': G('11111', '00001', '00001', '11111', '10000', '10000', '10000', '11111'),
  '4': G('10001', '10001', '10001', '11111', '00001', '00001', '00001', '00001'),
  '5': G('11111', '10000', '10000', '11111', '00001', '00001', '10001', '11111'),
  '6': G('11111', '10000', '10000', '11111', '10001', '10001', '10001', '11111'),
  '8': G('11111', '10001', '10001', '11111', '10001', '10001', '10001', '11111'),
  '9': G('11111', '10001', '10001', '11111', '00001', '00001', '00001', '11111'),
  C: G('01111', '10000', '10000', '10000', '10000', '10000', '10000', '01111'),
  D: G('11110', '10001', '10001', '10001', '10001', '10001', '10001', '11110'),
  E: G('11111', '10000', '10000', '11110', '10000', '10000', '10000', '11111'),
  G: G('01111', '10000', '10000', '10000', '10011', '10001', '10001', '01111'),
  I: G('11111', '00100', '00100', '00100', '00100', '00100', '00100', '11111'),
  N: G('10001', '11001', '11001', '10101', '10101', '10011', '10011', '10001'),
  O: G('01110', '10001', '10001', '10001', '10001', '10001', '10001', '01110'),
  P: G('11110', '10001', '10001', '10001', '11110', '10000', '10000', '10000'),
  R: G('11110', '10001', '10001', '10001', '11110', '10100', '10010', '10001'),
  T: G('11111', '00100', '00100', '00100', '00100', '00100', '00100', '00100'),
  U: G('10001', '10001', '10001', '10001', '10001', '10001', '10001', '01110'),
  V: G('10001', '10001', '10001', '10001', '10001', '01010', '01010', '00100'),
  // Added for the OVRLOC FAIL / CEL-DON alarm screen (ALARM-MEASUREMENTS.md) -- the
  // cogitator readouts built before it never needed L, F, A, M, 1 or 7. Same blocky,
  // single-stroke-width style as the existing set, not re-measured from footage (no
  // frame of this film's font ever isolates these specific characters cleanly enough
  // to trace) -- a legible match to the existing glyphs' weight, not a measurement.
  1: G('00100', '01100', '00100', '00100', '00100', '00100', '00100', '11111'),
  7: G('11111', '00001', '00010', '00100', '00100', '01000', '01000', '01000'),
  A: G('01110', '10001', '10001', '10001', '11111', '10001', '10001', '10001'),
  F: G('11111', '10000', '10000', '11110', '10000', '10000', '10000', '10000'),
  L: G('10000', '10000', '10000', '10000', '10000', '10000', '10000', '11111'),
  M: G('10001', '11011', '10101', '10101', '10001', '10001', '10001', '10001'),
  // Added for the debrief panel (src/debrief.js) -- an original instrument, not a footage
  // recreation, so these four are a legible match to the existing glyphs' weight rather
  // than a measurement, same reasoning as the alarm-screen additions just above.
  3: G('11111', '00001', '00001', '00111', '00001', '00001', '10001', '01110'),
  B: G('11110', '10001', '10001', '11110', '10001', '10001', '10001', '11110'),
  H: G('10001', '10001', '10001', '11111', '10001', '10001', '10001', '10001'),
  S: G('01111', '10000', '10000', '01110', '00001', '00001', '10001', '01110'),
  // Found missing while testing debrief.js: negative headings/coordinates need a minus sign, or
  // it silently renders as a blank space (drawBitmapText's own GLYPHS[ch] || GLYPHS[' '] fallback)
  // -- losing the sign is worse than an obviously-wrong glyph, since it reads as a plausible but
  // incorrect positive value instead of an evidently broken one.
  '-': G('00000', '00000', '00000', '11111', '00000', '00000', '00000', '00000'),
  // Found the same way, same pass: the debrief panel echoes pad names verbatim (e.g. "Bradbury
  // Building"), and the font had never needed a Y before.
  Y: G('10001', '10001', '01010', '00100', '00100', '00100', '00100', '00100'),
};

/**
 * Draws bitmap text as filled cellPx x cellPx squares, one glyph cell at a time. No font, no
 * anti-aliasing beyond what the caller's canvas smoothing setting does to the squares themselves
 * -- softness/bloom is added as a separate pass by the caller (see composeBloom in cogitator.js),
 * not baked in here, so this function stays a pure sharp-edge rasterizer.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x left edge, reference pixels
 * @param {number} y top edge, reference pixels
 * @param {number} cellPx size of one bitmap cell, reference pixels
 * @param {number} tracking extra gap between glyphs, in cells (0 = glyphs sit edge to edge)
 * @returns {number} total width drawn, in reference pixels
 */
export function drawBitmapText(ctx, text, x, y, cellPx, tracking = 1) {
  let cursor = x;
  for (const ch of text.toUpperCase()) {
    const glyph = GLYPHS[ch] || GLYPHS[' '];
    for (let row = 0; row < GLYPH_ROWS; row++) {
      for (let col = 0; col < GLYPH_COLS; col++) {
        if (glyph[row][col]) {
          ctx.fillRect(cursor + col * cellPx, y + row * cellPx, cellPx, cellPx);
        }
      }
    }
    cursor += (GLYPH_COLS + tracking) * cellPx;
  }
  return cursor - x;
}

export function measureBitmapText(text, cellPx, tracking = 1) {
  const len = [...text].length;
  return len * (GLYPH_COLS + tracking) * cellPx - tracking * cellPx;
}
