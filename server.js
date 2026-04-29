import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { randomBytes } from 'crypto';
import net from 'net';
import puppeteer from 'puppeteer';
import cors from 'cors';
import { renderQuoteDocumentParts } from './lib/render-quote-html.js';
import { renderSalesDocumentParts } from './lib/render-sales-html.js';
import { renderInvoiceDocumentParts } from './lib/render-invoice-html.js';
import { renderSalaryDocumentParts } from './lib/render-salary-html.js';
import {
  applyPdfLetterTableLayout,
  applyPdfOrphanCompaction,
  applyPdfSalesFlowCompaction,
  PDF_VIEWPORT,
} from './lib/pdf-print-compact.js';
import { renderQuotePdfHtml } from './pdf/quote-template.tsx';
import { renderSalesPdfHtml } from './pdf/sales-template.tsx';
import { renderInvoicePdfHtml } from './pdf/invoice-template.tsx';
import { renderSalaryPdfHtml } from './pdf/salary-template.tsx';
import {
  validatePdfJsonStructure,
  validatePdfJsonRender,
} from './lib/validate-pdf-json.js';
import {
  applyTemplateOverrides,
  extractTemplateDefaults,
} from './lib/pdf-template-customization.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** User-saved template overlays (never overwrite built-in `pdf/` templates). */
const NEW_TEMPLATE_DIR = path.join(__dirname, 'new-template');

/** Vite-built React SPA (see npm run build:editor). */
const TEMPLATE_EDITOR_INDEX = path.join(
  __dirname,
  'public',
  'template-editor',
  'index.html'
);

const dataPath = path.join(__dirname, 'Quote', 'data1.json');
const salesDataPath = path.join(__dirname, 'Sales', 's-data1.json');
const invoiceDataPath = path.join(__dirname, 'Invoice', 'invoice-data1.json');
const salaryDataPath = path.join(__dirname, 'salary', 'sa-data1.json');

/** node_modules may live next to pdf-lib (repo root) or inside pdf-lib */
function resolveModuleDir(...segments) {
  const local = path.join(__dirname, 'node_modules', ...segments);
  if (fs.existsSync(local)) return local;
  return path.join(__dirname, '..', 'node_modules', ...segments);
}

function loadQuoteData() {
  const raw = fs.readFileSync(dataPath, 'utf8');
  return JSON.parse(raw);
}

function loadSalesData() {
  const raw = fs.readFileSync(salesDataPath, 'utf8');
  return JSON.parse(raw);
}

function loadInvoiceData() {
  const raw = fs.readFileSync(invoiceDataPath, 'utf8');
  return JSON.parse(raw);
}

function loadSalaryData() {
  const raw = fs.readFileSync(salaryDataPath, 'utf8');
  return JSON.parse(raw);
}

/** Try startPort, then startPort+1, … until a port accepts a listen (or maxAttempts). */
function findAvailablePort(startPort, maxAttempts = 50) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const tryPort = (port) => {
      const probe = net.createServer();
      probe.once('error', (err) => {
        probe.removeAllListeners();
        if (err.code === 'EADDRINUSE') {
          attempts += 1;
          if (attempts >= maxAttempts) {
            reject(
              new Error(
                `No free port after ${maxAttempts} attempts starting at ${startPort}`
              )
            );
            return;
          }
          tryPort(port + 1);
        } else {
          reject(err);
        }
      });
      probe.once('listening', () => {
        probe.close(() => resolve(port));
      });
      probe.listen(port);
    };
    tryPort(startPort);
  });
}

const desiredPort = (() => {
  const p = Number(process.env.PORT);
  return Number.isFinite(p) && p > 0 ? Math.floor(p) : 3000;
})();

let listenPort;

const app = express();

app.use(cors({ origin: [/localhost:\d+$/, /127\.0\.0\.1:\d+$/] }));

app.use(express.json({ limit: '50mb' }));

