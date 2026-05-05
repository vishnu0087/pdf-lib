/**
 * Express + MongoDB templates — single-file server (`npm start`).
 */
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';
import { puppeteerHtmlToPdfBuffer } from './src/server/puppeteer-utils.js';
import { htmlForDocType } from './src/server/pdf-html.js';
import {
  validatePdfJsonStructure,
  validatePdfJsonRender,
} from './lib/validate-pdf-json.js';
import {
  applyTemplateOverrides,
  extractTemplateDefaults,
} from './lib/pdf-template-customization.js';
import { prepareFixtureForEditorVisualPreview } from './lib/editor-preview-payload.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const ASSETS_DIR = path.join(ROOT, 'assets');
const TEMPLATE_EDITOR_INDEX = path.join(
  ROOT,
  'public',
  'template-editor',
  'index.html'
);
/** Each download is written here first, then the same bytes are sent to the client. */
const GENERATED_PDF_DIR = path.join(ROOT, 'generated-pdfs');

const FIXTURE_PATH = {
  quote: path.join(ROOT, 'fixtures', 'quote', 'data1.json'),
  invoice: path.join(ROOT, 'fixtures', 'invoice', 'invoice-data1.json'),
  sales: path.join(ROOT, 'fixtures', 'sales', 's-data1.json'),
  salary: path.join(ROOT, 'fixtures', 'salary', 'sa-data1.json'),
};

const MONGO_URI = 'mongodb://127.0.0.1:27017/TemplateDB';

const PDF_NAMES = {
  quote: 'document.pdf',
  sales: 'sales-order.pdf',
  invoice: 'invoice.pdf',
  salary: 'salary-slip.pdf',
};

function resolveModuleDir(...segments) {
  const local = path.join(ROOT, 'node_modules', ...segments);
  if (fs.existsSync(local)) return local;
  return path.join(ROOT, '..', 'node_modules', ...segments);
}

function findAvailablePort(startPort, maxAttempts = 50) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const tryPort = (port) => {
      const probe = net.createServer();
      probe.once('error', (err) => {
        probe.removeAllListeners();
        if (err.code === 'EADDRINUSE') {
          attempts += 1;
          if (attempts >= maxAttempts)
            reject(
              new Error(
                `No free port after ${maxAttempts} attempts starting at ${startPort}`
              )
            );
          else tryPort(port + 1);
        } else reject(err);
      });
      probe.once('listening', () => probe.close(() => resolve(port)));
      probe.listen(port);
    };
    tryPort(startPort);
  });
}

