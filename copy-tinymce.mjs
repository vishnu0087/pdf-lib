import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, 'node_modules', 'tinymce');
const dest = path.join(__dirname, 'public', 'template-editor', 'tinymce');

if (!fs.existsSync(path.join(src, 'tinymce.min.js'))) {
  console.error('[copy-tinymce] Missing node_modules/tinymce. Run npm install.');
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
console.log('[copy-tinymce] Copied TinyMCE → public/template-editor/tinymce');
