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
