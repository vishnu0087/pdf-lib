/**
 * Shared page-geometry constants used by both the PDF/print pipeline
 * (Node — render-quote-html.js, puppeteer-utils.js) and the template editor
 * (browser — editorBridge.ts). Single source of truth for A4 dimensions and
 * artwork safe-band fractions so the editor's safe-area math and Puppeteer's
 * print safe-area math agree bit-for-bit.
 */

export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;

/** Header artwork band (top of every printed A4 page). */
export const SAFE_HEADER_BAND_PCT = 0.15;
/** Footer artwork band (bottom of every printed A4 page). */
export const SAFE_FOOTER_BAND_PCT = 0.11;

export const MM_TO_PT = 72 / 25.4;
export const MM_TO_PX_96 = 96 / 25.4;

export const A4_WIDTH_PT = A4_WIDTH_MM * MM_TO_PT;
export const A4_HEIGHT_PT = A4_HEIGHT_MM * MM_TO_PT;

/** Safe-area band heights in pixels at 96dpi (editor screen units). */
export const SAFE_HEADER_PX_96 = A4_HEIGHT_MM * MM_TO_PX_96 * SAFE_HEADER_BAND_PCT;
export const SAFE_FOOTER_PX_96 = A4_HEIGHT_MM * MM_TO_PX_96 * SAFE_FOOTER_BAND_PCT;

/** Safe-area band heights in points (print units). */
export const SAFE_HEADER_PT = A4_HEIGHT_PT * SAFE_HEADER_BAND_PCT;
export const SAFE_FOOTER_PT = A4_HEIGHT_PT * SAFE_FOOTER_BAND_PCT;
