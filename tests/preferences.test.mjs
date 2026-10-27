import test from 'node:test';
import assert from 'node:assert/strict';
import { fontStack, validateFont, migrateThemes, removeTheme } from '../shared/preferences.mjs';
import { initialPets, validatePet, removePet, petPosition } from '../shared/pets.mjs';
import { validateSession } from '../shared/session.mjs';
import { richDocument, serializeRichNode } from '../shared/rich-document.mjs';
import { renderMarkdown } from '../shared/markdown.mjs';
import { gifSize } from '../shared/gif.mjs';

test('GIF pets retain GIF bytes while rejecting broken or oversized frames', () => {
  const image = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  assert.deepEqual(gifSize(image), { width: 1, height: 1 });
  const start=image.indexOf(0x2c),frame=image.subarray(start,-1),animated=frames=>Buffer.concat([image.subarray(0,start),...Array.from({length:frames},()=>frame),Buffer.from([0x3b])]);
  assert.deepEqual(gifSize(animated(500)),{width:1,height:1});assert.throws(()=>gifSize(animated(501)));
  assert.throws(() => gifSize(image.subarray(0, -2)));
  const large = Buffer.from(image); large.writeUInt16LE(4097, 6); assert.throws(() => gifSize(large));
});

test('inline styles survive rich editing and exported HTML without enabling arbitrary HTML', () => {
  const source = '<u>下划线 **粗体**</u> 与 <mark>高亮</mark>、x<sup>2</sup>、H<sub>2</sub>O、<kbd>Ctrl</kbd>。';
  const document = richDocument(source).doc;
  const output = document.content.map(serializeRichNode).join('\n\n');
  const canonical = value => JSON.parse(JSON.stringify(value, (key, data) => key === 'marks' ? [...data].sort((a, b) => a.type.localeCompare(b.type)) : data));
  assert.deepEqual(canonical(richDocument(output).doc), canonical(document));
  const html = renderMarkdown(output); for (const tag of ['u', 'mark', 'sup', 'sub', 'kbd']) assert.ok(html.includes('<' + tag + '>'));
  assert.ok(!renderMarkdown('<mark onclick="alert(1)">文字</mark><script>bad()</script>').includes('onclick'));
  assert.ok(!renderMarkdown('`<u>代码</u>`').includes('<u>'));
  assert.ok(renderMarkdown('<u>未闭合').includes('未闭合'));
});
test('font names are quoted and always include system glyph fallbacks', () => {
  assert.ok(fontStack('Some Missing Font').startsWith('"Some Missing Font", system-ui'));
  assert.ok(fontStack('Consolas', true).includes('"Segoe UI Emoji"'));
  assert.equal(validateFont('  宋体 '), '宋体');
  for (const invalid of ['a\nfont', '</style><script>', 'a'.repeat(101)]) assert.throws(() => validateFont(invalid));
});
test('custom theme library migrates old configuration and protects built in themes', () => {
  const config = { theme: 'custom', customTheme: { name: '旧主题' } }; migrateThemes(config, 'custom:first');
  assert.equal(config.customThemes.length, 1); assert.throws(() => removeTheme(config, 'simple'));
  removeTheme(config, 'custom:first'); assert.equal(config.theme, 'simple'); assert.equal(config.customThemes.length, 0);
  config.theme = 'paper'; removeTheme(config, 'paper'); assert.equal(config.theme, 'simple'); assert.deepEqual(config.deletedThemes, ['paper']);
});
test('pet library supports deleting every pet, validates customization and keeps position on screen', () => {
  const state = initialPets(); state.enabled = true;
  for (const pet of [...state.items]) removePet(state, pet.id);
  assert.equal(state.items.length, 0); assert.equal(state.enabled, false); assert.equal(state.selected, '');
  assert.throws(() => validatePet({ name: 'x', kind: 'script', color: '#ffffff' }));
  assert.throws(() => validatePet({ name: '', kind: 'cat', color: '#ffffff' }));
  assert.deepEqual(petPosition({ x: 9000, y: -9000 }, { x: -1920, y: 0, width: 1920, height: 1080 }, 208, 248), { x: -208, y: 0 });
});
test('session state stores metadata only and clamps invalid or stale positions', () => {
  const s = validateSession({ lastPath: '../outside.md', mode: 'source', collapsed: ['旅行', '..'], views: { '笔记.md': { richTop: Infinity, sourceTop: -1, sourceAnchor: 42, sourceScrollAnchor: 5, sourceScrollOffset: 3500, text: 'never persist body' }, '../bad': {} } });
  assert.equal(s.lastPath, ''); assert.deepEqual(s.collapsed, ['旅行']); assert.deepEqual(Object.keys(s.views), ['笔记.md']);
  assert.equal(s.views['笔记.md'].sourceAnchor, 42); assert.equal(s.views['笔记.md'].sourceScrollOffset, 3500); assert.equal(s.views['笔记.md'].richTop, 0); assert.ok(!JSON.stringify(s).includes('never persist body'));
});