app.use('/assests', express.static(path.join(__dirname, 'assests')));

app.use(
  '/fontsource/montserrat',
  express.static(resolveModuleDir('@fontsource', 'montserrat'))
);

app.get('/pdf-render', (req, res) => {
  const data = loadQuoteData();
  const base = `http://127.0.0.1:${listenPort}`;
  const parts = renderQuoteDocumentParts(data, base);
  const html = renderQuotePdfHtml({
    baseUrl: base,
    ...parts,
  });
  res.type('html').send(html);
});

app.get('/pdf-render-sales', (req, res) => {
  const data = loadSalesData();
  const base = `http://127.0.0.1:${listenPort}`;
  const parts = renderSalesDocumentParts(data, base);
  const html = renderSalesPdfHtml({
    baseUrl: base,
    ...parts,
  });
  res.type('html').send(html);
});

app.get('/pdf-render-invoice', (req, res) => {
  const data = loadInvoiceData();
  const base = `http://127.0.0.1:${listenPort}`;
  const parts = renderInvoiceDocumentParts(data, base);
  const html = renderInvoicePdfHtml({
    baseUrl: base,
    ...parts,
  });
  res.type('html').send(html);
});

app.get('/pdf-render-salary', (req, res) => {
  const data = loadSalaryData();
  const base = `http://127.0.0.1:${listenPort}`;
  const parts = renderSalaryDocumentParts(data, base);
  const html = renderSalaryPdfHtml({
    baseUrl: base,
    ...parts,
  });
  res.type('html').send(html);
});

async function waitFontsAndImages(page) {
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
  });
  await page.evaluate(async () => {
    await Promise.all(
      [...document.images].map(
        (img) =>
          new Promise((resolve, reject) => {
            const ok = () => {
              if (img.naturalWidth > 0) resolve();
              else reject(new Error('Image not decoded: ' + img.src));
            };
            if (img.complete) ok();
            else {
              img.addEventListener('load', ok, { once: true });
              img.addEventListener(
                'error',
                () => reject(new Error('Image failed: ' + img.src)),
                { once: true }
              );
            }
          })
      )
    );
  });
}

/**
 * @param {string} html
 * @param {'quote' | 'other'} quoteLayout - quote skips sales-flow compaction
 */
