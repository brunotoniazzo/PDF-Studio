import { build } from 'esbuild';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

await build({
  entryPoints: [
    path.join(root, 'electron/main.ts'),
    path.join(root, 'electron/preload.ts'),
  ],
  outdir: path.join(root, 'dist-electron'),
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['electron'],
});

console.log('[desktop-windows] Electron main & preload compilados em dist-electron/.');
