import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { validateTheme, themeTemplate, backgroundStyle } from '../shared/theme-format.mjs';
import { builtInThemes } from '../shared/themes.mjs';

test('old themes and shared templates import and round trip without application settings', async () => {
  for (const name of ['ink-blue.json', 'theme-template.json', 'star-grid.json', 'neon-aurora.json', 'pop-soda.json']) {
    const theme = validateTheme(JSON.parse(await fs.readFile(new URL('../themes/' + name, import.meta.url), 'utf8')));
    const output = themeTemplate(theme);
    assert.equal(output.themeApiVersion, 2); assert.equal(output.name, theme.name);
    assert.deepEqual(output.tokens, theme.tokens); assert.ok(!('workspace' in output));
    assert.deepEqual(validateTheme(JSON.parse(JSON.stringify(output))), output);
  }
  for (const theme of builtInThemes) { const output = validateTheme(themeTemplate(theme)); assert.equal(output.name, theme.name); assert.equal(output.appearance, theme.appearance); }
});
test('invalid theme background, font and CSS payloads are rejected', () => {
  const good = themeTemplate(builtInThemes[3]);
  for (const background of [{ ...good.background, pattern: 'url(https://example.com)' }, { ...good.background, color: 'red; background:url(x)' }, { ...good.background, opacity: 2 }, { ...good.background, size: -1 }]) assert.throws(() => validateTheme({ ...good, background }));
  assert.throws(() => validateTheme({ ...good, typography: { body: '__proto__', heading: 'sans' } }));
  assert.throws(() => validateTheme({ ...good, tokens: { ...good.tokens, text: 'url(x)' } }));
  assert.throws(() => validateTheme({ ...good, ui: { icons: { brand: { paths: ['<script>alert(1)</script>'] } } } }));
  assert.throws(() => validateTheme({ ...good, ui: { labels: { '设置': 'x'.repeat(201) } } }));
  assert.throws(() => validateTheme({ ...good, ui: { icons: { unknownIcon: 'x' } } }));
  assert.throws(() => validateTheme({ ...good, appearance: 'url(https://example.com)' }));
});
test('switching background off clears image, scale and opacity', () => {
  const visible = backgroundStyle(themeTemplate(builtInThemes[7]).background);
  assert.match(visible.image, /gradient/); assert.ok(Number(visible.opacity) > 0);
  assert.deepEqual(backgroundStyle(undefined), { image: 'none', size: 'auto', opacity: '0' });
  assert.equal(backgroundStyle({ pattern: 'url(x)', color: '#ffffff', secondary: '#000000' }).image, 'none');
});
