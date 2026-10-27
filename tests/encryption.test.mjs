import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { NotebookStore, hash } from '../desktop/store.mjs';
import { encrypted, keyFor, seal, unseal } from '../desktop/encryption.mjs';

const password = '山海之间-strong-password-2026';
async function setup(t) {
  const base = path.resolve('test-results/unit'); await fs.mkdir(base, { recursive: true });
  const root = await fs.mkdtemp(path.join(base, 'crypto-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, store: await new NotebookStore(root).init() };
}
async function diskFiles(dir) {
  const out = [];
  for (const item of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name); if (item.isDirectory()) out.push(...await diskFiles(full)); else out.push(full);
  }
  return out;
}
test('password encryption protects body, prior history and recovery; lock and restart require password', async t => {
  const { root, store } = await setup(t), marker = '绝不以明文写盘的秘密';
  let doc = await store.create('机密', '\uFEFF# ' + marker + '\r\n');
  await store.save({ ...doc, text: doc.text + '第二版', expectedHash: doc.hash }); doc = await store.read(doc.path);
  await store.recovery(doc.path, marker + '未完成');
  const secured = await store.encrypt(doc.path, password, doc.hash); assert.equal(secured.encrypted, true); assert.equal(secured.text, doc.text);
  for (const file of await diskFiles(root)) assert.equal((await fs.readFile(file)).includes(Buffer.from(marker)), false, file);
  assert.equal((await store.list())[0].encrypted, true);
  assert.equal((await store.getRecovery(doc.path)).text, marker + '未完成');
  const history = await store.history(doc.path); assert.match(await store.historyRead(doc.path, history[0].id), new RegExp(marker));
  await store.save({ ...secured, text: secured.text + '第三版', expectedHash: secured.hash });
  await store.recovery(doc.path, marker + '新恢复');
  store.lockAll(); assert.equal((await store.read(doc.path)).locked, true);
  await assert.rejects(store.historyRead(doc.path, history[0].id), /解锁/);
  await assert.rejects(store.getRecovery(doc.path), /解锁/);
  await assert.rejects(store.unlock(doc.path, 'wrong-password'), /密码错误/);
  assert.equal((await store.read(doc.path)).locked, true);
  const reopened = await new NotebookStore(root).init(); assert.equal((await reopened.read(doc.path)).text, '');
  const unlocked = await reopened.unlock(doc.path, password); assert.match(unlocked.text, /第三版$/); assert.equal(unlocked.bom, true); assert.equal(unlocked.eol, '\r\n');
  await assert.rejects(reopened.pack([doc.path]), /加密文档/);
  for (const file of await diskFiles(root)) assert.equal((await fs.readFile(file)).includes(Buffer.from(marker)), false, file);
  await fs.writeFile(path.join(root, '.notebook', 'history', hash(doc.path), history[0].id), 'injected plaintext');
  await assert.rejects(reopened.historyRead(doc.path, history[0].id), /已损坏/);
  await fs.writeFile(path.join(root, '.notebook', 'recovery', hash(doc.path) + '.json'), '{"text":"injected plaintext"}');
  await assert.rejects(reopened.getRecovery(doc.path), /已损坏/);
});
test('authenticated format rejects tampering, wrong contexts, truncation and stale saves', async t => {
  const secret = await keyFor(password), plain = Buffer.from('sensitive content'), a = seal(plain, secret), b = seal(plain, secret);
  assert.notDeepEqual(a, b); assert.deepEqual(unseal(a, secret), plain);
  for (const offset of [8, 24, 36, 52]) { const tampered = Buffer.from(a); tampered[offset] ^= 1; assert.throws(() => unseal(tampered, secret)); }
  assert.throws(() => unseal(a.subarray(0, 30), secret)); assert.throws(() => unseal(a, secret, 'recovery'));
  const { root, store } = await setup(t); let doc = await store.create('conflict', 'before');
  await assert.rejects(store.encrypt(doc.path, 'short', doc.hash), /至少/);
  await assert.rejects(store.encrypt(doc.path, password, 'stale'), /其他程序/);
  doc = await store.encrypt(doc.path, password, doc.hash);
  const bytes = await fs.readFile(path.join(root, doc.path)); bytes[bytes.length - 1] ^= 1; await fs.writeFile(path.join(root, doc.path), bytes);
  await assert.rejects(store.save({ ...doc, text: 'after', expectedHash: doc.hash }), /其他程序/);
  await assert.rejects(store.read(doc.path), /密码错误/);
});
test('interrupted encryption commits resume with ciphertext only, without needing the password', async t => {
  const { root, store } = await setup(t); let doc = await store.create('resume', 'unique-secret');
  await store.save({ ...doc, text: 'unique-secret version2', expectedHash: doc.hash }); doc = await store.read(doc.path);
  const finish = store.finishEncryption.bind(store);
  store.finishEncryption = async stage => {
    const journal = JSON.parse(await fs.readFile(path.join(stage, 'commit.json'), 'utf8'));
    // Simulate power loss after the first history replacement has committed.
    await fs.writeFile(path.join(root, journal.entries[0].path), await fs.readFile(path.join(stage, '0.bin')));
    throw Error('simulated interruption');
  };
  await assert.rejects(store.encrypt(doc.path, password, doc.hash), /interruption/);
  const transactions = await fs.readdir(path.join(root, '.notebook/encryption')); assert.equal(transactions.length, 1);
  const recovered = await new NotebookStore(root).init(); assert.equal((await recovered.read(doc.path)).locked, true);
  assert.equal((await recovered.unlock(doc.path, password)).text, doc.text);
  for (const file of await diskFiles(root)) assert.equal((await fs.readFile(file)).includes(Buffer.from('unique-secret')), false, file);
  store.finishEncryption = finish;
});
