import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkFrontmatter from 'remark-frontmatter';
import remarkRehype from 'remark-rehype';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';
import { visit } from 'unist-util-visit';
import { highlightCode } from './code-highlight.mjs';

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkFrontmatter, ['yaml']);
const schema = { ...defaultSchema, tagNames: [...defaultSchema.tagNames, 'u', 'mark', 'sup', 'sub', 'kbd'], protocols: { ...defaultSchema.protocols, src: ['http', 'https', 'mnote', 'data'] }, attributes: { ...defaultSchema.attributes,
  code: [...(defaultSchema.attributes.code || []), ['className', /^language-./, 'math-inline', 'math-display']] } };
// Only these exact, attribute-free inline tags are editable extensions. Other
// HTML stays opaque and is never executed. Positions retain original Markdown.
const inlineTags = { u: 'underline', mark: 'highlight', sup: 'superscript', sub: 'subscript', kbd: 'keyboard' };
export function parse(text) {
  const tree = parser.parse(text);
  const convert = nodes => {
    const output = [];
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i], open = n.type === 'html' && /^<(u|mark|sup|sub|kbd)>$/i.exec(n.value);
      if (open) {
        const tag = open[1].toLowerCase(); let depth = 1, end = i + 1;
        for (; end < nodes.length; end++) {
          if (nodes[end].type !== 'html') continue;
          if (nodes[end].value.toLowerCase() === '<' + tag + '>') depth++;
          if (nodes[end].value.toLowerCase() === '</' + tag + '>' && --depth === 0) break;
        }
        if (!depth) { output.push({ type: inlineTags[tag], children: convert(nodes.slice(i + 1, end)), position: { start: n.position.start, end: nodes[end].position.end }, data: { hName: tag } }); i = end; continue; }
      }
      if (n.children) n.children = convert(n.children);
      output.push(n);
    }
    return output;
  };
  tree.children = convert(tree.children); return tree;
}
export function references(text) {
  const refs = [];
  visit(parse(text), node => {
    if (['image', 'link', 'definition'].includes(node.type)) refs.push({
      type: node.type, url: node.url, start: node.position.start.offset, end: node.position.end.offset,
    });
  });
  return refs;
}
export function rewriteLinks(text, mapping) {
  // Rewrite only destinations inside recognized link/image/definition nodes.
  const changes = [];
  for (const ref of references(text)) {
    const dest = mapping(ref.url);
    if (!dest || dest === ref.url) continue;
    const segment = text.slice(ref.start, ref.end);
    let start = -1, brackets = 0, codeTicks = 0;
    // Locate the end of the label before looking at the destination. A title may
    // itself contain ]( and a reference label may contain a colon.
    for (let i = segment.startsWith('!') ? 1 : 0; i < segment.length; i++) {
      const c = segment[i];
      if (c === '\\') { i++; continue; }
      if (c === '`' && ref.type !== 'definition') {
        let count = 1; while (segment[i + count] === '`') count++;
        if (!codeTicks) codeTicks = count; else if (codeTicks === count) codeTicks = 0;
        i += count - 1; continue;
      }
      if (codeTicks) continue;
      if (c === '[') brackets++;
      if (c === ']' && --brackets === 0) {
        const delimiter = ref.type === 'definition' ? ':' : '(';
        if (segment[i + 1] === delimiter) start = i + 2;
        break;
      }
    }
    if (start < 0) continue;
    while (/\s/.test(segment[start] || '') && start < segment.length) start++;
    const angled = segment[start] === '<';
    if (angled) start++;
    let end = start, depth = 0;
    for (; end < segment.length; end++) {
      const c = segment[end];
      if (c === '\\') { end++; continue; }
      if (angled && c === '>') break;
      if (!angled) {
        if (c === '(') depth++;
        if (c === ')') { if (!depth) break; depth--; }
        if (/\s/.test(c) && !depth) break;
      }
    }
    changes.push({ from: ref.start + start, to: ref.start + end, insert: dest });
  }
  for (const c of changes.sort((a, b) => b.from - a.from)) text = text.slice(0, c.from) + c.insert + text.slice(c.to);
  return text;
}
export function headings(text) {
  const out = [];
  visit(parse(text), 'heading', n => {
    let label = '';
    visit(n, child => { if (child.type === 'text' || child.type === 'inlineCode') label += child.value; });
    out.push({ level: n.depth, text: label, from: n.position.start.offset });
  });
  return out;
}
export function renderMarkdown(text, resolve = (url, _type) => url) {
  const tree = parse(text);
  visit(tree, node => {
    if (['image', 'link', 'definition'].includes(node.type)) node.url = resolve(node.url, node.type);
  });
  const renderer = unified().use(remarkRehype).use(rehypeSanitize, schema).use(highlightCode).use(rehypeKatex, { trust: false, strict: 'ignore' }).use(rehypeStringify);
  return String(renderer.stringify(renderer.runSync(tree)));
}
export const isRemote = url => /^[a-z][a-z\d+.-]*:/i.test(url) && !/^file:/i.test(url) || url.startsWith('//');
export function splitUrl(url) {
  const match = /^([^?#]*)(.*)$/.exec(url);
  return { path: match[1], suffix: match[2] };
}