async function puppeteerHtmlToPdfBuffer(html, quoteLayout) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: PDF_VIEWPORT.width,
      height: PDF_VIEWPORT.height,
      deviceScaleFactor: 1,
    });
    await page.setContent(html, {
      waitUntil: 'networkidle0',
      timeout: 60000,
    });
    await waitFontsAndImages(page);
    await page.emulateMediaType('print');
    await applyPdfLetterTableLayout(page);
    if (quoteLayout !== 'quote') {
      await applyPdfSalesFlowCompaction(page);
    }
    await applyPdfOrphanCompaction(page);
    const pdfBuffer = await page.pdf({
      width: '210mm',
      height: '297mm',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      preferCSSPageSize: true,
      scale: 1,
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

function ensureNewTemplateDir() {
  fs.mkdirSync(NEW_TEMPLATE_DIR, { recursive: true });
}

function sanitizeLiveHtmlPayload(html) {
  if (typeof html !== 'string' || html.length < 200) return '';
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '')
    .replace(/\sjavascript:/gi, ' blocked:');
}

function isUsableFullDocumentHtml(s) {
  return (
    typeof s === 'string' &&
    s.length > 400 &&
    /<html[\s>]/i.test(s) &&
    /<\/html>/i.test(s)
  );
}

function loadCustomTemplateRecord(id, expectedDocType) {
  if (
    !id ||
    typeof id !== 'string' ||
    !/^tpl_[a-zA-Z0-9_-]+$/.test(id)
  ) {
    return { valid: false, error: 'Invalid template id.' };
  }
  const fp = path.join(NEW_TEMPLATE_DIR, `${id}.json`);
  if (!fs.existsSync(fp)) {
    return { valid: false, error: 'Template not found.' };
  }
  try {
    const raw = fs.readFileSync(fp, 'utf8');
    const j = JSON.parse(raw);
    if (j.docType !== expectedDocType) {
      return {
        valid: false,
        error: 'Template is for a different document type.',
      };
    }
    if (!j.overrides || typeof j.overrides !== 'object') {
      return { valid: false, error: 'Invalid template file.' };
    }
    return { valid: true, record: j, overrides: j.overrides };
  } catch {
    return { valid: false, error: 'Could not read template.' };
  }
}

/** @returns {{ valid: true, overrides: object } | { valid: false, error: string }} */
function loadCustomTemplate(id, expectedDocType) {
  const r = loadCustomTemplateRecord(id, expectedDocType);
  if (!r.valid) return r;
  return { valid: true, overrides: r.overrides };
}

function htmlForDocType(docType, data) {
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

const PDF_DOWNLOAD_NAMES = {
  quote: 'document.pdf',
  sales: 'sales-order.pdf',
  invoice: 'invoice.pdf',
  salary: 'salary-slip.pdf',
};

app.get('/api/custom-templates', (req, res) => {
  ensureNewTemplateDir();
  const docType = req.query.docType;
  const okTypes = ['quote', 'sales', 'invoice', 'salary'];
  if (!okTypes.includes(String(docType))) {
    return res.status(400).json({ error: 'Invalid docType.' });
  }
  try {
    const entries = [];
    let names = [];
    try {
      names = fs.readdirSync(NEW_TEMPLATE_DIR);
    } catch {
      names = [];
    }
    for (const file of names) {
      if (!file.endsWith('.json')) continue;
      try {
        const fp = path.join(NEW_TEMPLATE_DIR, file);
        const j = JSON.parse(fs.readFileSync(fp, 'utf8'));
        if (j.docType === docType && j.id && j.overrides) {
          entries.push({
            id: j.id,
            name: typeof j.name === 'string' ? j.name : j.id,
            createdAt: j.createdAt || null,
          });
        }
      } catch {
        continue;
      }
    }
    entries.sort((a, b) =>
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    );
    res.json(entries);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not list templates.' });
  }
});

app.get('/api/custom-templates/:id', (req, res) => {
  ensureNewTemplateDir();
  const docType = req.query.docType;
  const okTypes = ['quote', 'sales', 'invoice', 'salary'];
  if (!okTypes.includes(String(docType))) {
    return res
      .status(400)
      .json({ error: 'Missing or invalid docType query parameter.' });
  }
  const loaded = loadCustomTemplateRecord(
    req.params.id,
    String(docType)
  );
  if (!loaded.valid) {
    return res.status(404).json({ error: loaded.error });
  }
  return res.json({
    id: loaded.record.id,
    name: loaded.record.name,
    docType: loaded.record.docType,
    createdAt: loaded.record.createdAt,
    overrides: loaded.record.overrides,
  });
});

app.post('/api/template-extract', (req, res) => {
  const { docType, data } = req.body || {};
  const struct = validatePdfJsonStructure(docType, data);
  if (!struct.valid) {
    return res.status(400).json(struct);
  }
  try {
    const overrides = extractTemplateDefaults(docType, data);
    return res.json({ overrides });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: e instanceof Error ? e.message : 'Extract failed.',
    });
  }
});

/** Full HTML for in-browser WYSIWYG preview (same pipeline as PDF). */
app.post('/api/template-preview-html', (req, res) => {
  const { docType, data, overrides } = req.body || {};
  const struct = validatePdfJsonStructure(docType, data);
  if (!struct.valid) {
    return res.status(400).json(struct);
  }
  let merged = data;
  if (overrides && typeof overrides === 'object') {
    merged = applyTemplateOverrides(docType, data, overrides);
  }
  const renderCheck = validatePdfJsonRender(docType, merged, listenPort);
  if (!renderCheck.valid) {
    return res.status(400).json(renderCheck);
  }
  try {
    const html = htmlForDocType(docType, merged);
    return res.json({ html });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: String(e.message || 'Preview generation failed.'),
    });
  }
});

