/**
 * Chromium PDF pagination: when the last page would only hold a short tail (1–2 lines),
 * progressively reduce zoom so content reflows and that tail fits on the previous page.
 * Must run with print media already applied (page.emulateMediaType('print')).
 */

/** Matches server.js Puppeteer viewport and A4 @ 96dpi (~794×1123). */
export const PDF_VIEWPORT = { width: 794, height: 1123 };

/** Height of the last “slice” below this (px) is treated as an orphan tail to eliminate. */
const DEFAULT_ORPHAN_MAX_PX = 112;

const DEFAULT_ZOOM_MIN = 0.84;

const DEFAULT_ZOOM_STEP = 0.008;

/**
 * @param {import('puppeteer').Page} page
 * @param {object} [opts]
 * @param {number} [opts.pageHeightPx]
 * @param {number} [opts.orphanMaxPx]
 * @param {number} [opts.zoomMin]
 * @param {number} [opts.zoomStep]
 * @returns {Promise<{ applied: boolean, zoom: number, scrollHeight: number, pages: number, remainder: number, initialPages: number }>}
 */
export async function applyPdfOrphanCompaction(page, opts = {}) {
  const pageH =
    opts.pageHeightPx != null ? opts.pageHeightPx : PDF_VIEWPORT.height;
  const orphanMax =
    opts.orphanMaxPx != null ? opts.orphanMaxPx : DEFAULT_ORPHAN_MAX_PX;
  const zoomMin = opts.zoomMin != null ? opts.zoomMin : DEFAULT_ZOOM_MIN;
  const zoomStep = opts.zoomStep != null ? opts.zoomStep : DEFAULT_ZOOM_STEP;

  return page.evaluate(
    (params) => {
      const { pageH, orphanMax, zoomMin, zoomStep } = params;
      const measure = () => document.documentElement.scrollHeight;
      const body = document.body;

      let h = measure();
      const initialPages = Math.ceil(h / pageH);
      let rem = h % pageH;

      if (initialPages < 2) {
        return {
          applied: false,
          zoom: 1,
          scrollHeight: h,
          pages: initialPages,
          remainder: rem,
          initialPages,
        };
      }
      if (rem === 0 || rem >= orphanMax) {
        return {
          applied: false,
          zoom: 1,
          scrollHeight: h,
          pages: initialPages,
          remainder: rem,
          initialPages,
        };
      }

      let zoom = 1;
      while (zoom > zoomMin) {
        zoom = Math.round((zoom - zoomStep) * 1000) / 1000;
        body.style.zoom = String(zoom);
        h = measure();
        const pagesNow = Math.ceil(h / pageH);
        rem = h % pageH;
        if (pagesNow < initialPages) break;
        if (rem === 0 || rem >= orphanMax) break;
      }

      body.style.zoom = String(zoom);
      h = measure();
      const pages = Math.ceil(h / pageH);
      rem = h % pageH;

      return {
        applied: zoom < 1,
        zoom,
        scrollHeight: h,
        pages,
        remainder: rem,
        initialPages,
      };
    },
    { pageH, orphanMax, zoomMin, zoomStep }
  );
}
