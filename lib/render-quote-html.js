/**
 * Quote PDF: render HTML fragments + dynamic styles from one quote data object (JSON).
 * Table/cell rendering: margins [l,t,r,b] in pt; table sheet scale/font and baseUrl for images.
 */

import {
  A4_WIDTH_PT,
  A4_HEIGHT_PT,
  SAFE_HEADER_BAND_PCT,
  SAFE_FOOTER_BAND_PCT,
} from './page-geometry.js';

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** @type {{ scale: number, baseUrl: string, pdfFontScale: number, lineTotalColIndex?: number, spacerColSpan?: number, lineItemsColumnSizing?: string, salesPdf?: boolean }} */
let _opts = { scale: 1, baseUrl: '', pdfFontScale: 1, salesPdf: false };

/** Data-driven line-item column widths (default). */
export const LINE_ITEMS_COLUMN_SIZING_AUTO = 'auto';
/** Legacy fixed `%` columns — set `document.lineItemsColumnSizing` to this to keep the old template. */
export const LINE_ITEMS_COLUMN_SIZING_FIXED = 'fixed';

function scalePt(n) {
  if (n == null || Number.isNaN(n)) return n;
  const s = typeof _opts.scale === 'number' ? _opts.scale : 1;
  const fs = typeof _opts.pdfFontScale === 'number' ? _opts.pdfFontScale : 1;
  return Math.round(n * s * fs * 100) / 100;
}

export function marginCssPt(m) {
  if (!m || !Array.isArray(m) || m.length !== 4) return '';
  const [l, t, r, b] = m;
  return `margin:${scalePt(t)}pt ${scalePt(r)}pt ${scalePt(b)}pt ${scalePt(l)}pt`;
}

function paddingFromMarginPt(m) {
  if (!m || !Array.isArray(m) || m.length !== 4) return '';
  const [l, t, r, b] = m;
  return `padding:${scalePt(t)}pt ${scalePt(r)}pt ${scalePt(b)}pt ${scalePt(l)}pt`;
}

/** Remove cell-level fill so background can be applied on `<td>` (full row / full cell). */
export function stripCellBg(cell) {
  if (!cell || typeof cell !== 'object') return cell;
  const out = { ...cell };
  delete out.fillColor;
  delete out.background;
  return out;
}

function tdBgCss(cell) {
  if (!cell || typeof cell !== 'object') return '';
  const bg = cell.fillColor || cell.background;
  if (!bg) return '';
  return `background-color:${bg};`;
}

function styleFromNode(node) {
  const parts = [];
  if (node.font) parts.push(`font-family:${node.font},sans-serif`);
  if (node.fontSize != null) parts.push(`font-size:${scalePt(node.fontSize)}pt`);
  if (node.bold) parts.push('font-weight:700');
  if (node.color) parts.push(`color:${node.color}`);
  if (node.italics) parts.push('font-style:italic');
  if (node.decoration === 'underline') parts.push('text-decoration:underline');
  if (node.fillColor || node.background) {
    parts.push(`background-color:${node.fillColor || node.background}`);
  }
  if (node.margin) {
    const x = marginCssPt(node.margin);
    if (x) parts.push(x);
  }
  if (node.marginBottom != null) {
    parts.push(`margin-bottom:${scalePt(node.marginBottom)}pt`);
  }
  if (node.marginLeft != null) {
    parts.push(`margin-left:${scalePt(node.marginLeft)}pt`);
  }
  if (node.alignment) {
    parts.push(`text-align:${node.alignment}`);
  }
  return parts.join(';');
}

function renderInlineParts(parts) {
  if (parts == null) return '';
  if (typeof parts === 'string' || typeof parts === 'number') {
    return escapeHtml(String(parts));
  }
  if (!Array.isArray(parts)) {
    return renderInlineParts([parts]);
  }
  return parts
    .map((p) => {
      if (typeof p === 'string' || typeof p === 'number') {
        return escapeHtml(String(p));
      }
      if (typeof p === 'object' && p.text !== undefined) {
        const st = styleFromNode(p);
        const inner = renderInlineParts(p.text);
        if (!st) return inner;
        return `<span style="${st}">${inner}</span>`;
      }
      return '';
    })
    .join('');
}

function renderTextObject(node) {
  if (node.text === undefined) return '';
  let inner;
  if (Array.isArray(node.text)) {
    inner = renderInlineParts(node.text);
  } else {
    inner = String(node.text)
      .split('\n')
      .map(escapeHtml)
      .join('<br />');
  }
  const st = styleFromNode(node);
  if (!st) return inner;
  return `<span style="${st}">${inner}</span>`;
}

function renderColumnsNode(item) {
  const gap = item.columnGap != null ? `${scalePt(item.columnGap)}pt` : '12pt';
  const cols = (item.columns || [])
    .map((col) => {
      let flex = '1 1 0';
      let minW = '0';
      if (col.width === 'auto') {
        flex = '0 0 auto';
        minW = 'auto';
      }
      const inner = col.stack
        ? col.stack.map((x) => renderStackItem(x)).join('')
        : col.text !== undefined || col.table || col.columns
          ? renderStackItem(col)
          : '';
      const m = col.margin ? marginCssPt(col.margin) : '';
      return `<div style="flex:${flex};min-width:${minW};box-sizing:border-box;${m}">${inner}</div>`;
    })
    .join('');
  const m = item.margin ? marginCssPt(item.margin) : '';
  return `<div class="qt-inline-columns" style="display:flex;flex-direction:row;gap:${gap};align-items:flex-start;width:100%;box-sizing:border-box;${m}">${cols}</div>`;
}

