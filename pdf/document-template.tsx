import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import React, { type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let cachedPrintCss: string | null = null;

function getPrintCss(): string {
  if (cachedPrintCss != null) return cachedPrintCss;
  const cssPath = path.join(__dirname, 'print.built.css');
  cachedPrintCss = readFileSync(cssPath, 'utf8');
  return cachedPrintCss;
}

/** One quote JSON → one PDF; these are the inner HTML + style strings for the fixed two-sheet shell. */
export type QuotePdfHtmlInput = {
  baseUrl: string;
  letterInnerHtml: string;
  /** When empty, the second sheet is omitted (avoids a blank page for single-flow docs like sales). */
  tableFlowInnerHtml: string;
  letterInnerStyle?: string;
  tableSheetStyle?: string;
  tableInnerStyle?: string;
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
    backgroundRepeat: 'repeat-y' as const,
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

function QuotePdfDocument({
  baseUrl,
  letterInnerHtml,
  tableFlowInnerHtml,
  letterInnerStyle,
  tableSheetStyle,
  tableInnerStyle,
  printCss,
}: QuotePdfHtmlInput & { printCss: string }) {
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
  .letter-sheet-bg {
    display: none !important;
  }
  .sheet.sheet--table {
    background: none !important;
  }
}`;

  return (
    <html lang="en" style={{ fontSize: '10pt' }}>
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>PDF render</title>
        <link
          rel="stylesheet"
          href={`${baseUrl}/fontsource/montserrat/latin-400.css`}
        />
        <link
          rel="stylesheet"
          href={`${baseUrl}/fontsource/montserrat/latin-700.css`}
        />
        <style dangerouslySetInnerHTML={{ __html: printCss }} />
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
          aria-label="Cover letter"
          style={shell.letterSection}
        >
          <img
            className="letter-sheet-bg"
            style={shell.sheetBg}
            src={bgUrl}
            alt=""
          />
          <img
            style={shell.stamp}
            src={`${baseUrl}/assests/not_approved.png`}
            alt=""
          />
          <div
            className="sheet-inner sheet-inner--p1"
            style={shell.letterInner}
            dangerouslySetInnerHTML={{ __html: letterInnerHtml }}
          />
        </section>

        {tableFlowInnerHtml.trim() !== '' ? (
          <section
            className="sheet sheet--table"
            aria-label="Continuation"
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

export function renderQuotePdfHtml(input: QuotePdfHtmlInput): string {
  const markup = renderToStaticMarkup(
    <QuotePdfDocument {...input} printCss={getPrintCss()} />
  );
  return '<!DOCTYPE html>\n' + markup;
}
