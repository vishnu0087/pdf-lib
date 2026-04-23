import {
  renderPdfDocumentShellToHtml,
  type PdfDocumentShellInput,
} from './document-template-core.tsx';

export type SalesPdfHtmlInput = PdfDocumentShellInput;

export function renderSalesPdfHtml(input: PdfDocumentShellInput): string {
  return renderPdfDocumentShellToHtml(input, {
    htmlTitle: 'Sales order PDF',
    letterAriaLabel: 'Sales order',
    continuationAriaLabel: 'Sales order — continuation',
  });
}
