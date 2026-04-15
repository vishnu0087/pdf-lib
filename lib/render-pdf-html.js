/**
 * Puppeteer PDF HTML: data1.json -> HTML fragments + dynamic styles for templates/pdf-render.html.
 * Table/cell rendering: margins [l,t,r,b] in pt; page-2 scale/font and baseUrl for images.
 */

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** @type {{ scale: number, baseUrl: string, pdfFontScale: number }} */
let _opts = { scale: 1, baseUrl: '', pdfFontScale: 1 };

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
  const layout = block.layout || '';
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

  const baseFont = 'font-family:Montserrat,sans-serif';

  const renderRow = (row, ri, totalRows) => {
    if (!Array.isArray(row)) return '';
    const norm = normalizeTableRow(row);
    const isLastRow = ri === totalRows - 1;
    const twoColOuter = starAutoOuter && norm.length === 2;

    const cells = norm
      .map((cell, ci) => {
        const bgOnTd = tdBgCss(cell);
        const src =
          bgOnTd && typeof cell === 'object'
            ? stripCellBg(cell)
            : cell;
        const inner =
          typeof src === 'string' || typeof src === 'number'
            ? escapeHtml(String(src))
            : renderCellInnerHtml(src);

        let extra = '';
        if (cell && typeof cell === 'object') {
          if (cell.fontSize != null) extra += `font-size:${scalePt(cell.fontSize)}pt;`;
          if (cell.alignment) extra += `text-align:${cell.alignment};`;
          if (cell.bold) extra += 'font-weight:700;';
        }

        if (twoColOuter) {
          if (ci === 0) {
            return `<td class="qt-star-auto-spacer" style="border:none;padding:0;vertical-align:top;width:100%;height:1px;${bgOnTd}${baseFont}">${inner || '&nbsp;'}</td>`;
          }
          return `<td style="border:none;padding:2pt 4pt 2pt 6pt;text-align:right;vertical-align:top;${bgOnTd}${baseFont}${extra}"><div class="qt-star-auto-cell-inner">${inner}</div></td>`;
        }

        if (lightLines) {
          const bottom = !isLastRow ? 'border-bottom:1px solid #ccc' : '';
          const padV = scalePt(2);
          const padH = scalePt(6);
          return `<td style="${bottom};padding:${padV}pt ${padH}pt;vertical-align:middle;line-height:1.25;${bgOnTd}${baseFont};${extra}">${inner}</td>`;
        }

        if (outerNoBorder) {
          return `<td style="border:none;padding:0;vertical-align:top;${bgOnTd}${baseFont};${extra}">${inner}</td>`;
        }

        const padV = scalePt(compactTwoCol ? 0.75 : 1.5);
        const padH = scalePt(compactTwoCol ? 2.5 : 3);
        const lh = compactTwoCol ? '1.15' : '1.25';
        return `<td style="border:1px solid #ddd;padding:${padV}pt ${padH}pt;vertical-align:top;line-height:${lh};word-wrap:break-word;${bgOnTd}${baseFont};${extra}">${inner}</td>`;
      })
      .join('');
    return `<tr>${cells}</tr>`;
  };

  let colgroup = '';
  if (starAutoOuter) {
    colgroup =
      '<colgroup><col class="qt-col-star" /><col class="qt-col-auto" /></colgroup>';
  } else if (Array.isArray(widths) && widths.length) {
    const cols = widths
      .map((w) => {
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
  const tblLayout = starAutoOuter
    ? 'table-layout:auto'
    : allWidthsAuto
      ? 'table-layout:auto'
      : Array.isArray(widths) && widths.length
        ? 'table-layout:fixed'
        : 'table-layout:auto';
  const tblClass = [
    'qt-html-table',
    starAutoOuter ? 'qt-html-table--star-auto' : '',
    !starAutoOuter && lightLines ? 'qt-html-table--light-lines' : '',
    totalsInnerTable ? 'qt-html-table--totals-inner' : '',
    compactTwoCol ? 'qt-html-table--compact-twocol' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const tblStyle = `width:100%;border-collapse:collapse;${tblLayout};margin:0;padding:0;${m}`;
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

/** Last column (0-based index 7) in the 8-column quote table: line totals / prices — highlight text only, not full cell. */
const QUOTE_LINE_TOTAL_COL_INDEX = 7;

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

  const baseBorder = 'border:1px solid #ddd';
  const font = 'font-family:Montserrat,sans-serif';
  const fzHeader = scalePt(10);
  const padV = scalePt(1.5);
  const padH = scalePt(3.5);
  const padVHeader = scalePt(2);
  const padHHeader = scalePt(4);

  if (cell.style === 'tableHeader') {
    const inner = renderHeaderCellHtml(cell);
    const st = [
      'background-color:#ffb74d',
      'color:#333',
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
    cell.colSpan === 8 &&
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

  if (cell.colSpan === 8 && cell.fillColor === '#eee') {
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
    colIndex === QUOTE_LINE_TOTAL_COL_INDEX &&
    colSpan === 1 &&
    cell.style !== 'tableHeader';

  const inner = renderCellInnerHtml(
    tdBg && !priceTextOnlyHighlight ? stripCellBg(cell) : cell
  );

  const align = cell.alignment || 'left';
  const fzBody = scalePt(10);
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

export function renderQuoteTable(bodyInner, colgroupHtml = '', theadTr = '') {
  const thead = theadTr ? `<thead>${theadTr}</thead>` : '';
  return `<table class="quote-table" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;table-layout:fixed">${colgroupHtml}${thead}${bodyInner}</table>`;
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
  if (block.table) return renderHtmlTableBlock(block);
  if (block.stack) return renderStackBlock(block);
  if (block.columns) return renderColumnsBlock(block);
  if (block.text !== undefined) return renderTextBlock(block);
  return '';
}

/**
 * @param {object[]} blocks
 * @param {{ scale?: number, baseUrl?: string }} opts
 */
function renderAfterTableBlocks(blocks, opts = {}) {
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

function renderLetter(block, data) {
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
  const inset =
    data[pageKey]?.contentInsetPt || data.page1?.contentInsetPt;
  if (!inset) return '';
  const ds = data.document?.defaultStyle;
  const fs = data?.document?.pdfFontScale ?? 0.92;
  const isTable = opts.flow === 'table';
  const base = [
    paddingInsetCss(inset),
    'box-sizing:border-box',
    'width:100%',
    isTable ? 'height:auto' : 'height:100%',
    isTable ? 'overflow:visible' : 'overflow:hidden',
    isTable ? 'min-height:0' : '',
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
  const inset = data.page2?.contentInsetPt || data.page1?.contentInsetPt;
  if (!inset) return '';
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
 * Page 2 table from data1.json only (page2.tableBody). Puppeteer prints baseUrl + absolute image paths.
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
  const opts = { scale, baseUrl: baseUrl || '', pdfFontScale };
  const headerTr = renderTableRow(body[0], 0);
  const tbody = renderTableBodySlice(body.slice(1), opts);
  const colgroup = `<colgroup>
<col style="width:7%" />
<col style="width:11%" />
<col style="width:30%" />
<col style="width:10%" />
<col style="width:11%" />
<col style="width:8%" />
<col style="width:8%" />
<col style="width:15%" />
</colgroup>`;
  const table = renderQuoteTable(tbody, colgroup, headerTr);
  const after =
    Array.isArray(p2.afterTable) && p2.afterTable.length > 0
      ? renderAfterTableBlocks(p2.afterTable, opts)
      : '';
  return `<div class="p2-table-wrap">${table}</div>${after ? `<div class="p2-after-table">${after}</div>` : ''}`;
}
