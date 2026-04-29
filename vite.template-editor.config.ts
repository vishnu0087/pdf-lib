import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: path.join(__dirname, 'template-editor-src'),
  base: '/template-editor/',
  build: {
    outDir: path.join(__dirname, 'public/template-editor'),
    emptyOutDir: true,
    sourcemap: false,
  },
});
