/** Phase 10c — Quote semantic chip catalog + in-place chipifier.
 *  Replaces fixture VALUES in the rendered Quote HTML with semantically-
 *  named chip spans. The surrounding document structure (header, footer,
 *  watermark, tables, totals, bank/terms sections, all styling) stays
 *  exactly as the existing renderer emits it.
 *
 *  Inline scalar fields are textually replaced (longest-first to mitigate
 *  substring collisions). The customer address text is parsed into its
 *  semantic pieces (name / company / address / GSTIN / phone / email) so
 *  each piece becomes its own chip. The letter body's inner content is
 *  collapsed to a single <Letter Body> chip inside the existing wrapper.
 *  The line-items table is DOMParser-traversed and each data cell is
 *  replaced with a column-mapped chip carrying data-tpl-row + data-tpl-col
 *  so the PDF resolver can look up per-cell runtime values. */

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function pickBlock(data, id) {
  const blocks = data && data.page1 && data.page1.blocks;
  if (!Array.isArray(blocks)) return null;
  return blocks.find((b) => b && b.id === id) || null;
}
function pickColumn(data, blockId, columnId) {
  const block = pickBlock(data, blockId);
  const cols = block && block.columns;
  if (!Array.isArray(cols)) return null;
  return cols.find((c) => c && c.id === columnId) || null;
}
function pickStackItem(data, columnId, index) {
  const col = pickColumn(data, 'address_and_meta_row', columnId);
  const items = col && col.items;
  if (!Array.isArray(items)) return null;
  return items[index] || null;
}
function matchLabelled(lines, re) {
  const hit = (lines || []).find((l) => re.test(l));
  return hit ? hit.replace(re, '').trim() : '';
}

/** Inline scalar chips — direct JSON-path resolves. */
export const QUOTE_SEMANTIC_INLINE = [
  {
    token: 'QUOTATION_TITLE', label: 'Quotation Title', group: 'Document',
    resolve: (d) => (pickBlock(d, 'title_quote') || {}).text,
  },
  {
    token: 'QUOTATION_NUMBER', label: 'Quotation Number', group: 'Document',
    resolve: (d) => (pickStackItem(d, 'quote_meta', 0) || {}).text,
  },
  {
    token: 'QUOTATION_DATE', label: 'Date', group: 'Document',
    resolve: (d) => (pickStackItem(d, 'quote_meta', 1) || {}).text,
  },
  {
    token: 'PREPARED_BY', label: 'Prepared By', group: 'Document',
    resolve: (d) =>
      ((pickStackItem(d, 'quote_meta', 2) || {}).text || '')
        .replace(/^Prepared by:\s*/i, ''),
  },
];

/** Customer-address parsing — splits the address text into semantic pieces. */
export const QUOTE_ADDRESS_CHIPS = [
  { token: 'CUSTOMER_NAME',          label: 'Customer Name', group: 'Customer',
    extract: (lines) => (lines[0] || '') },
  { token: 'CUSTOMER_COMPANY',       label: 'Customer Company', group: 'Customer',
    extract: (lines) => (lines[1] || '') },
  { token: 'CUSTOMER_ADDRESS',       label: 'Customer Address', group: 'Customer',
    extract: (lines) =>
      (lines || [])
        .slice(2)
        .filter((l) => !/^(GSTIN|Phone|Email)\s*:/i.test(l))
        .join('\n') },
  { token: 'GSTIN',                  label: 'GSTIN', group: 'Customer',
    extract: (lines) => matchLabelled(lines, /^GSTIN\s*:\s*/i) },
  { token: 'COMPANY_CONTACT_NUMBER', label: 'Company Contact Number', group: 'Customer',
    extract: (lines) => matchLabelled(lines, /^Phone\s*:\s*/i) },
  { token: 'CUSTOMER_EMAIL',         label: 'Customer Email', group: 'Customer',
    extract: (lines) => matchLabelled(lines, /^Email\s*:\s*/i) },
];

/** Line-items table — column index → semantic chip mapping. */
export const QUOTE_LINE_ITEMS_COLUMNS = {
  2: { token: 'PRODUCT_NAME',  label: 'Product Name',  group: 'Line item' },
  3: { token: 'HSN',           label: 'HSN',           group: 'Line item' },
  4: { token: 'PRODUCT_PRICE', label: 'Product Price', group: 'Line item' },
  5: { token: 'QUANTITY',      label: 'Quantity',      group: 'Line item' },
  6: { token: 'DISCOUNT',      label: 'Discount',      group: 'Line item' },
  7: { token: 'PRODUCT_TOTAL', label: 'Product Total', group: 'Line item' },
};

/** Lookup a runtime value for a Quote semantic chip token. */
export function getSemanticChipValue(token, data) {
  const inline = QUOTE_SEMANTIC_INLINE.find((x) => x.token === token);
  if (inline) {
    try {
      const v = inline.resolve(data);
      return v == null ? '' : String(v);
    } catch {
      return '';
    }
  }
  const col = pickColumn(data, 'address_and_meta_row', 'customer_address');
  const addrText = col && col.text;
  if (typeof addrText === 'string') {
    const lines = addrText.split(/\r?\n/).map((s) => s.trim());
    const addr = QUOTE_ADDRESS_CHIPS.find((x) => x.token === token);
    if (addr) {
      try {
        const v = addr.extract(lines);
        return v == null ? '' : String(v);
      } catch {
        return '';
      }
    }
  }
  return '';
}

