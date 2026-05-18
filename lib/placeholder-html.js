/**
 * Placeholder ↔ value substitution for saved template HTML (_liveHtml).
 * Used when generating PDFs (user JSON) and when showing/editing templates (fixture preview).
 */

/** Legacy path tokens from older builds */
const PLACEHOLDER_PIPE_RE = /<\|([^>|]+(?:\|[^>|]+)*)\|>/g;

export function getByJsonPath(obj, parts) {
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[/^\d+$/.test(p) ? Number(p) : p];
  }
  return cur;
}

export function escapeXmlText(v) {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Replace `<TOKEN>` and legacy pipe tokens with escaped values from `data`.
 * @param {string} html
 * @param {object} data
 * @param {Record<string, string[]> | null | undefined} tokenMap
 */
export function substitutePlaceholdersInHtml(html, data, tokenMap) {
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

/**
 * Turn editor HTML (fixture literal text) back into storable HTML with `<TOKEN>` markers
 * so PDF generation can merge real user JSON via `substitutePlaceholdersInHtml`.
 * Longest value matches first to reduce substring collisions.
 */
export function retokenizeEditorLiveHtml(html, previewData, tokenMap) {
  if (typeof html !== 'string' || !html || !previewData || !tokenMap) return html;
  let out = html;
  const entries = Object.entries(tokenMap)
    .map(([body, pathParts]) => {
      if (!Array.isArray(pathParts)) return null;
      const val = getByJsonPath(previewData, pathParts);
      if (val == null || typeof val === 'object') return null;
      const raw = String(val);
      const needle = escapeXmlText(raw);
      if (!needle) return null;
      /** Match `escapeHtml` in render-quote-html so tokens survive in HTML like JSON-driven previews. */
      const token = `&lt;${body}&gt;`;
      return { needle, token, len: needle.length };
    })
    .filter(Boolean)
    .sort((a, b) => b.len - a.len);

  for (const { needle, token } of entries) {
    if (needle.length < 2) continue;
    if (!out.includes(needle)) continue;
    out = out.split(needle).join(token);
  }
  return out;
}

/** Escape a string for safe inclusion inside an HTML attribute value. */
function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Derive a human label from a SNAKE_CASE token: CUSTOMER_NAME → "Customer Name". */
function defaultTokenLabel(token) {
  return String(token || '')
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Phase 10b — wrap each fixture-value occurrence in the HTML with a chip
 * span (<span class="tpl-var" data-tpl-var="TOKEN" contenteditable="false">…</span>)
 * so the editor displays the FULL template layout with runtime data shown
 * as draggable / styleable variable chips in place of the literal values.
 *
 * Same overall textual-replacement strategy as `retokenizeEditorLiveHtml` —
 * sorted longest-first to mitigate substring collisions, skips values
 * shorter than 2 characters.
 *
 * When `opts.docType === 'quote'`, also replaces the inner contents of any
 * `<div class="p1-letter" …>…</div>` wrapper with a single `LETTER_BODY`
 * chip while preserving the wrapper element + its style attribute (so the
 * user can still apply font / color / alignment to the wrapper and have it
 * cascade to the rendered letter content at PDF time).
 */
export function chipifyEditorLiveHtml(html, previewData, tokenMap, opts) {
  if (typeof html !== 'string' || !html || !previewData || !tokenMap) return html;
  const labelFor =
    (opts && typeof opts.labelFor === 'function') ? opts.labelFor : defaultTokenLabel;
  let out = html;
  const entries = Object.entries(tokenMap)
    .map(([body, pathParts]) => {
      if (!Array.isArray(pathParts)) return null;
      const val = getByJsonPath(previewData, pathParts);
      if (val == null || typeof val === 'object') return null;
      const raw = String(val);
      const needle = escapeXmlText(raw);
      if (!needle || needle.length < 2) return null;
      const chip =
        '<span class="tpl-var" data-tpl-var="' + escapeAttr(body) +
        '" contenteditable="false">' + escapeAttr(labelFor(body)) + '</span>';
      return { needle, chip, len: needle.length };
    })
    .filter(Boolean)
    .sort((a, b) => b.len - a.len);

  for (const { needle, chip } of entries) {
    if (!out.includes(needle)) continue;
    out = out.split(needle).join(chip);
  }

  if (opts && opts.docType === 'quote') {
    out = out.replace(
      /(<div\b[^>]*\bclass=["'][^"']*\bp1-letter\b[^"']*["'][^>]*>)([\s\S]*?)(<\/div>)/i,
      (_full, open, _inner, close) =>
        open +
          '<span class="tpl-var" data-tpl-var="LETTER_BODY" contenteditable="false">Letter Body</span>' +
        close
    );
  }

  return out;
}
