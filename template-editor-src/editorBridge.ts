/** Iframe DOM + persistence bridge (no JSX). Puppeteer consumes saved HTML verbatim. */

import {
  A4_HEIGHT_MM,
  MM_TO_PX_96,
  SAFE_HEADER_PX_96,
  SAFE_FOOTER_PX_96,
} from '../lib/page-geometry.js';
import { TEMPLATE_FIELD_CSS } from '../lib/template-field-styles.js';

export const FONT_PT_SIZES: number[] = [];
for (let s = 8; s <= 36; s++) FONT_PT_SIZES.push(s);

export function normalizeColorForInput(c: unknown, fallback: string): string {
  if (!c || typeof c !== 'string') return fallback;
  const t = c.trim();
  if (/^#[0-9a-f]{6}$/i.test(t)) return t;
  if (/^#[0-9a-f]{3}$/i.test(t) && t.length === 4) {
    const [, a, b, d] = t;
    return `#${a}${a}${b}${b}${d}${d}`;
  }
  return fallback;
}

export function sanitizeHtml(html: string): string {
  const stripped = String(html)
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '');
  /* Editor-only overlay nodes must never reach _liveHtml. DOMParser handles
     nested attribute quoting correctly where a regex cannot. */
  if (!/data-editor-only/i.test(stripped)) return stripped;
  if (typeof DOMParser === 'undefined') return stripped;
  try {
    const doc = new DOMParser().parseFromString(stripped, 'text/html');
    doc.querySelectorAll('[data-editor-only]').forEach((n) => n.parentNode?.removeChild(n));
    /* Preserve a full-document shape so persistence still detects <html>/</html>. */
    return /<html[\s>]/i.test(stripped)
      ? '<!DOCTYPE html>\n' + doc.documentElement.outerHTML
      : doc.body.innerHTML;
  } catch {
    return stripped;
  }
}

/** @public for tests */
export function pickHeaderCells(
  docEl: Document,
  dt: string
): HTMLElement[] {
  if (!docEl || dt === 'salary') return [];
  if (dt === 'quote') {
    const tr = docEl.querySelector('.quote-table thead tr');
    return tr ? Array.from(tr.querySelectorAll(':scope > td')) : [];
  }
  if (dt === 'sales' || dt === 'invoice') {
    const tbl =
      docEl.querySelector('.qt-sales-main-items-wrap .qt-html-table') ||
      docEl.querySelector('.p2-after-table .qt-html-table');
    if (!tbl) return [];
    let tr = tbl.querySelector('thead tr');
    if (!tr) tr = tbl.querySelector('tbody tr');
    return tr
      ? Array.from(tr.querySelectorAll(':scope > td'))
      : [];
  }
  return [];
}

export function syncHeadersIntoDraft(
  doc: Document | null | undefined,
  docType: string,
  draft: Record<string, unknown>
): Record<string, unknown> {
  if (!doc || docType === 'salary') return draft;
  const cells = pickHeaderCells(doc, docType);
  if (!cells.length) return draft;
  const texts = cells.map((td) =>
    String(td.innerText || '')
      .replace(/\r\n/g, '\n')
      .replace(/\u00a0/g, ' ')
      .trimEnd()
  );
  const next = { ...draft };
  if (docType === 'quote') {
    next.quote = { ...(typeof next.quote === 'object' && next.quote ? next.quote : {}), columnHeaders: texts };
  } else if (docType === 'sales' || docType === 'invoice') {
    next.afterTableItems = {
      ...(typeof next.afterTableItems === 'object' && next.afterTableItems ? next.afterTableItems : {}),
      columnHeaders: texts,
    };
  }
  return next;
}

export function applyThemeStyleBlock(
  d: Document | null | undefined,
  bodyFs: number,
  bodyColor: string,
  bodyFontStack: string,
  thFs: number,
  thFill: string,
  thFg: string
): void {
  if (!d || !d.head) return;
  let tag = d.getElementById('tpl-user-live-theme');
  if (!tag) {
    tag = d.createElement('style');
    tag.id = 'tpl-user-live-theme';
    d.head.appendChild(tag);
  }
  const fam = String(bodyFontStack || 'Montserrat, sans-serif');
  tag.textContent = `
    html { color: ${bodyColor}; box-sizing: border-box; }
    *, *::before, *::after { box-sizing: inherit; }
    body, .sheet-inner--p2, .p2-quote-line-items-shell .quote-table-wrap {
      font-family: ${fam};
    }
    .sheet-inner--p2 { font-size: ${bodyFs}pt; }
    .sheet-inner--p1 { font-size: ${Math.max(bodyFs, 8)}pt; }
    table.quote-table,
    .qt-html-table {
      border-collapse: collapse;
      width: 100%;
    }
    table.quote-table td,
    .qt-html-table td {
      border: 1px solid #cfd8dc !important;
    }
    table.quote-table thead td,
    .quote-table.quote-table thead td,
    .qt-sales-main-items-wrap .qt-html-table thead td,
    .qt-html-table thead td {
      font-size: ${thFs}pt;
      background-color: ${thFill};
      color: ${thFg};
    }
    img { max-width: 100%; height: auto; vertical-align: middle; }
  `.trim();
}

export function updateLiveThemeCssFromDraft(
  d: Document | null | undefined,
  draft: Record<string, unknown>
): void {
  const ds = /** @type {Record<string, unknown>} */ (
    (draft.document && typeof draft.document === 'object' && draft.document && 'defaultStyle' in draft.document
      ? (draft.document as { defaultStyle?: Record<string, unknown> }).defaultStyle
      : {}) || {}
  );
  const styles = draft.document &&
    typeof draft.document === 'object' &&
    draft.document !== null &&
    'styles' in draft.document &&
    typeof (draft.document as { styles?: unknown }).styles === 'object' &&
    (draft.document as { styles?: Record<string, unknown> }).styles
    ? (draft.document as { styles: Record<string, unknown> }).styles
    : {};
  const thRaw = styles.tableHeader;
  const th: Record<string, unknown> =
    typeof thRaw === 'object' && thRaw !== null && !Array.isArray(thRaw)
      ? { ...(thRaw as Record<string, unknown>) }
      : {};
  applyThemeStyleBlock(
    d,
    Number(ds.fontSize) || 8,
    normalizeColorForInput(ds.color != null ? String(ds.color) : undefined, '#212121'),
    String(ds.fontFamily || 'Montserrat, sans-serif'),
    Number(th.fontSize) || 7,
    normalizeColorForInput(th.fillColor != null ? String(th.fillColor) : undefined, '#eceff1'),
    normalizeColorForInput(th.color != null ? String(th.color) : undefined, '#263238')
  );
}

