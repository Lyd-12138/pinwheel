import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { writePetPackage, readPetPackage } from '../desktop/pet-package.mjs';
import { validatePet } from '../shared/pets.mjs';
import { validateAppearance, validateActions, actionVisual } from '../shared/pet-format.mjs';
const image = Buffer.from('test fixture bytes');
const inspect = () => ({ width: 32, height: 16 });
const pet = { name: '像素伙伴', kind: 'image', color: '#ad99ef', appearance: { accessory: 'bow', bodyWidth: 1.2 }, actions: { idle: { kind: 'sheet', files: ['source.png'], columns: 4, rows: 2, count: 8, fps: 12, loop: true, duration: 2000 }, dance: { kind: 'frames', files: ['source.png'], fps: 8, duration: 1200, label: '跳舞' } }, behavior: { click: 'dance', doubleClick: 'play', messages: { dance: ['你好！'] } } };
test('pet packs retain appearance, interaction mapping, frames and original bytes', async () => {
  const bytes = await writePetPackage(pet, async () => image, '制作指南'), result = await readPetPackage(bytes, inspect);
  assert.equal(result.pet.name, pet.name); assert.equal(result.pet.appearance.accessory, 'bow'); assert.equal(result.pet.behavior.click, 'dance');
  assert.equal(result.pet.actions.idle.aspectRatio, 1); assert.deepEqual(result.assets.values().next().value.bytes, image);
  assert.equal(result.assets.size, 1); assert.ok((await JSZip.loadAsync(bytes)).file('pet.json'));
});
test('pet packs reject traversal, symlinks, unlisted executable files and changed images', async () => {
  const original = await writePetPackage(pet, async () => image);
  for (const mode of ['path', 'symlink', 'script', 'tamper']) {
    const zip = await JSZip.loadAsync(original);
    if (mode === 'path') zip.file('../escape.png', image);
    if (mode === 'symlink') zip.file('link.png', 'elsewhere', { unixPermissions: 0xa1ff });
    if (mode === 'script') zip.file('run.js', 'alert(1)');
    if (mode === 'tamper') zip.file('assets/image-0.png', Buffer.from('different image!!!'));
    await assert.rejects(readPetPackage(await zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' }), inspect));
  }
});
test('sprite grids and action configuration are bounded and cannot reference external paths', async () => {
  assert.throws(() => validateActions({ idle: { files: ['../outside.png'] } }));
  assert.throws(() => validateActions({ idle: { kind: 'sheet', files: ['a.png'], columns: 4, rows: 2, start: 7, count: 2 } }));
  assert.throws(() => validateActions({ idle: { files: ['a.png'], fps: 0 } }));
  assert.throws(() => validateAppearance({ bodyWidth: 10 }));
  assert.throws(() => validatePet({ ...pet, behavior: { click: 'no-such-action' } }));
  const bytes = await writePetPackage(pet, async () => image); await assert.rejects(readPetPackage(bytes, () => ({ width: 31, height: 16 })));
});

test('switching an image pet back to a procedural shape does not keep a stale main image', () => {
  assert.equal(actionVisual({ kind: 'cat', image: 'old.png' }, 'idle'), null);
  assert.deepEqual(actionVisual({ kind: 'cat', actions: { feed: { files: ['food.png'] } } }, 'feed'), { files: ['food.png'] });
});
