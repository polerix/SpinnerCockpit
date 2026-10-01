// The debrief panel: a static, readable, after-the-fact readout of the most recent catastrophic
// lock sequence's incident record (src/lock.mjs's two-phase capture).
//
// CONTRACT.md "Debrief": its own dedicated panel, separate from the alarm (live/reactive/
// mid-emergency) and the cogitator's existing slot. Unlike alarm.js, this is NOT a recreation of
// anything filmed -- it's an original instrument this project is adding, so there's no footage to
// measure it against. It reuses the same bitmap font as cogitator.js/alarm.js purely for visual
// consistency across the cockpit's procedural CRT panels, not as a measurement claim.

import { GLYPH_ROWS, drawBitmapText } from './cogitator-font.js';

export const REFERENCE_WIDTH = 640;
export const REFERENCE_HEIGHT = 360;

const FIELD_COLOR = '#060d0e'; // matches spinner.css's .strip background -- the cockpit's own
// house panel colour, not a new one invented for this module.
const TITLE_COLOR = 'rgb(214,173,84)'; // amber, matches the cockpit's existing readout accent
const TEXT_COLOR = 'rgb(140,216,216)'; // matches the cockpit's existing body-text cyan

const TITLE_CELL_PX = 7;
const ROW_CELL_PX = 5;
const ROW_GAP_PX = 6;
const MARGIN_X = 20;
const MARGIN_TOP = 16;

/**
 * Pure formatting: incident record -> an array of short display lines. Exported separately from
 * the canvas-drawing class so the actual field layout is testable without a DOM/canvas. No
 * punctuation (period, colon, percent, slash) -- the bitmap font doesn't have those glyphs, and
 * adding them for a handful of readout lines wasn't worth the font-surface growth; numbers are
 * rounded to whole units and separated by words instead.
 */
export function formatIncidentRows(incident) {
  const n = (v, d = 0) => String(Math.round(Number(v) * 10 ** d) / 10 ** d).replace('.', ' ');
  const approach = incident.assistedApproach
    ? `APPROACH ${incident.assistedApproach.pad} ${n(incident.assistedApproach.progress * 100)} PCT`
    : 'APPROACH NONE';
  return [
    `CAUSE COLLISION BLDG ${incident.cause.buildingId}`,
    `SPEED ${n(incident.speed)} M S`,
    `MODE ${incident.mode.toUpperCase()} ${incident.auto ? 'AUTO' : 'MANUAL'}`,
    `ALT ${n(incident.altitude)} M  HDG ${n(incident.heading, 2)}`,
    `POS ${n(incident.lon, 2)} ${n(incident.lat, 2)}`,
    approach,
    `HOLD ${n(incident.holdDuration, 1)} S   RELEASES ${incident.releaseCount}`,
    `FINAL HDG ${n(incident.finalHeading, 2)}`,
    `OUTCOME ${incident.outcome.toUpperCase()}`,
  ];
}

export class Debrief {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this._ref = document.createElement('canvas');
    this._ref.width = REFERENCE_WIDTH;
    this._ref.height = REFERENCE_HEIGHT;
    this._refCtx = this._ref.getContext('2d');
    this.incident = null;
  }

  /** Sets (or clears, with null) the incident record this panel reads. No animation, no
   * acknowledgement -- static and readable, per CONTRACT.md's own framing of this panel. */
  setIncident(incident) {
    this.incident = incident;
  }

  draw() {
    const rc = this._refCtx;
    rc.setTransform(1, 0, 0, 1, 0, 0);
    rc.fillStyle = FIELD_COLOR;
    rc.fillRect(0, 0, REFERENCE_WIDTH, REFERENCE_HEIGHT);
    if (this.incident) this._paintIncident(rc);

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this._ref, 0, 0, this.canvas.width, this.canvas.height);
  }

  _paintIncident(rc) {
    rc.fillStyle = TITLE_COLOR;
    drawBitmapText(rc, 'DEBRIEF', MARGIN_X, MARGIN_TOP, TITLE_CELL_PX);

    rc.fillStyle = TEXT_COLOR;
    let y = MARGIN_TOP + GLYPH_ROWS * TITLE_CELL_PX + 14;
    for (const row of formatIncidentRows(this.incident)) {
      drawBitmapText(rc, row, MARGIN_X, y, ROW_CELL_PX);
      y += GLYPH_ROWS * ROW_CELL_PX + ROW_GAP_PX;
    }
  }
}
