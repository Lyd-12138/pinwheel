import fs from 'node:fs/promises';
import path from 'node:path';
export async function migrateLegacyData(destination, candidates) {
  if (await fs.stat(path.join(destination, 'settings.json')).catch(() => null)) return null;
  for (const candidate of candidates) {
    if (path.resolve(candidate) === path.resolve(destination)) continue;
    let source;
    try { source = await fs.readFile(path.join(candidate, 'settings.json')); JSON.parse(source.toString('utf8')); } catch { continue; }
    await fs.mkdir(destination, { recursive: true });
    const pets = path.join(candidate, 'pets'); if (await fs.stat(pets).catch(() => null)) await fs.cp(pets, path.join(destination, 'pets'), { recursive: true, errorOnExist: false, force: false });
    // Settings are the commit marker. Copying does not modify legacy data or notes.
    try { await fs.writeFile(path.join(destination, 'settings.json'), source, { flag: 'wx' }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    return candidate;
  }
  return null;
}
