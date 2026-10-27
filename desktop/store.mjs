import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import JSZip from 'jszip';
import { references, rewriteLinks, isRemote, splitUrl } from '../shared/markdown.mjs';
import { encrypted, header, keyFor, seal, unseal } from './encryption.mjs';
import { recoverRenames, renameEntry, duplicateNote, entry } from './file-operations.mjs';
import { readFileBounded, ensurePrivateDirectory, privateFile } from './safe-io.mjs';
import { loadSafeZip, readZipEntry } from '../shared/zip-safety.mjs';
const MAX_NOTE = 21 * 1024 * 1024, MAX_PACK = 128 * 1024 * 1024;

export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const normalize = p => path.resolve(p);
export const inside = (root, file) => { const rel = path.relative(normalize(root), normalize(file)); return !rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel); };
export async function atomicWrite(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = file + '.' + randomUUID() + '.tmp';
  let h;
  try { h = await fs.open(temp, 'wx'); await h.writeFile(data); await h.sync(); await h.close(); h = null; await fs.rename(temp, file); }
  finally { await h?.close(); await fs.rm(temp, { force: true }).catch(() => {}); }
}
export function validateName(name) {
  if (typeof name !== 'string' || !name.trim() || name.length > 150 || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) throw Error('文件名无效，请使用普通文字。');
  return name;
}
export function validPackagePath(p) {
  return typeof p === 'string' && p.length < 600 && !p.includes('\\') && !p.startsWith('/') && p.split('/').every(x => x && x !== '.' && x !== '..' && !/[<>:"|?*\x00-\x1f]/.test(x) && !/[. ]$/.test(x) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(x));
}
export class NotebookStore {
  constructor(root, assetRoot = null, authorizedAssetRoots = []) { this.root = normalize(root); this.assetRoot = assetRoot ? normalize(assetRoot) : path.join(this.root, 'assets'); this.authorizedAssetRoots = authorizedAssetRoots.map(normalize); this.queues = new Map(); this.keys = new Map(); }
  async init() {
    await fs.mkdir(this.root, { recursive: true });
    for (const folder of ['history','recovery','encryption','renames']) await ensurePrivateDirectory(this.root, '.notebook/' + folder);
    const journals = path.join(this.root, '.notebook', 'encryption');
    for (const name of await fs.readdir(journals).catch(() => [])) {
      if (/^[a-f\d-]{36}$/.test(name)) { await ensurePrivateDirectory(this.root, '.notebook/encryption/' + name); await this.finishEncryption(path.join(journals, name)); }
    }
    await recoverRenames(this); return this;
  }
  entry(file) { return entry(this, file); }
  privateFile(full) { return privateFile(this.root, path.relative(this.root, full).split(path.sep).join('/')); }
  async fileOperation(fn) {
    const key = normalize(path.join(this.root, '.notebook/file-operations')).toLowerCase();
    return this.queue('.notebook/file-operations', async () => {
      await Promise.allSettled([...this.queues.entries()].filter(([name]) => name !== key).map(([, promise]) => promise));
      this.mutating = true;
      try { return await fn(); } finally { this.mutating = false; }
    });
  }
  rename(file, name) { return this.fileOperation(() => renameEntry(this, file, name)); }
  duplicate(file) { return this.fileOperation(() => duplicateNote(this, file)); }
  secret(file) { const secret = this.keys.get(normalize(path.join(this.root, file)).toLowerCase()); if (!secret) throw Error('请先输入密码解锁文档。'); return secret; }
  lock(file) { const key = normalize(path.join(this.root, file)).toLowerCase(); this.keys.get(key)?.key.fill(0); this.keys.delete(key); }
  lockAll() { for (const value of this.keys.values()) value.key.fill(0); this.keys.clear(); }
  async unlock(file, password) {
    return this.queue(file, async () => {
      const bytes = await readFileBounded(await this.resolve(file), MAX_NOTE), secret = await keyFor(password, header(bytes).salt);
      try { unseal(bytes, secret); } catch (error) { secret.key.fill(0); throw error; }
      this.lock(file); this.keys.set(normalize(path.join(this.root, file)).toLowerCase(), secret);
      return this.read(file);
    });
  }
  async finishEncryption(stage) {
    const journalFile = await this.privateFile(path.join(stage, 'commit.json'));
    const journal = await readFileBounded(journalFile, 2*1024*1024, 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (!journal) { await fs.rm(stage, { recursive: true, force: true }); return; }
    await this.resolve(journal.file);
    const historyPrefix = '.notebook/history/' + hash(journal.file) + '/';
    const recoveryPath = '.notebook/recovery/' + hash(journal.file) + '.json';
    if (!Array.isArray(journal.entries) || journal.entries.length > 1000) throw Error('加密事务记录无效。');
    for (const [i, entry] of journal.entries.entries()) {
      if (!(entry.path === journal.file || entry.path === recoveryPath || entry.path.startsWith(historyPrefix) && /^\d+-[a-f\d-]+\.md$/.test(entry.path.slice(historyPrefix.length))) || !/^[a-f\d]{64}$/.test(entry.before) || !/^[a-f\d]{64}$/.test(entry.after)) throw Error('加密事务路径无效。');
      const target = path.join(this.root, entry.path), realRoot = await fs.realpath(this.root), realTarget = await fs.realpath(target);
      if (!inside(realRoot, realTarget)) throw Error('加密事务目标不在笔记库中。');
      const currentHash = hash(await readFileBounded(target, MAX_NOTE));
      if (currentHash === entry.after) continue;
      if (currentHash !== entry.before) throw Error('加密过程中原文件被外部修改，请保留文件并处理加密事务。');
      const ciphertext = await readFileBounded(await this.privateFile(path.join(stage, i + '.bin')), MAX_NOTE);
      if (!encrypted(ciphertext) || hash(ciphertext) !== entry.after) throw Error('加密事务校验失败。');
      await atomicWrite(target, ciphertext);
    }
    await fs.rm(stage, { recursive: true, force: true });
  }
  async encrypt(file, password, expectedHash) {
    return this.queue(file, async () => {
      const full = await this.resolve(file), before = await readFileBounded(full, MAX_NOTE);
      if (encrypted(before)) throw Error('此文档已经加密。');
      if (hash(before) !== expectedHash) throw Error('磁盘文件已被其他程序修改，请重新载入后加密。');
      if (before.length > 20 * 1024 * 1024) throw Error('正文超过 20MB 限制。');
      const secret = await keyFor(password), stage = path.join(this.root, '.notebook', 'encryption', randomUUID());
      let committed = false;
      try {
        const entries = [], sources = [];
        const historyDir = await ensurePrivateDirectory(this.root, '.notebook/history/' + hash(file));
        for (const id of await fs.readdir(historyDir).catch(() => [])) {
          if (!/^\d+-[a-f\d-]+\.md$/.test(id)) throw Error('历史记录包含未知文件，加密已停止。');
          sources.push({ path: '.notebook/history/' + hash(file) + '/' + id, context: 'document' });
        }
        const recoveryPath = '.notebook/recovery/' + hash(file) + '.json';
        if (await fs.stat(path.join(this.root, recoveryPath)).catch(() => null)) sources.push({ path: recoveryPath, context: 'recovery' });
        sources.push({ path: file, context: 'document' });
        for (const source of sources) {
          const raw = source.path === file ? before : await readFileBounded(await this.privateFile(path.join(this.root, source.path)), MAX_NOTE);
          if (raw.length > 20 * 1024 * 1024) throw Error('正文或恢复记录超过 20MB，无法加密。');
          const bytes = seal(raw, secret, source.context), i = entries.length;
          await atomicWrite(await this.privateFile(path.join(stage, i + '.bin')), bytes);
          entries.push({ path: source.path, before: hash(raw), after: hash(bytes) });
        }
        await atomicWrite(await this.privateFile(path.join(stage, 'commit.json')), JSON.stringify({ file, entries })); committed = true;
        await this.finishEncryption(stage);
        this.keys.set(normalize(full).toLowerCase(), secret);
        return this.read(file);
      } catch (error) {
        secret.key.fill(0); if (!committed) await fs.rm(stage, { recursive: true, force: true });
        throw error;
      }
    });
  }
  async resolve(file, { asset = false, exists = true } = {}) {
    if (typeof file !== 'string' || !file || file.length > 4096 || /[\x00-\x1f]/.test(file)) throw Error('文件路径无效。');
    const full = path.resolve(this.root, file);
    const roots = asset ? [this.root, this.assetRoot, ...this.authorizedAssetRoots] : [this.root];
    if (!roots.some(r => inside(r, full))) throw Error('文件不在已授权目录中。');
    if (!roots.some(r=>inside(r,full)&&!path.relative(r,full).split(path.sep).some(p=>/[<>:"|?*]/.test(p)))) throw Error('文件路径包含不安全字符。');
    if (!asset && (path.relative(this.root, full).split(path.sep).some(x => x.startsWith('.')) || !/\.(md|markdown|moye)$/i.test(full))) throw Error('仅允许操作 Markdown 或风车笔记加密笔记。');
    const real = await fs.realpath(exists ? full : path.dirname(full));
    const realRoot = await fs.realpath(this.root), realRoots = await Promise.all(roots.map(async r => ({ lexical:r, real:await fs.realpath(r).catch(()=>null) })));
    const permitted=realRoots.filter(r => r.real && inside(r.lexical, full) && (!inside(this.root,r.lexical) || inside(realRoot,r.real)) && inside(r.real,real));
    if (!permitted.length) throw Error('不允许通过符号链接访问目录外文件。');
    if (!asset && path.relative(realRoot,real).split(path.sep).some(p=>p.startsWith('.')))throw Error('不能通过链接访问隐藏笔记或内部存储。');
    if (asset) {
      if (inside(path.join(this.root,'.notebook'), full) || inside(path.join(realRoot,'.notebook'),real)) throw Error('不能将内部存储作为附件访问。');
      if (!permitted.some(r => !path.relative(r.lexical,full).split(path.sep).some(p=>p.startsWith('.')) && !path.relative(r.real,real).split(path.sep).some(p=>p.startsWith('.')))) throw Error('不能通过笔记引用隐藏文件或目录。');
    }
    return full;
  }
  async list() {
    const notes = [];
    const walk = async (dir, depth = 0) => {
      if (depth > 20 || notes.length > 20000) return;
      for (const item of await fs.readdir(dir, { withFileTypes: true })) {
        if (item.name.startsWith('.') || item.isSymbolicLink()) continue;
        const file = path.join(dir, item.name);
        if (item.isDirectory() && normalize(file) !== normalize(this.assetRoot)) await walk(file, depth + 1);
        else if (item.isFile() && /\.(md|markdown|moye)$/i.test(item.name)) {
          const s = await fs.stat(file), h = await fs.open(file, 'r'); let flag;
          try { const bytes = Buffer.alloc(8); await h.read(bytes, 0, 8, 0); flag = encrypted(bytes); } finally { await h.close(); }
          notes.push({ path: path.relative(this.root, file).split(path.sep).join('/'), name: item.name.replace(/\.(md|markdown|moye)$/i, ''), modified: s.mtimeMs, encrypted: flag });
        }
      }
    };
    await walk(this.root); return notes.sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'));
  }
  async read(file) {
    const full = await this.resolve(file); const stored = await readFileBounded(full, MAX_NOTE), isEncrypted = encrypted(stored);
    if (/\.moye$/i.test(file) && !isEncrypted) throw Error('加密文档格式无效或已损坏。');
    if (isEncrypted && !this.keys.has(normalize(full).toLowerCase())) { header(stored); return { path: file, encrypted: true, locked: true, text: '', hash: hash(stored), bom: false, eol: '\n' }; }
    const bytes = isEncrypted ? unseal(stored, this.secret(file)) : stored;
    if (bytes.length > 20 * 1024 * 1024) throw Error('此版本最多打开 20MB 的 Markdown 文件。');
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); } catch { throw Error('文件不是有效 UTF-8，请先转换编码后打开；原文件未修改。'); }
    const bom = text.startsWith('\uFEFF'); if (bom) text = text.slice(1);
    return { path: file, text, bom, hash: hash(stored), encrypted: isEncrypted, eol: text.includes('\r\n') ? '\r\n' : '\n' };
  }
  queue(file, fn) {
    if (this.mutating) return Promise.reject(Error('正在调整文件，请稍后再试。'));
    const key = normalize(path.join(this.root, file)).toLowerCase();
    const next = (this.queues.get(key) || Promise.resolve()).catch(() => {}).then(fn);
    this.queues.set(key, next); return next;
  }
  async save({ path: file, text, expectedHash, bom = false }) {
    if (typeof text !== 'string' || text.length > 20 * 1024 * 1024) throw Error('笔记内容超过限制。');
    return this.queue(file, async () => {
      const full = await this.resolve(file); const before = await readFileBounded(full, MAX_NOTE);
      if (hash(before) !== expectedHash) throw Error('磁盘文件已被其他程序修改。请另存副本，或重新载入磁盘版本。');
      const plain = Buffer.from((bom ? '\uFEFF' : '') + text), isEncrypted = encrypted(before);
      if (plain.length > 20 * 1024 * 1024) throw Error('笔记内容超过 20MB 限制。');
      if (isEncrypted && unseal(before, this.secret(file)).equals(plain) || !isEncrypted && hash(plain) === expectedHash) return { hash: expectedHash };
      const bytes = isEncrypted ? seal(plain, this.secret(file)) : plain;
      const history = await ensurePrivateDirectory(this.root, '.notebook/history/' + hash(file));
      await atomicWrite(await this.privateFile(path.join(history, Date.now() + '-' + randomUUID() + '.md')), before);
      // Recheck after creating the recovery version, before replacement.
      if (hash(await readFileBounded(full, MAX_NOTE)) !== expectedHash) throw Error('保存过程中磁盘文件发生变化，请另存副本。');
      await atomicWrite(full, bytes);
      const versions = (await fs.readdir(history)).sort().reverse();
      for (const old of versions.slice(30)) await fs.rm(path.join(history, old)).catch(() => {});
      return { hash: hash(bytes) };
    });
  }
  async directory(parent = '') {
    if (typeof parent !== 'string' || (parent && !validPackagePath(parent)) || parent.split('/').some(part => part.startsWith('.'))) throw Error('文件夹路径无效。');
    const full = path.resolve(this.root, parent);
    if (!inside(this.root, full) || normalize(this.assetRoot) !== normalize(this.root) && inside(this.assetRoot, full)) throw Error('请选择笔记库中的普通文件夹。');
    const real = await fs.realpath(full), realRoot = await fs.realpath(this.root);
    if (!inside(realRoot, real) || !(await fs.stat(full)).isDirectory()) throw Error('文件夹不在笔记库中。');
    return full;
  }
  async directories() {
    const folders = [];
    const walk = async (dir, depth = 0) => {
      if (depth > 20 || folders.length > 20000) return;
      for (const item of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, item.name);
        if (!item.isDirectory() || item.isSymbolicLink() || item.name.startsWith('.') || normalize(full) === normalize(this.assetRoot)) continue;
        folders.push(path.relative(this.root, full).split(path.sep).join('/')); await walk(full, depth + 1);
      }
    };
    await walk(this.root); return folders;
  }
  async createFolder(name, parent = '') {
    validateName(name); if (name.startsWith('.')) throw Error('文件夹名称不能以点开头。');
    const directory = await this.directory(parent), full = path.join(directory, name);
    if (normalize(this.assetRoot) !== normalize(this.root) && inside(this.assetRoot, full)) throw Error('该目录用于存放附件，请使用其他文件夹名称。');
    try { await fs.mkdir(full); } catch (error) { if (error.code === 'EEXIST') throw Error('同名文件或文件夹已存在。'); throw error; }
    return { path: path.relative(this.root, full).split(path.sep).join('/') };
  }
  async create(name, text = '# 新笔记\n\n', parent = '') {
    validateName(name); if (!/\.md$/i.test(name)) name += '.md';
    await this.directory(parent);
    const relative = parent ? parent + '/' + name : name;
    const full = await this.resolve(relative, { exists: false });
    try { await fs.writeFile(full, text, { flag: 'wx' }); } catch (error) { if (error.code === 'EEXIST') throw Error('同名文件已存在。'); throw error; }
    return this.read(relative);
  }
  async recovery(file, text) {
    if (typeof text !== 'string' || Buffer.byteLength(text) > 20 * 1024 * 1024) throw Error('恢复内容超过限制。');
    return this.queue(file, async () => {
      const bytes = await readFileBounded(await this.resolve(file),MAX_NOTE), data = Buffer.from(JSON.stringify({ path: file, text, at: Date.now() }));
      if (data.length > 20 * 1024 * 1024) throw Error('恢复记录超过 20MB 限制。');
      await atomicWrite(await this.privateFile(path.join(this.root, '.notebook', 'recovery', hash(file) + '.json')), encrypted(bytes) ? seal(data, this.secret(file), 'recovery') : data);
    });
  }
  async getRecovery(file) {
    const note = await this.read(file); if (note.encrypted) this.secret(file);
    const bytes = await readFileBounded(await this.privateFile(path.join(this.root, '.notebook', 'recovery', hash(file) + '.json')),MAX_NOTE).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (!bytes) return null;
    if (note.encrypted && !encrypted(bytes)) throw Error('加密文档的恢复记录已损坏。');
    return JSON.parse((encrypted(bytes) ? unseal(bytes, this.secret(file), 'recovery') : bytes).toString('utf8'));
  }
  async clearRecovery(file, text) {
    const current = await this.getRecovery(file);
    if (current?.text === text) await fs.rm(path.join(this.root, '.notebook', 'recovery', hash(file) + '.json'), { force: true });
  }
  async history(file) {
    const note = await this.read(file); if (note.locked) throw Error('请先输入密码解锁文档。');
    const dir = await ensurePrivateDirectory(this.root, '.notebook/history/' + hash(file));
    return (await fs.readdir(dir).catch(() => [])).sort().reverse().map(name => ({ id: name, at: Number(name.split('-')[0]) }));
  }
  async historyRead(file, id) {
    await this.resolve(file); if (!/^\d+-[a-f\d-]+\.md$/.test(id)) throw Error('无效版本。');
    const note = await this.read(file); if (note.encrypted) this.secret(file);
    const bytes = await readFileBounded(await this.privateFile(path.join(this.root, '.notebook', 'history', hash(file), id)),MAX_NOTE);
    if (note.encrypted && !encrypted(bytes)) throw Error('加密文档的历史版本已损坏。');
    return (encrypted(bytes) ? unseal(bytes, this.secret(file)) : bytes).toString('utf8');
  }
  async ingest(bytes, name, note) {
    await this.resolve(note); validateName(name);
    if (!bytes.length || bytes.length > 100 * 1024 * 1024) throw Error('附件为空或超过 100MB。');
    await this.assetDirectory();
    const ext = path.extname(name).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 12) || '.bin';
    const dest = path.join(this.assetRoot, hash(bytes) + ext);
    if (!(await fs.stat(dest).catch(() => null))) await atomicWrite(dest, bytes);
    else if (hash(await readFileBounded(dest,100*1024*1024)) !== hash(bytes)) throw Error('已有附件内容与名称不一致，请更换附件目录。');
    return { url: this.linkFor(note, dest), name, image: /\.(png|jpg|jpeg|gif|webp|avif|bmp|svg)$/i.test(ext) };
  }
  linkFor(note, dest) {
    const relative = path.relative(path.dirname(path.join(this.root, note)), dest);
    return path.isAbsolute(relative) ? pathToFileURL(dest).href : relative.split(path.sep).map(encodeURIComponent).join('/');
  }
  async assetDirectory() {
    await fs.mkdir(this.assetRoot,{recursive:true});const root=await fs.realpath(this.root),real=await fs.realpath(this.assetRoot);
    if (inside(this.root,this.assetRoot)&&!inside(root,real) || inside(path.join(this.root,'.notebook'),this.assetRoot) || inside(path.join(root,'.notebook'),real)) throw Error('附件目录不能借助链接越界或使用内部存储。');
    return this.assetRoot;
  }
  async localTarget(note, url) {
    await this.resolve(note);
    if (!url || url.startsWith('#') || isRemote(url)) return null;
    const part = splitUrl(url); let full;
    try { full = /^file:/i.test(url) ? fileURLToPath(new URL(url)) : path.resolve(path.dirname(path.join(this.root, note)), decodeURIComponent(part.path)); }
    catch { throw Error('无效附件路径：' + url); }
    return this.resolve(full, { asset: true });
  }
  async pack(files, snapshots = {}) {
    const zip = new JSZip(); const documents = [], assets = [], map = new Map(), contents = new Map(), warnings = [];
    let retained = 0;
    const pending = [...files], visited = new Set();
    while (pending.length) {
      const file = pending.shift(); if (visited.has(file)) continue; visited.add(file);
      if (visited.size > 10000) throw Error('笔记包文档数量超过限制。');
      const note = await this.read(file); if (note.encrypted) throw Error('笔记包包含加密文档，请单独导出为加密文档；加密正文不会转为明文。'); const text = snapshots[file] ?? note.text;
      if (typeof text !== 'string' || Buffer.byteLength(text)>20*1024*1024 || (retained+=Buffer.byteLength(text))>MAX_PACK) throw Error('笔记包总内容超过限制。');
      contents.set(file, text); map.set(path.resolve(this.root, file).toLowerCase(), 'notes/' + file.replaceAll('\\', '/'));
      for (const ref of references(text)) {
        if (isRemote(ref.url)) { if(warnings.length<1000)warnings.push({ note: file, url: ref.url.slice(0,4096), reason: '外部链接，未下载' }); continue; }
        const full = await this.localTarget(file, ref.url); if (!full) continue;
        const key = full.toLowerCase();
        if (/\.(md|markdown|moye)$/i.test(full) && inside(this.root, full)) { pending.push(path.relative(this.root, full).split(path.sep).join('/')); continue; }
        if (!map.has(key)) {
          const bytes = await readFileBounded(full,Math.min(100*1024*1024,MAX_PACK-retained)); const dest = 'assets/' + hash(bytes) + path.extname(full).toLowerCase();
          map.set(key, dest);
          if (!assets.some(a => a.path === dest)) { retained+=bytes.length; assets.push({ path: dest, size: bytes.length, sha256: hash(bytes) }); zip.file(dest, bytes); }
        }
      }
    }
    for (const [file, text] of contents) {
      const dest = map.get(path.resolve(this.root, file).toLowerCase());
      const refs = new Map();
      for (const ref of references(text)) {
        const target = await this.localTarget(file, ref.url); if (!target) continue;
        const mapped = map.get(target.toLowerCase());
        if (!mapped) throw Error('无法收集依赖：' + ref.url);
        refs.set(ref.url, path.posix.relative(path.posix.dirname(dest), mapped).split('/').map(encodeURIComponent).join('/') + splitUrl(ref.url).suffix);
      }
      const bytes = Buffer.from(rewriteLinks(text, x => refs.get(x)));
      retained += bytes.length - Buffer.byteLength(text); if (retained>MAX_PACK || bytes.length>20*1024*1024) throw Error('笔记包内容超过限制。');
      zip.file(dest, bytes); documents.push({ path: dest, size: bytes.length, sha256: hash(bytes) });
    }
    const manifest = { format: 'local-markdown-notepack', formatVersion: 1, appVersion: '0.1.0', dialect: 'gfm-math-v1', createdAt: new Date().toISOString(), documents, assets, warnings };
    if ([...documents, ...assets].reduce((n, f) => n + f.size, 0) > 128 * 1024 * 1024) throw Error('此版本笔记包总内容不得超过 128MB。');
    const manifestText=JSON.stringify(manifest,null,2);if(Buffer.byteLength(manifestText)>2*1024*1024 || retained+Buffer.byteLength(manifestText)>MAX_PACK)throw Error('笔记包清单或总内容超过限制。');
    zip.file('manifest.json', manifestText);
    return { bytes: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }), manifest };
  }
  async inspectPackage(bytes) {
    if (bytes.length > 128 * 1024 * 1024) throw Error('笔记包超过 128MB 限制。');
    const zip = await loadSafeZip(bytes, { maxBytes:MAX_PACK,maxEntries:20000,maxExpanded:MAX_PACK,validName:name=>validPackagePath(name.replace(/\/$/,''))&&!name.split('/').some(p=>p.startsWith('.')) }); let total = 0; const seen = new Set();
    if (Object.keys(zip.files).length > 20000) throw Error('包内条目过多。');
    for (const [name, entry] of Object.entries(zip.files)) {
      const original = entry.unsafeOriginalName || name;
      if (!validPackagePath(original.replace(/\/$/, '')) || original !== name || seen.has(name.toLowerCase()) || (Number(entry.unixPermissions) & 0xf000) === 0xa000) throw Error('笔记包包含不安全路径或重复条目。');
      seen.add(name.toLowerCase());
      total += entry._data?.uncompressedSize || 0;
      if (total > 128 * 1024 * 1024) throw Error('解压内容超过 128MB 限制。');
    }
    const mf = zip.file('manifest.json'); if (!mf || mf._data.uncompressedSize > 2 * 1024 * 1024) throw Error('笔记包缺少有效清单。');
    const budget = { remaining:MAX_PACK };
    const manifest = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readZipEntry(mf,2*1024*1024,budget)));
    if (manifest.format !== 'local-markdown-notepack' || manifest.formatVersion !== 1 || !Array.isArray(manifest.documents) || !Array.isArray(manifest.assets) || !manifest.documents.length) throw Error('不支持此笔记包版本或内容为空。');
    const files = new Map(), paths = new Set();
    for (const doc of manifest.documents) if (!/^notes\/.+\.(md|markdown)$/i.test(doc?.path) || !Number.isSafeInteger(doc.size) || doc.size>20*1024*1024) throw Error('无效笔记条目或文件过大。');
    for (const asset of manifest.assets) if (typeof asset?.path!=='string' || !asset.path.startsWith('assets/') || !Number.isSafeInteger(asset.size) || asset.size>100*1024*1024) throw Error('无效附件条目或文件过大。');
    for (const item of [...manifest.documents, ...manifest.assets]) {
      if (!validPackagePath(item.path) || paths.has(item.path.toLowerCase()) || !Number.isSafeInteger(item.size) || item.size < 0 || !/^[a-f\d]{64}$/.test(item.sha256)) throw Error('文件清单无效。');
      if (!(item.path.startsWith('notes/') || item.path.startsWith('assets/'))) throw Error('文件清单路径无效。');
      paths.add(item.path.toLowerCase());
      const entry = zip.file(item.path); if (!entry || entry._data.uncompressedSize !== item.size) throw Error('文件缺失或大小不匹配：' + item.path);
      const content = Buffer.from(await readZipEntry(entry,item.size,budget));
      if (hash(content) !== item.sha256) throw Error('文件校验失败：' + item.path);
      files.set(item.path, content);
    }
    for (const doc of manifest.documents) if (!/^notes\/.+\.(md|markdown)$/i.test(doc.path)) throw Error('无效笔记条目。');
    for (const asset of manifest.assets) if (!asset.path.startsWith('assets/')) throw Error('无效附件条目。');
    for (const entry of Object.values(zip.files)) if (!entry.dir && entry.name !== 'manifest.json' && !files.has(entry.name)) throw Error('笔记包有未声明文件。');
    return { manifest, files };
  }
  async importPackage(bytes) {
    const { manifest, files } = await this.inspectPackage(bytes);
    const folder = '导入-' + new Date().toISOString().slice(0, 10) + '-' + randomUUID().slice(0, 6);
    const stage = path.join(this.root, '.notebook', 'import-' + randomUUID());
    await ensurePrivateDirectory(this.root, '.notebook/' + path.basename(stage));
    const targets = new Map();
    try {
      for (const a of manifest.assets) {
        const content = files.get(a.path); const dest = path.join(this.assetRoot, hash(content) + path.extname(a.path));
        await this.assetDirectory();
        if (await fs.stat(dest).catch(() => null)) { if (hash(await readFileBounded(dest,100*1024*1024)) !== hash(content)) throw Error('附件目录存在内容冲突。'); }
        else await atomicWrite(dest, content);
        targets.set(a.path, dest);
      }
      for (const d of manifest.documents) targets.set(d.path, path.join(this.root, folder, d.path.slice(6)));
      for (const d of manifest.documents) {
        const target = targets.get(d.path); const relative = path.relative(this.root, target);
        const text = new TextDecoder('utf-8', { fatal: true }).decode(files.get(d.path));
        const updated = rewriteLinks(text, url => {
          if (isRemote(url) || url.startsWith('#')) return url;
          const part = splitUrl(url); const packagePath = path.posix.normalize(path.posix.join(path.posix.dirname(d.path), decodeURIComponent(part.path)));
          const mapped = targets.get(packagePath);
          if (!mapped) throw Error('笔记包有未收集的本地依赖：' + url);
          return this.linkFor(relative, mapped) + part.suffix;
        });
        await atomicWrite(path.join(stage, d.path.slice(6)), updated);
      }
      await fs.rename(stage, path.join(this.root, folder));
      return { folder, count: manifest.documents.length, warnings: manifest.warnings || [] };
    } finally { await fs.rm(stage, { recursive: true, force: true }).catch(() => {}); }
  }
}