export function renderStackItem(item) {
  if (item == null) return '';
  if (typeof item === 'string') {
    return `<div>${escapeHtml(item)}</div>`;
  }
  if (typeof item === 'object') {
    if (item.image) return renderCellInnerHtml(item);
    if (item.stack) return renderStack(item);
    if (item.columns) return renderColumnsNode(item);
    if (item.text !== undefined) {
      const inner = renderTextObject(item);
      const st = styleFromNode(item);
      if (!st) return `<div>${inner}</div>`;
      return `<div style="${st}">${inner}</div>`;
    }
    if (item.ul) return renderUl(item);
    if (item.ol) return renderOl(item);
    if (item.table) {
      return renderHtmlTableBlock({
        table: item.table,
        layout: item.layout,
        margin: item.margin,
      });
    }
  }
  return '';
}

export function renderStack(node) {
  const items = node.stack || [];
  const inner = items.map((it) => renderStackItem(it)).join('');
  const extra = styleFromNode(node);
  const align = node.alignment ? `text-align:${node.alignment}` : '';
  return `<div style="${[align, extra].filter(Boolean).join(';')}">${inner}</div>`;
}

function renderUl(node) {
  const items = node.ul || [];
  const inner = items
    .map((entry) => {
      if (entry.stack) {
        const block = entry.stack.map((s) => renderStackItem(s)).join('');
        const st = styleFromNode(entry);
        return `<li style="${st}">${block}</li>`;
      }
      return `<li>${renderStackItem(entry)}</li>`;
    })
    .join('');
  const st = styleFromNode(node);
  return `<ul class="qt-ul" style="margin:0;padding-left:14pt;list-style:disc;list-style-position:outside;${st}">${inner}</ul>`;
}

function renderOl(node) {
  const items = node.ol || [];
  const inner = items
    .map((entry) => {
      if (entry.stack) {
        const block = entry.stack.map((s) => renderStackItem(s)).join('');
        const st = styleFromNode(entry);
        return `<li style="${st}">${block}</li>`;
      }
      return `<li>${renderStackItem(entry)}</li>`;
    })
    .join('');
  const st = styleFromNode(node);
  return `<ol class="qt-ol" style="margin:0;padding-left:18pt;list-style:decimal;list-style-position:outside;${st}">${inner}</ol>`;
}

/**
 * Nested HTML tables (totals, payment terms grids, payment details, etc.).
 */