app.post('/api/custom-templates', (req, res) => {
  ensureNewTemplateDir();
  const { docType, name, overrides } = req.body || {};
  const okTypes = ['quote', 'sales', 'invoice', 'salary'];
  if (!okTypes.includes(docType)) {
    return res.status(400).json({ error: 'Invalid docType.' });
  }
  if (!overrides || typeof overrides !== 'object') {
    return res.status(400).json({ error: 'Missing overrides.' });
  }
  const id = `tpl_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`;
  const trimmedName =
    String(name || 'Custom template').trim().slice(0, 120) ||
    'Custom template';
  const rec = {
    id,
    name: trimmedName,
    docType,
    createdAt: new Date().toISOString(),
    overrides,
  };
  try {
    fs.writeFileSync(
      path.join(NEW_TEMPLATE_DIR, `${id}.json`),
      JSON.stringify(rec, null, 2),
      'utf8'
    );
    res.json({ id, name: trimmedName });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not save template.' });
  }
});

app.post('/api/validate-pdf-json', (req, res) => {
  const { docType, data } = req.body || {};
  const struct = validatePdfJsonStructure(docType, data);
  if (!struct.valid) {
    return res.status(400).json(struct);
  }
  const renderCheck = validatePdfJsonRender(docType, data, listenPort);
  if (!renderCheck.valid) {
    return res.status(400).json(renderCheck);
  }
  return res.json({ valid: true });
});

app.post('/api/pdf-generate', async (req, res) => {
  const { docType, data, templateId, liveHtml: liveHtmlRaw } = req.body || {};
  const struct = validatePdfJsonStructure(docType, data);
  if (!struct.valid) {
    return res.status(400).json(struct);
  }
  const renderCheck = validatePdfJsonRender(docType, data, listenPort);
  if (!renderCheck.valid) {
    return res.status(400).json(renderCheck);
  }

  const tid =
    templateId != null && String(templateId).trim() !== ''
      ? String(templateId).trim()
      : '';

  let loaded = null;
  if (tid) {
    loaded = loadCustomTemplate(tid, docType);
    if (!loaded.valid) {
      return res.status(400).json({ valid: false, error: loaded.error });
    }
  }

  const fromClient = sanitizeLiveHtmlPayload(String(liveHtmlRaw || ''));
  const fromStored =
    loaded?.overrides?._liveHtml &&
    typeof loaded.overrides._liveHtml === 'string'
      ? sanitizeLiveHtmlPayload(loaded.overrides._liveHtml)
      : '';

  let htmlExact = '';
  if (isUsableFullDocumentHtml(fromClient)) {
    htmlExact = fromClient;
  } else if (isUsableFullDocumentHtml(fromStored)) {
    htmlExact = fromStored;
  }

  if (htmlExact) {
    try {
      const quoteLayout = docType === 'quote' ? 'quote' : 'other';
      const buf = await puppeteerHtmlToPdfBuffer(htmlExact, quoteLayout);
      const filename = PDF_DOWNLOAD_NAMES[docType] || 'document.pdf';
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`
      );
      res.send(buf);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'PDF generation failed' });
    }
    return;
  }

  let dataForPdf = data;
  if (tid && loaded) {
    dataForPdf = applyTemplateOverrides(docType, data, loaded.overrides);
    const mergedCheck = validatePdfJsonRender(docType, dataForPdf, listenPort);
    if (!mergedCheck.valid) {
      return res.status(400).json(mergedCheck);
    }
  }

  try {
    const html = htmlForDocType(docType, dataForPdf);
    const quoteLayout = docType === 'quote' ? 'quote' : 'other';
    const buf = await puppeteerHtmlToPdfBuffer(html, quoteLayout);
    const filename = PDF_DOWNLOAD_NAMES[docType] || 'document.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'PDF generation failed' });
  }
});

app.get('/api/pdf', async (req, res) => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: PDF_VIEWPORT.width,
      height: PDF_VIEWPORT.height,
      deviceScaleFactor: 1,
    });
    await page.goto(`http://127.0.0.1:${listenPort}/pdf-render`, {
      waitUntil: 'networkidle0',
      timeout: 60000,
    });
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
    });
    await page.evaluate(async () => {
      await Promise.all(
        [...document.images].map(
          (img) =>
            new Promise((resolve, reject) => {
              const ok = () => {
                if (img.naturalWidth > 0) resolve();
                else reject(new Error('Image not decoded: ' + img.src));
              };
              if (img.complete) ok();
              else {
                img.addEventListener('load', ok, { once: true });
                img.addEventListener(
                  'error',
                  () => reject(new Error('Image failed: ' + img.src)),
                  { once: true }
                );
              }
            })
        )
      );
    });
    await page.emulateMediaType('print');
    await applyPdfLetterTableLayout(page);
    await applyPdfOrphanCompaction(page);
    const pdfBuffer = await page.pdf({
      width: '210mm',
      height: '297mm',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      preferCSSPageSize: true,
      scale: 1,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="document.pdf"'
    );
    res.send(Buffer.from(pdfBuffer));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'PDF generation failed' });
  } finally {
    await browser.close();
  }
});