export function buildSyncOverridesFromRibbonInput(
  prev: Record<string, unknown>,
  rib: { fontSizePt: number; fontFamily: string; color: string }
): Record<string, unknown> {
  const next = { ...prev };
  const docPrev =
    next.document &&
    typeof next.document === 'object' &&
    next.document !== null
      ? { ...(next.document as Record<string, unknown>) }
      : {};

  const prevDs =
    docPrev.defaultStyle &&
    typeof docPrev.defaultStyle === 'object' &&
    docPrev.defaultStyle !== null
      ? { ...(docPrev.defaultStyle as Record<string, unknown>) }
      : {};

  const stylesPrev =
    docPrev.styles && typeof docPrev.styles === 'object' && docPrev.styles !== null
      ? { ...(docPrev.styles as Record<string, unknown>) }
      : {};

  const prevThRaw = stylesPrev.tableHeader;
  const prevTh =
    typeof prevThRaw === 'object' && prevThRaw !== null
      ? { ...(prevThRaw as Record<string, unknown>) }
      : {};

  stylesPrev.tableHeader = {
    ...prevTh,
    fontSize: typeof prevTh.fontSize === 'number' ? prevTh.fontSize : 7,
    fillColor: typeof prevTh.fillColor === 'string' ? prevTh.fillColor : '#eceff1',
    color: typeof prevTh.color === 'string' ? prevTh.color : '#263238',
  };

  docPrev.defaultStyle = {
    ...prevDs,
    fontSize: rib.fontSizePt,
    color: rib.color,
    fontFamily: rib.fontFamily,
  };
  docPrev.styles = stylesPrev;
  next.document = docPrev;
  return next;
}

export type TemplateHtmlParts = {
  /** Starts at `<!DOCTYPE` or `<html` through end of opening `<body…>`. */
  prefix: string;
  /** From `</body>` through document end (includes `</html>`). */
  suffix: string;
  bodyInner: string;
};

/** Parse server PDF HTML so TinyMCE can edit `bodyInner` only while head/styles stay intact. */
export function splitTemplateHtml(full: string): TemplateHtmlParts {
  const trimmed = full.trim();
  const closeIdx = trimmed.toLowerCase().lastIndexOf('</body>');
  if (closeIdx === -1) {
    return { prefix: '', suffix: '', bodyInner: full };
  }
  const openMatch = /<body\b[^>]*>/i.exec(trimmed);
  if (!openMatch || openMatch.index === undefined) {
    return {
      prefix: '',
      suffix: trimmed.slice(closeIdx),
      bodyInner: trimmed.slice(0, closeIdx),
    };
  }
  const openEnd = openMatch.index + openMatch[0].length;
  return {
    prefix: trimmed.slice(0, openEnd),
    suffix: trimmed.slice(closeIdx),
    bodyInner: trimmed.slice(openEnd, closeIdx),
  };
}

export function mergeTemplateHtml(parts: TemplateHtmlParts): string {
  if (!parts.prefix && !parts.suffix) return parts.bodyInner;
  return `${parts.prefix}${parts.bodyInner}${parts.suffix}`;
}

/**
 * TinyMCE's edit iframe only contains `body` HTML; re-inject `<head>` stylesheets
 * and inline `<style>` from the PDF template so layout matches print/Puppeteer.
 */
export function injectPdfHeadIntoEditorDoc(
  doc: Document,
  prefixThroughBodyOpen: string
): void {
  const m = prefixThroughBodyOpen.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (!m) return;
  const inner = m[1];
  const wrap = new DOMParser().parseFromString(
    `<html><head>${inner}</head></html>`,
    'text/html'
  );
  const dest = doc.head;
  wrap.head.childNodes.forEach((node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === 'style') {
      const s = doc.createElement('style');
      s.textContent = el.textContent;
      dest.appendChild(s);
    } else if (tag === 'link' && el.getAttribute('rel') === 'stylesheet') {
      const l = doc.createElement('link');
      l.rel = 'stylesheet';
      const href = el.getAttribute('href');
      if (href) l.setAttribute('href', href);
      dest.appendChild(l);
    } else if (tag === 'base') {
      const b = doc.createElement('base');
      const href = el.getAttribute('href');
      if (href) b.setAttribute('href', href);
      dest.appendChild(b);
    }
  });
}

/**
 * Editor-only CSS (not persisted in saved HTML): stack each `.sheet` as an A4 page
 * and keep tables/images in normal document flow so edits reflow predictably.
 */
export function injectEditorPagedScreenCss(doc: Document | null | undefined): void {
  if (!doc?.head) return;
  let tag = doc.getElementById('tpl-editor-paged-screen');
  if (!tag) {
    tag = doc.createElement('style');
    tag.id = 'tpl-editor-paged-screen';
    doc.head.appendChild(tag);
  }
  tag.textContent = `
    html {
      background: #e5e5e5 !important;
    }
    /* Flex column prevents margin-collapsing so sheets never visually merge */
    body {
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      gap: 36px !important;
      margin: 0 !important;
      padding: 28px 0 44px !important;
      background: #e5e5e5 !important;
      box-sizing: border-box !important;
      width: 100% !important;
      min-height: 100% !important;
    }
    /* TRUE per-page A4 sheets. Every .sheet--table sibling is a real fixed-size
       A4 card with its own background; the repagination engine (repaginateTableSheets)
       distributes content across as many siblings as needed. */
    .sheet.sheet--letter,
    .sheet.sheet--table {
      width: 210mm;
      max-width: 100%;
      height: 297mm !important;
      max-height: 297mm !important;
      min-height: 297mm !important;
      margin: 0 !important;
      flex: 0 0 auto;
      box-sizing: border-box !important;
      background-color: #ffffff !important;
      background-repeat: no-repeat !important;
      background-position: top left !important;
      background-size: 210mm 297mm !important;
      break-after: page;
      page-break-after: always;
      position: relative !important;
      overflow: hidden !important;
      display: block;
      isolation: isolate !important;
      box-shadow:
        0 0 0 1px rgba(0,0,0,0.12),
        0 4px 6px rgba(0,0,0,0.08),
        0 12px 28px rgba(0,0,0,0.18);
    }
    /* A single image cannot blow past one A4. Repaginate places it on its own sheet. */
    .sheet--letter img:not(.letter-sheet-bg),
    .sheet--table img {
      max-height: 290mm;
      height: auto;
    }
    .sheet-inner--p1,
    .sheet-inner--p2 {
      position: relative;
      z-index: 1;
      width: 100%;
      height: 100%;
      max-height: 100%;
      box-sizing: border-box;
      /* Clip transient typing overflow at the safe-area bottom so content never
         visually paints over the footer artwork band, even before the debounced
         repagination has moved the overflowing block to the next sheet. */
      overflow: hidden !important;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .sheet-inner--p1 p,
    .sheet-inner--p2 p {
      box-sizing: border-box;
    }
    table.quote-table,
    table.qt-html-table {
      border-collapse: collapse;
      width: 100%;
      max-width: 100%;
      table-layout: auto;
    }
    table.quote-table td,
    table.quote-table th,
    table.qt-html-table td,
    table.qt-html-table th {
      vertical-align: top;
      box-sizing: border-box;
    }
    img.letter-sheet-bg {
      max-width: none !important;
      width: 210mm !important;
      height: auto !important;
      pointer-events: none;
    }
    img {
      max-width: 100%;
      height: auto;
      vertical-align: middle;
    }
    img.qt-stamp-img,
    img.qt-content-img {
      pointer-events: auto;
      max-width: min(100%, 200pt);
    }

    /* ------------------------------------------------------------------
       Editor-only mirror of the break-control subset of pdf/print.built.css.
       These rules don't change screen layout (the browser ignores break-*
       outside paged media), but they make template-author intent observable
       via getComputedStyle so the JS splitter's isSplittable / wantsBreakBefore
       can honor them. Keeps the editor preview's break decisions aligned with
       Puppeteer's native pagination of the same source HTML.
       ------------------------------------------------------------------ */
    thead {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .qt-html-table--totals-inner,
    .qt-html-table--totals-inner > tbody > tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .p2-after-table:not(.p2-after-table--sales) > table.qt-html-table:not(.qt-html-table--light-lines) > tbody > tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .p2-quote-line-items-shell > .p2-after-table--flush-totals table.qt-html-table--star-auto {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .p2-table-wrap--break-before {
      break-before: page;
      page-break-before: always;
    }

    /* ------------------------------------------------------------------
       Phase 9: shared toolbox-field styles. Identical CSS is also applied
       by the PDF print pipeline (document-template-core.tsx) so the editor
       preview and the printed output render fields the same way.
       ------------------------------------------------------------------ */
    ${TEMPLATE_FIELD_CSS}
  `.trim();
}

