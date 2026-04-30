import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { randomBytes } from 'crypto';
import {
  ASSETS_DIR,
  NEW_TEMPLATE_DIR,
  ROOT,
  TEMPLATE_EDITOR_INDEX,
} from './paths.js';
import { resolveModuleDir } from './resolve-module-dir.js';
import {
  loadInvoiceData,
  loadQuoteData,
  loadSalaryData,
  loadSalesData,
} from './sample-data.js';
import {
  ensureNewTemplateDir,
  isUsableFullDocumentHtml,
  loadCustomTemplate,
  loadCustomTemplateRecord,
  sanitizeLiveHtmlPayload,
} from './template-storage.js';
import {
  puppeteerHtmlToPdfBuffer,
  puppeteerPdfFromUrl,
} from './puppeteer-utils.js';
import { htmlForDocType } from './pdf-html.js';
import { renderQuoteDocumentParts } from '../../lib/render-quote-html.js';
import { renderSalesDocumentParts } from '../../lib/render-sales-html.js';
import { renderInvoiceDocumentParts } from '../../lib/render-invoice-html.js';
import { renderSalaryDocumentParts } from '../../lib/render-salary-html.js';
import { renderQuotePdfHtml } from '../../pdf/quote-template.tsx';
import { renderSalesPdfHtml } from '../../pdf/sales-template.tsx';
import { renderInvoicePdfHtml } from '../../pdf/invoice-template.tsx';
import { renderSalaryPdfHtml } from '../../pdf/salary-template.tsx';
import {
  validatePdfJsonStructure,
  validatePdfJsonRender,
} from '../../lib/validate-pdf-json.js';
import {
  applyTemplateOverrides,
  extractTemplateDefaults,
} from '../../lib/pdf-template-customization.js';

const PDF_DOWNLOAD_NAMES = {
  quote: 'document.pdf',
  sales: 'sales-order.pdf',
  invoice: 'invoice.pdf',
  salary: 'salary-slip.pdf',
};

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
 * @param {number} listenPort
 * @returns {import('express').Express}
 */
export function createApp(listenPort) {
  const app = express();

  app.use(cors({ origin: [/localhost:\d+$/, /127\.0\.0\.1:\d+$/] }));
  app.use(express.json({ limit: '50mb' }));

  // URL kept as `/assests` so existing templates and payloads stay unchanged.
  app.use('/assests', express.static(ASSETS_DIR));
  app.use(
    '/fontsource/montserrat',
    express.static(resolveModuleDir('@fontsource', 'montserrat'))
  );

  app.get('/pdf-render', (_req, res) => {
    const data = loadQuoteData();
    const base = `http://127.0.0.1:${listenPort}`;
    const parts = renderQuoteDocumentParts(data, base);
    const html = renderQuotePdfHtml({ baseUrl: base, ...parts });
    res.type('html').send(html);
  });

  app.get('/pdf-render-sales', (_req, res) => {
    const data = loadSalesData();
    const base = `http://127.0.0.1:${listenPort}`;
    const parts = renderSalesDocumentParts(data, base);
    const html = renderSalesPdfHtml({ baseUrl: base, ...parts });
    res.type('html').send(html);
  });

  app.get('/pdf-render-invoice', (_req, res) => {
    const data = loadInvoiceData();
    const base = `http://127.0.0.1:${listenPort}`;
    const parts = renderInvoiceDocumentParts(data, base);
    const html = renderInvoicePdfHtml({ baseUrl: base, ...parts });
    res.type('html').send(html);
  });

  app.get('/pdf-render-salary', (_req, res) => {
    const data = loadSalaryData();
    const base = `http://127.0.0.1:${listenPort}`;
    const parts = renderSalaryDocumentParts(data, base);
    const html = renderSalaryPdfHtml({ baseUrl: base, ...parts });
    res.type('html').send(html);
  });

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
    const loaded = loadCustomTemplateRecord(req.params.id, String(docType));
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
      const html = htmlForDocType(docType, merged, listenPort);
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
    const { docType, data, templateId, liveHtml: liveHtmlRaw } =
      req.body || {};
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
      const mergedCheck = validatePdfJsonRender(
        docType,
        dataForPdf,
        listenPort
      );
      if (!mergedCheck.valid) {
        return res.status(400).json(mergedCheck);
      }
    }

    try {
      const html = htmlForDocType(docType, dataForPdf, listenPort);
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

  app.get('/api/pdf', async (_req, res) => {
    try {
      const buf = await puppeteerPdfFromUrl(
        `http://127.0.0.1:${listenPort}/pdf-render`,
        { salesFlowCompaction: false }
      );
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="document.pdf"'
      );
      res.send(buf);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'PDF generation failed' });
    }
  });

  app.get('/api/pdf-sales', async (_req, res) => {
    try {
      const buf = await puppeteerPdfFromUrl(
        `http://127.0.0.1:${listenPort}/pdf-render-sales`,
        { salesFlowCompaction: true }
      );
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="sales-order.pdf"'
      );
      res.send(buf);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'PDF generation failed' });
    }
  });

  app.get('/api/pdf-invoice', async (_req, res) => {
    try {
      const buf = await puppeteerPdfFromUrl(
        `http://127.0.0.1:${listenPort}/pdf-render-invoice`,
        { salesFlowCompaction: true }
      );
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="invoice.pdf"'
      );
      res.send(buf);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'PDF generation failed' });
    }
  });

  app.get('/api/pdf-salary', async (_req, res) => {
    try {
      const buf = await puppeteerPdfFromUrl(
        `http://127.0.0.1:${listenPort}/pdf-render-salary`,
        { salesFlowCompaction: true }
      );
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="salary-slip.pdf"'
      );
      res.send(buf);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'PDF generation failed' });
    }
  });

  /** Express merges `/template-editor` and `/template-editor/` paths; SPA entry (with or without trailing slash). */
  app.get(/^\/template-editor(?:\/|\.html)?$/i, serveTemplateEditorIndex);
  app.use(express.static(path.join(ROOT, 'public')));

  return app;
}