app.get('/api/pdf-sales', async (req, res) => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: PDF_VIEWPORT.width,
      height: PDF_VIEWPORT.height,
      deviceScaleFactor: 1,
    });
    await page.goto(`http://127.0.0.1:${listenPort}/pdf-render-sales`, {
      waitUntil: 'networkidle0',
      timeout: 60000,
    });
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
    });
    await page.evaluate(async () => {
      await Promise.all(
        [...document.images].map(
          (img) =>
            new Promise((resolve, reject) => {
              const ok = () => {
                if (img.naturalWidth > 0) resolve();
                else reject(new Error('Image not decoded: ' + img.src));
              };
              if (img.complete) ok();
              else {
                img.addEventListener('load', ok, { once: true });
                img.addEventListener(
                  'error',
                  () => reject(new Error('Image failed: ' + img.src)),
                  { once: true }
                );
              }
            })
        )
      );
    });
    await page.emulateMediaType('print');
    await applyPdfLetterTableLayout(page);
    await applyPdfSalesFlowCompaction(page);
    await applyPdfOrphanCompaction(page);
    const pdfBuffer = await page.pdf({
      width: '210mm',
      height: '297mm',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      preferCSSPageSize: true,
      scale: 1,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="sales-order.pdf"'
    );
    res.send(Buffer.from(pdfBuffer));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'PDF generation failed' });
  } finally {
    await browser.close();
  }
});

app.get('/api/pdf-invoice', async (req, res) => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: PDF_VIEWPORT.width,
      height: PDF_VIEWPORT.height,
      deviceScaleFactor: 1,
    });
    await page.goto(`http://127.0.0.1:${listenPort}/pdf-render-invoice`, {
      waitUntil: 'networkidle0',
      timeout: 60000,
    });
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
    });
    await page.evaluate(async () => {
      await Promise.all(
        [...document.images].map(
          (img) =>
            new Promise((resolve, reject) => {
              const ok = () => {
                if (img.naturalWidth > 0) resolve();
                else reject(new Error('Image not decoded: ' + img.src));
              };
              if (img.complete) ok();
              else {
                img.addEventListener('load', ok, { once: true });
                img.addEventListener(
                  'error',
                  () => reject(new Error('Image failed: ' + img.src)),
                  { once: true }
                );
              }
            })
        )
      );
    });
    await page.emulateMediaType('print');
    await applyPdfLetterTableLayout(page);
    await applyPdfSalesFlowCompaction(page);
    await applyPdfOrphanCompaction(page);
    const pdfBuffer = await page.pdf({
      width: '210mm',
      height: '297mm',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      preferCSSPageSize: true,
      scale: 1,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="invoice.pdf"'
    );
    res.send(Buffer.from(pdfBuffer));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'PDF generation failed' });
  } finally {
    await browser.close();
  }
});

