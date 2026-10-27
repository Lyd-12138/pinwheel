import { all, createLowlight } from 'lowlight';
import { visit } from 'unist-util-visit';

export const codeHighlighter = createLowlight(all);
export const codeLanguages = codeHighlighter.listLanguages().sort();

// Run after sanitizing user HTML. Lowlight produces text and span nodes only.
export function highlightCode() {
  return tree => visit(tree, 'element', node => {
    if (node.tagName !== 'code') return;
    const language = (node.properties?.className || []).find(c => c.startsWith('language-'))?.slice(9);
    if (!language || language === 'mermaid' || !codeHighlighter.registered(language)) return;
    if (!node.children.every(c => c.type === 'text')) return;
    node.children = codeHighlighter.highlight(language, node.children.map(c => c.value).join('')).children;
  });
}
