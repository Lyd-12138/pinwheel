import JSZip from 'jszip';
import { createHash } from 'node:crypto';
import { validatePet } from '../shared/pets.mjs';
import { petAssetFiles, validPetAsset } from '../shared/pet-format.mjs';
import { loadSafeZip, readZipEntry } from '../shared/zip-safety.mjs';
const MAX = 80 * 1024 * 1024;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export async function readPetPackage(bytes, inspect) {
  if (bytes.length > MAX) throw Error('宠物包不能超过 80 MB。');
  const zip = await loadSafeZip(bytes,{maxBytes:MAX,maxEntries:512,maxExpanded:MAX,maxFile:10*1024*1024,validName:name=>name==='assets/'||['manifest.json','pet.json','README.md'].includes(name)||validPetAsset(name)}), seen = new Set(); let total = 0;
  if (Object.keys(zip.files).length > 512) throw Error('宠物包条目过多。');
  for (const [name, entry] of Object.entries(zip.files)) {
    const original = entry.unsafeOriginalName || name, key = name.normalize('NFKC').toLowerCase();
    if (original !== name || seen.has(key) || (Number(entry.unixPermissions) & 0xf000) === 0xa000 || !(entry.dir ? name === 'assets/' : ['manifest.json', 'pet.json', 'README.md'].includes(name) || validPetAsset(name))) throw Error('宠物包含有不安全路径、重复文件或不支持的文件。');
    seen.add(key); total += entry._data?.uncompressedSize || 0;
    if (total > MAX || (entry._data?.uncompressedSize || 0) > (['manifest.json', 'pet.json', 'README.md'].includes(name) ? 256 * 1024 : 10 * 1024 * 1024)) throw Error('解压后的宠物包超过限制。');
  }
  const file = zip.file('manifest.json'); if (!file) throw Error('宠物包缺少 manifest.json。');
  const budget={remaining:MAX};
  const manifest = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readZipEntry(file,256*1024,budget)));
  if (!['pinwheel-pet', 'moye-pet'].includes(manifest.format) || manifest.version !== 1 || !Array.isArray(manifest.assets) || manifest.assets.length > 300) throw Error('宠物包版本或资源清单无效。');
  const pet = validatePet(manifest.pet);
  if (manifest.pet.image !== undefined) { if (!validPetAsset(manifest.pet.image)) throw Error('宠物主图无效。'); pet.image = manifest.pet.image; }
  if (pet.kind === 'image' && !pet.image && !pet.actions.idle) throw Error('图片宠物需要主图或待机动作。');
  const needed = new Set(petAssetFiles(pet)), assets = new Map();
  for (const item of manifest.assets) {
    if (!item || !needed.has(item.path) || assets.has(item.path) || !validPetAsset(item.path) || !Number.isInteger(item.size) || item.size < 1 || item.size > 10 * 1024 * 1024 || !/^[a-f\d]{64}$/i.test(item.sha256 || '')) throw Error('宠物资源清单无效。');
    const entry = zip.file(item.path); if (!entry || entry._data?.uncompressedSize !== item.size) throw Error('宠物资源缺失或大小不符：' + item.path);
    const content = Buffer.from(await readZipEntry(entry,item.size,budget)); if (content.length !== item.size || hash(content) !== item.sha256.toLowerCase()) throw Error('宠物资源校验失败：' + item.path);
    const size = await inspect(content, item.path); assets.set(item.path, { bytes: content, size });
  }
  if (assets.size !== needed.size || Object.values(zip.files).filter(entry => !entry.dir && validPetAsset(entry.name)).length !== assets.size) throw Error('宠物资源清单与图片不一致。');
  for (const action of Object.values(pet.actions)) if (action.kind === 'sheet') { const size = assets.get(action.files[0]).size; if (size.width % action.columns || size.height % action.rows) throw Error('精灵图尺寸必须能够整除行列数。'); action.aspectRatio = (size.width / action.columns) / (size.height / action.rows); }
  return { pet, assets };
}
export async function writePetPackage(pet, readAsset, guide = '') {
  const value = { ...validatePet(pet), ...(pet.image ? { image: pet.image } : {}) }, zip = new JSZip(), assets = [], mapping = new Map();
  if (value.image && !validPetAsset(value.image) || petAssetFiles(value).length > 300) throw Error('宠物素材清单无效。');
  let total = 0;
  for (const original of petAssetFiles(value)) {
    const bytes = await readAsset(original); total += bytes.length; if (total > MAX || bytes.length > 10 * 1024 * 1024) throw Error('宠物资源超过导出限制。');
    const dest = 'assets/image-' + assets.length + '.' + original.split('.').pop().toLowerCase(); mapping.set(original, dest);
    assets.push({ path: dest, size: bytes.length, sha256: hash(bytes) }); zip.file(dest, bytes);
  }
  if (value.image) value.image = mapping.get(value.image);
  for (const action of Object.values(value.actions)) action.files = action.files.map(file => mapping.get(file));
  zip.file('pet.json', JSON.stringify(value, null, 2));
  zip.file('manifest.json', JSON.stringify({ format: 'pinwheel-pet', version: 1, pet: value, assets }, null, 2));
  if (guide) zip.file('README.md', guide);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
