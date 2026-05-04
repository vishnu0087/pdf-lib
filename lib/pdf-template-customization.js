/**
 * Extract and apply PDF template overlays (stored under new-template/).
 * Does not replace user JSON wholesale — merges typography / column titles / optional row padding.
 */

import { normalizeTableRow } from './render-quote-html.js';
import { normalizeSalesData } from './render-sales-html.js';
import { normalizeInvoiceData } from './render-invoice-html.js';
import { normalizeSalaryData } from './render-salary-html.js';

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function deepMerge(target, source) {
  if (source == null || typeof source !== 'object') return target;
  if (Array.isArray(source)) return source;
  if (target == null || typeof target !== 'object') {
    target = {};
  }
  for (const k of Object.keys(source)) {
    const sv = source[k];
    const tv = target[k];
    if (
      sv &&
      typeof sv === 'object' &&
      !Array.isArray(sv) &&
      tv &&
      typeof tv === 'object' &&
      !Array.isArray(tv)
    ) {
      target[k] = deepMerge({ ...tv }, sv);
    } else if (sv !== undefined) {
      target[k] = sv;
    }
  }
  return target;
}

function normalizeQuoteShell(doc) {
  const out = deepClone(doc);
  if (out.document && typeof out.document.pdfFontScale !== 'number') {
    out.document.pdfFontScale = 0.92;
  }
  return out;
}

