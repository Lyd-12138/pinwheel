import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { build } from 'vite';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const output = path.join(root, 'harmony/entry/src/main/resources/rawfile/web');
await build({ configFile: false, root: path.join(root, 'harmony/web'), base: './', logLevel: 'warn', build: { outDir: output, emptyOutDir: true, target: 'chrome114', assetsInlineLimit: 0, chunkSizeWarningLimit: 2500 } });
const files = [];
async function walk(dir) { for (const item of await fs.readdir(dir, { withFileTypes: true })) { const p = path.join(dir, item.name); if (item.isDirectory()) await walk(p); else files.push(p); } }
await walk(output);
console.log('Harmony editor built:', files.length, 'files,', Math.round((await Promise.all(files.map(p => fs.stat(p)))).reduce((n, s) => n + s.size, 0) / 1024), 'KB');
