/** Shared CSS for the template toolbox field blocks (Phase 9).
 *  Imported by the editor (for live preview via injectEditorPagedScreenCss)
 *  AND by the PDF print pipeline (via document-template-core.tsx) so editor
 *  preview and Puppeteer print render fields identically. */
export const TEMPLATE_FIELD_CSS = `
.tpl-field { box-sizing: border-box; }
.tpl-field--header {
  font-size: 18pt; font-weight: 700;
  margin: 16px 0 8px;
  color: #111827;
}
.tpl-field--label {
  font-size: 9pt; font-weight: 600;
  letter-spacing: 0.05em; text-transform: uppercase;
  color: #6b7280;
  margin: 6px 0 2px;
}
.tpl-field--paragraph {
  font-size: 11pt; line-height: 1.5;
  margin: 8px 0;
  color: #1f2937;
}
.tpl-field--linebreak {
  border: 0; border-top: 1px solid #e5e7eb;
  margin: 16px 0;
}
.tpl-field--dropdown {
  display: inline-flex; align-items: center; justify-content: space-between;
  gap: 12px;
  border: 1px solid #d1d5db; border-radius: 6px;
  padding: 6px 12px; background: #ffffff;
  min-width: 220px; font-size: 10pt;
  color: #374151;
}
.tpl-field--dropdown .tpl-dropdown-arrow {
  color: #6b7280; font-size: 9pt;
}
.tpl-field--tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
.tpl-tag {
  display: inline-block;
  background: #eff6ff; color: #1d4ed8;
  border-radius: 999px; padding: 2px 10px;
  font-size: 10pt; font-weight: 500;
}
.tpl-field--checkboxes,
.tpl-field--mchoice {
  display: flex; flex-direction: column; gap: 4px;
  margin: 8px 0;
}
.tpl-check-row,
.tpl-choice-row {
  font-size: 10pt; padding: 2px 0;
  color: #1f2937;
}
.tpl-field--textinput,
.tpl-field--numberinput {
  display: inline-block; min-width: 220px;
  border: 1px solid #d1d5db; border-radius: 6px;
  padding: 6px 10px;
  font-size: 10pt; color: #374151;
  background: #ffffff;
}
.tpl-field--numberinput {
  min-width: 100px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* ---- Phase 10c: subtle variable chips (toned down for in-place use) ---- */
.tpl-var {
  display: inline-block;
  padding: 0 4px;
  margin: 0 1px;
  border-radius: 4px;
  background: rgba(59, 130, 246, 0.08);
  color: #1d4ed8;
  font-weight: 500;
  font-size: 0.92em;
  border: 1px solid rgba(59, 130, 246, 0.18);
  user-select: none;
  text-decoration: none;
}
.tpl-var::before { content: '\\27E8'; opacity: 0.5; margin-right: 2px; }
.tpl-var::after  { content: '\\27E9'; opacity: 0.5; margin-left: 2px; }
.tpl-var-block {
  border: 1px dashed #93c5fd;
  background: #f8fafc;
  border-radius: 8px;
  padding: 12px 14px;
  margin: 12px 0;
}
.tpl-var-block__label {
  font-size: 10pt;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #1d4ed8;
  margin-bottom: 6px;
}
.tpl-var-block__content {
  color: #475569;
  font-style: italic;
  font-size: 10pt;
}
@media print {
  .tpl-var { all: unset; }
  .tpl-var-block { border: 0; padding: 0; background: transparent; margin: 0; }
  .tpl-var-block__label { display: none; }
  .tpl-var-block__content { color: inherit; font-style: normal; font-size: inherit; }
}
`;
