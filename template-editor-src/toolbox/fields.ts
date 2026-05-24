/**
 * Toolbox field types. Each produces a small block-level HTML snippet that
 * matches the existing `tpl-field--*` CSS in lib/template-field-styles.js
 * (already loaded into the template's <head>, so inserted elements pick up
 * the same visuals the PDF would print).
 */

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

export interface ToolboxItemDef {
  type: FieldType;
  label: string;
  hint: string;
}

export const TOOLBOX_ITEMS: ToolboxItemDef[] = [
  { type: 'header',      label: 'Header Text',     hint: 'Section heading' },
  { type: 'label',       label: 'Label',           hint: 'Small uppercase caption' },
  { type: 'paragraph',   label: 'Paragraph',       hint: 'Multi-line text block' },
  { type: 'linebreak',   label: 'Line Break',      hint: 'Horizontal separator' },
  { type: 'dropdown',    label: 'Dropdown',        hint: 'Single-choice picker' },
  { type: 'tags',        label: 'Tags',            hint: 'Pill labels group' },
  { type: 'checkboxes',  label: 'Checkboxes',      hint: 'Multi-select list' },
  { type: 'mchoice',     label: 'Multiple Choice', hint: 'Single-select list' },
  { type: 'textinput',   label: 'Text Input',      hint: 'Single-line value' },
  { type: 'numberinput', label: 'Number Input',    hint: 'Numeric value' },
];

/**
 * Default placeholder text that gets pre-selected so the user's first
 * keystroke replaces it (Header/Paragraph/Label/inputs only).
 */
export const PLACEHOLDER_TEXT: Partial<Record<FieldType, string>> = {
  header: 'Header Text',
  label: 'Label',
  paragraph: 'Paragraph text',
  textinput: 'Text input value',
  numberinput: '0',
};

/** Build the HTML snippet for a field. */
export function buildFieldHtml(type: FieldType): string {
  switch (type) {
    case 'header':
      return '<h2 class="tpl-field tpl-field--header" data-field-type="header">Header Text</h2>';
    case 'label':
      return '<div class="tpl-field tpl-field--label" data-field-type="label">Label</div>';
    case 'paragraph':
      return '<p class="tpl-field tpl-field--paragraph" data-field-type="paragraph">Paragraph text</p>';
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