/**
 * Edit-side CSS for the canonical single-document layer (Phase 7). Styles
 * `.sheet--letter` / `.sheet--table` as A4-width cards with auto height and
 * `overflow: visible` so the editor IS the source of truth — no fixed 297mm
 * boundary, no clipping, no JS pagination needed during typing. The preview
 * iframe uses `injectEditorPagedScreenCss` instead to show real pagination.
 */
export function injectEditorContinuousScreenCss(doc: Document | null | undefined): void {
  if (!doc?.head) return;
  let tag = doc.getElementById('tpl-editor-continuous-screen');
  if (!tag) {
    tag = doc.createElement('style');
    tag.id = 'tpl-editor-continuous-screen';
    doc.head.appendChild(tag);
  }
  /* Also remove the paged-screen rules if they were previously injected on
     this document, so the continuous rules win cleanly. */
  const stale = doc.getElementById('tpl-editor-paged-screen');
  if (stale) stale.parentNode?.removeChild(stale);
  tag.textContent = `
    html, body {
      background: #e5e5e5 !important;
      margin: 0 !important;
    }
    body {
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      gap: 24px !important;
      padding: 28px 0 44px !important;
      min-height: 100% !important;
      box-sizing: border-box !important;
    }
    .sheet.sheet--letter,
    .sheet.sheet--table {
      width: 210mm;
      max-width: 100%;
      min-height: 0 !important;
      height: auto !important;
      max-height: none !important;
      margin: 0 !important;
      flex: 0 0 auto;
      box-sizing: border-box !important;
      background-color: #ffffff !important;
      background-repeat: no-repeat !important;
      background-position: top left !important;
      background-size: 210mm 297mm !important;
      position: relative !important;
      overflow: visible !important;
      isolation: isolate !important;
      box-shadow:
        0 0 0 1px rgba(0,0,0,0.12),
        0 4px 6px rgba(0,0,0,0.08),
        0 12px 28px rgba(0,0,0,0.18);
    }
    .sheet-inner--p1,
    .sheet-inner--p2 {
      position: relative;
      z-index: 1;
      width: 100%;
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
      box-sizing: border-box;
      overflow: visible !important;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    img.letter-sheet-bg { display: none !important; }
    img {
      max-width: 100%;
      height: auto;
      vertical-align: middle;
    }
    img.qt-stamp-img,
    img.qt-content-img {
      pointer-events: auto;
      max-width: min(100%, 200pt);
    }
    table.quote-table,
    table.qt-html-table {
      border-collapse: collapse;
      width: 100%;
      max-width: 100%;
      table-layout: auto;
    }
    table.quote-table td,
    table.quote-table th,
    table.qt-html-table td,
    table.qt-html-table th {
      vertical-align: top;
      box-sizing: border-box;
    }

    /* Phase 9 — toolbox field styles (parity with paged variant). */
    ${TEMPLATE_FIELD_CSS}
  `.trim();
}

/** A4 portrait at 96dpi (~1122.52px). Matches Puppeteer's PDF_VIEWPORT.height. */
const EDITOR_A4_PAGE_HEIGHT_PX = A4_HEIGHT_MM * MM_TO_PX_96;

/** Safe-area floors derived from the shared print/editor constants so the
 *  editor's clientHeight matches Puppeteer's content area bit-for-bit. */
const MIN_FOOTER_RESERVE_PX = SAFE_FOOTER_PX_96;
const MIN_HEADER_RESERVE_PX = SAFE_HEADER_PX_96;

/** Per-side floors (px) applied during padding derivation. Top/bottom protect
 * the header/footer artwork bands; left/right are unconstrained because the
 * template's horizontal padding is design-driven. */
const PAGE_FLOORS = {
  top: MIN_HEADER_RESERVE_PX,
  right: 0,
  bottom: MIN_FOOTER_RESERVE_PX,
  left: 0,
};

type PadSide = 'paddingTop' | 'paddingRight' | 'paddingBottom' | 'paddingLeft';

/** Compute the effective safe-area padding (px) for a sheet section. Takes the
 * MAXIMUM of the cascaded section padding (e.g. from `tableSheetStyle`), the
 * cascaded inner padding (legacy template styling), and the per-side floor.
 * This honors template-specified safe areas without ever reducing below the
 * artwork-band floors. */
function derivePaddingPx(
  section: HTMLElement,
  inner: HTMLElement,
  w: Window & typeof globalThis,
  floors: { top: number; right: number; bottom: number; left: number }
): { top: number; right: number; bottom: number; left: number } {
  const cssS = w.getComputedStyle(section);
  const cssI = w.getComputedStyle(inner);
  const pick = (key: PadSide, floor: number): number =>
    Math.max(
      parseFloat(cssS[key] || '0') || 0,
      parseFloat(cssI[key] || '0') || 0,
      floor
    );
  return {
    top: pick('paddingTop', floors.top),
    right: pick('paddingRight', floors.right),
    bottom: pick('paddingBottom', floors.bottom),
    left: pick('paddingLeft', floors.left),
  };
}

/** Write the derived padding onto the section and zero the inner so the inner
 * div equals the actual safe area (which is what the splitter's `fits()`
 * measures via `clientHeight`). */
function applySectionPadding(
  section: HTMLElement,
  inner: HTMLElement,
  pads: { top: number; right: number; bottom: number; left: number }
): void {
  section.style.padding =
    `${pads.top}px ${pads.right}px ${pads.bottom}px ${pads.left}px`;
  inner.style.padding = '0';
}

/**
 * Move safe-area padding from `.sheet-inner--p1` (and any cascaded padding on
 * `.sheet--letter` itself) onto the letter section, floored to the header /
 * footer artwork bands. After this, `.sheet-inner--p1`'s `clientHeight` equals
 * the actual safe area between the header and footer artwork.
 *
 * Print-safe: `<img class="letter-sheet-bg">` and the not-approved stamp are
 * `position: absolute`, anchored to the section's padding-box, so they don't
 * shift.
 *
 * Re-runnable: the max() derivation is stable so re-application is a no-op
 * write.
 */
export function shiftPage1PaddingToSection(doc: Document | null | undefined): void {
  if (!doc) return;
  const w = (doc.defaultView ?? null) as (Window & typeof globalThis) | null;
  if (!w) return;
  doc.querySelectorAll('section.sheet.sheet--letter').forEach((s) => {
    const section = s as HTMLElement;
    const inner = section.querySelector(':scope > .sheet-inner--p1') as HTMLElement | null;
    if (!inner) return;
    try {
      applySectionPadding(section, inner, derivePaddingPx(section, inner, w, PAGE_FLOORS));
    } catch {
      /* */
    }
  });
}

/**
 * Symmetric to `shiftPage1PaddingToSection` but for continuation sheets. The
 * splitter's `fits()` check measures `.sheet-inner--p2`'s `clientHeight`; if
 * the inner fills the whole 297mm sheet, content overflows into the header /
 * footer artwork before split is triggered. Moving padding from the section's
 * cascaded CSS (e.g. `tableSheetStyle`) onto the section inline — floored to
 * the artwork bands — makes the inner equal to the actual safe area.
 *
 * Re-runnable: the max() derivation is stable.
 */