function normalizeSalesShellLike(data) {
  const out = deepClone(data);
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

/** First block with style itemsTable inside page2.afterTable */
export function findAfterTableItemsTable(afterTable) {
  if (!Array.isArray(afterTable)) return null;
  for (let i = 0; i < afterTable.length; i++) {
    const b = afterTable[i];
    if (
      b &&
      typeof b === 'object' &&
      b.style === 'itemsTable' &&
      b.table &&
      Array.isArray(b.table.body) &&
      b.table.body.length > 0
    ) {
      return { blockIndex: i, table: b.table };
    }
  }
  return null;
}

function normalizePathFor(docType, data) {
  if (docType === 'sales') return normalizeSalesShellLike(normalizeSalesData(deepClone(data)));
  if (docType === 'invoice') return normalizeSalesShellLike(normalizeInvoiceData(deepClone(data)));
  if (docType === 'salary') return normalizeSalaryData(deepClone(data));
  if (docType === 'quote') return normalizeQuoteShell(deepClone(data));
  return deepClone(data);
}

function flattenHeaderTextsFromCells(cells, max) {
  const out = [];
  for (let i = 0; i < cells.length && out.length < max; i++) {
    const c = cells[i];
    if (
      Array.isArray(c) ||
      c == null ||
      (typeof c === 'object' && c.stack)
    )
      continue;
    if (typeof c === 'object' && c.table) continue;
    const t = typeof c?.text === 'string' ? c.text : c?.text != null ? String(c.text) : '';
    out.push(t);
  }
  return out;
}

/** @typedef {{ document?: { defaultStyle?: object, styles?: object, pdfFontScale?: number }, quote?: { columnHeaders?: string[], extraRowsBelowHeader?: number }, afterTableItems?: { columnHeaders?: string[], extraDataRows?: number } }} TemplateOverrides */

/** Ensure quote line-item thead cells inherit `document.styles.tableHeader` (quoted shell does not run pdfmerge on these cells). */
function patchQuoteTableHeaderCellsFromStyles(data) {
  const th = data.document?.styles?.tableHeader;
  if (
    !th ||
    typeof th !== 'object' ||
    !Array.isArray(data.page2?.tableBody?.[0])
  )
    return;
  const row0 = data.page2.tableBody[0];
  for (const cell of row0) {
    if (!cell || Array.isArray(cell) || cell.style !== 'tableHeader') continue;
    if (th.fillColor != null) cell.fillColor = th.fillColor;
    if (th.color != null) cell.color = th.color;
    if (th.fontSize != null) cell.fontSize = th.fontSize;
    if (th.bold === true) cell.bold = true;
  }
}

/**
 * Build template overrides from current user data (for editor defaults).
 * @param {string} docType
 * @param {object} data
 * @returns {TemplateOverrides}
 */
export function extractTemplateDefaults(docType, data) {
  const norm = normalizePathFor(docType, data);
  /** @type {TemplateOverrides} */
  const overrides = {
    document: {
      defaultStyle: { ...(norm.document?.defaultStyle || {}) },
      styles: {
        tableHeader: { ...(norm.document?.styles?.tableHeader || {}) },
      },
    },
  };

  if (docType === 'quote') {
    const row0 = norm.page2?.tableBody?.[0];
    const cells = row0 && Array.isArray(row0) ? normalizeTableRow(row0) : [];
    const hdr = cells.filter((c) => c?.style === 'tableHeader').map((c) =>
      typeof c?.text === 'string' ? c.text : c?.text != null ? String(c.text) : ''
    );
    overrides.quote = {
      columnHeaders: hdr.length
        ? hdr
        : flattenHeaderTextsFromCells(cells, 32),
      extraRowsBelowHeader: 0,
    };
  } else if (docType === 'sales' || docType === 'invoice') {
    const found = findAfterTableItemsTable(norm.page2?.afterTable || []);
    if (found?.table.body?.[0]) {
      const row0 = found.table.body[0];
      const hdr = row0.map((cell) =>
        typeof cell?.text === 'string' ? cell.text : ''
      );
      overrides.afterTableItems = {
        columnHeaders: hdr,
        extraDataRows: 0,
      };
    } else {
      overrides.afterTableItems = { columnHeaders: [], extraDataRows: 0 };
    }
  }

  return overrides;
}

/** Apply patches to quote page2.tableBody[0] header cells matching tableHeader */
function patchQuoteHeadersRow(rowZero, texts) {
  if (!Array.isArray(rowZero) || !Array.isArray(texts)) return;
  let ti = 0;
  for (let ci = 0; ci < rowZero.length && ti < texts.length; ci++) {
    const cell = rowZero[ci];
    if (Array.isArray(cell)) continue;
    if (!cell || cell.style !== 'tableHeader') continue;
    rowZero[ci] = {
      ...cell,
      text: texts[ti++],
    };
  }
}

function cloneRowSkeleton(row) {
  return JSON.parse(JSON.stringify(row));
}

/**
 * Strip cell text-ish content for spacer rows — keep layout only.
 */
function blankRowTexts(row) {
  const r = cloneRowSkeleton(row);
  if (!Array.isArray(r)) return r;

  function visitCell(cell) {
    if (cell == null) return cell;
    if (Array.isArray(cell)) return cell.map(visitCell);
    if (typeof cell !== 'object') return cell;
    const next = { ...cell };
    if (typeof next.text === 'string') next.text = '';
    if ('text' in next && next.text !== undefined && typeof next.text !== 'string')
      delete next.text;
    if (next.stack) next.stack = next.stack.map(visitCell);
    if (next.ul) next.ul = next.ul.map(visitCell);
    if (next.ol) next.ol = next.ol.map(visitCell);
    if (next.columns) next.columns = next.columns.map(visitCell);
    if (next.table?.body)
      next.table = {
        ...next.table,
        body: next.table.body.map((row) =>
          Array.isArray(row) ? row.map(visitCell) : visitCell(row)
        ),
      };
    return next;
  }

  if (!Array.isArray(r)) return r;
  return r.map((cell) =>
    Array.isArray(cell)
      ? cell.map(visitCell)
      : visitCell(cell)
  );
}

/**
 * @param {string} docType
 * @param {object} data - user PDF JSON
 * @param {TemplateOverrides} overrides
 */
export function applyTemplateOverrides(docType, data, overrides) {
  if (!overrides || typeof overrides !== 'object') return deepClone(data);
  const clean = { ...overrides };
  delete clean._liveHtml;
  delete clean._placeholderTokenMap;
  let out = deepClone(data);

  if (clean.document && typeof clean.document === 'object') {
    out.document = out.document || {};
    if (clean.document.defaultStyle) {
      out.document.defaultStyle = deepMerge(
        { ...(out.document.defaultStyle || {}) },
        clean.document.defaultStyle
      );
    }
    if (clean.document.styles) {
      out.document.styles = deepMerge({ ...(out.document.styles || {}) }, clean.document.styles);
    }
    patchQuoteTableHeaderCellsFromStyles(out);
    if (
      clean.document.pdfFontScale != null &&
      typeof clean.document.pdfFontScale === 'number'
    ) {
      out.document.pdfFontScale = clean.document.pdfFontScale;
    }
  }

  if (
    clean.quote?.columnHeaders?.length &&
    docType === 'quote' &&
    out.page2?.tableBody?.[0]
  ) {
    patchQuoteHeadersRow(out.page2.tableBody[0], clean.quote.columnHeaders);
  }

  const extraHdr =
    docType === 'quote'
      ? Math.min(50, Math.max(0, Number(clean.quote?.extraRowsBelowHeader) || 0))
      : 0;
  if (
    extraHdr > 0 &&
    docType === 'quote' &&
    Array.isArray(out.page2?.tableBody) &&
    out.page2.tableBody.length > 1
  ) {
    const tpl = cloneRowSkeleton(out.page2.tableBody[1]);
    const blank = blankRowTexts(tpl);
    for (let i = 0; i < extraHdr; i++) {
      out.page2.tableBody.splice(2, 0, cloneRowSkeleton(blank));
    }
  }

  const itemsPatch = clean.afterTableItems;
  if (
    (docType === 'sales' || docType === 'invoice') &&
    itemsPatch?.columnHeaders?.length &&
    out.page2?.afterTable
  ) {
    const found = findAfterTableItemsTable(out.page2.afterTable);
    if (found?.table.body?.[0]) {
      const row0 = found.table.body[0];
      for (
        let i = 0;
        i < row0.length && i < itemsPatch.columnHeaders.length;
        i++
      ) {
        if (typeof row0[i] === 'object' && row0[i] !== null) {
          row0[i] = {
            ...row0[i],
            text: itemsPatch.columnHeaders[i],
          };
        }
      }
      const pad = Math.min(50, Math.max(0, Number(itemsPatch.extraDataRows) || 0));
      if (
        pad > 0 &&
        found.table.body.length > 1
      ) {
        const tmpl = blankRowTexts(cloneRowSkeleton(found.table.body[1]));
        for (let p = 0; p < pad; p++) {
          found.table.body.push(cloneRowSkeleton(tmpl));
        }
      }
    }
  }

  return out;
}
