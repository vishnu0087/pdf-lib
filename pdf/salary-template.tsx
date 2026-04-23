import {
  renderPdfDocumentShellToHtml,
  type PdfDocumentShellInput,
} from './document-template-core.tsx';

export type SalaryPdfHtmlInput = PdfDocumentShellInput;

export function renderSalaryPdfHtml(input: PdfDocumentShellInput): string {
  return renderPdfDocumentShellToHtml(input, {
    htmlTitle: 'Salary slip PDF',
    letterAriaLabel: 'Salary slip',
    continuationAriaLabel: 'Salary slip — continuation',
    showNotApprovedStamp: false,
  });
}
