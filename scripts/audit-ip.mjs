// Evidence collection, not a determination of ownership or infringement.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root = path.resolve('.'), out = path.resolve(process.argv[2] || 'docs/audit-2026-10-26');
const auditDate=process.env.PINWHEEL_RELEASE_DATE||new Date().toISOString().slice(0,10);
await fs.mkdir(out, { recursive: true });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const packages = [], seen = new Set();
async function scanModules(folder) {
  for (const item of await fs.readdir(folder, { withFileTypes: true }).catch(() => [])) {
    if (!item.isDirectory() || item.name.startsWith('.')) continue;
    const dir = path.join(folder, item.name);
    if (item.name.startsWith('@')) { await scanModules(dir); continue; }
    try {
      const p = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
      if (!p.name || !p.version) continue;
      const licenseFiles = [];
      async function legalFiles(current, depth = 0) {
        for (const file of await fs.readdir(current, { withFileTypes: true }).catch(() => [])) {
          if (file.isDirectory()) { if (depth < 3 && file.name !== 'node_modules' && !file.name.startsWith('.')) await legalFiles(path.join(current, file.name), depth + 1); }
          else if (/^(licen[sc]e|copying|notice|ofl)([._-].*|$)/i.test(file.name)) { const full = path.join(current, file.name), bytes = await fs.readFile(full); licenseFiles.push({ file: path.relative(dir, full).replaceAll('\\', '/'), bytes: bytes.length, sha256: sha(bytes) }); }
        }
      }
      await legalFiles(dir);
      const key = p.name + '@' + p.version;
      if (!seen.has(key)) { seen.add(key); packages.push({ name:p.name, version:p.version, license:p.license || p.licenses || null, repository:p.repository || null, location:path.relative(root, dir).replaceAll('\\','/'), legalFiles:licenseFiles }); }
      await scanModules(path.join(dir, 'node_modules'));
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
await scanModules(path.join(root, 'node_modules')); packages.sort((a,b) => a.name.localeCompare(b.name));
const sourceFiles = [], occurrences = [], imports = [], assets = [];
const sourceRoots = ['src','shared','desktop','scripts','themes','pet-examples','harmony/web','harmony/entry/src/main/ets','harmony/AppScope','harmony/entry/src/main/resources/base','assets'];
async function walk(relative) {
  const full = path.join(root, relative), stat = await fs.stat(full);
  if (stat.isDirectory()) { for (const name of await fs.readdir(full)) await walk(relative + '/' + name); return; }
  const bytes = await fs.readFile(full), entry = { path:relative, bytes:bytes.length, sha256:sha(bytes) }; sourceFiles.push(entry);
  if (/\.(png|ico|icns|svg|moye-pet|woff2?|ttf|otf|gif|jpe?g|webp|bmp)$/i.test(relative)) assets.push(entry);
  if (/\.(mjs|cjs|js|tsx?|ets|css|html|json5?|md|py|nsi)$/i.test(relative)) {
    const text = bytes.toString('utf8');
    text.split(/\r?\n/).forEach((line, index) => {
      if (relative !== 'scripts/audit-ip.mjs' && /typora|abnerlee|qiyun|app\.asar|md-diagram-panel|#write\b|\.md-focus|\.ty-/i.test(line)) occurrences.push({ file:relative, line:index+1, sample:line.slice(0,220) });
      if (/\b(from\s*['"]|import\s*['"]|import\s*\(|require\s*\()/i.test(line)) imports.push({ file:relative, line:index+1, sample:line.slice(0,260) });
    });
  }
}
for (const dir of sourceRoots) await walk(dir);
const lock = JSON.parse(await fs.readFile('package-lock.json','utf8')), licenses = {};
for (const p of packages) { const name = typeof p.license === 'string' ? p.license : JSON.stringify(p.license); licenses[name] = (licenses[name] || 0) + 1; }
const missingText = packages.filter(p => !p.legalFiles.length), needsReview = packages.filter(p => !p.license || !/^(MIT|ISC|BSD-2-Clause|BSD-3-Clause|0BSD|Apache-2\.0|CC0-1\.0|CC-BY-4\.0|BlueOak-1\.0\.0|Python-2\.0|\(MIT OR GPL-3\.0-or-later\)|\(MPL-2\.0 OR Apache-2\.0\)|\(BSD-3-Clause OR GPL-2\.0\))$/.test(String(p.license)));
const result = { version:lock.version, date:auditDate, scope:'installed dependency metadata + legal files to depth 3; first-party source signatures and asset hashes; excludes private Typora code and patent clearance', packages:packages.length, lockEntries:Object.keys(lock.packages).length-1, licenseHistogram:licenses, missingLicenseText:missingText.map(p => p.name), reviewLicenses:needsReview.map(p=>({name:p.name,license:p.license})), sources:sourceFiles.length, sourceBrandSignatures:occurrences, assets, ownLicensePresent:await fs.stat('LICENSE').then(()=>true).catch(()=>false) };
await fs.writeFile(path.join(out,'dependency-inventory.json'),JSON.stringify(packages,null,2));
await fs.writeFile(path.join(out,'source-hashes.json'),JSON.stringify(sourceFiles,null,2));
await fs.writeFile(path.join(out,'source-imports.json'),JSON.stringify(imports,null,2));
await fs.writeFile(path.join(out,'scan-summary.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
