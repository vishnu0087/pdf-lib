import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import React, { type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TEMPLATE_FIELD_CSS } from '../lib/template-field-styles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let cachedPrintCss: string | null = null;

export function getPrintCssForPdf(): string {
  if (cachedPrintCss != null) return cachedPrintCss;
  const cssPath = path.join(__dirname, 'print.built.css');
  cachedPrintCss = readFileSync(cssPath, 'utf8');
  return cachedPrintCss;
}

/** Shared input for quote / sales / invoice shells: inner HTML + optional per-sheet CSS. */
export type PdfDocumentShellInput = {
  baseUrl: string;
  letterInnerHtml: string;
  tableFlowInnerHtml: string;
  letterInnerStyle?: string;
  tableSheetStyle?: string;
  tableInnerStyle?: string;
};

export type PdfShellMeta = {
  /** Shown in `<title>` */
  htmlTitle: string;
  /** `aria-label` for the first sheet */
  letterAriaLabel: string;
  /** `aria-label` for the continuation sheet (if any) */
  continuationAriaLabel: string;
  /** When false, omits the not-approved corner image (e.g. salary slips). Default true. */
  showNotApprovedStamp?: boolean;
};

const shell = {
  letterSection: {
    width: '210mm',
    minHeight: '297mm',
    height: 'auto' as const,
    maxHeight: 'none' as const,
    boxSizing: 'border-box' as const,
    position: 'relative' as const,
    pageBreakAfter: 'auto' as const,
    pageBreakInside: 'auto' as const,
    overflow: 'visible' as const,
    backgroundColor: '#fff',
  },
  sheetBg: {
    position: 'absolute' as const,
    left: 0,
    top: 0,
    width: '210mm',
    height: '297mm',
    objectFit: 'fill' as const,
    objectPosition: 'top left' as const,
    zIndex: 0,
    display: 'block' as const,
    pointerEvents: 'none' as const,
  },
  stamp: {
    position: 'absolute' as const,
    left: 0,
    top: 0,
    zIndex: 5,
    width: '120pt',
    height: 'auto' as const,
    display: 'block' as const,
    pointerEvents: 'none' as const,
  },
  letterInner: {
    position: 'relative' as const,
    zIndex: 1,
    height: 'auto' as const,
    minHeight: 0,
    overflow: 'visible' as const,
    boxSizing: 'border-box' as const,
  },
  tableFlowSection: {
    pageBreakInside: 'auto' as const,
    minHeight: '297mm',
    height: 'auto' as const,
    maxHeight: 'none' as const,
    overflow: 'visible' as const,
    position: 'relative' as const,
    backgroundColor: '#fff',
    backgroundSize: '210mm 297mm',
    /* Full-page art includes footer strip; repeating vertically redraws logos mid-document in screen preview. */
    backgroundRepeat: 'no-repeat' as const,
    backgroundPosition: 'top left' as const,
    backgroundOrigin: 'border-box' as const,
    backgroundClip: 'border-box' as const,
    width: '210mm',
    pageBreakAfter: 'auto' as const,
  },
  tableInner: {
    position: 'relative' as const,
    zIndex: 1,
    height: 'auto' as const,
    minHeight: 0,
    overflow: 'visible' as const,
    boxSizing: 'border-box' as const,
  },
};

