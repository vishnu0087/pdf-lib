import { renderQuoteDocumentParts } from '../../lib/render-quote-html.js';
import { renderSalesDocumentParts } from '../../lib/render-sales-html.js';
import { renderInvoiceDocumentParts } from '../../lib/render-invoice-html.js';
import { renderSalaryDocumentParts } from '../../lib/render-salary-html.js';
import { renderQuotePdfHtml } from '../../pdf/quote-template.tsx';
import { renderSalesPdfHtml } from '../../pdf/sales-template.tsx';
import { renderInvoicePdfHtml } from '../../pdf/invoice-template.tsx';
import { renderSalaryPdfHtml } from '../../pdf/salary-template.tsx';

export function htmlForDocType(docType, data, listenPort) {
  const base = `http://127.0.0.1:${listenPort}`;
  if (docType === 'quote') {
    const parts = renderQuoteDocumentParts(data, base);
    return renderQuotePdfHtml({ baseUrl: base, ...parts });
  }
  if (docType === 'sales') {
    const parts = renderSalesDocumentParts(data, base);
    return renderSalesPdfHtml({ baseUrl: base, ...parts });
  }
  if (docType === 'invoice') {
    const parts = renderInvoiceDocumentParts(data, base);
    return renderInvoicePdfHtml({ baseUrl: base, ...parts });
  }
  if (docType === 'salary') {
    const parts = renderSalaryDocumentParts(data, base);
    return renderSalaryPdfHtml({ baseUrl: base, ...parts });
  }
  throw new Error(`Unknown docType: ${docType}`);
}
