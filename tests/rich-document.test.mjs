import test from 'node:test';
import assert from 'node:assert/strict';
import { richDocument, MarkdownSnapshot, serializeRichNode } from '../shared/rich-document.mjs';
import { parse } from '../shared/markdown.mjs';

test('literal rich text does not turn into math, entities or structural Markdown', () => {
  for (const value of ['$price$ &amp;', '---', '#', '1. example']) {
    const output = serializeRichNode({ type: 'paragraph', content: [{ type: 'text', text: value }] });
    const paragraph = parse(output).children[0];
    assert.equal(paragraph.type, 'paragraph');
    assert.equal(paragraph.children[0].value, value);
  }
});

test('opening rich mode and returning to source preserves exact Markdown', () => {
  const source = '# 标题\r\n\r\n__粗体__  \r\n换行\r\n';
  const p = richDocument(source); const snapshot = new MarkdownSnapshot(source, p.doc, p.sources);
  assert.equal(snapshot.serialize(p.doc), source);
});
test('rich editing retains unrelated extensions and code verbatim', () => {
  const source = '---\ntitle: 示例\n---\n\n# 标题\n\n[^a]: 脚注\n\n```mermaid\ngraph LR\n A-->B\n```\n';
  const p = richDocument(source); const snapshot = new MarkdownSnapshot(source, p.doc, p.sources);
  p.doc.content[1].content[0].text += '编辑';
  const output = snapshot.serialize(p.doc);
  assert.match(output, /# 标题编辑/);
  assert.ok(output.includes('[^a]: 脚注'));
  assert.ok(output.includes('title: 示例'));
  assert.ok(output.includes('```mermaid\ngraph LR\n A-->B\n```'));
});
test('rich table editing escapes pipes and preserves alignment', () => {
  const p = richDocument('| 标题 | 内容 |\n| :--- | ---: |\n| 原文 | 数字 |');
  p.doc.content[0].content[1].content[0].content[0].content[0].text = 'a | b';
  const output = serializeRichNode(p.doc.content[0]);
  const table = parse(output).children[0];
  assert.deepEqual(table.align, ['left', 'right']);
  assert.equal(table.children[1].children[0].children[0].value, 'a | b');
});
test('links, image destinations, nested lists and formulas survive rich serialization', () => {
  const source = '- **粗体**\n  - [链接](<folder/a b.md>)\n\n![图](<assets/a b.png>)\n\n公式 $x^2$ 与脚注[^a]\n\n[^a]: 定义';
  const p = richDocument(source); const output = p.doc.content.map(serializeRichNode).join('\n\n');
  assert.ok(output.includes('folder/a b.md')); assert.ok(output.includes('assets/a b.png'));
  assert.ok(output.includes('$x^2$')); assert.ok(output.includes('[^a]'));
  assert.equal(parse(output).children[0].children[0].children[1].type, 'list');
});
