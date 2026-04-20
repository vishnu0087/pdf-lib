/**
 * Emits print.built.css: html/body base + rules for injected HTML (quote-table, qt-*, …).
 * @page (size, margin, watermark) is injected in document-template.tsx (dynamic asset URL).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @page size/margin + full-bleed watermark live in document-template.tsx (dynamic asset URL). */
const basePrintCss = `
html {
  font-size: 10pt;
}
html,
body {
  margin: 0;
  padding: 0;
  background: #fff;
  font-size: 10pt;
  line-height: 1.2;
}
* {
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
`;

const innerPrintCss = `
.p1-title {
  box-sizing: border-box;
}
.p1-columns {
  box-sizing: border-box;
}
.p1-meta-line {
  box-sizing: border-box;
  width: 100%;
}
.p1-letter {
  box-sizing: border-box;
}
.quote-table {
  font-family: Montserrat, sans-serif;
  font-size: 10pt;
}
.quote-table td {
  word-wrap: break-word;
  overflow-wrap: break-word;
}
.qt-nested-table {
  width: 100%;
  font-size: 10pt;
  line-height: 1.12;
}
.qt-nested-cell {
  text-align: left;
}
.p2-table-wrap {
  margin: 0;
  padding: 0;
}
.p2-after-table {
  font-family: Montserrat, sans-serif;
  font-size: 10pt;
  color: #333;
  line-height: 1.15;
  width: 100%;
  box-sizing: border-box;
  margin-top: 0;
}
.p2-after-table table {
  word-wrap: break-word;
  overflow-wrap: break-word;
}
.sheet-inner--p2 > :first-child {
  margin-top: 0;
}
.qt-html-table.qt-html-table--star-auto {
  table-layout: auto;
  width: 100%;
}
.qt-html-table.qt-html-table--star-auto col.qt-col-star {
  width: auto;
}
.qt-html-table.qt-html-table--star-auto col.qt-col-auto {
  width: auto;
  min-width: 200pt;
}
.qt-star-auto-cell-inner {
  display: inline-block;
  text-align: left;
  vertical-align: top;
  min-width: 220pt;
  max-width: 100%;
  box-sizing: border-box;
}
.qt-html-table.qt-html-table--light-lines {
  table-layout: auto;
  width: 100%;
  border-collapse: collapse;
  box-sizing: border-box;
}
.qt-html-table.qt-html-table--light-lines td {
  line-height: 1.25;
}
/* Sales only: first two boxed tables (company/order + billing/shipping) — uniform 7pt, tighter padding */
.p2-after-table--sales > table.qt-html-table--light-lines {
  break-inside: auto;
  page-break-inside: auto;
  font-size: 7pt;
}
.p2-after-table--sales > table.qt-html-table--light-lines td {
  padding: 1.5pt 4.5pt !important;
  line-height: 1.2 !important;
}
.p2-after-table--sales > table.qt-html-table--light-lines td,
.p2-after-table--sales > table.qt-html-table--light-lines td * {
  font-size: 7pt !important;
  line-height: 1.2 !important;
}
/* Sales main line-items + in-table totals: compact; totals sub-table narrow like reference PDF */
.qt-sales-main-items-wrap {
  width: 100%;
  box-sizing: border-box;
  zoom: 0.875;
}
.qt-sales-main-items-wrap > table.qt-html-table > tbody > tr > td {
  padding: 1.35pt 3pt !important;
  line-height: 1.18 !important;
}
.qt-sales-main-items-wrap > table.qt-html-table > tbody > tr > td[colspan='7'] {
  text-align: right;
  vertical-align: top;
  padding: 2pt 3pt 2pt 3pt !important;
}
.qt-sales-main-items-wrap > table.qt-html-table > tbody > tr > td[colspan='7'] > table {
  display: inline-table;
  width: auto;
  max-width: 200pt;
  min-width: 0;
  margin: 0;
  vertical-align: top;
  table-layout: auto;
}
.qt-sales-main-items-wrap > table.qt-html-table > tbody > tr > td[colspan='7'] > table.qt-html-table--light-lines td {
  padding: 1.5pt 5pt !important;
}
/* Sales: omit top edge so the frame meets the line-items table above in the flow */
.p2-after-table--sales table.qt-html-table--star-auto:first-of-type {
  page-break-inside: avoid;
  border: 1px solid #ddd;
  border-top: none;
  margin-top: 0;
  box-sizing: border-box;
}
/* Quote: totals block sits below .p2-table-wrap — full box including top */
.p2-after-table:not(.p2-after-table--sales) table.qt-html-table--star-auto {
  page-break-inside: avoid;
  border: 1px solid #ddd;
  margin-top: 0;
  box-sizing: border-box;
}
.qt-columns {
  align-items: flex-start;
}
.qt-columns .qt-stack-block {
  width: auto;
  max-width: 100%;
  min-height: 0;
}
.qt-html-table--totals-inner {
  box-sizing: border-box;
}
/* Totals / grand-total nested table: fill star-auto column so the bordered box lines up with content width */
.qt-star-auto-cell-inner > .qt-html-table {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}
.qt-html-table--compact-twocol {
  width: 100%;
  max-width: 52%;
  min-width: 180pt;
  height: auto;
}
@media print {
  .p1-letter p,
  .p2-after-table p {
    orphans: 2;
    widows: 2;
  }
  .p2-after-table li {
    orphans: 2;
    widows: 2;
  }
  /* Quote (non-sales): original keep light-lines blocks together */
  .p2-after-table:not(.p2-after-table--sales) > table.qt-html-table--light-lines {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  /* Sales: top boxed tables may break to use slack on page 1 */
  .p2-after-table--sales > table.qt-html-table--light-lines {
    break-inside: auto;
    page-break-inside: auto;
  }
  /*
   * Sales line-items: only the header row and the final (totals) row stay unbreakable.
   * Middle data rows may split or move by row so content flows into leftover space on page 1.
   */
  .qt-sales-main-items-wrap > table.qt-html-table > tbody > tr:first-child,
  .qt-sales-main-items-wrap > table.qt-html-table > tbody > tr:last-child {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .qt-sales-main-items-wrap > table.qt-html-table > tbody > tr:not(:first-child):not(:last-child) {
    break-inside: auto;
    page-break-inside: auto;
  }
  /* Quote: original — keep each tbody row unbroken in bordered after-table blocks */
  .p2-after-table:not(.p2-after-table--sales) > table.qt-html-table:not(.qt-html-table--light-lines) > tbody > tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  /* Sales: allow HSN & other bordered tbody rows to break */
  .p2-after-table--sales > table.qt-html-table:not(.qt-html-table--light-lines) > tbody > tr {
    break-inside: auto;
    page-break-inside: auto;
  }
  /* Keep table header block together when thead exists */
  .p2-after-table > table.qt-html-table > thead {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  /* Nested Raw Total → Grand Total grid */
  .qt-html-table--totals-inner {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  /* Applied at PDF time when letter tail on the table-start page is ≥ ~15% of a page (applyPdfLetterTableLayout). */
  .p2-table-wrap.p2-table-wrap--break-before {
    break-before: page;
    page-break-before: always;
  }
}
`;

const out = path.join(__dirname, 'print.built.css');
fs.writeFileSync(
  out,
  `/* Generated by build-print-css.mjs — print + injected-body rules. */\n${basePrintCss.trim()}\n${innerPrintCss.trim()}\n`,
  'utf8'
);
console.log('Wrote', out);