export function shiftPage2PaddingToSection(doc: Document | null | undefined): void {
  if (!doc) return;
  const w = (doc.defaultView ?? null) as (Window & typeof globalThis) | null;
  if (!w) return;
  doc.querySelectorAll('section.sheet.sheet--table').forEach((s) => {
    const section = s as HTMLElement;
    const inner = section.querySelector(':scope > .sheet-inner--p2') as HTMLElement | null;
    if (!inner) return;
    try {
      applySectionPadding(section, inner, derivePaddingPx(section, inner, w, PAGE_FLOORS));
    } catch {
      /* */
    }
  });
}

/**
 * Create an empty `.sheet--table` continuation sheet inserted directly after
 * the given letter section. Inherits the letter's footer artwork background
 * (via the `.letter-sheet-bg` image src) so the new sheet looks identical in
 * the editor. PDF print uses the `@page` background, so the inline bg is
 * purely for the editing experience.
 */
function synthesizeContinuationAfter(
  letterSection: HTMLElement,
  doc: Document
): HTMLElement {
  const newSheet = doc.createElement('section');
  newSheet.className = 'sheet sheet--table';
  const bgImg = letterSection.querySelector(
    ':scope > img.letter-sheet-bg'
  ) as HTMLImageElement | null;
  if (bgImg && bgImg.src) {
    newSheet.style.backgroundImage = `url(${bgImg.src})`;
    newSheet.style.backgroundSize = '210mm 297mm';
    newSheet.style.backgroundRepeat = 'no-repeat';
    newSheet.style.backgroundPosition = 'top left';
  }
  const inner = doc.createElement('div');
  inner.className = 'sheet-inner sheet-inner--p2';
  newSheet.appendChild(inner);
  letterSection.parentNode?.insertBefore(newSheet, letterSection.nextSibling);
  return newSheet;
}

/**
 * @deprecated Superseded by the unified distribution in `repaginateTableSheets`
 * which treats `.sheet-inner--p1` as the first slot in the flow. Kept as a
 * no-op so existing imports don't break.
 */
export function promoteLetterOverflow(_doc: Document | null | undefined): void {
  /* Intentionally empty. The unified distribution inside `repaginateTableSheets`
     now treats `.sheet-inner--p1` as the first slot in the flow, which both
     trims letter overflow into continuation sheets AND splits the overflowing
     block (paragraph text-splitting via `splitTextNode`) so the letter page
     fills end-to-end before any continuation starts. */
}

/**
 * Rewrite an editor-paged Document into the canonical shape that
 * `renderPdfDocumentShellToHtml` emits originally:
 *   - one `.sheet--letter` (if present) + at most one `.sheet--table` (if
 *     there is any continuation content),
 *   - no editor-only inline `style.padding` on any sheet section or inner,
 *   - no editor-synthesized inline background on continuation sections.
 *
 * Decouples PDF correctness from editor splitter state: the saved HTML is
 * always canonical, so Puppeteer's native pagination renders from clean input
 * and editor splitter bugs never leak into the PDF. The live editor iframe is
 * NOT mutated by this — call it on a serialized clone.
 *
 * Idempotent: running on already-canonical HTML is a no-op.
 */
export function collapseEditorPagedHtml(doc: Document | null | undefined): void {
  if (!doc) return;
  const tables = Array.from(
    doc.querySelectorAll('section.sheet.sheet--table')
  ) as HTMLElement[];

  if (tables.length > 0) {
    const canonical = tables[0];
    const canonicalInner = canonical.querySelector(
      ':scope > .sheet-inner--p2'
    ) as HTMLElement | null;
    if (canonicalInner) {
      for (let i = 1; i < tables.length; i++) {
        const sec = tables[i];
        const innerEl = sec.querySelector(
          ':scope > .sheet-inner--p2'
        ) as HTMLElement | null;
        if (innerEl) {
          while (innerEl.firstChild) canonicalInner.appendChild(innerEl.firstChild);
        }
        sec.parentNode?.removeChild(sec);
      }
      /* Strip editor-only inline state from the surviving section + inner. */
      canonical.style.removeProperty('padding');
      canonical.style.removeProperty('background-image');
      canonical.style.removeProperty('background-size');
      canonical.style.removeProperty('background-repeat');
      canonical.style.removeProperty('background-position');
      canonicalInner.style.removeProperty('padding');
      /* If everything fit on the letter, the surviving table is empty —
         drop it so a letter-only template stays letter-only. */
      if (!canonicalInner.firstChild) {
        canonical.parentNode?.removeChild(canonical);
      }
    }
  }

  /* Strip editor-only inline padding from the letter section + its inner too. */
  doc.querySelectorAll('section.sheet.sheet--letter').forEach((s) => {
    const section = s as HTMLElement;
    section.style.removeProperty('padding');
    const inner = section.querySelector(
      ':scope > .sheet-inner--p1'
    ) as HTMLElement | null;
    if (inner) inner.style.removeProperty('padding');
  });
}

/**
 * String wrapper around `collapseEditorPagedHtml`. Parses the HTML, runs the
 * collapse on the parsed Document, returns the serialized canonical HTML.
 * Safe to call on partial bodies — wraps in a synthetic `<html><body>…</body></html>`
 * if no `<html>` is present and unwraps the body's inner before returning.
 */
export function collapseEditorPagedHtmlString(html: string): string {
  if (typeof DOMParser === 'undefined') return html;
  try {
    const full = /<html[\s>]/i.test(html);
    const source = full ? html : `<html><body>${html}</body></html>`;
    const parsed = new DOMParser().parseFromString(source, 'text/html');
    collapseEditorPagedHtml(parsed);
    if (full) {
      return '<!DOCTYPE html>\n' + parsed.documentElement.outerHTML;
    }
    return parsed.body ? parsed.body.innerHTML : html;
  } catch {
    return html;
  }
}

/** Elements that should be split open when their content overflows. */
const SPLITTABLE_TAGS = new Set([
  'div', 'section', 'article', 'main', 'aside', 'ul', 'ol', 'dl', 'tbody',
  'p',
]);
/** Elements treated as atomic (moved whole, never split). */
const ATOMIC_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'img', 'hr', 'br', 'pre', 'figure', 'blockquote',
  'tr', 'td', 'th', 'iframe', 'video', 'canvas', 'svg',
]);

/**
 * Live multi-page repagination with recursive content fragmentation.
 *
 * Distributes content of all `.sheet--table` sections across N real sibling
 * sections (fixed 297mm A4 cards, `overflow: hidden`, `height: 297mm`). When
 * a wrapper div (`.p2-quote-line-items-shell`, `.p2-table-wrap`, `.p2-after-table`,
 * generic `<div>`/`<section>`/`<ul>`/`<ol>`, etc.) overflows the safe area,
 * the wrapper is cloned across spawned sheets so CSS class context is preserved
 * for nested children. Tables are split at `<tr>` boundaries with `<thead>` and
 * `<colgroup>` re-cloned on each new page so column widths and headers persist.
 *
 * Caret survival: leaf nodes (text, atomic blocks like `<p>`, `<img>`, rows)
 * are *moved* via `appendChild` (no clones), so JS node identity is preserved
 * and any active `Range` endpoint anchored in user-typed text continues to
 * resolve after re-parenting. Only wrapper containers are cloned (empty).
 */