app.get('/api/pdf-salary', async (req, res) => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: PDF_VIEWPORT.width,
      height: PDF_VIEWPORT.height,
      deviceScaleFactor: 1,
    });
    await page.goto(`http://127.0.0.1:${listenPort}/pdf-render-salary`, {
      waitUntil: 'networkidle0',
      timeout: 60000,
    });
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
    });
    await page.evaluate(async () => {
      await Promise.all(
        [...document.images].map(
          (img) =>
            new Promise((resolve, reject) => {
              const ok = () => {
                if (img.naturalWidth > 0) resolve();
                else reject(new Error('Image not decoded: ' + img.src));
              };
              if (img.complete) ok();
              else {
                img.addEventListener('load', ok, { once: true });
                img.addEventListener(
                  'error',
                  () => reject(new Error('Image failed: ' + img.src)),
                  { once: true }
                );
              }
            })
        )
      );
    });
    await page.emulateMediaType('print');
    await applyPdfLetterTableLayout(page);
    await applyPdfSalesFlowCompaction(page);
    await applyPdfOrphanCompaction(page);
    const pdfBuffer = await page.pdf({
      width: '210mm',
      height: '297mm',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      preferCSSPageSize: true,
      scale: 1,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="salary-slip.pdf"'
    );
    res.send(Buffer.from(pdfBuffer));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'PDF generation failed' });
  } finally {
    await browser.close();
  }
});

function serveTemplateEditorIndex(_req, res) {
  if (!fs.existsSync(TEMPLATE_EDITOR_INDEX)) {
    res
      .status(503)
      .type('html')
      .send(
        '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Template editor</title></head>' +
          '<body style="font-family:system-ui,sans-serif;padding:2rem;line-height:1.5;color:#323130">' +
          '<h1 style="margin-top:0">Template editor assets missing</h1>' +
          '<p>The Customize page is shipped as a separate Vite build.</p>' +
          '<p>From your <strong>pdf-lib</strong> folder run:</p>' +
          '<pre style="background:#f6f6f4;padding:1rem;overflow:auto;border-radius:8px">' +
          'npm install\n' +
          'npm run build:editor\n' +
          'npm start</pre>' +
          '</body></html>'
      );
    return;
  }
  res.sendFile(TEMPLATE_EDITOR_INDEX, (err) => {
    if (err) console.error('[template-editor] sendFile:', err.message);
  });
}

/**
 * Express collapses "/template-editor" and "/template-editor/" to the same req.path
 * ("/template-editor"), so a redirect from /template-editor → /template-editor/ loops forever.
 * Serve the SPA for .html, with or without trailing slash.
 */
app.get(/^\/template-editor(?:\/|\.html)?$/i, serveTemplateEditorIndex);

app.use(express.static(path.join(__dirname, 'public')));

try {
  listenPort = await findAvailablePort(desiredPort);
  if (listenPort !== desiredPort) {
    console.warn(
      `Port ${desiredPort} was busy — using ${listenPort} instead.`
    );
  }
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}

ensureNewTemplateDir();

const server = app.listen(listenPort, () => {
  console.log(`Open http://127.0.0.1:${listenPort}`);
  if (!fs.existsSync(TEMPLATE_EDITOR_INDEX)) {
    console.warn(
      '\n⚠ Customize /template-editor/ UI is missing. Run:\n    npm run build:editor\n'
    );
  }
});

server.on('error', (e) => {
  console.error(e);
  process.exit(1);
});
