import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** pdf-lib repository root */
export const ROOT = path.join(__dirname, '..', '..');

/** User-saved template overlays (never overwrite built-in `pdf/` templates). */
export const NEW_TEMPLATE_DIR = path.join(ROOT, 'new-template');

/** Vite-built React SPA (see `npm run build:editor`). */
export const TEMPLATE_EDITOR_INDEX = path.join(
  ROOT,
  'public',
  'template-editor',
  'index.html'
);

/** Public images used in PDF shells (mounted at `/assests` URL for backwards compatibility). */
export const ASSETS_DIR = path.join(ROOT, 'assets');

/** Example JSON payloads for `/pdf-render` demo routes only. */
export const FIXTURES = {
  quote: path.join(ROOT, 'fixtures', 'quote', 'data1.json'),
  sales: path.join(ROOT, 'fixtures', 'sales', 's-data1.json'),
  invoice: path.join(ROOT, 'fixtures', 'invoice', 'invoice-data1.json'),
  salary: path.join(ROOT, 'fixtures', 'salary', 'sa-data1.json'),
};