export function renderHtmlTableBlock(block) {
  const t = block.table;
  if (!t || !Array.isArray(t.body)) return '';
  const body = t.body;
  /** Only known string layouts change rendering. Non-strings (e.g. pdfmake `{}`) must fall through to default bordered cells — same as before layout was coerced to `noBorders`. */
  let layout = block.layout;
  if (layout == null || typeof layout !== 'string') {
    layout = '';
  }
  const headerRows = t.headerRows || 0;
  let widths = t.widths;
  const firstRowNorm =
    Array.isArray(body[0]) && body[0].length
      ? normalizeTableRow(body[0])
      : [];
  if (widths === 'auto' && firstRowNorm.length > 0) {
    widths = Array(firstRowNorm.length).fill('auto');
  }

  const outerNoBorder = layout === 'noBorders';
  const lightLines = layout === 'lightHorizontalLines';
  const starAutoOuter =
    outerNoBorder &&
    Array.isArray(widths) &&
    widths.length === 2 &&
    widths[0] === '*' &&
    widths[1] === 'auto';

  const totalsInnerTable =
    lightLines &&
    Array.isArray(widths) &&
    widths.length === 2 &&
    widths[0] === 'auto' &&
    widths[1] === 'auto';

  const compactTwoCol =
    Array.isArray(widths) &&
    widths.length === 2 &&
    widths[0] === 'auto' &&
    widths[1] === 'auto' &&
    !starAutoOuter &&
    !lightLines &&
    !outerNoBorder;

  const salesPdf = _opts.salesPdf === true;
  const baseFont = 'font-family:Montserrat,sans-serif';

  const renderRow = (row, ri, totalRows) => {
    if (!Array.isArray(row)) return '';
    const norm = normalizeTableRow(row);
    const isLastRow = ri === totalRows - 1;
    const twoColOuter = starAutoOuter && norm.length === 2;

    let skip = 0;
    const parts = [];

    for (let ci = 0; ci < norm.length; ci++) {
      if (skip > 0) {
        skip--;
        continue;
      }

      const cell = norm[ci];
      const colSpan =
        cell && typeof cell === 'object' && cell.colSpan != null
          ? Math.max(1, Number(cell.colSpan))
          : 1;
      const rowSpan =
        cell && typeof cell === 'object' && cell.rowSpan != null
          ? Math.max(1, Number(cell.rowSpan))
          : 1;
      skip = colSpan - 1;
      const spanAttr = `${colSpan > 1 ? ` colspan="${colSpan}"` : ''}${
        rowSpan > 1 ? ` rowspan="${rowSpan}"` : ''
      }`;

      const bgOnTd = tdBgCss(cell);
      const src =
        bgOnTd && typeof cell === 'object' ? stripCellBg(cell) : cell;
      const inner =
        typeof src === 'string' || typeof src === 'number'
          ? escapeHtml(String(src))
          : renderCellInnerHtml(src);

      let extra = '';
      if (cell && typeof cell === 'object') {
        if (cell.fontSize != null) {
          extra += `font-size:${scalePt(cell.fontSize)}pt;`;
        }
        if (cell.alignment) extra += `text-align:${cell.alignment};`;
        if (cell.bold) extra += 'font-weight:700;';
      }

      if (twoColOuter) {
        if (ci === 0) {
          parts.push(
            `<td${spanAttr} class="qt-star-auto-spacer" style="border:none;padding:0;vertical-align:top;width:100%;height:1px;${bgOnTd}${baseFont}">${inner || '&nbsp;'}</td>`
          );
        } else {
          parts.push(
            `<td${spanAttr} style="border:none;padding:2pt 4pt 2pt 6pt;text-align:right;vertical-align:top;${bgOnTd}${baseFont}${extra}"><div class="qt-star-auto-cell-inner">${inner}</div></td>`
          );
        }
        continue;
      }

      if (lightLines) {
        const padV = scalePt(2);
        const padH = scalePt(6);
        // Nested Raw Total → Grand Total grid (same structure as sales PDF): full cell grid, not only horizontals.
        const fullTotalsGrid = salesPdf || totalsInnerTable;
        const border = fullTotalsGrid
          ? 'border:1px solid #ccc'
          : !isLastRow
            ? 'border-bottom:1px solid #ccc'
            : '';
        const va = fullTotalsGrid ? 'top' : 'middle';
        parts.push(
          `<td${spanAttr} style="${border};padding:${padV}pt ${padH}pt;vertical-align:${va};line-height:1.25;${bgOnTd}${baseFont};${extra}">${inner}</td>`
        );
        continue;
      }

      if (outerNoBorder) {
        parts.push(
          `<td${spanAttr} style="border:none;padding:0;vertical-align:top;${bgOnTd}${baseFont};${extra}">${inner}</td>`
        );
        continue;
      }

      const padV = scalePt(compactTwoCol ? 0.75 : 1.5);
      const padH = scalePt(compactTwoCol ? 2.5 : 3);
      const lh = compactTwoCol ? '1.15' : '1.25';
      parts.push(
        `<td${spanAttr} style="border:1px solid #ddd;padding:${padV}pt ${padH}pt;vertical-align:top;line-height:${lh};word-wrap:break-word;${bgOnTd}${baseFont};${extra}">${inner}</td>`
      );
    }

    return `<tr>${parts.join('')}</tr>`;
  };

  let colgroup = '';
  if (starAutoOuter) {
    colgroup =
      '<colgroup><col class="qt-col-star" /><col class="qt-col-auto" /></colgroup>';
  } else if (Array.isArray(widths) && widths.length) {
    const cols = widths
      .map((w) => {
        if (salesPdf) {
          if (w === '*') {
            if (widths.length === 1) {
              return '<col style="width:100%" />';
            }
            return '<col style="width:auto;min-width:8pt" />';
          }
          if (w === 'auto') return '<col style="width:auto" />';
          const ws = typeof w === 'string' ? w.trim() : '';
          if (/^\d+(\.\d+)?%$/.test(ws)) {
            return `<col style="width:${ws}" />`;
          }
          if (typeof w === 'number' && Number.isFinite(w)) {
            return `<col style="width:${scalePt(w)}pt" />`;
          }
          return '<col />';
        }
        if (w === '*') return '<col style="width:100%" />';
        if (w === 'auto') return '<col style="width:auto" />';
        return '<col />';
      })
      .join('');
    colgroup = `<colgroup>${cols}</colgroup>`;
  }

  let thead = '';
  let tbodyRows = body;
  if (headerRows > 0) {
    thead = `<thead>${body
      .slice(0, headerRows)
      .map((r, i) => renderRow(r, i, headerRows))
      .join('')}</thead>`;
    tbodyRows = body.slice(headerRows);
  }
  const tbody = tbodyRows
    .map((r, i) => renderRow(r, i, tbodyRows.length))
    .join('');
  const m = block.margin ? marginCssPt(block.margin) : '';
  const allWidthsAuto =
    Array.isArray(widths) &&
    widths.length > 0 &&
    widths.every((w) => w === 'auto');
  let tblLayout;
  if (salesPdf) {
    const hasPercentWidth =
      Array.isArray(widths) &&
      widths.some((w) => {
        if (typeof w !== 'string') return false;
        return /^\d+(\.\d+)?%$/.test(String(w).trim());
      });
    const hasStarMulticol =
      Array.isArray(widths) &&
      widths.length > 1 &&
      widths.some((w) => w === '*');
    tblLayout = starAutoOuter
      ? 'table-layout:auto'
      : allWidthsAuto
        ? 'table-layout:auto'
        : hasPercentWidth || hasStarMulticol || lightLines
          ? 'table-layout:auto'
          : Array.isArray(widths) && widths.length
            ? 'table-layout:fixed'
            : 'table-layout:auto';
  } else {
    tblLayout = starAutoOuter
      ? 'table-layout:auto'
      : allWidthsAuto
        ? 'table-layout:auto'
        : Array.isArray(widths) && widths.length
          ? 'table-layout:fixed'
          : 'table-layout:auto';
  }
  const tblClass = [
    'qt-html-table',
    starAutoOuter ? 'qt-html-table--star-auto' : '',
    !starAutoOuter && lightLines ? 'qt-html-table--light-lines' : '',
    totalsInnerTable ? 'qt-html-table--totals-inner' : '',
    compactTwoCol ? 'qt-html-table--compact-twocol' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const quoteStarAutoOuterBorder =
    starAutoOuter && !salesPdf
      ? ';border:1px solid #ddd;box-sizing:border-box'
      : '';
  const tblStyle = `width:100%;border-collapse:collapse;${tblLayout};margin:0;padding:0;${m}${quoteStarAutoOuterBorder}`;
  return `<table class="${tblClass}" style="${tblStyle}">${colgroup}${thead}<tbody>${tbody}</tbody></table>`;
}

export function renderCellInnerHtml(cell) {
  if (cell == null) return '';
  if (typeof cell === 'string' || typeof cell === 'number') {
    return escapeHtml(String(cell));
  }
  if (Array.isArray(cell)) {
    return cell.map((c) => renderCellInnerHtml(c)).join('');
  }
  if (typeof cell !== 'object') return '';

  if (cell.image) {
    const raw = String(cell.image);
    const outerMargin = cell.margin ? marginCssPt(cell.margin) : '';
    if (
      raw.includes('not_approved_stamp') ||
      raw.includes('/assests/not_approved_stamp')
    ) {
      let w = scalePt(cell.width || 100);
      let h = scalePt(cell.height || 100);
      if (Array.isArray(cell.fit) && cell.fit.length >= 2) {
        w = scalePt(cell.fit[0]);
        h = scalePt(cell.fit[1]);
      }
      const path = raw.startsWith('/') ? raw : `/${raw}`;
      const url = `${_opts.baseUrl || ''}${path}`;
      const img = `<img src="${escapeHtml(url)}" alt="" class="qt-stamp-img" style="width:${w}pt;height:auto;max-width:110pt;display:block;margin:0 auto;object-fit:contain" />`;
      return outerMargin
        ? `<div style="${outerMargin};text-align:center">${img}</div>`
        : img;
    }
    if (
      raw.includes('/assests/not_approved.png') &&
      !raw.includes('stamp')
    ) {
      let w = scalePt(cell.width || 120);
      if (Array.isArray(cell.fit) && cell.fit.length >= 2) {
        w = scalePt(cell.fit[0]);
      }
      const path = raw.startsWith('/') ? raw : `/${raw}`;
      const url = `${_opts.baseUrl || ''}${path}`;
      const img = `<img src="${escapeHtml(url)}" alt="" class="qt-stamp-img" style="width:${w}pt;height:auto;max-width:120pt;display:block;margin:0 auto;object-fit:contain" />`;
      return outerMargin
        ? `<div style="${outerMargin};text-align:center">${img}</div>`
        : img;
    }
    if (raw.includes('/assests/') && !raw.includes('not_approved')) {
      let w = scalePt(cell.width || 40);
      let h = scalePt(cell.height || 40);
      if (Array.isArray(cell.fit) && cell.fit.length >= 2) {
        w = scalePt(cell.fit[0]);
        h = scalePt(cell.fit[1]);
      }
      const path = raw.startsWith('/') ? raw : `/${raw.replace(/^\/+/, '')}`;
      const url = `${_opts.baseUrl || ''}${path}`;
      const align =
        cell.alignment === 'right'
          ? 'right'
          : cell.alignment === 'left'
            ? 'left'
            : 'center';
      const img = `<img src="${escapeHtml(url)}" alt="" class="qt-content-img" style="width:${w}pt;height:auto;max-width:100%;display:inline-block;vertical-align:middle;object-fit:contain" />`;
      const block = outerMargin
        ? `<div style="${outerMargin};text-align:${align}">${img}</div>`
        : `<div style="text-align:${align}">${img}</div>`;
      return block;
    }
    let w = scalePt(cell.width || 40);
    let h = scalePt(cell.height || 40);
    if (Array.isArray(cell.fit) && cell.fit.length >= 2) {
      w = scalePt(cell.fit[0]);
      h = scalePt(cell.fit[1]);
    }
    const slot = `<span class="qt-img-slot" aria-hidden="true" style="display:inline-block;width:${w}pt;height:${h}pt;vertical-align:middle"></span>`;
    return outerMargin
      ? `<div style="${outerMargin};text-align:center">${slot}</div>`
      : slot;
  }
  if (cell.stack) return renderStack(cell);
  if (cell.table) {
    return renderHtmlTableBlock({
      table: cell.table,
      layout: cell.layout,
      margin: cell.margin,
    });
  }
  if (cell.ul) return renderUl(cell);
  if (cell.ol) return renderOl(cell);
  if (cell.text !== undefined) {
    let html = renderTextObject(cell);
    if (cell.background || cell.fillColor) {
      const bg = cell.background || cell.fillColor;
      const st = [
        `background-color:${bg}`,
        'display:inline-block',
        styleFromNode(cell),
      ]
        .filter(Boolean)
        .join(';');
      html = `<span style="${st}">${html}</span>`;
    }
    return html;
  }
  return '';
}

export function normalizeTableRow(row) {
  if (!Array.isArray(row)) return [];
  const out = [];
  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (Array.isArray(c)) continue;
    out.push(c);
  }
  return out;
}

