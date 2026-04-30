import fs from 'fs';
import path from 'path';
import { NEW_TEMPLATE_DIR } from './paths.js';

export function ensureNewTemplateDir() {
  fs.mkdirSync(NEW_TEMPLATE_DIR, { recursive: true });
}

export function sanitizeLiveHtmlPayload(html) {
  if (typeof html !== 'string' || html.length < 200) return '';
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '')
    .replace(/\sjavascript:/gi, ' blocked:');
}

export function isUsableFullDocumentHtml(s) {
  return (
    typeof s === 'string' &&
    s.length > 400 &&
    /<html[\s>]/i.test(s) &&
    /<\/html>/i.test(s)
  );
}

export function loadCustomTemplateRecord(id, expectedDocType) {
  if (!id || typeof id !== 'string' || !/^tpl_[a-zA-Z0-9_-]+$/.test(id)) {
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
export function loadCustomTemplate(id, expectedDocType) {
  const r = loadCustomTemplateRecord(id, expectedDocType);
  if (!r.valid) return r;
  return { valid: true, overrides: r.overrides };
}
