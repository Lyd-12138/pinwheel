import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  base: './',
  resolve: { alias: {
    'decode-named-character-reference': fileURLToPath(new URL('./node_modules/decode-named-character-reference/index.js', import.meta.url)),
    'hast-util-from-html-isomorphic': fileURLToPath(new URL('./node_modules/hast-util-from-html-isomorphic/index.js', import.meta.url)),
  } },
  build: { chunkSizeWarningLimit: 1500 }, worker: { format: 'es' },
});
