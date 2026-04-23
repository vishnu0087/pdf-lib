import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

const server = app.listen(listenPort, () => {
  console.log(
    `Open http://127.0.0.1:${listenPort}`
  );
});

server.on('error', (e) => {
  console.error(e);
  process.exit(1);
});
