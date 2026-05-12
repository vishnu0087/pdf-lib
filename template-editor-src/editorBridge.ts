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
  return String(html)
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '');
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
    /* Each page is its own stacking context so absolutes cannot paint over the next sheet */
    .sheet.sheet--letter,
    .sheet.sheet--table {
      width: 210mm;
      max-width: 100%;
      min-height: 297mm;
      height: auto !important;
      margin: 0 !important;
      flex: 0 0 auto;
      box-sizing: border-box !important;
      background-color: #ffffff !important;
      /* Inline styles may set repeat-y on continuation sheet; PDF uses @page art instead */
      background-repeat: no-repeat !important;
      background-position: top left !important;
      box-shadow:
        0 0 0 1px rgba(0,0,0,0.12),
        0 4px 6px rgba(0,0,0,0.08),
        0 12px 28px rgba(0,0,0,0.18);
      break-after: page;
      page-break-after: always;
      position: relative !important;
      overflow: visible !important;
      display: block;
      isolation: isolate !important;
    }
    .sheet-inner--p1,
    .sheet-inner--p2 {
      position: relative;
      z-index: 1;
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
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

/**
 * Make stamp/signature/content images draggable in the editor; inline styles
 * (position, margins, width) are kept in HTML so saved templates print as edited.
 */
export function wireTemplateImagesForEditor(doc: Document | null | undefined): void {
  if (!doc?.body) return;
  doc.body.querySelectorAll('img').forEach((el) => {
    const img = el as HTMLImageElement;
    try {
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
