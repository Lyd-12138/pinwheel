import { t } from './i18n';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { codeHighlighter, codeLanguages } from '../shared/code-highlight.mjs';

export const HighlightedCodeBlock = CodeBlockLowlight.configure({
  lowlight: codeHighlighter, defaultLanguage: 'plaintext', enableTabIndentation: true,
}).extend({
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('div'); dom.className = 'code-block';
      const bar = document.createElement('div'); bar.className = 'code-block-bar'; bar.contentEditable = 'false';
      const label = document.createElement('span'); label.textContent = t('代码');
      const language = document.createElement('select'); language.setAttribute('aria-label', t('代码语言'));
      for (const value of ['', ...codeLanguages]) {
        const option = document.createElement('option'); option.value = value; option.textContent = value || t('未指定（纯文本）'); language.append(option);
      }
      const pre = document.createElement('pre'), code = document.createElement('code'); pre.append(code);
      const update = () => {
        const value = node.attrs.language || '';
        if (![...language.options].some(o => o.value === value)) { const option = document.createElement('option'); option.value = value; option.textContent = value; language.append(option); }
        language.value = value;
        const className = value ? 'language-' + value : '';
        if (code.className !== className) code.className = className;
      };
      update();
      language.addEventListener('change', () => {
        const pos = getPos(); if (typeof pos !== 'number') return;
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, language: language.value || null }));
      });
      bar.append(label, language); dom.append(bar, pre);
      return { dom, contentDOM: code,
        update: next => { if (next.type !== node.type) return false; node = next; update(); return true; },
        stopEvent: event => bar.contains(event.target as globalThis.Node),
        ignoreMutation: mutation => mutation.type !== 'selection' && (bar.contains(mutation.target) || mutation.type === 'attributes' && mutation.target === code),
      };
    };
  },
});