function keepLiteralString(key, val) {
  if (typeof val !== 'string') return true;
  if (val.length === 0) return true;
  if (/^#[0-9a-f]{3,8}$/i.test(val.trim())) return true;
  if (/^https?:\/\//i.test(val)) return true;
  if (val.includes('/assests/') || val.startsWith('assests/')) return true;
  const lk = key.toLowerCase();
  if (lk === 'format' || lk === 'formatversion') return true;
  if (
    lk.endsWith('path') ||
    lk === 'imageref' ||
    lk === 'urlpath' ||
    lk === 'fontfamily'
  )
    return true;
  return false;
}

/** `customerName` → `CUSTOMER_NAME`; duplicate keys → `TEXT_2`, `TEXT_3`. */
function keyToPlaceholderLabel(key) {
  return String(key)
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toUpperCase();
}

function nextPlaceholderBody(lastKey, counts) {
  const base = keyToPlaceholderLabel(lastKey);
  const n = (counts.get(base) || 0) + 1;
  counts.set(base, n);
  return n === 1 ? base : `${base}_${n}`;
}

/**
 * Fixture-shaped JSON with strings like `<CUSTOMER_NAME>` (from field keys).
 * tokenMap: { CUSTOMER_NAME: ['page1','blocks','0','customerName'], ... }
 */
function clonePlaceholderPayload(raw) {
  const root = JSON.parse(JSON.stringify(raw));
  /** @type {Record<string, string[]>} */
  const tokenMap = {};
  const counts = new Map();

  function walk(node, pathParts) {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      const parentKey = pathParts[pathParts.length - 1] || '';
      for (let i = 0; i < node.length; i++) {
        const item = node[i];
        if (typeof item === 'string') {
          const keyForLabel =
            parentKey === 'paragraphs'
              ? `letterParagraphLine_${i}`
              : `${parentKey}_${i}`;
          if (!keepLiteralString(keyForLabel, item)) {
            const body = nextPlaceholderBody(keyForLabel, counts);
            tokenMap[body] = [...pathParts, String(i)].map(String);
            node[i] = `<${body}>`;
          }
          continue;
        }
        walk(item, [...pathParts, String(i)]);
      }
      return;
    }
    for (const k of Object.keys(node)) {
      const v = node[k];
      const nextPath = [...pathParts, k];
      if (typeof v === 'string') {
        if (!keepLiteralString(k, v)) {
          const body = nextPlaceholderBody(k, counts);
          tokenMap[body] = nextPath.map(String);
          node[k] = `<${body}>`;
        }
      } else walk(v, nextPath);
    }
  }
  walk(root, []);
  return { payload: root, tokenMap };
}

/** `<CUSTOMER_NAME>` / `<TEXT_2>` style (HTML-safe Upper token). */
const PLACEHOLDER_ANGLE_RE = /^<[A-Z][A-Z0-9_]*(?:_\d+)?>$/;

/** Legacy path tokens from older builds */
const PLACEHOLDER_PIPE_RE = /<\|([^>|]+(?:\|[^>|]+)*)\|>/g;

function isPlaceholderToken(s) {
  return typeof s === 'string' && (PLACEHOLDER_ANGLE_RE.test(s) || /^<\|(?:[^|]+\|)+\|>$/.test(s));
}

/** Drop placeholder-only override leaves so real upload JSON is not overwritten at PDF time. */
function scrubOverridesForMerge(o) {
  if (o === null || typeof o !== 'object') return o;
  if (Array.isArray(o)) {
    return o
      .map(scrubOverridesForMerge)
      .filter((x) => !(typeof x === 'string' && isPlaceholderToken(x)));
  }
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === '_liveHtml' || k === '_placeholderTokenMap') {
      out[k] = v;
      continue;
    }
    if (typeof v === 'string' && isPlaceholderToken(v)) continue;
    if (v && typeof v === 'object') out[k] = scrubOverridesForMerge(v);
    else out[k] = v;
  }
  return out;
}

function getByJsonPath(obj, parts) {
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[/^\d+$/.test(p) ? Number(p) : p];
  }
  return cur;
}

