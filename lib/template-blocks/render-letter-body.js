/** Phase 10 — Letter-body block renderer.
 *  Thin wrapper around the existing renderLetter() in render-quote-html.js so
 *  the runtime variable resolver and the existing whole-document renderer
 *  share one source of truth for letter rendering. */

import { renderLetter } from '../render-quote-html.js';

/** Find the letter_body block in a quote data object and render it.
 *  Returns the HTML string to inject as the wrapper's inner content; returns
 *  an empty paragraph fallback if the block is missing. */
export function renderLetterBodyBlock(data) {
  const blocks = data?.page1?.blocks;
  if (!Array.isArray(blocks)) return '<p></p>';
  const block = blocks.find((b) => b && b.id === 'letter_body');
  if (!block) return '<p></p>';
  try {
    return renderLetter(block, data);
  } catch {
    return '<p></p>';
  }
}
