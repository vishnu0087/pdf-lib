/**
 * Shapes fixture JSON into a lightweight “template shell” for the visual template editor:
 * neutral typography colors, trimmed tables/blocks, and quote page1/page2 simplified layout.
 */

const NEUTRAL = {
  bodyColor: '#263238',
  headerFill: '#eceff1',
  headerFg: '#263238',
};

function applyNeutralEditorTheme(data) {
  if (!data || typeof data.document !== 'object') return;
  const doc = data.document;
  doc.defaultStyle = { ...(typeof doc.defaultStyle === 'object' ? doc.defaultStyle : {}) };
  const ds = doc.defaultStyle;
  if (typeof ds.font === 'string' && !ds.fontFamily) ds.fontFamily = ds.font;
  if (ds.fontSize != null && ds.fontSizePt == null) ds.fontSizePt = ds.fontSize;
  if (typeof ds.fontSizePt !== 'number' || Number.isNaN(ds.fontSizePt))
    ds.fontSizePt = 10;
  ds.color = NEUTRAL.bodyColor;

  doc.styles =
    typeof doc.styles === 'object' && doc.styles !== null ? { ...doc.styles } : {};
  const prevTh =
    typeof doc.styles.tableHeader === 'object' && doc.styles.tableHeader !== null
      ? doc.styles.tableHeader
      : {};
  doc.styles.tableHeader = {
    ...prevTh,
    bold: prevTh.bold !== false,
    fillColor: NEUTRAL.headerFill,
    color: NEUTRAL.headerFg,
  };
}

/**
 * Trim wide pdfmake tables so the editor iframe stays readable.
 * @param {unknown} node
 * @param {number} maxDataRows data rows after the first row (treated as header)
 */
export function trimPdfmakeTableBodies(node, maxDataRows = 5) {
  if (node == null) return;
  if (Array.isArray(node)) {
    node.forEach((x) => trimPdfmakeTableBodies(x, maxDataRows));
    return;
  }
  if (typeof node !== 'object') return;
  const body = node.table?.body;
  if (Array.isArray(body) && body.length > 1 + maxDataRows) {
    node.table.body = [body[0], ...body.slice(1, 1 + maxDataRows)];
  }
  for (const k of Object.keys(node)) trimPdfmakeTableBodies(node[k], maxDataRows);
}

function truncateAfterTableBlocks(afterTable, maxBlocks) {
  if (!Array.isArray(afterTable)) return;
  if (afterTable.length > maxBlocks) afterTable.length = maxBlocks;
}

/** Quote-only: canonical letter + compact line-items skeleton (no totals block). */
function mutateQuoteFixtureForEditor(data) {
  const inset = data.page1?.contentInsetPt || {};
  data.page1 = {
    ...data.page1,
    pageBreakAfter: true,
    contentInsetPt: { ...inset },
    blocks: [
      {
        id: 'title_quote',
        type: 'text',
        text: 'Quote',
        style: {
          fontFamily: 'Montserrat',
          fontSizePt: 16,
          fontWeight: 'bold',
          color: '#37474f',
          textAlign: 'center',
          marginPt: [0, 10, 0, 10],
        },
      },
      {
        id: 'address_and_meta_row',
        type: 'columns',
        columns: [
          {
            id: 'customer_address_block',
            width: '62%',
            type: 'text',
            text: [
              'Customer / bill-to contact name',
              'Street address, city, state, postal code',
              '',
              'Phone: customer phone number',
              'Email: customer email address',
            ].join('\n'),
            style: {
              fontFamily: 'Montserrat',
              fontSizePt: 9,
              fontWeight: 'normal',
              color: NEUTRAL.bodyColor,
              textAlign: 'left',
              marginPt: [0, 0, 14, 0],
              whiteSpace: 'pre-line',
            },
          },
          {
            width: '38%',
            type: 'stack',
            marginPt: [0, 0, 0, 0],
            items: [
              {
                type: 'text',
                text: 'Quote #: reference number',
                style: {
                  fontFamily: 'Montserrat',
                  fontSizePt: 9,
                  color: NEUTRAL.bodyColor,
                  textAlign: 'right',
                },
              },
              {
                type: 'text',
                text: 'Date: issue date',
                style: {
                  fontFamily: 'Montserrat',
                  fontSizePt: 9,
                  color: NEUTRAL.bodyColor,
                  textAlign: 'right',
                },
              },
              {
                type: 'text',
                text: 'Valid until',
                style: {
                  fontFamily: 'Montserrat',
                  fontSizePt: 9,
                  marginPt: [0, 4, 0, 0],
                  color: '#ffffff',
                  backgroundColor: '#546e7a',
                  display: 'inline-block',
                  textAlign: 'right',
                },
              },
            ],
          },
        ],
      },
      {
        id: 'letter_body',
        type: 'text',
        paragraphs: [
          'Dear customer name,',
          '',
          'Opening paragraph introducing the quote or correspondence.',
          '',
          'Additional details and next steps.',
          '',
          'Regards,\nYour company name',
        ],
        style: {
          inheritsDefault: true,
          fontFamily: 'Montserrat',
          fontSizePt: 10,
          fontWeight: 'normal',
          color: NEUTRAL.bodyColor,
          textAlign: 'left',
          marginPt: [20, 10, 28, 10],
          lineHeight: 1.2,
          paragraphGap: '1em',
          whiteSpace: 'pre-line',
        },
      },
    ],
  };

  /** Keep fixture row indices so `_placeholderTokenMap` paths still match real quote JSON. */
  const tb = data.page2?.tableBody;
  if (Array.isArray(tb) && tb.length > 14) tb.length = 14;
  const at = data.page2?.afterTable;
  if (Array.isArray(at) && at.length > 10) at.length = 10;
}

function trimSalesLikeForEditor(data, maxAfterBlocks = 24) {
  const p2 = data.page2;
  if (!p2 || typeof p2 !== 'object') return;
  truncateAfterTableBlocks(p2.afterTable, maxAfterBlocks);
  trimPdfmakeTableBodies(p2.afterTable, 5);
}

/**
 * Mutate a cloned fixture root in place before tokenization for the editor.
 * @param {string} docType
 * @param {object} root
 */
export function prepareFixtureForEditorVisualPreview(docType, root) {
  applyNeutralEditorTheme(root);
  if (docType === 'quote') {
    mutateQuoteFixtureForEditor(root);
  } else if (docType === 'sales' || docType === 'invoice' || docType === 'salary') {
    trimSalesLikeForEditor(root);
    if (docType === 'salary') {
      truncateAfterTableBlocks(root.page2?.afterTable, 18);
      trimPdfmakeTableBodies(root.page2?.afterTable, 8);
    }
  }
}
