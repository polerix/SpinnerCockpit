// Bitmap digit glyphs for the octagon/X disconnect readout's counter cells, 5 columns x 8 rows
// per cell -- same grid mechanism as cogitator-font.js (filled squares, softened by a separate
// bloom pass, not anti-aliased here), reused for consistency across both screens rather than
// reinvented.
//
// Glyph SHAPE was not something OCTAGON-MEASUREMENTS.md set out to measure (the brief was colour,
// geometry, and counter behaviour, not typeface), and the source footage is too small/compressed
// to trace individual digit strokes with any confidence beyond "readable numerals, serif-flagged
// 1, open-counter 8, curved-looking 5 and 6" -- a general reading, not a pixel count the way the
// cogitator's letterforms got. These shapes are a reasonable stylised recreation of that general
// impression, not a measurement. Only 0-9 are needed; no letters, this screen has no text content
// beyond digits.

export const DIGIT_COLS = 5;
export const DIGIT_ROWS = 8;

const G = (...rows) => rows.map((r) => r.split('').map(Number));

export const DIGIT_GLYPHS = {
  '0': G('01110', '10001', '10011', '10101', '11001', '10001', '10001', '01110'),
  '1': G('00110', '01110', '00110', '00110', '00110', '00110', '00110', '01111'),
  '2': G('01110', '10001', '00001', '00010', '00100', '01000', '10000', '11111'),
  '3': G('11110', '00001', '00001', '01110', '00001', '00001', '10001', '01110'),
  '4': G('00010', '00110', '01010', '10010', '11111', '00010', '00010', '00010'),
  '5': G('11111', '10000', '10000', '11110', '00001', '00001', '10001', '01110'),
  '6': G('00110', '01000', '10000', '11110', '10001', '10001', '10001', '01110'),
  '7': G('11111', '00001', '00010', '00100', '01000', '01000', '01000', '01000'),
  '8': G('01110', '10001', '10001', '01110', '10001', '10001', '10001', '01110'),
  '9': G('01110', '10001', '10001', '01111', '00001', '00001', '00010', '01100'),
};

/**
 * Draws one digit character as filled cellPx x cellPx squares. Mirrors drawBitmapText's contract
 * in cogitator-font.js (sharp rasterizer, no bloom -- that's a separate pass by the caller).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} digit single character, '0'-'9' (anything else draws nothing)
 * @param {number} x left edge, reference pixels
 * @param {number} y top edge, reference pixels
 * @param {number} cellPx size of one bitmap cell, reference pixels
 */
export function drawDigit(ctx, digit, x, y, cellPx) {
  const glyph = DIGIT_GLYPHS[digit];
  if (!glyph) return;
  for (let row = 0; row < DIGIT_ROWS; row++) {
    for (let col = 0; col < DIGIT_COLS; col++) {
      if (glyph[row][col]) {
        ctx.fillRect(x + col * cellPx, y + row * cellPx, cellPx, cellPx);
      }
    }
  }
}
