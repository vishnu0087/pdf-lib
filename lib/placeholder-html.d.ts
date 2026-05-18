export type TokenMap = Record<string, string[]>;

export function getByJsonPath(obj: unknown, parts: readonly string[]): unknown;

export function escapeXmlText(v: unknown): string;

export function substitutePlaceholdersInHtml(
  html: string,
  data: unknown,
  tokenMap: TokenMap | null | undefined
): string;

export function retokenizeEditorLiveHtml(
  html: string,
  previewData: unknown,
  tokenMap: TokenMap | null | undefined
): string;

export function chipifyEditorLiveHtml(
  html: string,
  previewData: unknown,
  tokenMap: TokenMap | null | undefined,
  opts?: { docType?: string; labelFor?: (token: string) => string }
): string;