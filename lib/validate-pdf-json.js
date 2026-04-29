import { renderQuoteDocumentParts } from './render-quote-html.js';
import { renderSalesDocumentParts } from './render-sales-html.js';
import { renderInvoiceDocumentParts } from './render-invoice-html.js';
import { renderSalaryDocumentParts } from './render-salary-html.js';

export const DOC_FORMATS = {
  quote: 'puppeteer-quote-pdf',
  invoice: 'puppeteer-invoice-pdf',
  salary: 'puppeteer-salary-pdf',
  sales: 'puppeteer-sales-pdf',
};

const DOC_TYPES = new Set(Object.keys(DOC_FORMATS));

/**
 * @param {string} docType - quote | invoice | salary | sales
 * @param {unknown} data - parsed JSON
 * @returns {{ valid: true } | { valid: false, error: string }}
 */
export function validatePdfJsonStructure(docType, data) {
  if (!DOC_TYPES.has(docType)) {
    return { valid: false, error: 'Invalid document type.' };
  }
  if (data == null || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, error: 'JSON must be a non-empty object.' };
  }
  const expected = DOC_FORMATS[docType];
  if (data.format !== expected) {
    return {
      valid: false,
      error: `This file is for "${data.format || 'unknown'}". For ${docType}, use format "${expected}".`,
    };
  }
  if (typeof data.formatVersion !== 'number' || !Number.isFinite(data.formatVersion)) {
    return { valid: false, error: 'formatVersion must be a finite number.' };
  }
  if (!data.document || typeof data.document !== 'object' || Array.isArray(data.document)) {
    return { valid: false, error: 'Missing or invalid "document" object.' };
  }
  if (!data.page1 || typeof data.page1 !== 'object' || Array.isArray(data.page1)) {
    return { valid: false, error: 'Missing or invalid "page1" object.' };
  }
  return { valid: true };
}

/**
 * Ensures the renderer accepts this payload (same code path as PDF HTML).
 * @param {string} docType
 * @param {object} data
 * @param {number} listenPort
 */
export function validatePdfJsonRender(docType, data, listenPort) {
  const base = `http://127.0.0.1:${listenPort}`;
  try {
    switch (docType) {
      case 'quote':
        renderQuoteDocumentParts(data, base);
        break;
      case 'sales':
        renderSalesDocumentParts(data, base);
        break;
      case 'invoice':
        renderInvoiceDocumentParts(data, base);
        break;
      case 'salary':
        renderSalaryDocumentParts(data, base);
        break;
      default:
        return { valid: false, error: 'Invalid document type.' };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      valid: false,
      error: `Data is not valid for PDF rendering: ${msg}`,
    };
  }
  return { valid: true };
}