function renderHeaderCellHtml(cell) {
  const raw = cell.text;
  const lines = typeof raw === 'string' ? raw.split('\n') : [String(raw)];
  return lines.map((line) => escapeHtml(line)).join('<br />');
}

export function renderTableRow(row, rowIndex) {
  const cells = normalizeTableRow(row);
  const tds = cells
    .map((cell, colIndex) => renderTd(cell, colIndex))
    .join('');
  return `<tr class="qt-tr" data-row="${rowIndex}">${tds}</tr>`;
}

function renderTd(cell, colIndex = 0) {
  const colSpan = cell.colSpan || 1;
  const rowSpan = cell.rowSpan || 1;

  const lineIdx =
    typeof _opts.lineTotalColIndex === 'number' ? _opts.lineTotalColIndex : 7;
  const spacerSpan =
    typeof _opts.spacerColSpan === 'number' ? _opts.spacerColSpan : 8;

  const baseBorder = 'border:1px solid #ddd';
  const font = 'font-family:Montserrat,sans-serif';
  const fzHeader =
    cell.fontSize != null ? scalePt(cell.fontSize) : scalePt(10);
  const padV = scalePt(1.5);
  const padH = scalePt(3.5);
  const padVHeader = scalePt(2);
  const padHHeader = scalePt(4);

  if (cell.style === 'tableHeader') {
    const inner = renderHeaderCellHtml(cell);
    const headerBg = cell.fillColor || cell.background || '#ffb74d';
    const headerFg = cell.color || '#333';
    const st = [
      `background-color:${headerBg}`,
      `color:${headerFg}`,
      'font-weight:700',
      `font-size:${fzHeader}pt`,
      'line-height:1.15',
      'text-align:center',
      'vertical-align:middle',
      `padding:${padVHeader}pt ${padHHeader}pt`,
      baseBorder,
      font,
    ].join(';');
    return `<td colspan="${colSpan}" rowspan="${rowSpan}" style="${st}">${inner}</td>`;
  }

  if (
    cell.colSpan === spacerSpan &&
    (!cell.text || cell.text === '') &&
    !cell.stack &&
    !cell.table
  ) {
    const st = [
      'padding:0',
      'height:3pt',
      'line-height:0',
      'font-size:0',
      baseBorder,
      font,
    ].join(';');
    return `<td colspan="${colSpan}" rowspan="${rowSpan}" style="${st}">&nbsp;</td>`;
  }

  const fillLower = (cell.fillColor || '').toLowerCase();
  const isGrayFill = fillLower === '#eee' || fillLower === '#eeeeee';
  if (cell.colSpan === spacerSpan && isGrayFill) {
    const pad = cell.margin ? paddingFromMarginPt(cell.margin) : `padding:${scalePt(3)}pt ${scalePt(6)}pt`;
    const fz = scalePt(12);
    const st = [
      'background-color:#eee',
      'text-align:center',
      'font-weight:700',
      `font-size:${fz}pt`,
      'line-height:1.2',
      'color:#333',
      pad,
      baseBorder,
      font,
    ].join(';');
    const text =
      typeof cell.text === 'string' ? escapeHtml(cell.text) : renderCellInnerHtml(cell);
    return `<td colspan="${colSpan}" rowspan="${rowSpan}" style="${st}">${text}</td>`;
  }

  const tdBg = cell.fillColor || cell.background;
  const priceTextOnlyHighlight =
    !!tdBg &&
    colIndex === lineIdx &&
    colSpan === 1 &&
    cell.style !== 'tableHeader';

  const inner = renderCellInnerHtml(
    tdBg && !priceTextOnlyHighlight ? stripCellBg(cell) : cell
  );

  const align = cell.alignment || 'left';
  const fzBody =
    cell.fontSize != null ? scalePt(cell.fontSize) : scalePt(10);
  let bg = '';
  if (!priceTextOnlyHighlight) {
    if (cell.fillColor) {
      bg = `background-color:${cell.fillColor}`;
    } else if (cell.background) {
      bg = `background-color:${cell.background}`;
    }
  }

  const st = [
    `text-align:${align}`,
    'vertical-align:top',
    `padding:${padV}pt ${padH}pt`,
    'word-wrap:break-word',
    'overflow-wrap:break-word',
    baseBorder,
    font,
    `font-size:${fzBody}pt`,
    'color:#333',
    'line-height:1.22',
    bg,
  ]
    .filter(Boolean)
    .join(';');

  return `<td colspan="${colSpan}" rowspan="${rowSpan}" style="${st}">${inner}</td>`;
}

