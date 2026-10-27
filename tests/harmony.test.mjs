import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { loadNative } from './harmony/load-native.mjs';
import { MobileStore, encode, decode, bytes64, unbase, safePath, resolvePath } from '../harmony/web/store.mjs';
import { keyFor, seal, unseal } from '../desktop/encryption.mjs';
import { NotebookStore } from '../desktop/store.mjs';
const run = path.resolve('test-results/harmony-core-' + Date.now()); await fs.mkdir(run, { recursive: true });
const { NoteCrypto, NoteFiles, trustedPage, NativeBridge } = await loadNative(path.join(run, 'native'));
async function fixture(name) {
  const root = path.join(run, name), crypto = new NoteCrypto(), files = new NoteFiles(root, crypto);
  const io = async (command, args = {}) => {
    if (command === 'read') return files.read(args.path);
    if (command === 'write') return files.write(args.path, args.data, args.expected);
    if (command === 'list') return files.list(args.path || '');
    if (command === 'mkdir') return files.mkdir(args.path);
    if (command === 'move') return files.move(args.path, args.dest);
    if (command === 'trash') return files.trash(args.path);
    if (command === 'digest') return crypto.digest(crypto.decode(args.data));
    if (command === 'seal') return crypto.seal(args.data, args.token || '', args.password || '');
    if (command === 'open') return crypto.open(args.data, args.password || '', args.token || '');
    if (command === 'forget') return crypto.forget(args.token);
    if (command === 'forgetAll') return crypto.forgetAll();
    throw Error(command);
  };
  const store = new MobileStore(io); await store.init(); return { store, root, files, crypto, io };
}
test('Harmony native encryption is byte-compatible with desktop and authenticates before returning plaintext', async () => {
  const crypto = new NoteCrypto(), password = '互通密码-Harmony-2026', original = '# 中文\r\n\r\nhello 🪷';
  const desktopKey = await keyFor(password), desktopBytes = seal(Buffer.from(original), desktopKey);
  const opened = await crypto.open(bytes64(desktopBytes), password); assert.equal(decode(opened.data), original);
  const mobile = await crypto.seal(encode(original + '\n继续'), opened.token); assert.equal(unseal(Buffer.from(unbase(mobile.data)), desktopKey).toString(), original + '\n继续');
  const fresh = await crypto.seal(encode(original), '', password); const stored = Buffer.from(unbase(fresh.data)); const freshKey = await keyFor(password, stored.subarray(8, 24)); assert.equal(unseal(stored, freshKey).toString(), original);
  const tampered = stored.slice(); tampered[tampered.length - 1] ^= 1; await assert.rejects(crypto.open(bytes64(tampered), password), /密码错误/);
  await assert.rejects(crypto.open(fresh.data, '错误密码abcdefgh'), /密码错误/); crypto.forgetAll(); await assert.rejects(crypto.seal(encode('leak'), fresh.token), /已锁定/);
});
test('Harmony store preserves BOM/CRLF, queues saves, refuses stale writes and persists session without body text', async () => {
  const { store, io, root } = await fixture('save'); await io('write', { path: '笔记.md', data: encode('\uFEFF# 原文\r\n\r\n内容\r\n'), expected: 'new' });
  const doc = await store.open('笔记.md'); assert.equal(doc.bom, true); assert.equal(doc.text, '# 原文\r\n\r\n内容\r\n');
  await Promise.all([store.save(doc, '# 修改\r\n一\r\n'), store.save(doc, '# 修改\r\n二\r\n')]); assert.equal((await fs.readFile(path.join(root, doc.path))).toString(), '\uFEFF# 修改\r\n二\r\n');
  const stale = { ...doc }; await store.save(doc, '# 第三次'); await assert.rejects(store.save(stale, '不会覆盖'), /其他修改/);
  await store.preferences({ lastPath: doc.path, mode: 'source', collapsed: ['资料'], views: { [doc.path]: { sourceTop: 420 } } });
  const again = new MobileStore(io); await again.init(); assert.equal(again.settings.lastPath, doc.path); assert.equal(again.settings.mode, 'source'); assert.equal(again.settings.views[doc.path].sourceTop, 420); assert.ok(!(await fs.readFile(path.join(root, '.moye/settings.json'), 'utf8')).includes('第三次'));
});
test('Harmony attachment, rename, duplicate and locked document persistence keep original encrypted bytes', async () => {
  const { store, root } = await fixture('files'); await store.create('资料', true); await store.create('资料/想法.md'); let doc = await store.open('资料/想法.md');
  const file = { name: '照片.png', data: encode('image fixture') }, attachment = await store.attachment(doc.path, file); assert.ok(attachment.url.startsWith('../attachments/')); assert.equal((await store.attachment(doc.path, file)).path, attachment.path);
  await store.save(doc, '# 秘密\n\n![](' + attachment.url + ')'); await store.encrypt(doc, '至少八个字符-harmony'); const encryptedBefore = await fs.readFile(path.join(root, doc.path)); assert.ok(!encryptedBefore.includes(Buffer.from('秘密')));
  await store.save(doc, '# 第二份秘密'); const copy = await store.duplicate(doc.path); assert.deepEqual(await fs.readFile(path.join(root, copy)), await fs.readFile(path.join(root, doc.path)));
  await store.lockAll(); assert.equal((await store.open(copy)).locked, true); const renamed = await store.rename(copy, '换一个名字'); assert.ok(renamed.endsWith('.md')); assert.equal((await store.open(renamed, '至少八个字符-harmony')).text, '# 第二份秘密');
  await assert.rejects(store.exportPack([doc.path]), /加密笔记/); await store.trash(renamed); assert.ok(!(await store.catalog()).notes.some(n => n.path === renamed));
});
test('Harmony and desktop exchange checked note packs with images and nested relative links', async () => {
  const a = await fixture('pack-a'), b = await fixture('pack-b'); await a.store.create('子目录', true); await a.store.create('子目录/笔记.md'); const doc = await a.store.open('子目录/笔记.md');
  const attachment = await a.store.attachment(doc.path, { name: '图.png', data: encode('picture bytes') }); await a.store.save(doc, '# 标题\n\n![图](<' + attachment.url + '>)\n\n```typescript\nconst ok = true;\n```');
  const data = await a.store.exportPack([doc.path]); const imported = await b.store.importPack(data); assert.ok((await b.store.images(imported, (await b.store.open(imported)).text)).size === 1);
  const desktop = await new NotebookStore(path.join(run, 'desktop-pack')).init(); const desktopResult = await desktop.importPackage(Buffer.from(unbase(data))); assert.equal(desktopResult.count, 1);
  const desktopNote = (await desktop.list())[0]; const desktopPack = await desktop.pack([desktopNote.path]);
  const c = await fixture('pack-c'); const cpath = await c.store.importPack(bytes64(desktopPack.bytes)); assert.ok((await c.store.images(cpath, (await c.store.open(cpath)).text)).size === 1);
  await a.store.create('关联.md'); const related = await a.store.open('关联.md'); await a.store.save(related, '# 关联正文'); await a.store.save(doc, doc.text + '\n\n[关联](../关联.md)');
  const relatedPack = await JSZip.loadAsync(unbase(await a.store.exportPack([doc.path]))); assert.equal(JSON.parse(await relatedPack.file('manifest.json').async('string')).documents.length, 2);
});
test('Harmony import rejects traversal, symlinks, oversized metadata and tampered content before committing notes', async () => {
  const a = await fixture('hostile'), pack = new JSZip(); pack.file('../escape.md', 'bad'); await assert.rejects(a.store.importPack(bytes64(await pack.generateAsync({ type: 'uint8array' }))), /安全|路径/);
  const b = await fixture('bad-hash'); await b.store.create('一.md'); const doc = await b.store.open('一.md'); await b.store.save(doc, '# 原文'); const original = await b.store.exportPack([doc.path]); const zip = await JSZip.loadAsync(unbase(original)); zip.file('notes/一.md', '# 篡改');
  await assert.rejects(a.store.importPack(bytes64(await zip.generateAsync({ type: 'uint8array' }))), /校验失败|大小不符/); assert.equal((await a.store.catalog()).notes.length, 0);
  const symlink = new JSZip(); symlink.file('notes/link.md', '../target', { unixPermissions: 0o120777 }); await assert.rejects(a.store.importPack(bytes64(await symlink.generateAsync({ type: 'uint8array', platform: 'UNIX' }))), /安全/);
  const oversized = new JSZip(); oversized.file('notes/huge.md', new Uint8Array(21 * 1024 * 1024)); await assert.rejects(a.store.importPack(bytes64(await oversized.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }))), /文件过大|超过限制/);
  const collision = new JSZip(); collision.file('notes/A.md', 'one'); collision.file('notes/a.md', 'two'); await assert.rejects(a.store.importPack(bytes64(await collision.generateAsync({ type: 'uint8array' }))), /安全/);
  for (const input of ['../outside', '/root', 'a\\b', 'a/../b', 'a\u0000b', 'a:/b']) assert.throws(() => safePath(input));
  assert.throws(() => resolvePath('note.md', '../outside.png')); assert.throws(() => resolvePath('note.md', 'file:///outside.png'));
  await assert.rejects(a.io('read', { path: '../outside' }), /路径无效/);
  await assert.rejects(a.store.rename('attachments', '误改'), /附件存储目录/);
  const restore = await fixture('restore'); await restore.store.create('原文.md'); await restore.store.trash('原文.md'); const entries = await restore.store.trashEntries(); assert.equal(entries.length, 1); assert.equal(await restore.store.restoreTrash(entries[0].path), '原文.md'); assert.equal((await restore.store.catalog()).notes.length, 1);
});
test('Harmony bridge rejects foreign origins, unknown commands and emits safely encoded callbacks', async () => {
  assert.equal(trustedPage('resource://RAWFILE/web/index.html'), true); for (const url of ['https://example.com', 'resource://rawfile/web/index.html#x', 'resource://rawfile/web/index.html/evil', 'file:///web/index.html']) assert.equal(trustedPage(url), false);
  const root = path.join(run, 'bridge'); await fs.mkdir(root, { recursive: true }); const callbacks = []; let url = 'resource://RAWFILE/web/index.html';
  const bridge = new NativeBridge({ filesDir: root }, { getUrl: () => url, runJavaScript: async script => callbacks.push(script) });
  bridge.post(JSON.stringify({ id: 1, command: 'unknown' })); await new Promise(r => setTimeout(r, 20)); assert.ok(callbacks[0].includes('"ok":false'));
  url = 'https://example.com'; bridge.post(JSON.stringify({ id: 2, command: 'write', path: 'forbidden.md', data: encode('bad') })); await new Promise(r => setTimeout(r, 10)); assert.equal(callbacks.length, 1); assert.equal(await fs.stat(path.join(root, 'moye/forbidden.md')).then(() => true).catch(() => false), false); bridge.dispose();
});
