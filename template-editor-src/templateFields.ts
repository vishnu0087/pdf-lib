/** Phase 9 — Toolbox field definitions.
 *  Each field type maps to a small block-level HTML snippet inserted at the
 *  caret via TinyMCE's editor.insertContent. Visuals come from the shared
 *  TEMPLATE_FIELD_CSS in pdf-lib/lib/template-field-styles.js (applied to
 *  both the editor preview and the PDF print pipeline). */

export type FieldType =
  | 'header'
  | 'label'
  | 'paragraph'
  | 'linebreak'
  | 'dropdown'
  | 'tags'
  | 'checkboxes'
  | 'mchoice'
  | 'textinput'
  | 'numberinput';

export type ToolboxItem = {
  type: FieldType;
  label: string;
  description: string;
};

export const TOOLBOX_ITEMS: ToolboxItem[] = [
  { type: 'header',      label: 'Header Text',     description: 'Section heading' },
  { type: 'label',       label: 'Label',           description: 'Small uppercase caption' },
  { type: 'paragraph',   label: 'Paragraph',       description: 'Multi-line text block' },
  { type: 'linebreak',   label: 'Line Break',      description: 'Horizontal separator' },
  { type: 'dropdown',    label: 'Dropdown',        description: 'Single-choice picker' },
  { type: 'tags',        label: 'Tags',            description: 'Pill labels group' },
  { type: 'checkboxes',  label: 'Checkboxes',      description: 'Multi-select list' },
  { type: 'mchoice',     label: 'Multiple Choice', description: 'Single-select list' },
  { type: 'textinput',   label: 'Text Input',      description: 'Single-line value' },
  { type: 'numberinput', label: 'Number Input',    description: 'Numeric value' },
];

/** Returns the HTML for a fresh field block. Pure block-level elements with
 *  stable classes + data-field-type so the splitter, sanitizer, and PDF
 *  pipeline treat them as ordinary editable DOM. Uses Unicode glyphs
 *  (☐ ○ ▾) instead of real form elements so TinyMCE accepts them without
 *  needing extended_valid_elements changes. */
export function buildFieldHtml(type: FieldType): string {
  switch (type) {
    case 'header':
      return '<h2 class="tpl-field tpl-field--header" data-field-type="header">Heading</h2>';
    case 'label':
      return '<div class="tpl-field tpl-field--label" data-field-type="label">Label</div>';
    case 'paragraph':
      return '<p class="tpl-field tpl-field--paragraph" data-field-type="paragraph">Click to edit paragraph text.</p>';
    case 'linebreak':
      return '<hr class="tpl-field tpl-field--linebreak" data-field-type="linebreak">';
    case 'dropdown':
      return '<div class="tpl-field tpl-field--dropdown" data-field-type="dropdown"><span class="tpl-dropdown-text">Select option</span><span class="tpl-dropdown-arrow">▾</span></div>';
    case 'tags':
      return '<div class="tpl-field tpl-field--tags" data-field-type="tags"><span class="tpl-tag">Tag</span><span class="tpl-tag">Another</span></div>';
    case 'checkboxes':
      return '<div class="tpl-field tpl-field--checkboxes" data-field-type="checkboxes"><div class="tpl-check-row">☐ Option 1</div><div class="tpl-check-row">☐ Option 2</div><div class="tpl-check-row">☐ Option 3</div></div>';
    case 'mchoice':
      return '<div class="tpl-field tpl-field--mchoice" data-field-type="mchoice"><div class="tpl-choice-row">○ Choice 1</div><div class="tpl-choice-row">○ Choice 2</div></div>';
    case 'textinput':
      return '<div class="tpl-field tpl-field--textinput" data-field-type="textinput">Text input value</div>';
    case 'numberinput':
      return '<div class="tpl-field tpl-field--numberinput" data-field-type="numberinput">0</div>';
  }
}

/** Escape attribute / text content so an inserted variable can't break the
 *  surrounding markup. Keep it minimal — only the chars that matter inside
 *  attribute values and text. */
function escapeAttr(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Build inline variable chip HTML (Phase 10). */
export function buildVariableHtml(token: string, label: string): string {
  const t = escapeAttr(token);
  const l = escapeAttr(label || token);
  return `<span class="tpl-var" data-tpl-var="${t}" contenteditable="false">${l}</span>`;
}

/** Build a block variable region HTML (Phase 10). */
export function buildBlockVariableHtml(id: string, label: string): string {
  const i = escapeAttr(id);
  const l = escapeAttr(label || id);
  return (
    `<div class="tpl-var-block" data-tpl-var-block="${i}">` +
      `<div class="tpl-var-block__label" contenteditable="false">${l}</div>` +
      `<div class="tpl-var-block__content" contenteditable="false">` +
        `<em>${l} will render here at PDF time.</em>` +
      `</div>` +
    `</div>`
  );
}
