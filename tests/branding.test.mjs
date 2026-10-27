import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { NotebookStore } from '../desktop/store.mjs';
import { keyFor, seal } from '../desktop/encryption.mjs';
import { writePetPackage, readPetPackage } from '../desktop/pet-package.mjs';
import { petGuide } from '../shared/pet-guide.mjs';
import { documentTypes } from '../shared/windows-association.mjs';
import { renameEntry, duplicateNote } from '../desktop/file-operations.mjs';

test('new and legacy encrypted extensions remain readable and password protected', async () => {
  await fs.mkdir('test-results', { recursive: true });
  const root = await fs.mkdtemp(path.resolve('test-results/branding-'));
  const store = await new NotebookStore(root).init();
  const password = 'brand-compatibility-password', secret = await keyFor(password);
  const content = seal(Buffer.from('# Private document'), secret);
  for (const extension of ['pinwheel', 'moye']) {
    const file = 'document.' + extension;
    await fs.writeFile(path.join(root, file), content);
    assert.equal((await store.read(file)).locked, true);
    assert.equal((await store.unlock(file, password)).text, '# Private document');
    assert.deepEqual(await fs.readFile(path.join(root, file)), content);
  }
  assert.equal((await store.list()).length, 2);
  for (const extension of ['pinwheel', 'moye']) {
    const renamed = await renameEntry(store, 'document.' + extension, 'renamed');
    assert.equal(renamed.path, 'renamed.' + extension);
    const copy = await duplicateNote(store, renamed.path);
    assert.ok(copy.path.endsWith('.' + extension));
    assert.deepEqual(await fs.readFile(path.join(root, copy.path)), content);
    assert.equal((await store.unlock(renamed.path, password)).text, '# Private document');
  }
  await fs.writeFile(path.join(root, 'invalid.pinwheel'), 'plaintext');
  await assert.rejects(store.read('invalid.pinwheel'), /已损坏/);
  assert.deepEqual(documentTypes.find(t => t.id === 'Pinwheel.Encrypted').extensions, ['.pinwheel', '.moye']);
});

test('pet exports use the current format while legacy manifests still import', async () => {
  const bytes = await writePetPackage({ name: '伙伴', kind: 'cat', color: '#abcdef' }, async () => { throw Error('Unexpected asset'); }, petGuide);
  const zip = await JSZip.loadAsync(bytes), manifest = JSON.parse(await zip.file('manifest.json').async('string'));
  assert.equal(manifest.format, 'pinwheel-pet');
  assert.equal((await readPetPackage(bytes)).pet.name, '伙伴');
  manifest.format = 'moye-pet'; zip.file('manifest.json', JSON.stringify(manifest));
  assert.equal((await readPetPackage(await zip.generateAsync({ type: 'nodebuffer' }))).pet.name, '伙伴');
});

test('shipped assets, pet examples and theme defaults retain the product identity', async () => {
  assert.equal(await fs.readFile('pet-examples/宠物制作指南.md', 'utf8'), petGuide);
  for (const folder of ['assets', 'pet-examples']) {
    const names = await fs.readdir(folder);
    assert.ok(names.every(name => !/moye|墨页/i.test(name)), folder);
    for (const name of names.filter(name => name.endsWith('.pinwheel-pet'))) {
      const zip = await JSZip.loadAsync(await fs.readFile(path.join(folder, name)));
      assert.equal(await zip.file('README.md').async('string'), petGuide);
      assert.equal(JSON.parse(await zip.file('manifest.json').async('string')).format, 'pinwheel-pet');
    }
  }
  for (const name of (await fs.readdir('themes')).filter(name => name.endsWith('.json'))) {
    const theme = JSON.parse(await fs.readFile(path.join('themes', name), 'utf8'));
    for (const key of ['风车笔记', 'pinwheel']) if (theme.ui?.labels?.[key]) assert.equal(theme.ui.labels[key], key, name);
  }
});