export function runWithHtmlRenderOpts(opts, fn) {
  const prev = _opts;
  _opts = { scale: 1, baseUrl: '', pdfFontScale: 1, ...opts };
  try {
    return fn();
  } finally {
    _opts = prev;
  }
}

export function renderTableBodySlice(bodyRows, opts = {}) {
  return runWithHtmlRenderOpts(opts, () => {
    if (!Array.isArray(bodyRows)) return '';
    const rows = bodyRows.map((row, i) => renderTableRow(row, i)).join('');
    return `<tbody>${rows}</tbody>`;
  });
}

/**
 * @param {{ lineItemsColumnSizing?: string }} [sizing] Data-driven columns unless `lineItemsColumnSizing === 'fixed'`.
 */
export function renderQuoteTable(
  bodyInner,
  colgroupHtml = '',
  theadTr = '',
  sizing = {}
) {
  const thead = theadTr ? `<thead>${theadTr}</thead>` : '';
  const dataMode =
    sizing.lineItemsColumnSizing !== LINE_ITEMS_COLUMN_SIZING_FIXED;
  const cls = dataMode ? 'quote-table quote-table--data-columns' : 'quote-table';
  const tblLayout = dataMode ? 'auto' : 'fixed';
  return `<table class="${cls}" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;table-layout:${tblLayout}">${colgroupHtml}${thead}${bodyInner}</table>`;
}


/**
 * Summary/terms/columns blocks after the main quote table on page 2.
 */
function renderTextBlock(block) {
  const inner = renderCellInnerHtml(block);
  const m = block.margin ? marginCssPt(block.margin) : '';
  const align = block.alignment ? `text-align:${block.alignment}` : '';
  const full =
    block.alignment === 'right' || block.alignment === 'center'
      ? 'width:100%;display:block;'
      : '';
  return `<div class="qt-text-block" style="${m};${full}${align};box-sizing:border-box">${inner}</div>`;
}

function renderStackBlock(block) {
  const inner = (block.stack || [])
    .map((item) => renderStackItem(item))
    .join('');
  const m = block.margin ? marginCssPt(block.margin) : '';
  return `<div class="qt-stack-block" style="${m};font-family:Montserrat,sans-serif;width:100%;box-sizing:border-box">${inner}</div>`;
}

function renderColumnsBlock(block) {
  const gap = block.columnGap != null ? `${block.columnGap}pt` : '12pt';
  const cols = (block.columns || [])
    .map((col) => {
      let flex = '1 1 0';
      let minW = '0';
      if (col.width === 'auto') {
        flex = '0 0 auto';
        minW = 'auto';
      }
      const inner = col.stack
        ? col.stack.map((item) => renderStackItem(item)).join('')
        : col.text !== undefined || col.table || col.columns
          ? renderStackItem(col)
          : '';
      const m = col.margin ? marginCssPt(col.margin) : '';
      return `<div style="flex:${flex};min-width:${minW};box-sizing:border-box;align-self:flex-start;height:auto;min-height:0;${m}">${inner}</div>`;
    })
    .join('');
  const m = block.margin ? marginCssPt(block.margin) : '';
  return `<div class="qt-columns" style="display:flex;flex-direction:row;gap:${gap};align-items:flex-start;width:100%;box-sizing:border-box;${m}">${cols}</div>`;
}