export function repaginateTableSheets(
  doc: Document | null | undefined
): { pages: number } {
  if (!doc?.body) return { pages: 1 };

  /* Save selection BEFORE any DOM mutation so subsequent padding shifts and
     letter promotion don't drop the user's caret. */
  const sel = doc.getSelection ? doc.getSelection() : null;
  let savedRange: Range | null = null;
  if (sel && sel.rangeCount > 0) {
    try {
      savedRange = sel.getRangeAt(0).cloneRange();
    } catch {
      savedRange = null;
    }
  }

  /* Ensure both sheet types carry their safe-area padding on the section so
     the inner div's clientHeight reflects the usable content area (not the
     full 297mm sheet). Both helpers are idempotent. */
  try {
    shiftPage1PaddingToSection(doc);
  } catch {
    /* */
  }
  try {
    shiftPage2PaddingToSection(doc);
  } catch {
    /* */
  }

  /* Find the letter section + inner. It participates in the unified flow as
     the first slot — content fills the letter to capacity before continuation
     sheets are opened. */
  const letterSection = doc.querySelector(
    'section.sheet.sheet--letter'
  ) as HTMLElement | null;
  const letterInner = (letterSection
    ? letterSection.querySelector(':scope > .sheet-inner--p1')
    : null) as HTMLElement | null;

  let all = Array.from(
    doc.querySelectorAll('section.sheet.sheet--table')
  ) as HTMLElement[];
  /* Ensure at least one continuation sheet exists so the splitter has a
     template to clone from. If only the letter exists, synthesize one. */
  if (all.length === 0) {
    if (letterSection) {
      const synth = synthesizeContinuationAfter(letterSection, doc);
      try {
        shiftPage2PaddingToSection(doc);
      } catch {
        /* */
      }
      all = [synth];
    } else {
      if (savedRange && sel) {
        try {
          const startC = (savedRange.startContainer as Node)?.isConnected;
          const endC = (savedRange.endContainer as Node)?.isConnected;
          if (startC && endC) {
            sel.removeAllRanges();
            sel.addRange(savedRange);
          }
        } catch {
          /* */
        }
      }
      return { pages: 1 };
    }
  }

  const innerSelector = ':scope > .sheet-inner--p2';
  const initialTemplate = all[0];
  const initialInner = initialTemplate.querySelector(innerSelector) as HTMLElement | null;
  if (!initialInner) return { pages: 1 + all.length };
  const initialParent = initialTemplate.parentNode;
  if (!initialParent) return { pages: 1 + all.length };

  /* template/templateInner/parent are `let` because runDistribution may
     re-synthesize the template `.sheet--table` between verification passes
     (e.g. if a prior pass removed it as empty). Non-null at first assignment
     thanks to the early returns above. */
  let template: HTMLElement = initialTemplate;
  let templateInner: HTMLElement = initialInner;
  let parent: Node = initialParent;

  /* Mutable state shared by the recursive helpers. The unified flow starts at
     the letter inner if present, falling back to the template inner. */
  let currentSheet: HTMLElement = letterSection ?? template;
  let currentInner: HTMLElement = letterInner ?? templateInner;
  const readUsable = (el: HTMLElement) => {
    el.getBoundingClientRect();
    return el.clientHeight || EDITOR_A4_PAGE_HEIGHT_PX;
  };
  let usable = readUsable(currentInner);

  const startNewSheet = () => {
    const newSheet = template.cloneNode(false) as HTMLElement;
    const newInner = templateInner.cloneNode(false) as HTMLElement;
    while (newInner.firstChild) newInner.removeChild(newInner.firstChild);
    newSheet.appendChild(newInner);
    if (currentSheet.nextSibling) parent.insertBefore(newSheet, currentSheet.nextSibling);
    else parent.appendChild(newSheet);
    currentSheet = newSheet;
    currentInner = newInner;
    usable = readUsable(currentInner);
  };

  const fits = () => currentInner.scrollHeight <= usable + 1;

  const isElement = (n: Node): n is HTMLElement => n.nodeType === Node.ELEMENT_NODE;
  const tagOf = (n: Node) => (isElement(n) ? n.tagName.toLowerCase() : '');
  const isTable = (n: Node) => tagOf(n) === 'table';
  /** Read the cascaded `break-inside` value (set via the print-CSS mirror in
   *  `injectEditorPagedScreenCss`). When `avoid`, the element is treated as
   *  atomic so the splitter never breaks it across pages — matching Puppeteer. */
  const hasBreakInsideAvoid = (el: HTMLElement): boolean => {
    try {
      const w = doc.defaultView;
      if (!w) return false;
      const cs = w.getComputedStyle(el);
      return cs.breakInside === 'avoid' || cs.pageBreakInside === 'avoid';
    } catch {
      return false;
    }
  };
  /** Honor `break-before: page` on a block (mirrors the print-CSS rule
   *  `.p2-table-wrap--break-before { break-before: page }`). */
  const wantsBreakBefore = (n: Node): boolean => {
    if (!isElement(n)) return false;
    try {
      const w = doc.defaultView;
      if (!w) return false;
      const cs = w.getComputedStyle(n);
      return cs.breakBefore === 'page' || cs.pageBreakBefore === 'always';
    } catch {
      return false;
    }
  };
  const isSplittable = (n: Node) => {
    if (!isElement(n)) return false;
    const t = tagOf(n);
    if (ATOMIC_TAGS.has(t)) return false;
    if (!SPLITTABLE_TAGS.has(t)) return false;
    /* Respect template-author intent: anything carrying break-inside:avoid
       (e.g. .qt-html-table--totals-inner, .p2-after-table--flush-totals
       table.qt-html-table--star-auto) is treated as atomic by the splitter. */
    if (hasBreakInsideAvoid(n)) return false;
    return true;
  };

  /**
   * Start a new sheet AND mirror the wrapper chain from currentInner down to
   * the depth of `slot`, so spawned-page content keeps its CSS class context
   * (e.g., `.p2-quote-line-items-shell > .p2-table-wrap > …`).
   */
  const startNewSheetWithChain = (slot: HTMLElement): HTMLElement => {
    const chain: HTMLElement[] = [];
    let n: HTMLElement | null = slot;
    while (n && n !== currentInner) {
      chain.unshift(n);
      n = n.parentElement;
    }
    startNewSheet();
    let parentRef: HTMLElement = currentInner;
    for (const link of chain) {
      const clone = link.cloneNode(false) as HTMLElement;
      while (clone.firstChild) clone.removeChild(clone.firstChild);
      parentRef.appendChild(clone);
      parentRef = clone;
    }
    return parentRef;
  };

  /**
   * Place `node` into `slot`. If overflow, split recursively. Returns the
   * slot at the same nesting depth where the NEXT sibling should go (may be
   * a freshly-cloned wrapper on a freshly-spawned sheet).
   */
  const placeNode = (node: ChildNode, slot: HTMLElement): HTMLElement => {
    slot.appendChild(node);
    if (fits()) return slot;

    /* Overflow. Pull node back and pick a split strategy. */
    slot.removeChild(node);

    /* Atomic-by-break (e.g. break-inside:avoid totals table) is best-effort —
       try a fresh sheet first; if it STILL doesn't fit, fall back to splitting
       so content is never silently clipped by overflow:hidden. Matches browser
       print, which also splits break-inside:avoid blocks when they're taller
       than a single page. Only Elements can carry break-inside, so this branch
       is HTMLElement-only by construction. */
    if (isElement(node) && hasBreakInsideAvoid(node)) {
      const el = node;
      let trial = slot;
      if (currentInner.firstChild) {
        trial = startNewSheetWithChain(slot);
      }
      trial.appendChild(el);
      if (fits()) return trial;
      trial.removeChild(el);
      if (isTable(el)) return splitTable(el, trial);
      if (SPLITTABLE_TAGS.has(tagOf(el)) && el.childNodes.length > 0) {
        return splitContainer(el, trial);
      }
      /* True atomic leaf (img, hr, …) — accept overflow rather than lose it. */
      trial.appendChild(el);
      return trial;
    }

    if (isTable(node)) return splitTable(node as HTMLElement, slot);
    if (isSplittable(node) && node.childNodes.length > 0) {
      return splitContainer(node as HTMLElement, slot);
    }
    if (node.nodeType === Node.TEXT_NODE) {
      return splitTextNode(node as Text, slot);
    }

    /* Atomic leaf. Move to a fresh sheet if the current one already has content. */
    if (!currentInner.firstChild) {
      slot.appendChild(node);
      return slot;
    }
    const newSlot = startNewSheetWithChain(slot);
    newSlot.appendChild(node);
    return newSlot;
  };

  /**
   * Split a text node at the longest word-boundary prefix that still fits in
   * the current slot. Remaining text recurses onto a freshly spawned sheet.
   * Preserves whitespace by tokenizing on alternating word/whitespace runs.
   */
  const splitTextNode = (text: Text, slot: HTMLElement): HTMLElement => {
    const data = text.data;
    if (!data || data.trim() === '') {
      /* Whitespace-only: nothing to gain from splitting. */
      if (!currentInner.firstChild) {
        slot.appendChild(text);
        return slot;
      }
      const newSlot = startNewSheetWithChain(slot);
      newSlot.appendChild(text);
      return newSlot;
    }
    const tokens = data.match(/\S+|\s+/g) || [data];
    const probe = doc.createTextNode('');
    slot.appendChild(probe);
    let lo = 0;
    let hi = tokens.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      probe.data = tokens.slice(0, mid).join('');
      if (fits()) lo = mid;
      else hi = mid - 1;
    }
    if (lo === 0) {
      /* No prefix fit. If this slot is otherwise empty, accept the full text
         (it physically can't be smaller); otherwise spawn a fresh sheet and
         try again there. */
      slot.removeChild(probe);
      if (!currentInner.firstChild) {
        slot.appendChild(text);
        return slot;
      }
      const newSlot = startNewSheetWithChain(slot);
      return splitTextNode(text, newSlot);
    }
    probe.data = tokens.slice(0, lo).join('');
    if (lo === tokens.length) return slot;
    const remainder = doc.createTextNode(tokens.slice(lo).join(''));
    const newSlot = startNewSheetWithChain(slot);
    return splitTextNode(remainder, newSlot);
  };

  /**
   * Replace `container` (already in slot) with an empty clone, then place each
   * child of the original container into the clone, splitting across sheets.
   */
  const splitContainer = (container: HTMLElement, slot: HTMLElement): HTMLElement => {
    const children = Array.from(container.childNodes);
    const empty = container.cloneNode(false) as HTMLElement;
    while (empty.firstChild) empty.removeChild(empty.firstChild);
    slot.appendChild(empty);

    /* If even the empty wrapper doesn't fit AND the current sheet has prior
       content, push the wrapper itself to a new sheet first. */
    if (!fits() && currentInner.childNodes.length > 1) {
      slot.removeChild(empty);
      const nextSlot = startNewSheetWithChain(slot);
      nextSlot.appendChild(empty);
      slot = nextSlot;
    }

    /* Capture slotDepth NOW, while slot is still inside currentInner. The
       wrapper-chain mirroring done by startNewSheetWithChain preserves depth,
       so this value stays a valid target even if the loop below spawns more
       sheets and the final climb resolves against a newer currentInner.
       (Computing slotDepth AFTER the loop would observe slot on a stale sheet
       and return -1, causing the climb to walk past the new currentInner and
       return the bare <section> — which silently appends subsequent siblings
       outside the safe-area inner and clips them. Phase 4 fix.) */
    const slotDepth = depthFrom(slot, currentInner);

    let sub: HTMLElement = empty;
    for (const child of children) {
      /* Honor `break-before: page` on inner blocks too (mirrors Puppeteer). */
      if (wantsBreakBefore(child) && currentInner.firstChild) {
        const spawned = startNewSheetWithChain(sub);
        sub = spawned;
      }
      sub = placeNode(child, sub);
    }

    /* Climb sub up to the same depth as the original slot in the CURRENT
       currentInner. */
    let result: HTMLElement | null = sub;
    while (result && depthFrom(result, currentInner) > slotDepth) {
      result = result.parentElement;
    }
    /* Bug-safety net: if result ended up outside currentInner, fall back to
       currentInner so the caller's next siblings stay inside the safe-area
       inner div instead of being appended to the bare sheet section. */
    if (!result || depthFrom(result, currentInner) < 0) return currentInner;
    return result;
  };

  /** Distance from `node` up to `ancestor` (exclusive). Returns -1 if not nested. */
  function depthFrom(node: HTMLElement, ancestor: HTMLElement): number {
    let d = 0;
    let n: HTMLElement | null = node;
    while (n && n !== ancestor) {
      n = n.parentElement;
      d++;
    }
    return n === ancestor ? d : -1;
  }

  /**
   * Split a `<table>` at `<tr>` boundaries. Builds a fresh empty clone of the
   * table on each new sheet, copying `<caption>`, `<colgroup>`, and `<thead>`
   * deep so column widths and header rows persist across the print spread.
   */
  const splitTable = (table: HTMLElement, slot: HTMLElement): HTMLElement => {
    /* Collect rows from EVERY <tbody> (templates may author multiple). Using
       :scope > tbody (singular) silently dropped non-first tbodies. */
    const tbodies = Array.from(
      table.querySelectorAll(':scope > tbody')
    ) as HTMLElement[];
    const rows = tbodies.flatMap(
      (tb) => Array.from(tb.children) as HTMLElement[]
    );
    if (tbodies.length === 0 || rows.length === 0) {
      /* No tbody (or empty) — treat as atomic. */
      if (!currentInner.firstChild) {
        slot.appendChild(table);
        return slot;
      }
      const onlySlot = startNewSheetWithChain(slot);
      onlySlot.appendChild(table);
      return onlySlot;
    }
    const tbody = tbodies[0];

    const captionEl = table.querySelector(':scope > caption');
    const colgroupEl = table.querySelector(':scope > colgroup');
    const theadEl = table.querySelector(':scope > thead');
    const buildEmptyClone = (): { table: HTMLElement; tbody: HTMLElement } => {
      const t = table.cloneNode(false) as HTMLElement;
      if (captionEl) t.appendChild(captionEl.cloneNode(true));
      if (colgroupEl) t.appendChild(colgroupEl.cloneNode(true));
      if (theadEl) t.appendChild(theadEl.cloneNode(true));
      const tb = tbody.cloneNode(false) as HTMLElement;
      t.appendChild(tb);
      return { table: t, tbody: tb };
    };

    let { table: curTable, tbody: curTbody } = buildEmptyClone();
    slot.appendChild(curTable);
    if (!fits() && currentInner.childNodes.length > 1) {
      slot.removeChild(curTable);
      const next = startNewSheetWithChain(slot);
      const built = buildEmptyClone();
      curTable = built.table;
      curTbody = built.tbody;
      next.appendChild(curTable);
      slot = next;
    }

    for (const row of rows) {
      curTbody.appendChild(row);
      if (!fits()) {
        if (curTbody.children.length === 1) {
          /* Row alone overflows. Avoid the Phase 1 trap of spawning a new
             sheet per row when consecutive rows are each "alone too tall" —
             that produces the "header before every row" symptom. Strategy:
             if there's no prior content above the table on this sheet, just
             accept the overflow here (one big oversize page beats N pages
             each with a single thead+row). If there IS prior content, move
             the row to a fresh sheet once — where thead+row may now fit. */
          const slotHasContentAboveTable =
            curTable.previousSibling != null ||
            currentInner.firstChild !== curTable;
          if (!slotHasContentAboveTable) {
            continue;
          }
          curTbody.removeChild(row);
          if (curTable.parentNode) curTable.parentNode.removeChild(curTable);
          const next = startNewSheetWithChain(slot);
          const built = buildEmptyClone();
          curTable = built.table;
          curTbody = built.tbody;
          next.appendChild(curTable);
          curTbody.appendChild(row);
          slot = next;
          continue;
        }
        curTbody.removeChild(row);
        const next = startNewSheetWithChain(slot);
        const built = buildEmptyClone();
        curTable = built.table;
        curTbody = built.tbody;
        next.appendChild(curTable);
        curTbody.appendChild(row);
        slot = next;
      }
    }
    return slot;
  };

  /* Unified distribution: collects every top-level block from the letter inner
     AND every `.sheet--table` inner into one ordered list, then redistributes
     starting at the letter inner. Continuation `.sheet--table` sheets are
     spawned only when the letter (and then each continuation) overflows. */
  const runDistribution = () => {
    /* Re-find the template `.sheet--table` every pass — a prior pass may have
       removed an empty one as cleanup. Synthesize a fresh one if needed. */
    let tables = Array.from(
      doc.querySelectorAll('section.sheet.sheet--table')
    ) as HTMLElement[];
    if (tables.length === 0 && letterSection) {
      tables = [synthesizeContinuationAfter(letterSection, doc)];
      try {
        shiftPage2PaddingToSection(doc);
      } catch {
        /* */
      }
    }
    if (tables.length === 0) return;
    template = tables[0];
    const ti = template.querySelector(innerSelector) as HTMLElement | null;
    if (!ti) return;
    templateInner = ti;
    const par = template.parentNode;
    if (!par) return;
    parent = par;

    const blocks: ChildNode[] = [];
    if (letterInner)
      Array.from(letterInner.childNodes).forEach((n) => blocks.push(n));
    tables.forEach((sec) => {
      const innerEl = sec.querySelector(innerSelector) as HTMLElement | null;
      if (!innerEl) return;
      Array.from(innerEl.childNodes).forEach((n) => blocks.push(n));
    });

    for (let i = tables.length - 1; i >= 1; i--) parent.removeChild(tables[i]);
    if (letterInner)
      while (letterInner.firstChild) letterInner.removeChild(letterInner.firstChild);
    while (templateInner.firstChild) templateInner.removeChild(templateInner.firstChild);

    currentSheet = letterSection ?? template;
    currentInner = letterInner ?? templateInner;
    usable = readUsable(currentInner);

    let s: HTMLElement = currentInner;
    for (const block of blocks) {
      /* Honor `break-before: page` (e.g. .p2-table-wrap--break-before) by
         opening a fresh sheet before placing the block — matches Puppeteer. */
      if (wantsBreakBefore(block) && currentInner.firstChild) {
        startNewSheet();
        s = currentInner;
      }
      s = placeNode(block, s);
      s = currentInner;
    }

    /* Cleanup: if everything fit on the letter, the template `.sheet--table`
       is still empty and should be dropped so no orphan sheet remains. */
    if (
      letterSection &&
      currentSheet === letterSection &&
      !templateInner.firstChild
    ) {
      parent.removeChild(template);
    }
  };

  runDistribution();

  /* Bounded verification: if the letter inner or any continuation inner still
     overflows after the first pass, redistribute. Capped at 3 passes. */
  for (let pass = 0; pass < 3; pass++) {
    const letterOverflows = (() => {
      if (!letterInner) return false;
      letterInner.getBoundingClientRect();
      return letterInner.scrollHeight > letterInner.clientHeight + 1;
    })();
    const tableOverflows = Array.from(
      doc.querySelectorAll('section.sheet.sheet--table > .sheet-inner--p2')
    ).some((el) => {
      const e = el as HTMLElement;
      e.getBoundingClientRect();
      return e.scrollHeight > e.clientHeight + 1;
    });
    if (!letterOverflows && !tableOverflows) break;
    runDistribution();
    if (pass === 2) {
      /* eslint-disable-next-line no-console */
      console.warn('repaginateTableSheets: overflow persists after 3 passes');
    }
  }

  if (savedRange) {
    try {
      const startC = (savedRange.startContainer as Node)?.isConnected;
      const endC = (savedRange.endContainer as Node)?.isConnected;
      if (startC && endC && sel) {
        sel.removeAllRanges();
        sel.addRange(savedRange);
      }
    } catch {
      /* range detached during DOM moves; harmless */
    }
  }

  const tableCount = doc.querySelectorAll('section.sheet.sheet--table').length;
  const letterCount = doc.querySelectorAll('section.sheet.sheet--letter').length;
  return { pages: Math.max(1, tableCount + letterCount) };
}

