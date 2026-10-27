import JSZip from 'jszip';
import { references, rewriteLinks, isRemote } from '../../shared/markdown.mjs';
import { loadSafeZip, readZipEntry } from '../../shared/zip-safety.mjs';

export const MAX_FILE = 20 * 1024 * 1024, MAX_PACK = 32 * 1024 * 1024;
const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
export const encode = text => bytes64(encoder.encode(text));
export function bytes64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(s); }
export const unbase = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export const decode = s => decoder.decode(unbase(s));
export const encrypted = data => { const bytes = unbase(data); return bytes.length >= 8 && bytes.subarray(0, 8).every((n, i) => n === [77,79,89,69,69,78,67,1][i]); };
const documentText = data => { const bytes = unbase(data); return { text: decoder.decode(bytes), bom: bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191 }; };
export function safePath(path, empty = false) {
  if (typeof path !== 'string' || (!path && !empty) || path.length > 900 || /[\\\x00-\x1f:*?"<>|]/.test(path) || path.startsWith('/') || path.split('/').some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p)) && path !== '') throw Error('文件路径无效。');
  return path;
}
export function resolvePath(note, url) {
  if (typeof url !== 'string' || isRemote(url) || url.startsWith('/') || /^[a-z]:/i.test(url)) throw Error('仅支持笔记库中的相对附件路径。');
  const clean = decodeURIComponent(url.split(/[?#]/)[0]), parts = note.split('/').slice(0, -1);
  if (clean.includes('\\')) throw Error('无效附件路径。');
  for (const part of clean.split('/')) { if (!part || part === '.') continue; if (part === '..') { if (!parts.length) throw Error('附件超出笔记库。'); parts.pop(); } else parts.push(part); }
  const resolved = safePath(parts.join('/')); if (resolved.split('/').some(p=>p.startsWith('.'))) throw Error('不能通过笔记引用隐藏文件或目录。'); return resolved;
}
export function relative(from, to) { const a = from.split('/').slice(0, -1), b = to.split('/'); while (a.length && a[0] === b[0]) { a.shift(); b.shift(); } return '../'.repeat(a.length) + b.join('/'); }
const noteFile = path => /\.(md|markdown|moye)$/i.test(path);
export class MobileStore {
  constructor(io) { this.io = io; this.tokens = new Map(); this.settings = { language: 'system', systemLanguage: 'en', theme: 'simple', mode: 'markdown', lastPath: '', assetFolder: 'attachments', views: {}, collapsed: [], deletedThemes: [], customThemes: [], font: '', fontSize: 17, noteView: 'tree' }; this.queue = Promise.resolve(); }
  serial(fn) { const job = this.queue.then(fn); this.queue = job.catch(() => {}); return job; }
  async init() {
    try { const value = JSON.parse(decode(await this.io('read', { path: '.moye/settings.json' }))); this.settings={...this.settings,...Object.fromEntries(Object.entries(value).filter(([key])=>!['__proto__','constructor','prototype'].includes(key)))}; } catch (error) { if (!String(error.message).includes('ENOENT') && !String(error.message).includes('不存在')) throw error; }
    safePath(this.settings.assetFolder); if (this.settings.assetFolder.startsWith('.')) this.settings.assetFolder = 'attachments';
    return this.catalog();
  }
  async preferences(patch) { return this.serial(async () => { const value = { ...this.settings, ...patch }; if (value.assetFolder.split('/').some(p => p.startsWith('.'))) throw Error('附件目录不能使用隐藏目录。'); safePath(value.assetFolder); value.assetHistory = [...new Set([...(this.settings.assetHistory || []), this.settings.assetFolder, value.assetFolder])]; await this.io('write', { path: '.moye/settings.json', data: encode(JSON.stringify(value)) }); this.settings = value; }); }
  async catalog() {
    const notes = [], directories = [];
    const walk = async (parent, depth = 0) => {
      if (depth > 24 || notes.length + directories.length > 3000) throw Error('笔记库过大，请分批导入。');
      for (const item of await this.io('list', { path: parent })) {
        if (item.name.startsWith('.')) continue;
        const path = parent ? parent + '/' + item.name : item.name;
        if (item.directory) { directories.push(path); await walk(path, depth + 1); }
        else if (noteFile(path)) notes.push({ path, name: item.name.replace(/\.(md|markdown|moye)$/i, ''), modified: item.modified, encrypted: item.encrypted });
      }
    };
    await walk(''); notes.sort((a, b) => b.modified - a.modified || a.path.localeCompare(b.path)); return { notes, directories };
  }
  async open(path, password) {
    safePath(path); const data = await this.io('read', { path }), hash = await this.io('digest', { data });
    if (encrypted(data)) {
      if (!password && !this.tokens.has(path)) return { path, hash, text: '', encrypted: true, locked: true };
      let result;
      try { result = await this.io('open', { data, password: password || '', token: this.tokens.get(path) || '' }); }
      catch (error) { if (password) throw error; this.tokens.delete(path); return { path, hash, text: '', encrypted: true, locked: true }; }
      this.tokens.set(path, result.token);
      return { path, hash, ...documentText(result.data), encrypted: true, locked: false };
    }
    return { path, hash, ...documentText(data), encrypted: false, locked: false };
  }
  async save(doc, text) { return this.serial(async () => {
    const plain = encode((doc.bom ? '\uFEFF' : '') + text);
    if (unbase(plain).length > MAX_FILE) throw Error('文档正文不能超过 20MB。');
    const data = doc.encrypted ? (await this.io('seal', { data: plain, token: this.tokens.get(doc.path) || '' })).data : plain;
    const hash = await this.io('write', { path: doc.path, data, expected: doc.hash }); doc.hash = hash; doc.text = text; return hash;
  }); }
  async encrypt(doc, password) { return this.serial(async () => {
    if (doc.encrypted) throw Error('文档已加密。');
    const result = await this.io('seal', { data: encode((doc.bom ? '\uFEFF' : '') + doc.text), password });
    try { doc.hash = await this.io('write', { path: doc.path, data: result.data, expected: doc.hash }); this.tokens.set(doc.path, result.token); doc.encrypted = true; }
    catch (error) { await this.io('forget', { token: result.token }); throw error; }
  }); }
  async lockAll() { await this.queue; await this.io('forgetAll'); this.tokens.clear(); }
  async create(path, folder = false) { safePath(path); if (path.split('/').some(p => p.startsWith('.'))) throw Error('请使用可见的文件名。'); return folder ? this.io('mkdir', { path }) : this.io('write', { path: noteFile(path) ? path : path + '.md', data: encode(''), expected: 'new' }); }
  async duplicate(path) { const data = await this.io('read', { path }); const base = path.replace(/\.(md|markdown|moye)$/i, ''), ext = path.slice(base.length); for (let i = 1; i <= 100; i++) { const dest = base + '-副本' + (i === 1 ? '' : i) + ext; try { await this.io('write', { path: dest, data, expected: 'new' }); return dest; } catch (e) { if (!String(e.message).includes('已存在')) throw e; } } throw Error('副本过多，请先重命名。'); }
  assertMutable(path) { safePath(path); if (path.split('/').some(p => p.startsWith('.')) || [...(this.settings.assetHistory || []), this.settings.assetFolder].some(root => root === path || root.startsWith(path + '/'))) throw Error('附件存储目录及其上级目录不能重命名或删除，请在设置中更改新附件的位置。'); }
  async rename(path, name) { this.assertMutable(path); safePath(name); if (name.includes('/') || name.startsWith('.')) throw Error('请输入单独的名称。'); const isNote = noteFile(path); if (isNote && !noteFile(name)) name += /\.(md|markdown|moye)$/i.exec(path)[0]; const dest = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) + name : name; await this.io('move', { path, dest }); this.tokens.delete(path); return dest; }
  async trash(path) { this.assertMutable(path); await this.io('trash', { path }); this.tokens.delete(path); }
  async trashEntries() {
    const out = [];
    const walk = async (path, depth = 0) => { if (depth > 26) return; for (const item of await this.io('list', { path })) { const next = path + '/' + item.name; if (item.directory) await walk(next, depth + 1); else if (noteFile(next)) out.push({ path: next, original: next.split('/').slice(3).join('/'), modified: item.modified }); } };
    try { await walk('.moye/trash'); } catch (error) { if (!/ENOENT|不存在/.test(String(error.message))) throw error; } return out.sort((a, b) => b.modified - a.modified);
  }
  async restoreTrash(path) { safePath(path); if (!/^\.moye\/trash\/[^/]+\/.+/.test(path)) throw Error('回收路径无效。'); const original = safePath(path.split('/').slice(3).join('/')); await this.io('move', { path, dest: original }); return original; }
  async attachment(note, picked) {
    if (unbase(picked.data).length > MAX_FILE) throw Error('附件不能超过 20MB。');
    const ext = /\.[a-z\d]{1,10}$/i.exec(picked.name)?.[0]?.toLowerCase() || '.bin', hash = await this.io('digest', { data: picked.data }), path = this.settings.assetFolder + '/' + hash + ext;
    try { await this.io('write', { path, data: picked.data, expected: 'new' }); } catch (error) { if (!String(error.message).includes('已存在')) throw error; }
    const url = relative(note, path); return { path, url: url.split('/').map(p => encodeURIComponent(p)).join('/'), image: /\.(png|jpe?g|gif|webp|bmp)$/i.test(ext) };
  }
  async images(note, text) {
    const images = new Map();
    for (const ref of references(text)) { if (!['image', 'definition'].includes(ref.type) || images.has(ref.url)) continue; try { const path = resolvePath(note, ref.url), ext = path.split('.').at(-1).toLowerCase(); const mime = ({ png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',bmp:'image/bmp' })[ext]; if (mime) images.set(ref.url, 'data:' + mime + ';base64,' + await this.io('read', { path })); } catch {} }
    return images;
  }
  async importMarkdown(picked) {
    if (unbase(picked.data).length > MAX_FILE) throw Error('导入文档不能超过 20MB。');
    const name = picked.name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^[. ]+|[. ]+$/g, '') || '导入.md';
    const folder = '导入-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7); await this.io('mkdir', { path: folder }); const path = folder + '/' + (noteFile(name) ? name : name + '.md');
    if (!encrypted(picked.data)) decode(picked.data); await this.io('write', { path, data: picked.data, expected: 'new' }); return path;
  }
  async exportPack(paths) {
    const zip = new JSZip(), documents = [], assets = [], target = new Map(), opened = new Map(); let total = 0;
    const add = async (path, dest, collection) => { const data = await this.io('read', { path }), bytes = unbase(data); total += bytes.length; if (total > MAX_PACK) throw Error('移动版笔记包不能超过 32MB。'); const item = { path: dest, size: bytes.length, sha256: await this.io('digest', { data }) }; zip.file(dest, bytes); collection.push(item); };
    const queue = [...new Set(paths)];
    for (let i = 0; i < queue.length; i++) { const path = safePath(queue[i]); if (queue.length > 500) throw Error('关联笔记超过移动版 500 篇限制，请分批导出。'); const doc = await this.open(path); if (doc.encrypted) throw Error('加密笔记请单独导出加密文档，不会转为明文笔记包。'); target.set(path, 'notes/' + path); opened.set(path, doc); for (const ref of references(doc.text)) { if (isRemote(ref.url) || ref.url.startsWith('#')) continue; const linked = resolvePath(path, ref.url); if (noteFile(linked) && !queue.includes(linked)) queue.push(linked); } }
    for (const path of queue) {
      const doc = opened.get(path), mapping = new Map();
      for (const ref of references(doc.text)) {
        if (isRemote(ref.url) || ref.url.startsWith('#')) continue;
        const resolved = resolvePath(path, ref.url);
        if (target.has(resolved)) { mapping.set(ref.url, relative(target.get(path), target.get(resolved))); continue; }
        const dest = 'assets/' + (await this.io('digest', { data: await this.io('read', { path: resolved }) })) + (/\.[a-z\d]{1,10}$/i.exec(resolved)?.[0] || '.bin');
        if (!assets.some(a => a.path === dest)) await add(resolved, dest, assets); mapping.set(ref.url, relative(target.get(path), dest));
      }
      const data = encode(rewriteLinks(doc.text, url => mapping.get(url) || url)), bytes = unbase(data); total += bytes.length;
      zip.file(target.get(path), bytes); documents.push({ path: target.get(path), size: bytes.length, sha256: await this.io('digest', { data }) });
    }
    if (total > MAX_PACK) throw Error('移动版笔记包不能超过 32MB。');
    zip.file('manifest.json', JSON.stringify({ format: 'local-markdown-notepack', formatVersion: 1, appVersion: 'harmony-0.2.3', dialect: 'gfm-math-v1', createdAt: new Date().toISOString(), documents, assets, warnings: [] }, null, 2));
    return bytes64(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
  }
  async importPack(data) {
    const bytes = unbase(data); if (bytes.length > MAX_PACK) throw Error('笔记包不能超过 32MB。');
    const zip = await loadSafeZip(bytes,{maxBytes:MAX_PACK,maxEntries:1000,maxExpanded:MAX_PACK,maxFile:MAX_FILE,validName:name=>{try{safePath(name.replace(/\/$/,''));return !name.split('/').some(p=>p.startsWith('.'));}catch{return false;}}}), names = new Set(); let total = 0;
    for (const entry of Object.values(zip.files)) {
      safePath(entry.name.replace(/\/$/, '')); if (entry.name.split('/').some(p => p.startsWith('.')) || entry.unsafeOriginalName && entry.unsafeOriginalName !== entry.name || names.has(entry.name.toLowerCase()) || (Number(entry.unixPermissions) & 0xf000) === 0xa000) throw Error('笔记包路径不安全。'); names.add(entry.name.toLowerCase());
      if (!entry.dir) { const size = entry._data?.uncompressedSize; if (!Number.isSafeInteger(size) || size > MAX_FILE || size < 0) throw Error('笔记包文件过大。'); total += size; }
    }
    if (names.size > 1000 || total > MAX_PACK) throw Error('笔记包内容超过移动版限制。');
    const manifestFile = zip.file('manifest.json'); if (!manifestFile || manifestFile._data.uncompressedSize > 1024 * 1024) throw Error('笔记包缺少清单。');
    const budget={remaining:MAX_PACK};
    const m = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readZipEntry(manifestFile,1024*1024,budget)));
    if (m.format !== 'local-markdown-notepack' || m.formatVersion !== 1 || !Array.isArray(m.documents) || !m.documents.length || !Array.isArray(m.assets)) throw Error('不支持的笔记包。');
    const contents = new Map(), seen = new Set();
    for (const item of [...m.documents, ...m.assets]) {
      safePath(item.path); if (seen.has(item.path.toLowerCase()) || !/^(notes|assets)\//.test(item.path) || !Number.isSafeInteger(item.size) || item.size < 0 || !/^[a-f\d]{64}$/.test(item.sha256)) throw Error('笔记包清单无效。'); seen.add(item.path.toLowerCase());
      const entry = zip.file(item.path); if (!entry || entry._data.uncompressedSize !== item.size) throw Error('笔记包文件大小不符。'); const value = bytes64(await readZipEntry(entry,item.size,budget)); if (await this.io('digest', { data: value }) !== item.sha256) throw Error('笔记包校验失败。'); contents.set(item.path, value);
    }
    for (const item of m.documents) if (!/^notes\/.+\.(md|markdown)$/i.test(item.path) || encrypted(contents.get(item.path))) throw Error('笔记条目无效。');
    for (const item of m.assets) if (!item.path.startsWith('assets/')) throw Error('附件条目无效。');
    for (const entry of Object.values(zip.files)) if (!entry.dir && entry.name !== 'manifest.json' && !contents.has(entry.name)) throw Error('笔记包有未声明文件。');
    const id = Date.now() + '-' + Math.random().toString(36).slice(2, 7), folder = '导入-' + id, stage = '.moye/import-' + id; await this.io('mkdir', { path: stage });
    // Keep the desktop notes/assets directory relationship intact. Commit once all writes succeed.
    for (const [path, value] of contents) await this.io('write', { path: stage + '/' + path, data: value, expected: 'new' });
    await this.io('move', { path: stage, dest: folder }); return folder + '/' + m.documents[0].path;
  }
}
