export type QuoteSemanticInlineEntry = {
  token: string;
  label: string;
  group: string;
  resolve: (data: unknown) => unknown;
};
export type QuoteAddressChipEntry = {
  token: string;
  label: string;
  group: string;
  extract: (lines: string[]) => string;
};
export type QuoteLineItemsColumnEntry = {
  token: string;
  label: string;
  group: string;
};

export const QUOTE_SEMANTIC_INLINE: QuoteSemanticInlineEntry[];
export const QUOTE_ADDRESS_CHIPS: QuoteAddressChipEntry[];
export const QUOTE_LINE_ITEMS_COLUMNS: Record<number, QuoteLineItemsColumnEntry>;

export function getSemanticChipValue(token: string, data: unknown): string;
export function getQuoteCellValue(data: unknown, row: number, col: number): string;
export function chipifyQuoteEditorHtml(html: string, data: unknown): string;
