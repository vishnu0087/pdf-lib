import path from 'path';
import fs from 'fs';
import { ROOT } from './paths.js';

/** `node_modules` may live next to pdf-lib (repo root) or inside pdf-lib. */
export function resolveModuleDir(...segments) {
  const local = path.join(ROOT, 'node_modules', ...segments);
  if (fs.existsSync(local)) return local;
  return path.join(ROOT, '..', 'node_modules', ...segments);
}
