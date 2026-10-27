import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { NotebookStore, hash, validPackagePath } from '../desktop/store.mjs';
import { renderMarkdown, rewriteLinks, references } from '../shared/markdown.mjs';

async function setup(t) { const base = path.resolve('test-results', 'unit'); await fs.mkdir(base, { recursive: true }); const root = await fs.mkdtemp(path.join(base, 'case-')); t.after(() => fs.rm(root, { recursive: true, force: true })); return { root, store: await new NotebookStore(path.join(root, 'source')).init() }; }
test('empty directories and nested files can be created without overwriting or escaping the notebook', async t => {
  const { store } = await setup(t);
  await store.createFolder('项目'); await store.createFolder('资料', '项目');
  assert.deepEqual((await store.directories()).sort(), ['项目', '项目/资料']);
  const file = await store.create('计划', '# 计划', '项目/资料'); assert.equal(file.path, '项目/资料/计划.md');
  await assert.rejects(store.create('计划', 'overwrite', '项目/资料'), /已存在/);
  assert.equal((await store.read(file.path)).text, '# 计划');
  await assert.rejects(store.createFolder('资料', '项目'), /已存在/);
  for (const parent of ['../outside', '.notebook', '项目/../资料', '/outside', 'C:/outside']) await assert.rejects(store.create('bad', 'x', parent));
  await assert.rejects(store.createFolder('.hidden'));
  await assert.rejects(store.createFolder('assets'));
});
test('UTF-8 BOM and CRLF survive read/save, history preserves original', async t => {
  const { store } = await setup(t); const original = Buffer.from('\uFEFF# 中文\r\n\r\n原文\r\n');
  await fs.writeFile(path.join(store.root, '中文.md'), original);
  const doc = await store.read('中文.md'); assert.equal(doc.bom, true); assert.equal(doc.eol, '\r\n');
  await store.save({ ...doc, expectedHash: doc.hash }); assert.deepEqual(await fs.readFile(path.join(store.root, doc.path)), original);
  await store.save({ ...doc, text: doc.text + '新内容\r\n', expectedHash: doc.hash });
  const history = await store.history(doc.path); assert.equal(history.length, 1); assert.equal(await store.historyRead(doc.path, history[0].id), original.toString());
});
test('external edits are never silently overwritten', async t => {
  const { store } = await setup(t); const doc = await store.create('test', 'initial');
  await fs.writeFile(path.join(store.root, doc.path), 'external');
  await assert.rejects(store.save({ ...doc, text: 'mine', expectedHash: doc.hash }), /其他程序/);
  assert.equal(await fs.readFile(path.join(store.root, doc.path), 'utf8'), 'external');
});
test('queued concurrent saves reject stale revisions', async t => {
  const { store } = await setup(t); const doc = await store.create('queue', 'one');
  const result = await Promise.allSettled([store.save({ ...doc, text: 'two', expectedHash: doc.hash }), store.save({ ...doc, text: 'three', expectedHash: doc.hash })]);
  assert.equal(result[0].status, 'fulfilled'); assert.equal(result[1].status, 'rejected'); assert.equal((await store.read(doc.path)).text, 'two');
});
test('attachments deduplicate and share package imports to another attachment folder', async t => {
  const { store, root } = await setup(t); const doc = await store.create('项目 #1', '# 示例\n');
  const data = Buffer.from('example image bytes');
  const a = await store.ingest(data, '截图.png', doc.path); const b = await store.ingest(data, '另一张.png', doc.path); assert.equal(a.url, b.url);
  const child = await store.create('关联', '# 关联笔记\n');
  const content = '# 示例\n\n![图片](' + a.url + ')\n\n[关联](' + encodeURIComponent(child.path) + '#章节)\n\n```md\n![不用改](fake.png)\n```';
  const packed = await store.pack([doc.path], { [doc.path]: content }); assert.equal(packed.manifest.documents.length, 2); assert.equal(packed.manifest.assets.length, 1);
  assert.ok(!packed.bytes.toString().includes(store.root));
  const target = await new NotebookStore(path.join(root, 'target'), path.join(root, 'separate-assets')).init();
  const result = await target.importPackage(packed.bytes); assert.equal(result.count, 2);
  const imported = await target.read(result.folder + '/' + doc.path);
  const img = references(imported.text).find(x => x.type === 'image');
  assert.deepEqual(await fs.readFile(await target.localTarget(imported.path, img.url)), data);
  assert.match(imported.text, /fake\.png/); assert.match(imported.text, /#章节/);
  const again = await target.importPackage(packed.bytes); assert.notEqual(again.folder, result.folder);
});
test('reference destinations update without modifying code blocks or link labels', () => {
  const input = '![原文](<old path.png> "标题")\n\n[ref]: old.png "标题"\n\n![图][ref]\n\n```\n![图](old.png)\n```';
  const output = rewriteLinks(input, x => x.startsWith('old') ? 'assets/new.png' : x);
  assert.match(output, /<assets\/new.png> "标题"/); assert.match(output, /\[ref\]: assets\/new.png "标题"/); assert.match(output, /```\n!\[图\]\(old.png\)/);
});
test('invalid names, traversal, private files and unauthorized asset roots are rejected', async t => {
  const { store, root } = await setup(t); await store.create('a');
  await fs.writeFile(path.join(root, 'outside.png'), 'private');
  await assert.rejects(store.create('../bad'), /文件名无效/);
  await assert.rejects(store.resolve('.notebook/hidden.md'), /仅允许/);
  await assert.rejects(store.localTarget('a.md', '../../outside.png'), /授权/);
  for (const bad of ['../evil', '/evil', 'C:/evil', 'notes/CON.md', 'notes/a:stream', 'notes/a\\b', 'notes/x.']) assert.equal(validPackagePath(bad), false, bad);
});
test('path rewrite preserves punctuation in labels, titles and nested destinations', () => {
  const input = '[a:b]: foo(a).png "title ]( remains"\n\n[outer [label]](foo(a).png "also ]( stays")\n';
  const output = rewriteLinks(input, () => 'assets/new.png');
  assert.equal(output, '[a:b]: assets/new.png "title ]( remains"\n\n[outer [label]](assets/new.png "also ]( stays")\n');
});
test('tampered packages fail integrity verification before note creation', async t => {
  const { store, root } = await setup(t); const doc = await store.create('a'); const packed = await store.pack([doc.path]);
  const zip = await JSZip.loadAsync(packed.bytes); zip.file('notes/a.md', 'tampered');
  const target = await new NotebookStore(path.join(root, 'target')).init();
  await assert.rejects(target.importPackage(await zip.generateAsync({ type: 'nodebuffer' })), /匹配|校验/);
  assert.deepEqual(await target.list(), []);
});
test('unsafe zip original names are rejected', async t => {
  const { store } = await setup(t); const zip = new JSZip(); zip.file('../escape.md', 'no');
  await assert.rejects(store.inspectPackage(await zip.generateAsync({ type: 'nodebuffer' })), /不安全/);
});
test('missing local dependencies stop complete export', async t => {
  const { store } = await setup(t); const doc = await store.create('missing', '![图](missing.png)');
  await assert.rejects(store.pack([doc.path]), /ENOENT/);
});
test('HTML injection is inert while GFM, math and local image protocol render', () => {
  const html = renderMarkdown('# 标题\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n![图片](a.png)\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n$x^2$', (url, type) => type === 'image' ? 'mnote://asset?note=x&url=a.png' : url);
  assert.ok(!html.includes('<script')); assert.ok(!html.includes('href="javascript:')); assert.match(html, /<table>/); assert.match(html, /class="katex"/); assert.match(html, /src="mnote:/);
});
test('recovery logs and historical external asset roots remain readable', async t => {
  const { store, root } = await setup(t); const doc = await store.create('recovery');
  await store.recovery(doc.path, 'draft 1'); await store.recovery(doc.path, 'draft 2');
  await store.clearRecovery(doc.path, 'draft 1'); assert.equal((await store.getRecovery(doc.path)).text, 'draft 2');
  const old = path.join(root, 'old-assets'); await fs.mkdir(old); await fs.writeFile(path.join(old, 'x.png'), 'x');
  store.authorizedAssetRoots.push(old); assert.equal(await store.localTarget(doc.path, '../old-assets/x.png'), path.join(old, 'x.png'));
});
