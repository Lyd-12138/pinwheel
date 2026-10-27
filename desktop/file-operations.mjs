import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicWrite, hash, inside, validPackagePath, validateName } from './store.mjs';
import { readFileBounded, ensurePrivateDirectory } from './safe-io.mjs';

const stat = file => fs.lstat(file, { bigint: true }).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
const identity = value => ({ dev: String(value.dev), ino: String(value.ino), folder: value.isDirectory() });
const same = (value, expected) => value && !value.isSymbolicLink() && String(value.dev) === expected.dev && String(value.ino) === expected.ino && value.isDirectory() === expected.folder;
const matches = async (value, file, expected) => value && !value.isSymbolicLink() && (expected.folder || !expected.digest ? same(value, expected) : value.isFile() && hash(await readFileBounded(file,21*1024*1024)) === expected.digest);
const normal = value => typeof value === 'string' && validPackagePath(value) && !value.split('/').some(part => part.startsWith('.'));
export async function entry(store, file = '') {
  if (file && !normal(file)) throw Error('文件路径无效。');
  const full = path.resolve(store.root, file), info = await stat(full);
  if (!info || info.isSymbolicLink()) throw Error('文件不存在，或不是普通文件。');
  if (info.isDirectory()) await store.directory(file); else await store.resolve(file);
  return { full, path: file, folder: info.isDirectory(), info };
}
async function move(store, source, target, expected) {
  const from = path.resolve(store.root, source), to = path.resolve(store.root, target);
  if (!inside(store.root, from) || !inside(store.root, to)) throw Error('重命名目标不在笔记库中。');
  await fs.mkdir(path.dirname(to), { recursive: true });
  for (const location of [from, to]) {
    const parent = await fs.realpath(path.dirname(location));
    if (!inside(await fs.realpath(store.root), parent)) throw Error('不允许通过链接移动笔记库外的文件。');
  }
  const before = await stat(from), after = await stat(to);
  if (!before && await matches(after, to, expected)) return;
  if (!await matches(before, from, expected)) throw Error('重命名期间文件被外部替换，请保留文件并重新启动应用恢复。');
  if (after) {
    if (!expected.folder && await matches(after, to, expected)) { await fs.unlink(from); return; }
    throw Error('目标名称已存在，原文件未覆盖。');
  }
  if (expected.folder) await fs.rename(from, to);
  else {
    // Exclusive copying works on NTFS, APFS and removable filesystems too.
    await fs.copyFile(from, to, constants.COPYFILE_EXCL);
    if (!await matches(await stat(from), from, expected) || !await matches(await stat(to), to, expected)) { await fs.unlink(to); throw Error('原文件在重命名期间被外部替换。'); }
    await fs.unlink(from);
  }
}
export async function finishRename(store, stage) {
  const journal = await readFileBounded(await store.privateFile(path.join(stage, 'commit.json')),8*1024*1024,'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (!journal) { if (await stat(path.join(stage,'content'))) throw Error('重命名暂存区存在文档但缺少提交记录，请保留暂存区并手动恢复。'); await fs.rm(stage, { recursive: true, force: true }); return; }
  const { file, target, notes, content, metadata } = journal;
  if (!normal(file) || !normal(target) || path.posix.dirname(file) !== path.posix.dirname(target) || !Array.isArray(notes) || notes.length > 20000 || !Array.isArray(metadata)) throw Error('重命名事务无效。');
  const staged = path.relative(store.root, path.join(stage, 'content')).split(path.sep).join('/'), allowed = new Set();
  for (const note of notes) {
    if (!normal(note) || !(note === file || note.startsWith(file + '/')) || !/\.(md|markdown|moye)$/i.test(note)) throw Error('重命名事务中的笔记路径无效。');
    const renamed = target + note.slice(file.length);
    for (const kind of ['history','recovery']) {
      const suffix = kind === 'recovery' ? '.json' : '';
      allowed.add(`.notebook/${kind}/${hash(note)}${suffix}|.notebook/${kind}/${hash(renamed)}${suffix}`);
    }
  }
  for (const item of metadata) {
    if (!allowed.has(item.from + '|' + item.to)) throw Error('重命名事务中的历史路径无效。');
    await move(store, item.from, item.to, item.identity);
  }
  const finalInfo = await stat(path.join(store.root, target));
  if (!(await matches(finalInfo, path.join(store.root, target), content) && !await stat(path.join(store.root, file)) && !await stat(path.join(store.root, staged)))) {
    await move(store, file, staged, content);
    await move(store, staged, target, content);
  }
  await fs.rm(stage, { recursive: true, force: true });
}
export async function recoverRenames(store) {
  const root = path.join(store.root, '.notebook', 'renames');
  for (const name of await fs.readdir(root).catch(() => [])) if (/^[a-f\d-]{36}$/.test(name)) { await ensurePrivateDirectory(store.root,'.notebook/renames/'+name); await finishRename(store, path.join(root, name)); }
}
export async function renameEntry(store, file, name) {
  const source = await entry(store, file); if (!file) throw Error('不能重命名笔记库根目录。');
  if (source.folder && [store.assetRoot, ...store.authorizedAssetRoots].some(root => inside(source.full, root))) throw Error('此文件夹包含已配置的附件目录，请先调整附件目录后再重命名。');
  validateName(name); if (name.startsWith('.')) throw Error('名称不能以点开头。');
  if (!source.folder) { const ext = path.extname(file); if (!name.toLowerCase().endsWith(ext.toLowerCase())) name += ext; }
  const parent = path.posix.dirname(file), target = (parent === '.' ? '' : parent + '/') + name;
  if (target === file) return { path: target, folder: source.folder };
  const existing = await stat(path.join(store.root, target));
  if (existing && !(process.platform === 'win32' && target.toLowerCase() === file.toLowerCase() && same(existing, identity(source.info)))) throw Error('同名文件或文件夹已存在。');
  const notes = source.folder ? (await store.list()).filter(note => note.path.startsWith(file + '/')).map(note => note.path) : [file], metadata = [];
  for (const note of notes) {
    const renamed = target + note.slice(file.length);
    for (const kind of ['history','recovery']) {
      const suffix = kind === 'recovery' ? '.json' : '';
      const from = `.notebook/${kind}/${hash(note)}${suffix}`, to = `.notebook/${kind}/${hash(renamed)}${suffix}`;
      if (from === to) continue;
      if (await stat(path.join(store.root, to))) throw Error('目标名称已有历史或恢复记录，请使用其他名称以保留这些记录。');
      const old = await stat(path.join(store.root, from));
      if (old) { if (old.isSymbolicLink()) throw Error('历史记录路径不能是链接。'); metadata.push({ from, to, identity: { ...identity(old), ...(old.isFile() ? { digest: hash(await readFileBounded(await store.privateFile(path.join(store.root, from)),21*1024*1024)) } : {}) } }); }
    }
  }
  const stage = path.join(store.root, '.notebook', 'renames', randomUUID());
  await atomicWrite(await store.privateFile(path.join(stage, 'commit.json')), JSON.stringify({ file, target, notes, content: { ...identity(source.info), ...(!source.folder ? { digest:hash(await readFileBounded(source.full,21*1024*1024)) } : {}) }, metadata }));
  for (const note of notes) store.lock(note); await finishRename(store, stage);
  return { path: target, folder: source.folder };
}
export async function duplicateNote(store, file) {
  const source = await entry(store, file); if (source.folder) throw Error('请选择需要创建副本的文档。');
  const ext = path.extname(file), stem = path.basename(file, ext).slice(0, 112), parent = path.posix.dirname(file);
  for (let i = 1; i <= 1000; i++) {
    const name = stem + '-副本' + (i === 1 ? '' : i) + ext, target = (parent === '.' ? '' : parent + '/') + name;
    if (await stat(path.join(store.root, '.notebook/history', hash(target))) || await stat(path.join(store.root, '.notebook/recovery', hash(target) + '.json'))) continue;
    try { await fs.copyFile(source.full, path.join(store.root, target), constants.COPYFILE_EXCL); return { path: target }; }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  throw Error('副本名称过多，请先整理同名副本。');
}
