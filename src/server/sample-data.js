import fs from 'fs';
import { FIXTURES } from './paths.js';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function loadQuoteData() {
  return readJson(FIXTURES.quote);
}

export function loadSalesData() {
  return readJson(FIXTURES.sales);
}

export function loadInvoiceData() {
  return readJson(FIXTURES.invoice);
}

export function loadSalaryData() {
  return readJson(FIXTURES.salary);
}