function renderBlock(block) {
  if (block == null || typeof block !== 'object') return '';
  if (block.table) {
    const html = renderHtmlTableBlock(block);
    if (_opts.salesPdf === true && block._salesMainItemsTable) {
      const dataCols =
        _opts.lineItemsColumnSizing !== LINE_ITEMS_COLUMN_SIZING_FIXED;
      const wrapClass = dataCols
        ? 'qt-sales-main-items-wrap qt-sales-main-items-wrap--data-columns'
        : 'qt-sales-main-items-wrap';
      return `<div class="${wrapClass}">${html}</div>`;
    }
    return html;
  }
  if (block.stack) return renderStackBlock(block);
  if (block.columns) return renderColumnsBlock(block);
  if (block.text !== undefined) return renderTextBlock(block);
  return '';
}

/**
 * @param {object[]} blocks
 * @param {{ scale?: number, baseUrl?: string, pdfFontScale?: number }} opts
 */
export function renderAfterTableBlocks(blocks, opts = {}) {
  if (!Array.isArray(blocks) || blocks.length === 0) return '';
  return runWithHtmlRenderOpts(opts, () =>
    blocks.map((b) => renderBlock(b)).join('\n')
  );
}

/** @param {[number, number, number, number]} m Page 1 margins (l,t,r,b) in pt */
function p1MarginCssPt(m) {
  const [l, t, r, b] = m;
  return `margin:${t}pt ${r}pt ${b}pt ${l}pt`;
}

/** @param {{ left: number, top: number, right: number, bottom: number }} inset */
function paddingInsetCss(inset) {
  const { left, top, right, bottom } = inset;
  return `padding:${top}pt ${right}pt ${bottom}pt ${left}pt`;
}

/**
 * Safe band for `assests/pdf-background.png`: full-bleed A4 art with header + footer bars.
 * Insets are derived from A4 height so content stays in the white middle band (not on logos).
 * Merged with each page's contentInsetPt via Math.max per edge.
 * Optional JSON: document.contentSafeInsetPt — only values *above* the computed floor apply (use to tighten/tune).
 */
/** Minimum horizontal inset (~4% width, clamped) */
const SAFE_SIDE_MIN_LEFT_PT = 24;
const SAFE_SIDE_MIN_RIGHT_PT = 32;

const DEFAULT_SAFE_CONTENT_INSET_PT = {
  left: Math.round(Math.max(SAFE_SIDE_MIN_LEFT_PT, A4_WIDTH_PT * 0.04) * 100) / 100,
  top: Math.round(A4_HEIGHT_PT * SAFE_HEADER_BAND_PCT * 100) / 100,
  right: Math.round(Math.max(SAFE_SIDE_MIN_RIGHT_PT, A4_WIDTH_PT * 0.04) * 100) / 100,
  bottom: Math.round(A4_HEIGHT_PT * SAFE_FOOTER_BAND_PCT * 100) / 100,
};

/**
 * @param {{ left?: number, top?: number, right?: number, bottom?: number } | undefined} pageInset
 * @param {object} data
 */
function getMergedContentInsetPt(pageInset, data) {
  const doc = data?.document?.contentSafeInsetPt;
  /** Never shrink below artwork-safe floors; optional doc.* only raises a side. */
  const floor = {
    left: Math.max(DEFAULT_SAFE_CONTENT_INSET_PT.left, doc?.left ?? 0),
    top: Math.max(DEFAULT_SAFE_CONTENT_INSET_PT.top, doc?.top ?? 0),
    right: Math.max(DEFAULT_SAFE_CONTENT_INSET_PT.right, doc?.right ?? 0),
    bottom: Math.max(DEFAULT_SAFE_CONTENT_INSET_PT.bottom, doc?.bottom ?? 0),
  };
  if (!pageInset) {
    return floor;
  }
  return {
    left: Math.max(pageInset.left ?? 0, floor.left),
    top: Math.max(pageInset.top ?? 0, floor.top),
    right: Math.max(pageInset.right ?? 0, floor.right),
    bottom: Math.max(pageInset.bottom ?? 0, floor.bottom),
  };
}

function pdfFontScale(data) {
  return typeof data?.document?.pdfFontScale === 'number'
    ? data.document.pdfFontScale
    : 0.92;
}

/** @param {Record<string, unknown>} style */
function textStyleAttr(style, data) {
  const parts = [];
  if (style.fontFamily) parts.push(`font-family:${style.fontFamily},sans-serif`);
  if (style.fontSizePt != null) {
    const pt =
      data != null
        ? Math.round(style.fontSizePt * pdfFontScale(data) * 100) / 100
        : style.fontSizePt;
    parts.push(`font-size:${pt}pt`);
  }
  if (style.fontWeight) parts.push(`font-weight:${style.fontWeight}`);
  if (style.color) parts.push(`color:${style.color}`);
  if (style.textAlign) parts.push(`text-align:${style.textAlign}`);
  if (style.backgroundColor) parts.push(`background-color:${style.backgroundColor}`);
  if (style.display) parts.push(`display:${style.display}`);
  if (style.whiteSpace) parts.push(`white-space:${style.whiteSpace}`);
  if (style.lineHeight != null) parts.push(`line-height:${style.lineHeight}`);
  if (style.marginPt) parts.push(p1MarginCssPt(style.marginPt));
  return parts.join(';');
}

/** @param {object} data */
export function renderPage1InnerHtml(data) {
  const blocks = data.page1?.blocks;
  if (!Array.isArray(blocks)) return '';

  const chunks = [];
  for (const block of blocks) {
    if (block.type === 'image' && block.id === 'stamp_not_approved') continue;

    if (block.type === 'text' && block.id === 'title_quote') {
      chunks.push(
        `<div class="p1-title" style="${textStyleAttr(block.style, data)}">${escapeHtml(block.text)}</div>`
      );
      continue;
    }

    if (block.type === 'columns' && block.id === 'address_and_meta_row') {
      chunks.push(renderColumns(block, data));
      continue;
    }

    if (block.type === 'text' && block.id === 'letter_body') {
      chunks.push(renderLetter(block, data));
      continue;
    }
  }

  return chunks.join('\n');
}

