export type InlineVar = {
  token: string;
  label: string;
  type: string;
  resolve: (data: unknown) => string;
};

export type BlockVar = {
  id: string;
  label: string;
  description: string;
  renderer: string;
};

export type DocTypeRegistry = {
  inline: InlineVar[];
  blocks: BlockVar[];
};

export const VARIABLE_REGISTRY: Record<string, DocTypeRegistry>;

export function resolveInlineVariableValue(
  docType: string,
  token: string,
  data: unknown
): string;

export function getBlockRendererKey(
  docType: string,
  blockId: string
): string | null;