function PdfDocumentShell({
  baseUrl,
  letterInnerHtml,
  tableFlowInnerHtml,
  letterInnerStyle,
  tableSheetStyle,
  tableInnerStyle,
  printCss,
  shellMeta,
}: PdfDocumentShellInput & { printCss: string; shellMeta: PdfShellMeta }) {
  const dyn: ReactNode[] = [];
  if (letterInnerStyle) {
    dyn.push(
      <style
        key="letter"
        dangerouslySetInnerHTML={{
          __html: `.sheet-inner--p1{${letterInnerStyle}}`,
        }}
      />
    );
  }
  if (tableSheetStyle) {
    dyn.push(
      <style
        key="tableSheet"
        dangerouslySetInnerHTML={{
          __html: `.sheet.sheet--table{${tableSheetStyle}}`,
        }}
      />
    );
  }
  if (tableInnerStyle) {
    dyn.push(
      <style
        key="tableInner"
        dangerouslySetInnerHTML={{
          __html: `.sheet-inner--p2{${tableInnerStyle}}`,
        }}
      />
    );
  }

  const bgUrl = `${baseUrl}/assests/pdf-background.png`;

  /* One full A4 art per printed page: @page backgrounds repeat per sheet correctly.
   * (background-repeat on .sheet fragments only paints a slice on short last pages.) */
  const printWatermarkCss = `@page {
  size: A4 portrait;
  margin: 0;
  background-color: #ffffff;
  background-image: url("${bgUrl}");
  background-size: 210mm 297mm;
  background-repeat: no-repeat;
  background-position: top left;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
@media print {
  html,
  body {
    background: transparent !important;
  }
  .sheet.sheet--letter,
  .sheet.sheet--table {
    background-image: none !important;
    background-color: transparent !important;
  }
  .letter-sheet-bg {
    display: none !important;
  }
}`;

  return (
    <html lang="en" style={{ fontSize: '10pt' }}>
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{shellMeta.htmlTitle}</title>
        <link
          rel="stylesheet"
          href={`${baseUrl}/fontsource/montserrat/latin-400.css`}
        />
        <link
          rel="stylesheet"
          href={`${baseUrl}/fontsource/montserrat/latin-700.css`}
        />
        <style dangerouslySetInnerHTML={{ __html: printCss }} />
        {/* Phase 9: toolbox field styles — identical to the editor preview's
            injected CSS so editor and PDF render fields the same. */}
        <style dangerouslySetInnerHTML={{ __html: TEMPLATE_FIELD_CSS }} />
        <style dangerouslySetInnerHTML={{ __html: printWatermarkCss }} />
        {dyn}
      </head>
      <body
        style={{
          margin: 0,
          padding: 0,
          background: '#fff',
          fontSize: '10pt',
          lineHeight: 1.2,
        }}
      >
        <section
          className="sheet sheet--letter"
          aria-label={shellMeta.letterAriaLabel}
          style={shell.letterSection}
        >
          <img
            className="letter-sheet-bg"
            style={shell.sheetBg}
            src={bgUrl}
            alt=""
          />
          {shellMeta.showNotApprovedStamp !== false ? (
            <img
              style={shell.stamp}
              src={`${baseUrl}/assests/not_approved.png`}
              alt=""
            />
          ) : null}
          <div
            className="sheet-inner sheet-inner--p1"
            style={shell.letterInner}
            dangerouslySetInnerHTML={{ __html: letterInnerHtml }}
          />
        </section>

        {tableFlowInnerHtml.trim() !== '' ? (
          <section
            className="sheet sheet--table"
            aria-label={shellMeta.continuationAriaLabel}
            style={{
              ...shell.tableFlowSection,
              backgroundImage: `url(${bgUrl})`,
            }}
          >
            <div
              className="sheet-inner sheet-inner--p2"
              style={shell.tableInner}
              dangerouslySetInnerHTML={{ __html: tableFlowInnerHtml }}
            />
          </section>
        ) : null}
      </body>
    </html>
  );
}

/**
 * Renders the shared A4 shell (background; optional not_approved stamp via `shellMeta.showNotApprovedStamp`).
 */
export function renderPdfDocumentShellToHtml(
  input: PdfDocumentShellInput,
  shellMeta: PdfShellMeta
): string {
  const markup = renderToStaticMarkup(
    <PdfDocumentShell
      {...input}
      printCss={getPrintCssForPdf()}
      shellMeta={shellMeta}
    />
  );
  return '<!DOCTYPE html>\n' + markup;
}