function renderColumns(block, data) {
  const cols = block.columns;
  if (!Array.isArray(cols) || cols.length !== 2) return '';

  const left = cols[0];
  const right = cols[1];

  let leftHtml = '';
  if (left.type === 'text') {
    leftHtml = `<div class="p1-col p1-col-left" style="width:${left.width};box-sizing:border-box;${textStyleAttr(left.style, data)}">${escapeHtml(left.text).replace(/\n/g, '<br />')}</div>`;
  }

  let rightHtml = '';
  if (right.type === 'stack' && Array.isArray(right.items)) {
    const stackMargin = right.marginPt
      ? p1MarginCssPt(right.marginPt)
      : '';
    const items = right.items
      .map((item) => {
        if (item.type !== 'text') return '';
        if (item.style?.backgroundColor) {
          return renderMetaBadgeLine(item, data);
        }
        const st = textStyleAttr(item.style, data);
        const inner = escapeHtml(item.text);
        return `<div class="p1-meta-line" style="${st}">${inner}</div>`;
      })
      .join('\n');
    rightHtml = `<div class="p1-col p1-col-right" style="width:${right.width};box-sizing:border-box;${stackMargin}">${items}</div>`;
  }

  return `<div class="p1-columns" style="display:flex;flex-direction:row;width:100%;align-items:flex-start;box-sizing:border-box">${leftHtml}${rightHtml}</div>`;
}

/** Red badge: background only on the text, not full column width */
function renderMetaBadgeLine(item, data) {
  const s = item.style;
  const margin = s.marginPt ? p1MarginCssPt(s.marginPt) : '';
  const outer = [
    'width:100%',
    'text-align:right',
    'box-sizing:border-box',
    margin,
  ]
    .filter(Boolean)
    .join(';');
  const fsPt =
    s.fontSizePt != null && data != null
      ? Math.round(s.fontSizePt * pdfFontScale(data) * 100) / 100
      : s.fontSizePt;
  const inner = [
    s.fontFamily ? `font-family:${s.fontFamily},sans-serif` : '',
    fsPt != null ? `font-size:${fsPt}pt` : '',
    s.fontWeight ? `font-weight:${s.fontWeight}` : '',
    s.color ? `color:${s.color}` : '',
    `background-color:${s.backgroundColor}`,
    'display:inline-block',
  ]
    .filter(Boolean)
    .join(';');
  return `<div class="p1-meta-line p1-meta-line--badge" style="${outer}"><span style="${inner}">${escapeHtml(item.text)}</span></div>`;
}

export function renderLetter(block, data) {
  const st = block.style;
  const paragraphs = Array.isArray(block.paragraphs) ? block.paragraphs : [];
  const gap = st.paragraphGap || '1em';
  const ps = paragraphs
    .map(
      (p, i) =>
        `<p class="p1-letter-p" style="margin:0 0 ${i < paragraphs.length - 1 ? gap : '0'} 0">${escapeHtml(p)}</p>`
    )
    .join('');
  const base = textStyleAttr(
    {
      ...st,
      marginPt: undefined,
      paragraphGap: undefined,
      whiteSpace: undefined,
    },
    data
  );
  const outerMargin = st.marginPt ? p1MarginCssPt(st.marginPt) : '';
  return `<div class="p1-letter" style="${base};${outerMargin}">${ps}</div>`;
}

/**
 * @param {object} data
 * @param {{ pageKey?: string, flow?: 'letter' | 'table' }} [opts]
 */
export function renderSheetInnerStyle(data, opts = {}) {
  const pageKey = opts.pageKey || 'page1';
  const insetRaw =
    data[pageKey]?.contentInsetPt || data.page1?.contentInsetPt;
  const inset = getMergedContentInsetPt(insetRaw, data);
  const ds = data.document?.defaultStyle;
  const fs = data?.document?.pdfFontScale ?? 0.92;
  const base = [
    paddingInsetCss(inset),
    'box-sizing:border-box',
    'width:100%',
    'height:auto',
    'overflow:visible',
    'min-height:0',
    '-webkit-box-decoration-break:clone',
    'box-decoration-break:clone',
    ds?.fontFamily ? `font-family:${ds.fontFamily},sans-serif` : '',
    ds?.fontSizePt != null
      ? `font-size:${Math.round(ds.fontSizePt * fs * 100) / 100}pt`
      : '',
    ds?.color ? `color:${ds.color}` : '',
  ]
    .filter(Boolean)
    .join(';');
  return base;
}

/** @param {object} data */
export function renderPage1InnerStyle(data) {
  return renderSheetInnerStyle(data, { pageKey: 'page1', flow: 'letter' });
}

/**
 * Padding on `.sheet.sheet--table` (not inner) so box-decoration-break applies per printed page.
 * Matches document pageMargins [left, top, right, bottom] in pt.
 */
export function renderPage2TableSheetStyle(data) {
  const insetRaw = data.page2?.contentInsetPt || data.page1?.contentInsetPt;
  const inset = getMergedContentInsetPt(insetRaw, data);
  return [
    paddingInsetCss(inset),
    'box-sizing:border-box',
    '-webkit-box-decoration-break:clone',
    'box-decoration-break:clone',
  ].join(';');
}

