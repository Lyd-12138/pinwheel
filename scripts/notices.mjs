import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export async function createNotices(modules, destination) {
  const seen = new Set(), entries = [];
  const supplementRoot = path.join(projectRoot, 'third-party', 'licenses');
  const supplements = JSON.parse(await fs.readFile(path.join(projectRoot, 'third-party', 'license-sources.json'), 'utf8').catch(() => '{}'));
  async function scan(folder) {
    for (const item of await fs.readdir(folder, { withFileTypes: true }).catch(() => [])) {
      if (!item.isDirectory() || item.name.startsWith('.')) continue;
      const dir = path.join(folder, item.name);
      if (item.name.startsWith('@')) { await scan(dir); continue; }
      let hasMetadata=false;
      try {
        const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
        hasMetadata=true;
        const key = pkg.name + '@' + pkg.version;
        if (!seen.has(key)) {
          seen.add(key); let content = '';
          for (const file of await fs.readdir(dir)) if (/^(licen[sc]e|copying|notice)([.-].*)?$/i.test(file)) {
            const full = path.join(dir, file); const stat = await fs.stat(full);
            if (stat.isFile() && stat.size < 500000) content += '\n' + file + '\n' + await fs.readFile(full, 'utf8');
          }
          const extra = supplements[key];
          if (extra) content += '\n' + extra.file + '\n' + await fs.readFile(path.join(supplementRoot, extra.file), 'utf8') + '\nLicense source: ' + extra.source + '\n';
          const repository = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
          entries.push(`## ${key}\nLicense: ${JSON.stringify(pkg.license || pkg.licenses || 'See package documentation')}\n${repository ? 'Upstream repository: ' + repository + '\n' : ''}${content}`);
        }
        await scan(path.join(dir, 'node_modules'));
      } catch (error) { if(hasMetadata || error.code!=='ENOENT')throw error; /* Folders without package metadata are not packages. */ }
    }
  }
  await scan(modules);
  let additional = '';
  const fontNotice = path.join(supplementRoot, 'KaTeX-fonts-OFL-1.1.txt');
  if (await fs.stat(fontNotice).catch(() => null)) additional += '\n\n---\n\n## KaTeX mathematical fonts — SIL OFL 1.1\n\n' + await fs.readFile(fontNotice, 'utf8');
  const sourceManifest=JSON.parse(await fs.readFile(path.join(projectRoot,'third-party/source-manifest.json'),'utf8').catch(()=>'{"components":[]}'));
  additional+='\n\n---\n\n## Archived upstream sources\n\nThese archives retain their upstream file notices. They are not covered by the application MIT license. See third-party/SOURCE-CODE.md and third-party/source-manifest.json for exact URLs, versions, hashes and provenance limits.\n\n';
  for(const component of sourceManifest.components) additional+=`- ${component.file}: ${component.license}; source: ${component.url}\n`;
  for(const file of ['EPL-1.0.txt','Apache-2.0.txt','NSIS-bundle.txt']) if(await fs.stat(path.join(supplementRoot,file)).catch(()=>null)) additional+='\n\n### '+file+'\n\n'+await fs.readFile(path.join(supplementRoot,file),'utf8');
  await fs.writeFile(destination, '# Third-party notices\n\nThis inventory includes runtime and build dependencies. It does not license the application itself. Desktop packages must separately retain the official Electron LICENSE and LICENSES.chromium.html. See third-party/SOURCE-CODE.md for covered-source availability and remaining release checks.\n\n' + entries.sort().join('\n\n---\n\n') + additional);
  return entries.length;
}
