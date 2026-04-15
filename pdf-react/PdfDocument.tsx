import type { ReactNode } from 'react';

export type PdfDocumentProps = {
  baseUrl: string;
  page1Html: string;
  page2Html: string;
  page1InnerStyle?: string;
  page2SheetStyle?: string;
  page2InnerStyle?: string;
  /** Generated print CSS (build-print-css.mjs): @page, base, injected-body selectors */
  printCss: string;
};

/** Shell layout uses React inline styles matching legacy CSS exactly (avoids JIT edge cases). */
const shell = {
  page1Section: {
    width: '210mm',
    height: '297mm',
    maxHeight: '297mm',
    boxSizing: 'border-box' as const,
    position: 'relative' as const,
    pageBreakAfter: 'always' as const,
    pageBreakInside: 'avoid' as const,
    overflow: 'hidden' as const,
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
  page1Inner: {
    position: 'relative' as const,
    zIndex: 1,
    height: '100%',
    boxSizing: 'border-box' as const,
  },
  page2Section: {
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
  page2Inner: {
    position: 'relative' as const,
    zIndex: 1,
    height: 'auto' as const,
    minHeight: 0,
    overflow: 'visible' as const,
    boxSizing: 'border-box' as const,
  },
};

export default function PdfDocument({
  baseUrl,
  page1Html,
  page2Html,
  page1InnerStyle,
  page2SheetStyle,
  page2InnerStyle,
  printCss,
}: PdfDocumentProps) {
  const dyn: ReactNode[] = [];
  if (page1InnerStyle) {
    dyn.push(
      <style
        key="p1"
        dangerouslySetInnerHTML={{
          __html: `.sheet-inner--p1{${page1InnerStyle}}`,
        }}
      />
    );
  }
  if (page2SheetStyle) {
    dyn.push(
      <style
        key="p2s"
        dangerouslySetInnerHTML={{
          __html: `.sheet.sheet--table{${page2SheetStyle}}`,
        }}
      />
    );
  }
  if (page2InnerStyle) {
    dyn.push(
      <style
        key="p2i"
        dangerouslySetInnerHTML={{
          __html: `.sheet-inner--p2{${page2InnerStyle}}`,
        }}
      />
    );
  }

  const bgUrl = `${baseUrl}/assests/pdf-background.png`;

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
        <section aria-label="Page 1" style={shell.page1Section}>
          <img
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
            style={shell.page1Inner}
            dangerouslySetInnerHTML={{ __html: page1Html }}
          />
        </section>

        <section
          className="sheet sheet--table"
          aria-label="Page 2"
          style={{
            ...shell.page2Section,
            backgroundImage: `url(${bgUrl})`,
          }}
        >
          <div
            className="sheet-inner sheet-inner--p2"
            style={shell.page2Inner}
            dangerouslySetInnerHTML={{ __html: page2Html }}
          />
        </section>
      </body>
    </html>
  );
}
