import fs from 'fs';
import { findAvailablePort } from './find-port.js';
import { createApp } from './create-app.js';
import { ensureNewTemplateDir } from './template-storage.js';
import { TEMPLATE_EDITOR_INDEX } from './paths.js';

const desiredPort = (() => {
  const p = Number(process.env.PORT);
  return Number.isFinite(p) && p > 0 ? Math.floor(p) : 3000;
})();

let listenPort;

try {
  listenPort = await findAvailablePort(desiredPort);
  if (listenPort !== desiredPort) {
    console.warn(`Port ${desiredPort} was busy — using ${listenPort} instead.`);
  }
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}

ensureNewTemplateDir();

const app = createApp(listenPort);
const server = app.listen(listenPort, () => {
  console.log(`Open http://127.0.0.1:${listenPort}`);
  if (!fs.existsSync(TEMPLATE_EDITOR_INDEX)) {
    console.warn(
      '\n⚠ Customize /template-editor/ UI is missing. Run:\n    npm run build:editor\n'
    );
  }
});

server.on('error', (e) => {
  console.error(e);
  process.exit(1);
});
