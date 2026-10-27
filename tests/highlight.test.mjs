import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../shared/markdown.mjs';

test('code fences highlight by language and alias in document exports', () => {
  for (const [language, code] of [['js', 'const n = "hello";'], ['python', 'def hello():\n    return "hi"'], ['sql', 'SELECT name FROM notes WHERE id = 42;']]) {
    const html = renderMarkdown('```' + language + '\n' + code + '\n```');
    assert.match(html, /hljs-keyword/);
    assert.ok(html.includes('language-' + language));
  }
});
test('unknown code language preserves content without treating it as HTML', () => {
  const html = renderMarkdown('```custom-language\n<script>alert(1)</script>\n```');
  assert.match(html, /(?:&lt;|&#x3C;)script/i); assert.ok(!html.includes('<script>')); assert.ok(!html.includes('hljs-'));
});
test('highlighting keeps code text safe and leaves math and diagrams intact', () => {
  const html = renderMarkdown('```html\n<img src=x onerror=alert(1)>\n```\n\n$$x^2$$\n\n```mermaid\ngraph LR\n A-->B\n```');
  assert.ok(!html.includes('<img')); assert.ok(html.includes('hljs-tag'));
  assert.ok(html.includes('katex')); assert.ok(html.includes('language-mermaid'));
});
