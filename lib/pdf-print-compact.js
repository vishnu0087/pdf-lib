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

/**
 * Letter vs table layout for two-part PDF:
 * 1) If only a short tail of page-1 letter spills onto the next page, shrink `.sheet-inner--p1` (zoom)
 *    so that tail fits on page 1.
 * 2) If the letter tail on the page before the table is ≥ ~15% of a sheet (15–20% band),
 *    force the main table to start on a fresh page (`break-before` on `.p2-table-wrap`).
 *
 * Must run with print media (page.emulateMediaType('print')).
 *
 * @param {import('puppeteer').Page} page
 * @param {object} [opts]
 * @param {number} [opts.pageHeightPx]
 * @param {number} [opts.orphanMaxPx] — tail height treated as “1–2 lines”; try letter-only shrink
 * @param {number} [opts.heavyTailMinRatio] — if remainder ≥ this × page height, page-break before table (default 0.15)
 * @param {number} [opts.letterZoomMin]
 * @param {number} [opts.letterZoomStep]
 * @returns {Promise<{ letterZoom: number, breakBeforeTable: boolean, letterHeight: number, remainder: number }>}
 */
export async function applyPdfLetterTableLayout(page, opts = {}) {
  const pageH =
    opts.pageHeightPx != null ? opts.pageHeightPx : PDF_VIEWPORT.height;
  /** ~1–2 lines at body line-height; aligned with applyPdfOrphanCompaction orphan band. */
  const orphanMaxPx =
    opts.orphanMaxPx != null ? opts.orphanMaxPx : 112;
  const heavyTailMinRatio =
    opts.heavyTailMinRatio != null ? opts.heavyTailMinRatio : 0.15;
  const letterZoomMin =
    opts.letterZoomMin != null ? opts.letterZoomMin : 0.82;
  const letterZoomStep =
    opts.letterZoomStep != null ? opts.letterZoomStep : 0.008;

  return page.evaluate(
    (params) => {
      const {
        pageH,
        orphanMaxPx,
        heavyTailMinRatio,
        letterZoomMin,
        letterZoomStep,
      } = params;

      const letterInner = document.querySelector('.sheet-inner--p1');
      const tableWrap = document.querySelector('.p2-table-wrap');
      if (!letterInner || !tableWrap) {
        return {
          letterZoom: 1,
          breakBeforeTable: false,
          letterHeight: 0,
          remainder: 0,
        };
      }

      /** Quote uses a second sheet; sales flows entirely in sheet 1 — never break before the only content block. */
      const continuationSheet = document.querySelector('.sheet.sheet--table');
      const allowBreakBeforeTable = !!continuationSheet;

      const measureLetterHeight = () => {
        const letterSection = document.querySelector('.sheet.sheet--letter');
        return letterSection ? letterSection.scrollHeight : letterInner.scrollHeight;
      };

      /** Letter height on the page where the letter block ends (before the table). */
      const remLast = (h) =>
        h <= 0 || pageH <= 0 ? 0 : h - Math.floor(h / pageH) * pageH;

      let letterZoom = 1;
      let L = measureLetterHeight();
      let r = remLast(L);

      const heavyPx = pageH * heavyTailMinRatio;
      let breakBeforeTable = false;

      if (
        allowBreakBeforeTable &&
        L > pageH &&
        r > 0 &&
        r >= heavyPx
      ) {
        tableWrap.classList.add('p2-table-wrap--break-before');
        breakBeforeTable = true;
      } else if (L > pageH && r > 0 && r < orphanMaxPx) {
        while (letterZoom > letterZoomMin) {
          letterZoom = Math.round((letterZoom - letterZoomStep) * 1000) / 1000;
          letterInner.style.zoom = String(letterZoom);
          L = measureLetterHeight();
          r = remLast(L);
          if (L <= pageH) break;
          if (r === 0 || r >= orphanMaxPx) break;
        }
        letterInner.style.zoom = String(letterZoom);
        L = measureLetterHeight();
        r = remLast(L);
      }

      return {
        letterZoom,
        breakBeforeTable,
        letterHeight: L,
        remainder: r,
      };
    },
    {
      pageH,
      orphanMaxPx,
      heavyTailMinRatio,
      letterZoomMin,
      letterZoomStep,
    }
  );
}

/**
 * Sales single-sheet flow: find the largest `.sheet-inner--p1` zoom that still matches the
 * minimum achievable page count (measured at a lower zoom floor), so extra lines can move
 * onto page 1 when there is slack — without shrinking more than necessary.
 * Skipped when a continuation `.sheet--table` exists (quote-style two-part PDF).
 *
 * @param {import('puppeteer').Page} page
 * @param {object} [opts]
 * @param {number} [opts.pageHeightPx]
 * @param {number} [opts.zoomMin] — relative floor vs current letter zoom (default 0.88)
 */
export async function applyPdfSalesFlowCompaction(page, opts = {}) {
  const pageH =
    opts.pageHeightPx != null ? opts.pageHeightPx : PDF_VIEWPORT.height;
  const zoomMinRel =
    opts.zoomMin != null ? opts.zoomMin : 0.88;

  return page.evaluate(
    (params) => {
      const { pageH, zoomMinRel } = params;
      if (document.querySelector('.sheet.sheet--table')) {
        return { applied: false, zoom: 1, reason: 'has-continuation-sheet' };
      }
      const inner = document.querySelector('.sheet-inner--p1');
      if (!inner || !document.querySelector('.qt-sales-main-items-wrap')) {
        return { applied: false, zoom: 1, reason: 'not-sales' };
      }

      const pages = () =>
        Math.ceil(document.documentElement.scrollHeight / pageH);

      const setInnerZoom = (z) => {
        inner.style.zoom = String(Math.round(z * 10000) / 10000);
      };

      const zLetter = parseFloat(inner.style.zoom) || 1;
      const floor = zLetter * zoomMinRel;

      setInnerZoom(floor);
      const minPages = pages();

      setInnerZoom(zLetter);
      const pagesFull = pages();

      if (pagesFull <= minPages) {
        setInnerZoom(zLetter);
        return {
          applied: false,
          zoom: zLetter,
          pages: pagesFull,
          minPages,
        };
      }

      let lo = floor;
      let hi = zLetter;
      for (let i = 0; i < 44; i++) {
        const mid = (lo + hi) / 2;
        setInnerZoom(mid);
        if (pages() <= minPages) lo = mid;
        else hi = mid;
      }
      setInnerZoom(lo);

      return {
        applied: Math.abs(lo - zLetter) > 0.002,
        zoom: Math.round(lo * 10000) / 10000,
        pages: pages(),
        minPages,
        pagesFull,
        zLetter,
      };
    },
    { pageH, zoomMinRel }
  );
}