/** Page 2 inner: typography only — vertical inset lives on the section (see renderPage2TableSheetStyle). */
export function renderPage2InnerStyle(data) {
  const ds = data.document?.defaultStyle;
  const fs = data?.document?.pdfFontScale ?? 0.92;
  const base = [
    'box-sizing:border-box',
    'width:100%',
    'height:auto',
    'overflow:visible',
    'min-height:0',
    'margin:0',
    'padding:0',
    ds?.fontFamily ? `font-family:${ds.fontFamily},sans-serif` : '',
    ds?.fontSizePt != null
      ? `font-size:${Math.round(ds.fontSizePt * fs * 100) / 100}pt`
      : '',
    ds?.color ? `color:${ds.color}` : '',
  ]
    .filter(Boolean)
    .join(';');
  return base;
}


/**
 * First `afterTable` block that wraps Raw Total → Grand Total (star + auto outer table).
 * Rendered flush under the line-items table (same outer frame as Sales PDF).
 */
export function isQuoteGrandTotalsShellBlock(block) {
  if (!block || typeof block !== 'object' || !block.table) return false;
  if (block.layout !== 'noBorders') return false;
  const w = block.table.widths;
  if (!Array.isArray(w) || w.length !== 2) return false;
  if (w[0] !== '*' || w[1] !== 'auto') return false;
  const row0 = block.table.body?.[0];
  if (!Array.isArray(row0) || row0.length < 2) return false;
  const firstCell = row0[0];
  const second = row0[1];
  const firstEmpty =
    firstCell == null ||
    firstCell === '' ||
    (typeof firstCell === 'object' &&
      firstCell &&
      !firstCell.table &&
      firstCell.text === undefined);
  const secondHasTable =
    second && typeof second === 'object' && second.table?.body;
  return !!firstEmpty && !!secondHasTable;
}

/**
 * Table + afterTable from data.page2 (page2.tableBody, page2.afterTable). baseUrl resolves asset URLs.
 * @param {object} data
 * @param {string} baseUrl e.g. http://127.0.0.1:3000
 */
export function renderPage2InnerHtml(data, baseUrl) {
  const p2 = data.page2;
  if (!p2?.enabled) return '';

  const body = p2.tableBody;
  if (!Array.isArray(body) || body.length === 0) return '';

  const scale =
    typeof p2.fontScale === 'number' && p2.fontScale > 0 ? p2.fontScale : 1;
  const pdfFontScale =
    typeof data.document?.pdfFontScale === 'number'
      ? data.document.pdfFontScale
      : 0.92;
  const lineItemsColumnSizing =
    data.document?.lineItemsColumnSizing === LINE_ITEMS_COLUMN_SIZING_FIXED
      ? LINE_ITEMS_COLUMN_SIZING_FIXED
      : LINE_ITEMS_COLUMN_SIZING_AUTO;
  const opts = {
    scale,
    baseUrl: baseUrl || '',
    pdfFontScale,
    lineItemsColumnSizing,
  };
  const headerTr = renderTableRow(body[0], 0);
  const tbody = renderTableBodySlice(body.slice(1), opts);
  const tight = '<col class="qt-li-col-tight" />';
  const fill = '<col class="qt-li-col-fill" />';
  const colgroup =
    lineItemsColumnSizing === LINE_ITEMS_COLUMN_SIZING_AUTO
      ? `<colgroup>${tight}${tight}${fill}${tight}${tight}${tight}${tight}${tight}</colgroup>`
      : `<colgroup>
<col style="width:7%" />
<col style="width:11%" />
<col style="width:30%" />
<col style="width:10%" />
<col style="width:11%" />
<col style="width:8%" />
<col style="width:8%" />
<col style="width:15%" />
</colgroup>`;
  const table = renderQuoteTable(tbody, colgroup, headerTr, {
    lineItemsColumnSizing,
  });
  const afterList = Array.isArray(p2.afterTable) ? p2.afterTable : [];
  const useShell =
    afterList.length > 0 && isQuoteGrandTotalsShellBlock(afterList[0]);
  const afterShell = useShell
    ? renderAfterTableBlocks([afterList[0]], opts)
    : '';
  const afterRest =
    useShell && afterList.length > 1
      ? renderAfterTableBlocks(afterList.slice(1), opts)
      : !useShell && afterList.length > 0
        ? renderAfterTableBlocks(afterList, opts)
        : '';

  const tableWrap = `<div class="p2-table-wrap">${table}</div>`;
  const afterShellBlock =
    afterShell &&
    `<div class="p2-after-table p2-after-table--flush-totals">${afterShell}</div>`;
  const afterRestBlock =
    afterRest && `<div class="p2-after-table">${afterRest}</div>`;

  if (useShell && afterShell) {
    return `<div class="p2-quote-line-items-shell">${tableWrap}${afterShellBlock}</div>${afterRestBlock || ''}`;
  }
  return `${tableWrap}${afterShellBlock || ''}${afterRestBlock || ''}`;
}

/**
 * Single entry point: all inner HTML fragments and sheet styles for one quote PDF from one data object.
 * @param {object} data Parsed quote JSON (e.g. format puppeteer-quote-pdf)
 * @param {string} baseUrl Origin for assets, e.g. http://127.0.0.1:3000
 * @returns {{ letterInnerHtml: string, tableFlowInnerHtml: string, letterInnerStyle?: string, tableSheetStyle?: string, tableInnerStyle?: string }}
 * @see LINE_ITEMS_COLUMN_SIZING_FIXED — set `data.document.lineItemsColumnSizing: "fixed"` only if you need the legacy percentage column template.
 */
export function renderQuoteDocumentParts(data, baseUrl) {
  return {
    letterInnerHtml: renderPage1InnerHtml(data),
    tableFlowInnerHtml: renderPage2InnerHtml(data, baseUrl),
    letterInnerStyle: renderPage1InnerStyle(data) || undefined,
    tableSheetStyle: renderPage2TableSheetStyle(data) || undefined,
    tableInnerStyle: renderPage2InnerStyle(data) || undefined,
  };
}
