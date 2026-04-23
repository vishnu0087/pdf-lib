import {
  renderPdfDocumentShellToHtml,
  type PdfDocumentShellInput,
} from './document-template-core.tsx';

export type InvoicePdfHtmlInput = PdfDocumentShellInput;

export function renderInvoicePdfHtml(input: PdfDocumentShellInput): string {
  return renderPdfDocumentShellToHtml(input, {
    htmlTitle: 'Invoice PDF',
    letterAriaLabel: 'Invoice',
    continuationAriaLabel: 'Invoice — continuation',
  });
}