function escapeXmlText(v) {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {string} html
 * @param {object} data - user's PDF JSON
 * @param {Record<string, string[]> | null | undefined} tokenMap - from saved template / placeholder API
 */
function fillPlaceholders(html, data, tokenMap) {
  let out = html;
  if (tokenMap && typeof tokenMap === 'object') {
    const bodies = Object.keys(tokenMap).sort((a, b) => b.length - a.length);
    for (const body of bodies) {
      const pathParts = tokenMap[body];
      if (!Array.isArray(pathParts)) continue;
      const val = getByJsonPath(data, pathParts);
      const replacement =
        val == null || typeof val === 'object' ? '' : escapeXmlText(String(val));
      const token = `<${body}>`;
      const tokenEnt = `&lt;${body}&gt;`;
      out = out.split(token).join(replacement);
      out = out.split(tokenEnt).join(replacement);
    }
  }
  return out.replace(PLACEHOLDER_PIPE_RE, (_, inner) => {
    const parts = inner.split('|');
    const v = getByJsonPath(data, parts);
    if (v == null || typeof v === 'object') return '';
    return escapeXmlText(String(v));
  });
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

function serveTemplateEditorIndex(_req, res) {
  if (!fs.existsSync(TEMPLATE_EDITOR_INDEX)) {
    res.status(503).type('html').send(
      '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Template editor</title></head>' +
        '<body style="font-family:system-ui,sans-serif;padding:2rem;line-height:1.5;color:#323130">' +
        '<h1 style="margin-top:0">Template editor assets missing</h1>' +
        '<p>From <strong>pdf-lib</strong> run: npm install && npm run build:editor && npm start</p>' +
        '</body></html>'
    );
    return;
  }
  res.sendFile(TEMPLATE_EDITOR_INDEX, (err) => {
    if (err) console.error('[template-editor]', err.message);
  });
}

const desiredPort = (() => {
  const p = Number(process.env.PORT);
  return Number.isFinite(p) && p > 0 ? Math.floor(p) : 3000;
})();

const mongoClient = new MongoClient(MONGO_URI);
try {
  await mongoClient.connect();
  console.log('[mongo] connected TemplateDB');
} catch (e) {
  console.error('[mongo] connect failed:', e.message || e);
  process.exit(1);
}

const templatesColl = mongoClient.db().collection('templates');
await templatesColl.createIndex({ id: 1 }, { unique: true });

let listenPort;
try {
  listenPort = await findAvailablePort(desiredPort);
  if (listenPort !== desiredPort)
    console.warn(`Port ${desiredPort} busy — using ${listenPort}`);
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}

async function loadCustomTemplateRecord(id, expectedDocType) {
  if (!id || typeof id !== 'string' || !/^tpl_[a-zA-Z0-9_-]+$/.test(id))
    return { valid: false, error: 'Invalid template id.' };
  const doc = await templatesColl.findOne({
    id,
    docType: expectedDocType,
  });
  if (!doc) return { valid: false, error: 'Template not found.' };
  if (!doc.overrides || typeof doc.overrides !== 'object')
    return { valid: false, error: 'Invalid template.' };
  return { valid: true, record: doc, overrides: doc.overrides };
}

const app = express();
app.use(cors({ origin: [/localhost:\d+$/, /127\.0\.0\.1:\d+$/] }));
app.use(express.json({ limit: '50mb' }));

app.use('/assests', express.static(ASSETS_DIR));
app.use(
  '/fontsource/montserrat',
  express.static(resolveModuleDir('@fontsource', 'montserrat'))
);

app.get('/api/placeholder-data', (req, res) => {
  const docType = String(req.query.docType || '');
  const ok = ['quote', 'sales', 'invoice', 'salary'];
  if (!ok.includes(docType))
    return res.status(400).json({ error: 'Invalid docType.' });
  const fp = FIXTURE_PATH[docType];
  if (!fp || !fs.existsSync(fp))
    return res.status(404).json({ error: 'Fixture missing.' });
  try {
    const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
    prepareFixtureForEditorVisualPreview(docType, raw);
    const { payload, tokenMap } = clonePlaceholderPayload(raw);
    const struct = validatePdfJsonStructure(docType, payload);
    if (!struct.valid)
      return res.status(500).json({ error: 'Placeholder schema invalid.' });
    res.json({ ...payload, tokenMap });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not build placeholders.' });
  }
});

app.get('/api/custom-templates', async (req, res) => {
  const docType = req.query.docType;
  const ok = ['quote', 'sales', 'invoice', 'salary'];
  if (!ok.includes(String(docType)))
    return res.status(400).json({ error: 'Invalid docType.' });
  try {
    const rows = await templatesColl
      .find({ docType: String(docType) })
      .project({ id: 1, name: 1, createdAt: 1 })
      .sort({ createdAt: -1 })
      .toArray();
    const entries = rows.map((r) => ({
      id: r.id,
      name: typeof r.name === 'string' ? r.name : r.id,
      createdAt: r.createdAt || null,
    }));
    res.json(entries);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not list templates.' });
  }
});

app.get('/api/custom-templates/:id', async (req, res) => {
  const docType = req.query.docType;
  const ok = ['quote', 'sales', 'invoice', 'salary'];
  if (!ok.includes(String(docType))) {
    return res.status(400).json({ error: 'Missing or invalid docType.' });
  }
  const loaded = await loadCustomTemplateRecord(req.params.id, String(docType));
  if (!loaded.valid) return res.status(404).json({ error: loaded.error });
  const r = loaded.record;
  return res.json({
    id: r.id,
    name: r.name,
    docType: r.docType,
    createdAt: r.createdAt,
    overrides: r.overrides,
  });
});

app.post('/api/template-extract', (req, res) => {
  const { docType, data } = req.body || {};
  const struct = validatePdfJsonStructure(docType, data);
  if (!struct.valid) return res.status(400).json(struct);
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
  if (!struct.valid) return res.status(400).json(struct);
  let merged = data;
  if (overrides && typeof overrides === 'object')
    merged = applyTemplateOverrides(docType, data, scrubOverridesForMerge(overrides));
  const renderCheck = validatePdfJsonRender(docType, merged, listenPort);
  if (!renderCheck.valid) return res.status(400).json(renderCheck);
  try {
    const html = htmlForDocType(docType, merged, listenPort);
    return res.json({ html });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || 'Preview failed.') });
  }
});