/** Count real `.sheet` siblings in the editor — the status bar source of truth. */
export function countEditorPages(doc: Document | null | undefined): number {
  if (!doc) return 1;
  const n = doc.querySelectorAll('section.sheet.sheet--letter, section.sheet.sheet--table').length;
  return Math.max(1, n);
}

/**
 * Build a paginated read-only render of canonical HTML into a target iframe
 * (Phase 7 preview layer). Uses the existing splitter on a disposable clone
 * — the source canonical doc is never touched. Designed to be called
 * (debounced) every time the edit pane's content changes.
 */
export function paginatePreviewDoc(
  iframe: HTMLIFrameElement | null,
  fullHtml: string,
  templatePrefix: string
): { pages: number } {
  if (!iframe) return { pages: 1 };
  const doc = iframe.contentDocument;
  if (!doc) return { pages: 1 };
  try {
    doc.open();
    doc.write(fullHtml);
    doc.close();
  } catch {
    return { pages: 1 };
  }
  try { injectPdfHeadIntoEditorDoc(doc, templatePrefix); } catch { /* */ }
  try { injectEditorPagedScreenCss(doc); } catch { /* */ }
  try { shiftPage1PaddingToSection(doc); } catch { /* */ }
  try { shiftPage2PaddingToSection(doc); } catch { /* */ }
  /* Read-only: block editing keystrokes but allow scroll + selection. */
  try {
    if (doc.body) doc.body.setAttribute('contenteditable', 'false');
    doc.documentElement.addEventListener('keydown', (e) => e.preventDefault(), true);
    doc.documentElement.addEventListener('beforeinput', (e) => e.preventDefault(), true);
    doc.documentElement.addEventListener('paste', (e) => e.preventDefault(), true);
  } catch { /* */ }
  try {
    const result = repaginateTableSheets(doc);
    return { pages: countEditorPages(doc) || result.pages || 1 };
  } catch {
    return { pages: countEditorPages(doc) };
  }
}

