import {
  renderPdfDocumentShellToHtml,
  type PdfDocumentShellInput,
} from './document-template-core.tsx';

/** @deprecated Use `PdfDocumentShellInput` from document-template-core */
export type QuotePdfHtmlInput = PdfDocumentShellInput;

export function renderQuotePdfHtml(input: PdfDocumentShellInput): string {
  return renderPdfDocumentShellToHtml(input, {
    htmlTitle: 'Quote PDF',
    letterAriaLabel: 'Quote — first page',
    continuationAriaLabel: 'Quote — continuation',
  });
}