app.post('/api/custom-templates', async (req, res) => {
  const { docType, name, overrides } = req.body || {};
  const ok = ['quote', 'sales', 'invoice', 'salary'];
  if (!ok.includes(docType)) return res.status(400).json({ error: 'Invalid docType.' });
  if (!overrides || typeof overrides !== 'object')
    return res.status(400).json({ error: 'Missing overrides.' });
  const id = `tpl_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`;
  const trimmedName =
    String(name || 'Custom template').trim().slice(0, 120) || 'Custom template';
  const rec = {
    id,
    name: trimmedName,
    docType,
    createdAt: new Date().toISOString(),
    overrides,
  };
  try {
    await templatesColl.insertOne(rec);
    res.json({ id, name: trimmedName });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not save template.' });
  }
});

app.post('/api/validate-pdf-json', (req, res) => {
  const { docType, data } = req.body || {};
  const struct = validatePdfJsonStructure(docType, data);
  if (!struct.valid) return res.status(400).json(struct);
  const renderCheck = validatePdfJsonRender(docType, data, listenPort);
  if (!renderCheck.valid) return res.status(400).json(renderCheck);
  return res.json({ valid: true });
});

app.post('/api/pdf-generate', async (req, res) => {
  const { docType, data, templateId, liveHtml: liveHtmlRaw } = req.body || {};
  const struct = validatePdfJsonStructure(docType, data);
  if (!struct.valid) return res.status(400).json(struct);
  const renderCheck = validatePdfJsonRender(docType, data, listenPort);
  if (!renderCheck.valid) return res.status(400).json(renderCheck);

  const tid =
    templateId != null && String(templateId).trim() !== ''
      ? String(templateId).trim()
      : '';

  let loaded = null;
  if (tid) {
    loaded = await loadCustomTemplateRecord(tid, docType);
    if (!loaded.valid)
      return res.status(400).json({ valid: false, error: loaded.error });
  }

  const tokenMap =
    loaded?.overrides &&
    typeof loaded.overrides._placeholderTokenMap === 'object' &&
    loaded.overrides._placeholderTokenMap
      ? loaded.overrides._placeholderTokenMap
      : null;

  const fromClient = sanitizeLiveHtmlPayload(String(liveHtmlRaw || ''));
  const fromStored =
    loaded?.overrides?._liveHtml &&
    typeof loaded.overrides._liveHtml === 'string'
      ? sanitizeLiveHtmlPayload(loaded.overrides._liveHtml)
      : '';

  let htmlExact = '';
  if (isUsableFullDocumentHtml(fromClient)) htmlExact = fromClient;
  else if (isUsableFullDocumentHtml(fromStored)) htmlExact = fromStored;

  const quoteLayout = docType === 'quote' ? 'quote' : 'other';
  const filename = PDF_NAMES[docType] || 'document.pdf';

  try {
    let buf;
    if (htmlExact) {
      buf = await puppeteerHtmlToPdfBuffer(
        fillPlaceholders(htmlExact, data, tokenMap),
        quoteLayout
      );
    } else {
      let dataForPdf = data;
      if (tid && loaded) {
        dataForPdf = applyTemplateOverrides(
          docType,
          data,
          scrubOverridesForMerge(loaded.overrides)
        );
        const mergedCheck = validatePdfJsonRender(
          docType,
          dataForPdf,
          listenPort
        );
        if (!mergedCheck.valid) return res.status(400).json(mergedCheck);
      }
      const html = htmlForDocType(docType, dataForPdf, listenPort);
      buf = await puppeteerHtmlToPdfBuffer(html, quoteLayout);
    }
    const stem = path.basename(filename, path.extname(filename) || '.pdf');
    const diskName = `${Date.now()}_${randomBytes(4).toString('hex')}_${stem}.pdf`;
    await fs.promises.writeFile(path.join(GENERATED_PDF_DIR, diskName), buf);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'PDF generation failed' });
  }
});

app.get(/^\/template-editor(?:\/|\.html)?$/i, serveTemplateEditorIndex);
app.use(express.static(path.join(ROOT, 'public')));

app.listen(listenPort, () => {
  fs.mkdirSync(GENERATED_PDF_DIR, { recursive: true });
  console.log(`Open http://127.0.0.1:${listenPort}`);
  if (!fs.existsSync(TEMPLATE_EDITOR_INDEX))
    console.warn('\n⚠ Run npm run build:editor for /template-editor/\n');
});
