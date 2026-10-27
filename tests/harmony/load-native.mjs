import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transformSync } from 'rolldown/utils';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export async function loadNative(output) {
  await fs.mkdir(output, { recursive: true }); const shim = pathToFileURL(path.join(root, 'tests/harmony/native-shims.mjs')).href;
  for (const name of ['Crypto', 'Files', 'Bridge']) {
    let source = await fs.readFile(path.join(root, `harmony/entry/src/main/ets/services/${name}.ets`), 'utf8');
    source = source.replace(/from '\.\/([^']+)'/g, "from './$1.mjs'").replace(/from '@kit\.(CryptoArchitectureKit|ArkTS|CoreFileKit|ArkGraphics2D|LocalizationKit)'/g, 'from ' + JSON.stringify(shim));
    const result = transformSync(name + '.ts', source, { lang: 'ts', target: 'es2022' }); if (result.errors?.length) throw Error(JSON.stringify(result.errors));
    await fs.writeFile(path.join(output, name + '.mjs'), result.code);
  }
  return { ...await import(pathToFileURL(path.join(output, 'Crypto.mjs')).href), ...await import(pathToFileURL(path.join(output, 'Files.mjs')).href), ...await import(pathToFileURL(path.join(output, 'Bridge.mjs')).href) };
}
