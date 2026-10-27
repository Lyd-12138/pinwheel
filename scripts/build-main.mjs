import { build } from 'vite';
await build({ configFile: false, logLevel: 'warn', ssr: { noExternal: true, external: ['electron'] }, build: { ssr: 'desktop/main.mjs', target: 'node24', outDir: '.cache/main-bundle', minify: false, rolldownOptions: { external: ['electron'], output: { entryFileNames: 'main.mjs' } } } });