/** Lookup a runtime cell value for a Quote line-items chip via row/col. */
export function getQuoteCellValue(data, row, col) {
  const rows = data && data.page2 && data.page2.tableBody;
  if (!Array.isArray(rows)) return '';
  const r = rows[row];
  if (!Array.isArray(r)) return '';
  const cell = r[col];
  if (cell == null) return '';
  if (typeof cell === 'string') return cell;
  if (typeof cell === 'object' && typeof cell.text === 'string') return cell.text;
  return '';
}

function chipSpan(token, label) {
  return (
    '<span class="tpl-var" data-tpl-var="' + escapeAttr(token) +
    '" contenteditable="false">' + escapeAttr(label) + '</span>'
  );
}
function chipCellSpan(token, label, row, col) {
  return (
    '<span class="tpl-var" data-tpl-var="' + escapeAttr(token) +
    '" data-tpl-row="' + row + '" data-tpl-col="' + col +
    '" contenteditable="false">' + escapeAttr(label) + '</span>'
  );
}

/** Walk every `<table class="qt-html-table">` in the HTML, replace each
 *  data-row cell with a column-semantic chip carrying row/col metadata.
 *  Rows whose first cell has colspan > 1 (section / banner / spacer rows)
 *  are skipped — those visual breaks stay untouched. */
function chipifyQuoteLineItemsTable(html, data) {
  if (typeof DOMParser === 'undefined') return html;
  try {
    const dp = new DOMParser();
    const wrapped = '<!DOCTYPE html><html><body><div id="tpl-root">' + html + '</div></body></html>';
    const doc = dp.parseFromString(wrapped, 'text/html');
    const root = doc.getElementById('tpl-root');
    if (!root) return html;
    const tables = root.querySelectorAll('table.qt-html-table');
    const rowsData = data && data.page2 && data.page2.tableBody;
    tables.forEach((table) => {
      const tbodies = table.querySelectorAll(':scope > tbody');
      let rowIndex = 0;
      tbodies.forEach((tb) => {
        const trs = tb.querySelectorAll(':scope > tr');
        trs.forEach((tr) => {
          const firstCell = tr.querySelector(':scope > td, :scope > th');
          const colSpanAttr =
            firstCell && firstCell.getAttribute
              ? firstCell.getAttribute('colspan')
              : null;
          const colSpan = colSpanAttr ? parseInt(colSpanAttr, 10) : 1;
          if (colSpan > 1) { rowIndex++; return; }
          const cells = tr.querySelectorAll(':scope > td, :scope > th');
          cells.forEach((cell, colIdx) => {
            const mapping = QUOTE_LINE_ITEMS_COLUMNS[colIdx];
            if (!mapping) return;
            const fixtureRow = Array.isArray(rowsData) ? rowsData[rowIndex] : null;
            const fixtureCell = Array.isArray(fixtureRow) ? fixtureRow[colIdx] : null;
            const hasValue =
              typeof fixtureCell === 'string'
                ? fixtureCell.length > 0
                : !!(fixtureCell && typeof fixtureCell === 'object' && fixtureCell.text);
            if (!hasValue) return;
            cell.innerHTML = chipCellSpan(mapping.token, mapping.label, rowIndex, colIdx);
          });
          rowIndex++;
        });
      });
    });
    return root.innerHTML;
  } catch {
    return html;
  }
}

/** Top-level entry: chipify a freshly-rendered Quote HTML body in place. */
export function chipifyQuoteEditorHtml(html, data) {
  if (typeof html !== 'string' || !html) return html;
  let out = html;

  /* (1) Inline scalar chips — textual replacement, longest-first. */
  const inlineEntries = QUOTE_SEMANTIC_INLINE
    .map((c) => {
      let v;
      try { v = String(c.resolve(data) == null ? '' : c.resolve(data)); }
      catch { v = ''; }
      const needle = escapeHtml(v);
      if (!needle || needle.length < 2) return null;
      return { needle, chip: chipSpan(c.token, c.label), len: needle.length };
    })
    .filter(Boolean)
    .sort((a, b) => b.len - a.len);
  for (const { needle, chip } of inlineEntries) {
    if (out.includes(needle)) out = out.split(needle).join(chip);
  }

  /* (2) Customer-address parsed-line chips — applied longest-first too. */
  const addrCol = pickColumn(data, 'address_and_meta_row', 'customer_address');
  const addrText = addrCol && addrCol.text;
  if (typeof addrText === 'string') {
    const lines = addrText.split(/\r?\n/).map((s) => s.trim());
    const addrEntries = QUOTE_ADDRESS_CHIPS
      .map((c) => {
        let extracted;
        try { extracted = String(c.extract(lines) || ''); } catch { extracted = ''; }
        const needle = escapeHtml(extracted);
        if (!needle || needle.length < 2) return null;
        return { needle, chip: chipSpan(c.token, c.label), len: needle.length };
      })
      .filter(Boolean)
      .sort((a, b) => b.len - a.len);
    for (const { needle, chip } of addrEntries) {
      if (out.includes(needle)) out = out.split(needle).join(chip);
    }
  }

  /* (3) Letter body — replace the inner of <div class="p1-letter"> with a
     single <Letter Body> chip; keep the outer wrapper + its style attribute
     so user-applied font/size/alignment cascade to the resolved letter
     content at PDF time. */
  out = out.replace(
    /(<div\b[^>]*\bclass=["'][^"']*\bp1-letter\b[^"']*["'][^>]*>)([\s\S]*?)(<\/div>)/i,
    (_full, open, _inner, close) =>
      open + chipSpan('LETTER_BODY', 'Letter Body') + close
  );

  /* (4) Line-items table cell chips, with row/col metadata for runtime
     per-cell resolution. */
  out = chipifyQuoteLineItemsTable(out, data);

  return out;
}
