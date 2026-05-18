/** Phase 10 — Line-items block renderer.
 *  Thin wrapper around renderPage2InnerHtml() (already exported from
 *  render-quote-html.js) so the runtime variable resolver and the existing
 *  whole-document renderer share one source of truth. */

import { renderPage2InnerHtml } from '../render-quote-html.js';

/** Render the line-items shell (.p2-quote-line-items-shell + table + after-
 *  table blocks) for a quote data object. Returns the HTML string to inject
 *  as the wrapper's inner content. */
export function renderLineItemsBlock(data, baseUrl) {
  try {
    return renderPage2InnerHtml(data, baseUrl || '') || '';
  } catch {
    return '';
  }
}
