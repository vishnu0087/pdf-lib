import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { renderToStaticMarkup } from 'react-dom/server';
import PdfDocument from './PdfDocument';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let cachedPrintCss: string | null = null;

function getPrintCss(): string {
  if (cachedPrintCss != null) return cachedPrintCss;
  const cssPath = path.join(__dirname, 'pdf-tailwind.built.css');
  cachedPrintCss = readFileSync(cssPath, 'utf8');
  return cachedPrintCss;
}

export type RenderPdfHtmlInput = {
  baseUrl: string;
  page1Html: string;
  page2Html: string;
  page1InnerStyle?: string;
  page2SheetStyle?: string;
  page2InnerStyle?: string;
};

export function renderPdfHtml(input: RenderPdfHtmlInput): string {
  const markup = renderToStaticMarkup(
    <PdfDocument
      baseUrl={input.baseUrl}
      page1Html={input.page1Html}
      page2Html={input.page2Html}
      page1InnerStyle={input.page1InnerStyle}
      page2SheetStyle={input.page2SheetStyle}
      page2InnerStyle={input.page2InnerStyle}
      printCss={getPrintCss()}
    />
  );
  return '<!DOCTYPE html>\n' + markup;
}
