/** Phase 10 — Runtime resolver for Phase 10 structured variable wrappers.
 *  Replaces inline chip spans with resolved scalar text and block wrappers
 *  with renderer-generated HTML. The legacy <TOKEN> text-format substitution
 *  (placeholder-html.js → substitutePlaceholdersInHtml) still runs AFTER
 *  this resolver for backward compat with pre-Phase-10 saved templates. */

import {
  resolveInlineVariableValue,
  getBlockRendererKey,
} from './variable-registry.js';
import { renderLetterBodyBlock } from './template-blocks/render-letter-body.js';
import { renderLineItemsBlock } from './template-blocks/render-line-items.js';
import { getByJsonPath } from './placeholder-html.js';
import {
  getSemanticChipValue,
  getQuoteCellValue,
} from './quote-semantic-chips.js';

const BLOCK_RENDERERS = {
  renderLetterBodyBlock: (data /*, baseUrl */) => renderLetterBodyBlock(data),
  renderLineItemsBlock:  (data, baseUrl) => renderLineItemsBlock(data, baseUrl),
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Strip surrounding `<span class="tpl-var" data-tpl-var="X" …>…</span>`
 *  wrappers and replace with the resolved text value. The wrapper element
 *  is removed (no chip styling in final PDF). Lookup order:
 *    1. Hard-coded special tokens (LETTER_BODY → renderLetterBodyBlock HTML).
 *    2. Doc-type registry inline entry's resolve(data).
 *    3. Saved tokenMap → JSON path → raw value (escaped).
 *    4. Empty string (chip silently disappears).
 */
function resolveInlineSpans(html, docType, data, tokenMap, _baseUrl) {
  const re = /<span\b([^>]*?)\bdata-tpl-var=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/span>/gi;
  return html.replace(re, (_full, pre, token, post, _inner) => {
    const attrBlob = (pre || '') + ' ' + (post || '');
    /* Phase 10c: per-cell line-items chips carry data-tpl-row / data-tpl-col.
       Look up the cell value at runtime from data.page2.tableBody[row][col]
       so each chip in the table resolves to its own value. */
    const rowM = /\bdata-tpl-row=["'](\d+)["']/i.exec(attrBlob);
    const colM = /\bdata-tpl-col=["'](\d+)["']/i.exec(attrBlob);
    if (rowM && colM && docType === 'quote') {
      const v = getQuoteCellValue(
        data,
        parseInt(rowM[1], 10),
        parseInt(colM[1], 10)
      );
      return escapeHtml(v);
    }
    /* Special: LETTER_BODY chip resolves to the multi-paragraph letter HTML
       (NOT escaped) so user-styled wrapper styles cascade to the children. */
    if (token === 'LETTER_BODY') {
      try { return renderLetterBodyBlock(data); }
      catch { return ''; }
    }
    /* Quote semantic catalog (Phase 10c). */
    if (docType === 'quote') {
      const semantic = getSemanticChipValue(token, data);
      if (semantic) return escapeHtml(semantic);
    }
    /* Registry-resolved (custom/computed values). */
    const fromRegistry = resolveInlineVariableValue(docType, token, data);
    if (fromRegistry) return escapeHtml(fromRegistry);
    /* TokenMap fallback for auto-generated scalar tokens. */
    if (tokenMap && Array.isArray(tokenMap[token])) {
      const v = getByJsonPath(data, tokenMap[token]);
      if (v != null && typeof v !== 'object') return escapeHtml(String(v));
    }
    return '';
  });
}

/** Find `<div class="tpl-var-block" data-tpl-var-block="ID" …>…</div>` and
 *  replace its `__content` child's inner HTML with the block renderer's
 *  output. Preserves the outer wrapper (so user-applied class/style cascade
 *  to the rendered children). */
function resolveBlockWrappers(html, docType, data, baseUrl) {
  const re = /(<div\b[^>]*?\bdata-tpl-var-block=["']([^"']+)["'][^>]*>)([\s\S]*?)(<\/div>)/gi;
  /* The outer regex captures non-greedy <div>…</div>, but block wrappers
   *  contain nested <div>s (the __label and __content children). We need
   *  balanced-div matching. Use a small scanner. */
  return scanBalancedBlocks(html, (outerOpen, blockId, innerHtml, outerClose) => {
    const rendererKey = getBlockRendererKey(docType, blockId);
    if (!rendererKey) return outerOpen + innerHtml + outerClose;
    const renderer = BLOCK_RENDERERS[rendererKey];
    if (typeof renderer !== 'function') return outerOpen + innerHtml + outerClose;
    let rendered;
    try {
      rendered = renderer(data, baseUrl);
    } catch {
      rendered = '';
    }
    /* Replace the __content child's innerHTML; if there's no __content
     *  child we just wrap the rendered output ourselves so styles still
     *  cascade from the outer wrapper. */
    const contentRe = /(<div\b[^>]*?\bclass=["'][^"']*?\btpl-var-block__content\b[^"']*["'][^>]*>)([\s\S]*?)(<\/div>)/i;
    let newInner;
    if (contentRe.test(innerHtml)) {
      newInner = innerHtml.replace(
        contentRe,
        (_full, openTag, _existing, closeTag) => openTag + rendered + closeTag
      );
    } else {
      newInner = `<div class="tpl-var-block__content">${rendered}</div>`;
    }
    return outerOpen + newInner + outerClose;
  });
  /* eslint-disable-next-line no-unreachable */
  // (re is kept above for grep-ability; balanced scan is what executes)
  // suppress lint
  return re ? '' : ''; // unreachable
}

/** Walk `html` and process each top-level `<div data-tpl-var-block="…">`
 *  with a balanced scanner (handles nested <div>s inside __label/__content).
 *  Calls onMatch(outerOpenTag, blockId, innerHtml, outerCloseTag) for each
 *  block found and substitutes the returned string. */
function scanBalancedBlocks(html, onMatch) {
  const openRe = /<div\b[^>]*?\bdata-tpl-var-block=["']([^"']+)["'][^>]*>/gi;
  let out = '';
  let lastIndex = 0;
  let m;
  while ((m = openRe.exec(html)) !== null) {
    const openTagStart = m.index;
    const openTagEnd = openRe.lastIndex;
    const blockId = m[1];
    const outerOpenTag = m[0];
    /* From openTagEnd, scan forward, counting <div> opens and closes
     *  (case-insensitive) until balance returns to zero. */
    let depth = 1;
    const tagRe = /<\s*(\/?)div\b[^>]*>/gi;
    tagRe.lastIndex = openTagEnd;
    let closeAt = -1;
    let closeTagEnd = -1;
    let t;
    while ((t = tagRe.exec(html)) !== null) {
      if (t[1] === '/') {
        depth--;
        if (depth === 0) {
          closeAt = t.index;
          closeTagEnd = tagRe.lastIndex;
          break;
        }
      } else {
        depth++;
      }
    }
    if (closeAt < 0) break;
    const innerHtml = html.substring(openTagEnd, closeAt);
    const outerCloseTag = html.substring(closeAt, closeTagEnd);
    out += html.substring(lastIndex, openTagStart);
    out += onMatch(outerOpenTag, blockId, innerHtml, outerCloseTag);
    lastIndex = closeTagEnd;
    openRe.lastIndex = closeTagEnd;
  }
  out += html.substring(lastIndex);
  return out;
}

/** Top-level entry. Resolves Phase 10 structured variables in `html` using
 *  `data` as the runtime data source. Returns resolved HTML. Legacy
 *  substitution (`substitutePlaceholdersInHtml`) should run AFTER for any
 *  `<TOKEN>` text-format placeholders in pre-Phase-10 templates.
 *
 *  Opts:
 *    - baseUrl: forwarded to block renderers that need asset URLs.
 *    - tokenMap: saved `_placeholderTokenMap` to fall back on for chip tokens
 *      that aren't in the doc-type registry (Phase 10b chipify flow).
 */
export function resolveTemplateVariables(html, docType, data, opts = {}) {
  if (!html || typeof html !== 'string') return html;
  const baseUrl = (opts && opts.baseUrl) || '';
  const tokenMap = (opts && opts.tokenMap) || null;
  let out = html;
  try { out = resolveInlineSpans(out, docType, data, tokenMap, baseUrl); } catch { /* */ }
  try { out = resolveBlockWrappers(out, docType, data, baseUrl); } catch { /* */ }
  return out;
}