/**
 * Make stamp/signature/content images draggable in the editor; inline styles
 * (position, margins, width) are kept in HTML so saved templates print as edited.
 */
export function wireTemplateImagesForEditor(doc: Document | null | undefined): void {
  if (!doc?.body) return;
  doc.body.querySelectorAll('img').forEach((el) => {
    const img = el as HTMLImageElement;
    try {
      if (img.closest?.('[data-editor-only]')) return;
      if (img.classList.contains('letter-sheet-bg')) {
        img.draggable = false;
        return;
      }
      img.draggable = true;
      if (!img.style.cursor) img.style.cursor = 'grab';
    } catch {
      /* */
    }
  });
}

const LIVE_HTML_FINGERPRINT_DATA = (data: unknown) =>
  `${JSON.stringify(data ?? {}).slice(0, 80)}-${(data &&
    typeof data === 'object' &&
    data &&
    'format' in data &&
    (data as { format?: unknown }).format) ||
    ''}`;

export function persistLiveHtmlToLocalStorage(
  iframe: HTMLIFrameElement | null,
  docType: string,
  data: unknown
): void {
  if (
    !iframe?.contentDocument?.documentElement ||
    !iframe.src ||
    iframe.src.indexOf('about:blank') === 0
  )
    return;
  const html = sanitizeHtml(
    iframe.contentDocument.documentElement.outerHTML
  );
  persistLiveHtmlString(html, docType, data);
}

