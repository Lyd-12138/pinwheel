import { parse } from './markdown.mjs';

// The rich view owns structure; Markdown remains the storage format. Unknown
// constructs are opaque nodes so editing a nearby paragraph cannot erase them.
export function richDocument(source) {
  const tree = parse(source);
  const definitions = new Map(tree.children.filter(n => n.type === 'definition').map(n => [n.identifier, n]));
  const raw = n => source.slice(n.position.start.offset, n.position.end.offset);
  const inline = (nodes = [], marks = []) => nodes.flatMap(n => {
    const mark = { strong: 'bold', emphasis: 'italic', delete: 'strike', underline: 'underline', highlight: 'highlight', superscript: 'superscript', subscript: 'subscript', keyboard: 'keyboard' }[n.type];
    if (mark) return inline(n.children, [...marks, { type: mark }]);
    if (n.type === 'text') return n.value ? [{ type: 'text', text: n.value, ...(marks.length ? { marks } : {}) }] : [];
    if (n.type === 'inlineCode') return [{ type: 'text', text: n.value, marks: [...marks, { type: 'code' }] }];
    if (n.type === 'break') return [{ type: 'hardBreak' }];
    const def = definitions.get(n.identifier);
    if (n.type === 'link' || n.type === 'linkReference' && def) return inline(n.children, [...marks, { type: 'link', attrs: { href: n.url || def.url, title: n.title || def?.title || null } }]);
    if (n.type === 'image' || n.type === 'imageReference' && def) return [{ type: 'image', attrs: { src: n.url || def.url, alt: n.alt || '', title: n.title || def?.title || null } }];
    return [{ type: 'preservedInline', attrs: { source: raw(n) } }];
  });
  const block = n => {
    if (n.type === 'paragraph' || n.type === 'heading') return { type: n.type, ...(n.type === 'heading' ? { attrs: { level: n.depth } } : {}), content: inline(n.children) };
    if (n.type === 'blockquote') return { type: 'blockquote', content: n.children.map(block) };
    if (n.type === 'thematicBreak') return { type: 'horizontalRule' };
    if (n.type === 'code' && n.lang !== 'mermaid' && !n.meta) return { type: 'codeBlock', attrs: { language: n.lang || null }, content: n.value ? [{ type: 'text', text: n.value }] : [] };
    if (n.type === 'list') {
      const task = n.children.some(c => c.checked != null);
      return { type: task ? 'taskList' : n.ordered ? 'orderedList' : 'bulletList', attrs: n.ordered ? { start: n.start || 1 } : {}, content: n.children.map(c => ({ type: task ? 'taskItem' : 'listItem', ...(task ? { attrs: { checked: !!c.checked } } : {}), content: c.children.map(block) })) };
    }
    if (n.type === 'table') return { type: 'table', content: n.children.map((r, i) => ({ type: 'tableRow', content: r.children.map((c, j) => ({ type: i ? 'tableCell' : 'tableHeader', attrs: { textAlign: n.align[j] || null }, content: [{ type: 'paragraph', content: inline(c.children) }] })) })) };
    return { type: 'preservedBlock', attrs: { source: raw(n), kind: n.type } };
  };
  return { doc: { type: 'doc', content: tree.children.length ? tree.children.map(block) : [{ type: 'paragraph' }] }, sources: tree.children.map(raw), offsets: tree.children.map(n => n.position.start.offset) };
}

