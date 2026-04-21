/**
 * Sales order PDF: same shell as quote (background + not_approved on page 1).
 * Supports puppeteer-sales-pdf (page2.afterTable) and flat pdfmake-style JSON (content + styles).
 * Body flows from page 1 (no blank first sheet).
 */

import {
  isQuoteGrandTotalsShellBlock,
  LINE_ITEMS_COLUMN_SIZING_AUTO,
  LINE_ITEMS_COLUMN_SIZING_FIXED,
  renderAfterTableBlocks,
  renderPage1InnerHtml,
  renderPage1InnerStyle,
} from './render-quote-html.js';

function deepCloneJson(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Flat `s-data.json` → same shape as `s-data1.json` (puppeteer-sales-pdf).
 */
export function normalizeSalesData(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  if (raw.format === 'puppeteer-sales-pdf') {
    return raw;
  }
  if (Array.isArray(raw.content)) {
    const m = raw.pageMargins || [24, 100, 32, 60];
    const inset = {
      left: Number(m[0]) || 24,
      top: Number(m[1]) || 100,
      right: Number(m[2]) || 32,
      bottom: Math.max(Number(m[3]) || 60, 60),
    };
    return {
      format: 'puppeteer-sales-pdf',
      formatVersion: 1,
      document: {
        defaultStyle: raw.defaultStyle || { font: 'Montserrat', fontSize: 8 },
        styles: raw.styles || {},
        pdfFontScale: 0.92,
        ...(typeof raw.lineItemsColumnSizing === 'string'
          ? { lineItemsColumnSizing: raw.lineItemsColumnSizing }
          : {}),
      },
      page1: {
        blocks: [],
        contentInsetPt: inset,
      },
      page2: {
        enabled: true,
        fontScale: 1,
        contentInsetPt: inset,
        tableBody: [],
        afterTable: raw.content,
      },
    };
  }
  return raw;
}

/** Map pdfmake defaultStyle + ensure pdfFontScale for shared inset/typography helpers. */
function normalizeSalesShell(data) {
  const out = deepCloneJson(data);
  const ds = out.document?.defaultStyle;
  if (ds) {
    if (ds.font && !ds.fontFamily) ds.fontFamily = ds.font;
    if (ds.fontSize != null && ds.fontSizePt == null) ds.fontSizePt = ds.fontSize;
  }
  if (out.document && typeof out.document.pdfFontScale !== 'number') {
    out.document.pdfFontScale = 0.92;
  }
  return out;
}

/**
 * Merge `document.styles[name]` into nodes that carry `style: "name"` (pdfmake convention).
 */
function applyNamedStyles(node, styles) {
  if (node == null) return node;
  if (typeof node !== 'object') return node;
  if (Array.isArray(node)) {
    return node.map((n) => applyNamedStyles(n, styles));
  }

  let result = { ...node };
  if (typeof result.style === 'string' && styles?.[result.style]) {
    result = { ...styles[result.style], ...result };
    delete result.style;
  }

  if (result.stack) {
    result.stack = result.stack.map((n) => applyNamedStyles(n, styles));
  }
  if (result.ul) {
    result.ul = result.ul.map((n) => applyNamedStyles(n, styles));
  }
  if (result.ol) {
    result.ol = result.ol.map((n) => applyNamedStyles(n, styles));
  }
  if (result.columns) {
    result.columns = result.columns.map((n) => applyNamedStyles(n, styles));
  }
  if (result.table?.body) {
    result.table = {
      ...result.table,
      body: result.table.body.map((row) =>
        Array.isArray(row)
          ? row.map((cell) => {
              if (Array.isArray(cell)) {
                return cell.map((c) => applyNamedStyles(c, styles));
              }
              return applyNamedStyles(cell, styles);
            })
          : row
      ),
    };
  }
  if (Array.isArray(result.text)) {
    result.text = result.text.map((t) =>
      typeof t === 'object' && t !== null ? applyNamedStyles(t, styles) : t
    );
  }
  return result;
}

/** Rewrite private asset paths so render-quote-html can load stamps from /assests. */
function normalizeImagePaths(node) {
  if (node == null) return node;
  if (typeof node !== 'object') return node;
  if (Array.isArray(node)) {
    return node.map((n) => normalizeImagePaths(n));
  }
  const out = { ...node };
  if (out.image && typeof out.image === 'string') {
    const s = out.image.replace(/\\/g, '/');
    if (s.includes('not_approved_stamp')) {
      out.image = '/assests/not_approved_stamp.png';
    } else if (s.includes('not_approved.png')) {
      out.image = '/assests/not_approved.png';
    }
  }
  if (out.stack) out.stack = out.stack.map((n) => normalizeImagePaths(n));
  if (out.ul) out.ul = out.ul.map((n) => normalizeImagePaths(n));
  if (out.ol) out.ol = out.ol.map((n) => normalizeImagePaths(n));
  if (out.columns) out.columns = out.columns.map((n) => normalizeImagePaths(n));
  if (out.table?.body) {
    out.table = {
      ...out.table,
      body: out.table.body.map((row) =>
        Array.isArray(row)
          ? row.map((cell) =>
              Array.isArray(cell)
                ? cell.map((c) => normalizeImagePaths(c))
                : normalizeImagePaths(cell)
            )
          : row
      ),
    };
  }
  if (Array.isArray(out.text)) {
    out.text = out.text.map((t) =>
      typeof t === 'object' && t !== null ? normalizeImagePaths(t) : t
    );
  }
  return out;
}

function isDuplicatePage1StampBlock(block) {
  if (!block || typeof block !== 'object' || !block.image) return false;
  const s = String(block.image).replace(/\\/g, '/');
  return s.includes('not_approved.png') && !s.includes('stamp');
}

function prepareAfterTableBlocks(data) {
  const styles = data.document?.styles;
  let blocks = Array.isArray(data.page2?.afterTable)
    ? data.page2.afterTable.map((b) => {
        const markMainItems = b?.style === 'itemsTable';
        const out = normalizeImagePaths(applyNamedStyles(b, styles));
        if (markMainItems) out._salesMainItemsTable = true;
        return out;
      })
    : [];

  if (blocks.length && isDuplicatePage1StampBlock(blocks[0])) {
    blocks = blocks.slice(1);
  }
  return blocks;
}

/**
 * When the main line-items block is immediately followed by the star/auto grand-total block,
 * group them so the totals sit flush under the line-items frame (same as Quote PDF).
 */
function splitSalesLineItemsAndGrandTotals(blocks) {
  if (!Array.isArray(blocks) || blocks.length < 2) {
    return { useShell: false, before: blocks || [], itemsBlock: null, totalsBlock: null, after: [] };
  }
  const idx = blocks.findIndex((b) => b && b._salesMainItemsTable === true);
  if (idx < 0 || idx >= blocks.length - 1) {
    return { useShell: false, before: blocks, itemsBlock: null, totalsBlock: null, after: [] };
  }
  const totalsBlock = blocks[idx + 1];
  if (!isQuoteGrandTotalsShellBlock(totalsBlock)) {
    return { useShell: false, before: blocks, itemsBlock: null, totalsBlock: null, after: [] };
  }
  return {
    useShell: true,
    before: blocks.slice(0, idx),
    itemsBlock: blocks[idx],
    totalsBlock,
    after: blocks.slice(idx + 2),
  };
}

/**
 * @param {object} data Parsed sales JSON (flat or puppeteer-sales-pdf)
 * @param {string} baseUrl Origin for assets
 * @returns {{ letterInnerHtml: string, tableFlowInnerHtml: string, letterInnerStyle?: string, tableSheetStyle?: string, tableInnerStyle?: string }}
 */
export function renderSalesDocumentParts(data, baseUrl) {
  const normalized = normalizeSalesData(data);
  const shellData = normalizeSalesShell(normalized);
  const p2 = shellData.page2;
  const scale =
    typeof p2?.fontScale === 'number' && p2.fontScale > 0 ? p2.fontScale : 1;
  const pdfFontScale =
    typeof shellData.document?.pdfFontScale === 'number'
      ? shellData.document.pdfFontScale
      : 0.92;
  const lineItemsColumnSizing =
    shellData.document?.lineItemsColumnSizing === LINE_ITEMS_COLUMN_SIZING_FIXED
      ? LINE_ITEMS_COLUMN_SIZING_FIXED
      : LINE_ITEMS_COLUMN_SIZING_AUTO;
  const opts = {
    scale,
    baseUrl: baseUrl || '',
    pdfFontScale,
    salesPdf: true,
    lineItemsColumnSizing,
  };

  const afterBlocks = prepareAfterTableBlocks(shellData);
  const split = splitSalesLineItemsAndGrandTotals(afterBlocks);
  let bodyInner = '';
  if (afterBlocks.length > 0) {
    if (split.useShell && split.itemsBlock && split.totalsBlock) {
      const beforeH = renderAfterTableBlocks(split.before, opts);
      const itemsH = renderAfterTableBlocks([split.itemsBlock], opts);
      const totalsH = renderAfterTableBlocks([split.totalsBlock], opts);
      const afterH = renderAfterTableBlocks(split.after, opts);
      const shell = `<div class="p2-sales-line-items-shell">${itemsH}<div class="p2-after-table p2-after-table--sales p2-after-table--flush-totals">${totalsH}</div></div>`;
      bodyInner = [beforeH, shell, afterH].filter(Boolean).join('\n');
    } else {
      bodyInner = renderAfterTableBlocks(afterBlocks, opts);
    }
  }

  const p1Fragments = renderPage1InnerHtml(shellData) || '';
  const bodyWrapped = bodyInner
    ? `<div class="p2-table-wrap"><div class="p2-after-table p2-after-table--sales">${bodyInner}</div></div>`
    : '';

  return {
    letterInnerHtml: p1Fragments + bodyWrapped,
    tableFlowInnerHtml: '',
    letterInnerStyle: renderPage1InnerStyle(shellData) || undefined,
    tableSheetStyle: undefined,
    tableInnerStyle: undefined,
  };
}
