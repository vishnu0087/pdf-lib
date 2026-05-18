/** Phase 10 — Per-doc-type initial skeleton.
 *  Returned to the editor when a NEW template is being created (no saved
 *  _liveHtml). Contains variable chips + block regions in canonical positions
 *  so the user starts with a variable-driven layout instead of fixture data. */

/** Body inner HTML (no <html>/<head>/<body> wrappers — the editor's
 *  splitTemplateHtml flow expects just the body's inner contents). */
const QUOTE_BODY = `
<section class="sheet sheet--letter" aria-label="Quote — first page">
  <div class="sheet-inner sheet-inner--p1">
    <h1 class="tpl-field tpl-field--header" data-field-type="header" style="text-align:center;margin:0 0 18px;">
      <span class="tpl-var" data-tpl-var="TITLE" contenteditable="false">Title</span>
    </h1>
    <div style="display:flex;gap:24px;align-items:flex-start;margin:0 0 18px;">
      <div style="flex:1 1 60%;">
        <div class="tpl-field tpl-field--label" data-field-type="label">Customer</div>
        <p style="margin:0;white-space:pre-line;"><span class="tpl-var" data-tpl-var="CUSTOMER_ADDRESS" contenteditable="false">Customer Address</span></p>
      </div>
      <div style="flex:0 0 38%;text-align:right;">
        <p style="margin:0;font-weight:600;"><span class="tpl-var" data-tpl-var="QUOTE_NUMBER" contenteditable="false">Quote Number</span></p>
        <p style="margin:4px 0 0;"><span class="tpl-var" data-tpl-var="QUOTE_DATE" contenteditable="false">Date</span></p>
        <p style="margin:8px 0 0;color:#555;"><span class="tpl-var" data-tpl-var="PREPARED_BY" contenteditable="false">Prepared By</span></p>
      </div>
    </div>
    <div class="tpl-var-block" data-tpl-var-block="letter_body">
      <div class="tpl-var-block__label" contenteditable="false">Letter Body</div>
      <div class="tpl-var-block__content" contenteditable="false">
        <em>The full letter body will render here at PDF generation time. Style this block to control the runtime letter's typography (font, size, color, alignment).</em>
      </div>
    </div>
  </div>
</section>
<section class="sheet sheet--table" aria-label="Quote — continuation">
  <div class="sheet-inner sheet-inner--p2">
    <div class="tpl-var-block" data-tpl-var-block="line_items">
      <div class="tpl-var-block__label" contenteditable="false">Line Items Table</div>
      <div class="tpl-var-block__content" contenteditable="false">
        <em>Product / service items, totals, payment terms, and bank details render here at PDF generation time.</em>
      </div>
    </div>
  </div>
</section>
`.trim();

/** Map docType → skeleton body innerHTML. Only Quote is populated in
 *  Phase 10; other types fall back to the existing fixture-render path. */
export const TEMPLATE_SKELETONS = {
  quote: QUOTE_BODY,
};

/** Returns the skeleton body innerHTML for a doc type, or null if none. */
export function getTemplateSkeletonBody(docType) {
  if (!docType) return null;
  const body = TEMPLATE_SKELETONS[docType];
  return body || null;
}