/** Persist merged full-document HTML (used by TinyMCE path). */
export function persistLiveHtmlString(
  html: string,
  docType: string,
  data: unknown
): void {
  const sanitized = sanitizeHtml(html);
  if (
    sanitized.length <= 400 ||
    !/<html[\s>]/i.test(sanitized) ||
    !/<\/html>/i.test(sanitized)
  )
    return;
  try {
    localStorage.setItem('pdfEditorLiveHtml', sanitized);
    localStorage.setItem('pdfEditorLiveDocType', docType || '');
    localStorage.setItem(
      'pdfEditorFingerprint',
      `${docType}-${LIVE_HTML_FINGERPRINT_DATA(data)}`
    );
  } catch (_) {
    /* quota */
  }
}

export function focusIframeDoc(iframe: HTMLIFrameElement | null): void {
  const w = iframe?.contentWindow;
  if (w?.focus) w.focus();
}

export function selectionCollapsed(iframe: HTMLIFrameElement | null): boolean {
  const d = iframe?.contentDocument;
  if (!d?.getSelection) return true;
  const sel = d.getSelection();
  return !sel!.rangeCount || !!sel!.isCollapsed;
}

export function applyFontStyleToInlineSelection(
  iframe: HTMLIFrameElement | null,
  css: { fontSize?: string; fontFamily?: string; color?: string }
): boolean {
  const d = iframe?.contentDocument;
  const w = iframe?.contentWindow;
  if (!d || !w || !css) return false;
  focusIframeDoc(iframe);
  const sel = d.getSelection();
  if (!sel?.rangeCount || sel.isCollapsed) return false;
  const span = d.createElement('span');
  if (css.fontSize)
    span.style.fontSize = css.fontSize.includes('pt')
      ? css.fontSize
      : `${css.fontSize}pt`;
  if (css.fontFamily) span.style.fontFamily = css.fontFamily;
  if (css.color) span.style.color = css.color;
  const range = sel.getRangeAt(0);
  try {
    range.surroundContents(span);
  } catch (_) {
    const frag = range.extractContents();
    span.appendChild(frag);
    range.insertNode(span);
  }
  sel.removeAllRanges();
  return true;
}

export function runCmd(
  iframe: HTMLIFrameElement | null,
  cmd: string,
  val: string | null = null,
  schedule: () => void
): void {
  const dw = iframe?.contentWindow;
  if (!dw) return;
  try {
    dw.focus();
    if (val != null) dw.document.execCommand(cmd, false, val);
    else dw.document.execCommand(cmd, false);
  } catch (_) {
    /* */
  }
  schedule();
}

export function getTableContextFromCaret(iframe: HTMLIFrameElement | null): {
  cell: HTMLElement | null;
  table: HTMLElement | null;
} {
  const d = iframe?.contentDocument;
  focusIframeDoc(iframe);
  if (!d?.getSelection || !d.getSelection()?.rangeCount)
    return { cell: null, table: null };
  let n = d.getSelection()?.anchorNode as Node | null;
  if (!n) return { cell: null, table: null };
  if (n.nodeType === Node.TEXT_NODE) n = (n.parentElement as Node | null)!;
  const el =
    n && (n as Node).nodeType === Node.ELEMENT_NODE
      ? (n as HTMLElement)
      : null;
  const cell = el?.closest?.('td') || el?.closest?.('th') || null;
  const table =
    cell && cell.closest?.('table') ? (cell.closest('table') as HTMLElement) : null;
  return { cell, table };
}

export function insertTableMarkup(rows: number, cols: number): string {
  let html = `
<table style="border-collapse:collapse;width:100%;margin:12px 0;border:1px solid #bdbdbd;">
<tbody>`;
  for (let r = 0; r < rows; r++) {
    html += '<tr>';
    for (let c = 0; c < cols; c++)
      html +=
        '<td style="border:1px solid #c8c6c4;padding:6px 8px;min-height:28px;vertical-align:top;">​</td>';
    html += '</tr>';
  }
  html += `</tbody></table><p>\u200b</p>`;
  return html.trim();
}

export function wireDesignMode(iframe: HTMLIFrameElement): void {
  const d = iframe.contentDocument;
  if (!d?.body) return;
  try {
    (d as Document & { designMode?: string }).designMode = 'on';
  } catch (_) {
    /* */
  }
  try {
    d.execCommand('styleWithCSS', false, 'true');
  } catch (_) {
    /* */
  }
  try {
    d.execCommand('defaultParagraphSeparator', false, 'p');
  } catch (_) {
    /* */
  }

  let ui = d.getElementById('tpl-word-ui');
  if (!ui) {
    ui = d.createElement('style');
    ui.id = 'tpl-word-ui';
    d.head?.appendChild(ui);
  }
  ui.textContent = `
    html { background: #fff; }
    body { margin: 0; }
    /* Design mode does not set contenteditable on nodes; keep rules global. */
    table { border-collapse: collapse; }
    td, th { min-height: 1em; vertical-align: top; }
    img { max-width: 100%; height: auto; vertical-align: middle; }
  `;

  Array.from(d.querySelectorAll('img')).forEach((img) => {
    try {
      (img as HTMLImageElement).contentEditable = 'false';
      img.draggable = false;
    } catch (_) {
      /* */
    }
  });
}

export function observeNewImages(
  iframe: HTMLIFrameElement,
  onAny: () => void
): () => void {
  const d = iframe.contentDocument?.body;
  if (!d) return () => {};
  const obs = new MutationObserver((records) => {
    let touched = false;
    records.forEach((rec) => {
      rec.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const el = node as HTMLElement;
        const imgs =
          el.tagName === 'IMG'
            ? [el as HTMLImageElement]
            : Array.from(el.querySelectorAll?.('img') ?? []);
        imgs.forEach((img) => {
          try {
            img.contentEditable = 'false';
            img.draggable = false;
          } catch (_) {
            /* */
          }
          touched = true;
        });
      });
    });
    if (touched) onAny();
  });
  obs.observe(d, { childList: true, subtree: true });
  return () => obs.disconnect();
}