const escapeText = s => s.replace(/([\\`*_\[\]<>~|$&])/g, '\\$1').replace(/(^|\n)([ \t]*)(#{1,6}|[-+=]+)(?=\s|$)/g, '$1$2\\$3').replace(/(^|\n)([ \t]*\d+)([.)])(?=\s|$)/g, '$1$2\\$3');
const destination = s => '<' + String(s).replace(/</g, '%3C').replace(/>/g, '%3E').replace(/\n/g, '%0A') + '>';
const title = s => s ? ' "' + s.replace(/[\\"]/g, '\\$&') + '"' : '';
export function serializeRichNode(n) {
  const children = () => (n.content || []).map(serializeRichNode).join('');
  const blocks = () => (n.content || []).map(serializeRichNode).join('\n\n');
  switch (n.type) {
    case 'text': {
      let value = escapeText(n.text);
      for (const mark of n.marks || []) {
        if (mark.type === 'code') { const fence = '`'.repeat(Math.max(0, ...[...n.text.matchAll(/`+/g)].map(m => m[0].length)) + 1); value = fence + (n.text.startsWith('`') || n.text.endsWith('`') || /^ .* $/.test(n.text) ? ' ' + n.text + ' ' : n.text) + fence; }
        else if (mark.type === 'link') value = '[' + value + '](' + destination(mark.attrs.href) + title(mark.attrs.title) + ')';
        else if (['underline', 'highlight', 'superscript', 'subscript', 'keyboard'].includes(mark.type)) { const tag = { underline: 'u', highlight: 'mark', superscript: 'sup', subscript: 'sub', keyboard: 'kbd' }[mark.type]; value = '<' + tag + '>' + value + '</' + tag + '>'; }
        else { const marker = { bold: '**', italic: '*', strike: '~~' }[mark.type]; if (marker) value = value.replace(/^(\s*)([\s\S]*?)(\s*)$/, (_, a, b, c) => a + (b ? marker + b + marker : '') + c); }
      }
      return value;
    }
    case 'paragraph': return children();
    case 'heading': return '#'.repeat(n.attrs.level) + ' ' + children();
    case 'hardBreak': return '  \n';
    case 'image': return '![' + escapeText(n.attrs.alt || '') + '](' + destination(n.attrs.src) + title(n.attrs.title) + ')';
    case 'horizontalRule': return '---';
    case 'codeBlock': { const body = (n.content || []).map(c => c.text || '').join(''); const fence = '`'.repeat(Math.max(2, ...[...body.matchAll(/`+/g)].map(m => m[0].length)) + 1); return fence + (n.attrs?.language || '') + '\n' + body + '\n' + fence; }
    case 'blockquote': return blocks().split('\n').map(l => '> ' + l).join('\n');
    case 'bulletList': case 'orderedList': case 'taskList': return (n.content || []).map((c, i) => {
      const prefix = n.type === 'orderedList' ? ((n.attrs?.start || 1) + i) + '. ' : n.type === 'taskList' ? '- [' + (c.attrs?.checked ? 'x' : ' ') + '] ' : '- ';
      const lines = (c.content || []).map(serializeRichNode).join('\n\n').split('\n');
      return prefix + lines.map((l, j) => (j ? ' '.repeat(prefix.length) : '') + l).join('\n');
    }).join('\n');
    case 'table': { const rows = (n.content || []).map(r => '| ' + (r.content || []).map(c => (c.content || []).map(serializeRichNode).join('<br>').replace(/\n/g, '<br>')).join(' | ') + ' |'); const align = n.content[0].content.map(c => c.attrs?.textAlign === 'center' ? ':---:' : c.attrs?.textAlign === 'right' ? '---:' : c.attrs?.textAlign === 'left' ? ':---' : '---'); rows.splice(1, 0, '| ' + align.join(' | ') + ' |'); return rows.join('\n'); }
    case 'preservedBlock': case 'preservedInline': return n.attrs.source;
    default: return blocks();
  }
}

export class MarkdownSnapshot {
  constructor(source, normalized, sources) {
    this.source = source; this.original = JSON.stringify(normalized);
    this.blocks = new Map((normalized.content || []).map((n, i) => [JSON.stringify(n), sources[i]]));
  }
  serialize(doc) {
    if (JSON.stringify(doc) === this.original) return this.source;
    const text = (doc.content || []).map(n => this.blocks.get(JSON.stringify(n)) ?? serializeRichNode(n)).join('\n\n') + '\n';
    return this.source.includes('\r\n') ? text.replace(/\r?\n/g, '\r\n') : text;
  }
}
