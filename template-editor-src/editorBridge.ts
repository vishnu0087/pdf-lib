/** Iframe DOM + persistence bridge (no JSX). Puppeteer consumes saved HTML verbatim. */

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
      background: #525659 !important;
    }
    /* Flex column prevents margin-collapsing so sheets never visually merge */
    body {
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      gap: 36px !important;
      margin: 0 !important;
      padding: 28px 0 44px !important;
      background: #525659 !important;
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
  `.trim();
}

/** A4 portrait at 96dpi: 297mm * 96 / 25.4 ≈ 1122.52px. Matches Puppeteer's PDF_VIEWPORT.height. */
const EDITOR_A4_PAGE_HEIGHT_PX = (297 * 96) / 25.4;

/**
 * Editor-only one-shot: copies the cascaded padding from `.sheet-inner--p1` onto its
 * parent `.sheet--letter` and zeroes inner padding. After this, both `.sheet--letter`
 * and `.sheet--table` share the same geometry (section carries padding, inner is the
 * safe area itself), so `overflow: hidden` on the inner correctly clips at the
 * footer-band boundary on every page.
 *
 * Print-safe: `<img class="letter-sheet-bg">` and the not-approved stamp are both
 * `position: absolute`, anchored to the section's padding-box, so they don't shift.
 *
 * Idempotent: skips sections that already carry an explicit inline `padding`.
 */
export function shiftPage1PaddingToSection(doc: Document | null | undefined): void {
  if (!doc) return;
  const w = (doc.defaultView ?? null) as (Window & typeof globalThis) | null;
  if (!w) return;
  const letters = doc.querySelectorAll('section.sheet.sheet--letter');
  letters.forEach((s) => {
    const section = s as HTMLElement;
    const inner = section.querySelector(':scope > .sheet-inner--p1') as HTMLElement | null;
    if (!inner) return;
    const existing = (section.style.padding || '').trim();
    if (existing && existing !== '0' && existing !== '0px') return;
    try {
      const cs = w.getComputedStyle(inner);
      const padT = cs.paddingTop || '0';
      const padR = cs.paddingRight || '0';
      const padB = cs.paddingBottom || '0';
      const padL = cs.paddingLeft || '0';
      if (padT === '0px' && padR === '0px' && padB === '0px' && padL === '0px') return;
      section.style.padding = `${padT} ${padR} ${padB} ${padL}`;
      inner.style.padding = '0';
    } catch {
      /* */
    }
  });
}

/** Elements that should be split open when their content overflows. */
const SPLITTABLE_TAGS = new Set([
  'div', 'section', 'article', 'main', 'aside', 'ul', 'ol', 'dl', 'tbody',
]);
/** Elements treated as atomic (moved whole, never split). */
const ATOMIC_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
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
  const all = Array.from(
    doc.querySelectorAll('section.sheet.sheet--table')
  ) as HTMLElement[];
  if (all.length === 0) {
    const letters = doc.querySelectorAll('section.sheet.sheet--letter').length;
    return { pages: Math.max(1, letters) };
  }

  const sel = doc.getSelection ? doc.getSelection() : null;
  let savedRange: Range | null = null;
  if (sel && sel.rangeCount > 0) {
    try {
      savedRange = sel.getRangeAt(0).cloneRange();
    } catch {
      savedRange = null;
    }
  }

  const template = all[0];
  const innerSelector = ':scope > .sheet-inner--p2';
  const templateInner = template.querySelector(innerSelector) as HTMLElement | null;
  if (!templateInner) return { pages: 1 + all.length };

  const parent = template.parentNode;
  if (!parent) return { pages: 1 + all.length };

  /* Capture every top-level block across all existing sheets, preserving order. */
  const topBlocks: ChildNode[] = [];
  all.forEach((s) => {
    const innerEl = s.querySelector(innerSelector) as HTMLElement | null;
    if (!innerEl) return;
    Array.from(innerEl.childNodes).forEach((n) => topBlocks.push(n));
  });

  /* Remove sibling sheets and clear the template's inner to redistribute. */
  for (let i = all.length - 1; i >= 1; i--) parent.removeChild(all[i]);
  while (templateInner.firstChild) templateInner.removeChild(templateInner.firstChild);

  /* Mutable state shared by the recursive helpers. */
  let currentSheet: HTMLElement = template;
  let currentInner: HTMLElement = templateInner;
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
  const isSplittable = (n: Node) => {
    if (!isElement(n)) return false;
    const t = tagOf(n);
    if (ATOMIC_TAGS.has(t)) return false;
    return SPLITTABLE_TAGS.has(t);
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

    if (isTable(node)) return splitTable(node as HTMLElement, slot);
    if (isSplittable(node) && node.childNodes.length > 0) {
      return splitContainer(node as HTMLElement, slot);
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

    let sub: HTMLElement = empty;
    for (const child of children) sub = placeNode(child, sub);

    /* Climb back to slot's depth so the caller can place its next sibling. */
    const slotDepth = depthFrom(slot, currentInner);
    let result: HTMLElement | null = sub;
    while (result && depthFrom(result, currentInner) > slotDepth) {
      result = result.parentElement;
    }
    return result || slot;
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
    const tbody = table.querySelector(':scope > tbody') as HTMLElement | null;
    if (!tbody || tbody.children.length === 0) {
      /* No tbody (or empty) — treat as atomic. */
      if (!currentInner.firstChild) {
        slot.appendChild(table);
        return slot;
      }
      const onlySlot = startNewSheetWithChain(slot);
      onlySlot.appendChild(table);
      return onlySlot;
    }
    const rows = Array.from(tbody.children) as HTMLElement[];

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
          /* This row alone overflows: leave it and move on to a new sheet for
             the next row to avoid an infinite empty-table loop. */
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

  /* Distribute every captured top-level block sequentially. After each block
     is placed, reset the slot to currentInner so the next top-level block
     starts a fresh wrapper chain (matching the source structure). */
  let slot: HTMLElement = currentInner;
  for (const block of topBlocks) {
    slot = placeNode(block, slot);
    slot = currentInner;
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
