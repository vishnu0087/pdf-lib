export function resolveTemplateVariables(
  html: string,
  docType: string,
  data: unknown,
  opts?: {
    baseUrl?: string;
    tokenMap?: Record<string, string[]> | null;
  }
): string;
