import { t } from './i18n';
import { Editor, Node, Mark, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { HighlightedCodeBlock } from './code-block';
import { TableKit, TableCell, TableHeader } from '@tiptap/extension-table';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { TextSelection } from '@tiptap/pm/state';
import { undo, redo } from '@codemirror/commands';
import { openSearchPanel } from '@codemirror/search';
import { EditorView } from '@codemirror/view';
import { NoteEditor as SourceEditor } from './source-editor';
import { richDocument, MarkdownSnapshot, serializeRichNode } from '../shared/rich-document.mjs';
import { renderMarkdown, isRemote, headings } from '../shared/markdown.mjs';
import { drawDiagrams } from './diagrams';

export type Mode = 'markdown' | 'source';
export type EditorSession = { mode: Mode; richTop: number; sourceTop: number; richAnchor: number; richHead: number; sourceAnchor: number; sourceHead: number; sourceScrollAnchor?: number; sourceScrollOffset?: number };
const extraMarks = Object.entries({ highlight: 'mark', superscript: 'sup', subscript: 'sub', keyboard: 'kbd' }).map(([name, tag]) => Mark.create({ name, excludes: name === 'superscript' ? 'subscript' : name === 'subscript' ? 'superscript' : '', parseHTML: () => [{ tag }], renderHTML: () => [tag, 0] }));
export class NoteEditor {
  updateLanguage() { this.source.updateLanguage(); this.rich.view.dom.setAttribute('aria-label', t('Markdown 编辑器')); this.rich.view.dom.querySelectorAll<HTMLElement>('.code-block-bar>span').forEach(el => el.textContent = t('代码')); this.rich.view.dom.querySelectorAll<HTMLSelectElement>('.code-block-bar select').forEach(el => { el.setAttribute('aria-label', t('代码语言')); const option = [...el.options].find(o => !o.value); if (option) option.textContent = t('未指定（纯文本）'); }); }
  source: SourceEditor;
  rich: Editor;
  sourceHost: HTMLElement;
  richHost: HTMLElement;
  mode: Mode;
  snapshot!: MarkdownSnapshot;
  richText = '';
  syncing = false;
  onChange: (text: string) => void;
  constructor(parent: HTMLElement, public note: string, text: string, mode: Mode, onChange: (text: string) => void, onCursor: (line: number, col: number) => void, onFiles: (files: File[]) => void, onLink: (url: string) => void, onSave: () => void, private onActiveHeading: (index: number) => void = () => {}, resolveAsset?: (url: string) => string) {
    this.mode = mode; this.onChange = onChange; this.sourceHeadings = headings(text.replaceAll('\r\n', '\n'));
    this.sourceHost = parent.appendChild(document.createElement('div'));
    this.richHost = parent.appendChild(document.createElement('div'));
    this.richHost.className = 'rich-host';
    this.source = new SourceEditor(this.sourceHost, note, text, 'source', value => {
      this.sourceHeadings = headings(value.replaceAll('\r\n', '\n'));
      onChange(value); this.scheduleOutline();
      if (!this.syncing && this.mode === 'markdown' && this.rich) this.loadRich(value);
    }, onCursor, onFiles, onLink, onSave);
    const opaque = (inline: boolean) => Node.create({
      name: inline ? 'preservedInline' : 'preservedBlock', group: inline ? 'inline' : 'block', inline, atom: true,
      addAttributes: () => ({ source: { default: '' }, kind: { default: '' } }),
      parseHTML: () => [{ tag: inline ? 'span[data-preserved]' : 'div[data-preserved]' }],
      renderHTML: ({ node }) => [inline ? 'span' : 'div', { 'data-preserved': '', 'data-source': node.attrs.source }],
      addNodeView: () => ({ node, getPos }) => {
        const dom = document.createElement(inline ? 'span' : 'div');
        dom.className = 'preserved-node prose'; dom.contentEditable = 'false';
        const render = (value: string) => {
          dom.innerHTML = renderMarkdown(value, (url: string, type: string) => type === 'image' && resolveAsset ? resolveAsset(url) : url);
          if (!dom.textContent?.trim() && !dom.querySelector('img')) { dom.textContent = t(node.attrs.kind === 'yaml' ? '文档属性' : '引用定义（已保留）'); dom.classList.add('preserved-label'); }
          if (inline) { const p = dom.querySelector(':scope > p'); if (p) p.replaceWith(...p.childNodes); }
          if (dom.querySelector('code.language-mermaid')) void drawDiagrams(dom);
        };
        render(node.attrs.source); dom.title = t('双击编辑公式或扩展内容');
        dom.addEventListener('dblclick', () => this.editValue('编辑扩展内容', node.attrs.source, value => {
          const pos = getPos(); if (typeof pos !== 'number') return;
          this.rich.commands.command(({ tr, dispatch }) => { if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, source: value }); return true; });
        }));
        return { dom, update: next => { if (next.type !== node.type) return false; node = next; render(node.attrs.source); return true; } };
      },
    });
    const image = Image.configure({ inline: true }).extend({
      addNodeView: () => ({ node }) => {
        const dom = document.createElement('img');
        const apply = () => { dom.src = resolveAsset ? resolveAsset(node.attrs.src) : isRemote(node.attrs.src) ? '' : 'mnote://asset?note=' + encodeURIComponent(note) + '&url=' + encodeURIComponent(node.attrs.src); dom.alt = node.attrs.alt || ''; dom.title = node.attrs.title || ''; };
        apply(); return { dom, update: next => { if (next.type !== node.type) return false; node = next; apply(); return true; } };
      },
    });
    const align = { textAlign: { default: null, parseHTML: (el: HTMLElement) => el.style.textAlign || null, renderHTML: (attrs: Record<string, string>) => attrs.textAlign ? { style: 'text-align:' + attrs.textAlign } : {} } };
    this.rich = new Editor({
      element: this.richHost,
      extensions: [StarterKit.configure({ codeBlock: false, undoRedo: false,  trailingNode: false, link: { openOnClick: false, autolink: false } }), ...extraMarks, HighlightedCodeBlock, image, TaskList, TaskItem.configure({ nested: true }), TableKit.configure({ table: { resizable: false }, tableCell: false, tableHeader: false }), TableCell.extend({ addAttributes() { return { ...this.parent?.(), ...align }; } }), TableHeader.extend({ addAttributes() { return { ...this.parent?.(), ...align }; } }), opaque(false), opaque(true)],
      content: richDocument(text).doc as JSONContent,
      editorProps: {
        attributes: { class: 'prose rich-editor', 'aria-label': t('Markdown 编辑器'), role: 'textbox', 'aria-multiline': 'true', spellcheck: 'false' },
        handleKeyDown: (_view, e) => {
          if ((e.ctrlKey || e.metaKey) && !e.altKey) {
            if (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y') { e.preventDefault(); this.history(e.shiftKey || e.key.toLowerCase() === 'y'); return true; }
            if (e.key.toLowerCase() === 's') { e.preventDefault(); onSave(); return true; }
            if (e.key.toLowerCase() === 'f') { e.preventDefault(); this.search(); return true; }
          }
          return false;
        },
        handlePaste: (_view, event) => { const files = [...(event.clipboardData?.files || [])]; if (files.length) { onFiles(files); return true; } return false; },
        handleDrop: (_view, event) => { const files = [...(event.dataTransfer?.files || [])]; if (files.length) { onFiles(files); return true; } return false; },
        handleClick: (_view, _pos, event) => { const a = (event.target as HTMLElement).closest('a'); if (a && (event.ctrlKey || event.metaKey)) { event.preventDefault(); onLink(a.getAttribute('href') || ''); return true; } return false; },
      },
      onUpdate: () => {
        if (this.syncing) return;
        const value = this.snapshot.serialize(this.rich.getJSON()); this.richText = value;
        this.syncing = true;
        try {
          const old = this.source.view.state.doc.toString(), normalized = value.replace(/\r\n/g, '\n');
          let from = 0; while (from < old.length && from < normalized.length && old[from] === normalized[from]) from++;
          let end = old.length, to = normalized.length; while (end > from && to > from && old[end - 1] === normalized[to - 1]) { end--; to--; }
          if (old !== normalized) this.source.view.dispatch({ changes: { from, to: end, insert: normalized.slice(from, to) } });
        } finally { this.syncing = false; }
      },
      onSelectionUpdate: () => { const selection = this.rich.state.selection; onCursor(selection.$from.index(0) + 1, selection.$from.parentOffset + 1); this.scheduleOutline(); },
    });
    this.loadRich(text); this.setMode(mode);
    this.richHost.addEventListener('scroll', this.scheduleOutline);
    this.source.view.scrollDOM.addEventListener('scroll', this.scheduleOutline);
    this.resizeObserver = new ResizeObserver(this.scheduleOutline);
    this.resizeObserver.observe(this.richHost); this.resizeObserver.observe(this.rich.view.dom);
    this.resizeObserver.observe(this.source.view.scrollDOM);
  }
  loadRich(text: string) {
    this.syncing = true;
    try {
      const position = this.rich.state.selection.from, parsed = richDocument(text);
      this.rich.commands.setContent(parsed.doc as JSONContent, { emitUpdate: false });
      this.rich.view.dispatch(this.rich.state.tr.setSelection(TextSelection.near(this.rich.state.doc.resolve(Math.min(position, this.rich.state.doc.content.size)))));
      this.snapshot = new MarkdownSnapshot(text, this.rich.getJSON(), parsed.sources); this.richText = text;
    }
    finally { this.syncing = false; }
  }
  setMode(mode: Mode) {
    if (mode === 'markdown' && this.source.view.state.sliceDoc() !== this.richText) this.loadRich(this.source.view.state.sliceDoc());
    this.mode = mode; this.sourceHost.hidden = mode !== 'source'; this.richHost.hidden = mode !== 'markdown'; if (mode === 'source') this.source.view.requestMeasure(); this.navigationLock = null; this.scheduleOutline();
  }
  history(forward: boolean) { (forward ? redo : undo)(this.source.view); if (this.mode === 'markdown') this.rich.commands.focus(); }
  insert(text: string) { if (this.mode === 'source') return this.source.insert(text); this.rich.commands.insertContent(richDocument(text).doc.content as JSONContent[]); this.rich.commands.focus(); }
  wrap(marker: string, end = marker) {
    if (this.mode === 'source') return this.source.wrap(marker, end);
    const c = this.rich.chain().focus();
    if (marker === '**') c.toggleBold().run(); else if (marker === '*') c.toggleItalic().run(); else if (marker === '~~') c.toggleStrike().run();
    else if (marker.includes('```')) c.toggleCodeBlock().run();
    else if (marker === '[') this.editValue('链接地址', this.rich.getAttributes('link').href || 'https://', value => { if (!value) this.rich.chain().focus().unsetLink().run(); else if (/^(https?:|mailto:|#|[^:]+$)/i.test(value)) this.rich.chain().focus().setLink({ href: value }).run(); });
  }
  linePrefix(prefix: string) {
    if (this.mode === 'source') return this.source.linePrefix(prefix);
    const c = this.rich.chain().focus();
    if (prefix === '# ') c.toggleHeading({ level: 1 }).run(); else if (prefix === '## ') c.toggleHeading({ level: 2 }).run(); else if (prefix === '> ') c.toggleBlockquote().run(); else if (prefix.includes('[ ]')) c.toggleTaskList().run(); else c.toggleBulletList().run();
  }
  command(action: string) {
    if (action === 'undo' || action === 'redo') return this.history(action === 'redo');
    if (action === 'search') return this.search();
    const level = /^h([1-6])$/.exec(action);
    const markers: Record<string, [string, string?]> = { bold: ['**'], italic: ['*'], strike: ['~~'], underline: ['<u>', '</u>'], highlight: ['<mark>', '</mark>'], superscript: ['<sup>', '</sup>'], subscript: ['<sub>', '</sub>'], keyboard: ['<kbd>', '</kbd>'] };
    if (this.mode === 'source') {
      if (markers[action]) return this.source.wrap(...markers[action]);
      if (level || action === 'paragraph') return this.source.blockPrefix(level ? '#'.repeat(Number(level[1])) + ' ' : '', 'heading');
      if (['bulletList', 'orderedList', 'taskList', 'blockquote'].includes(action)) return this.source.blockPrefix(({ bulletList: '- ', orderedList: '1. ', taskList: '- [ ] ', blockquote: '> ' })[action]!, action === 'blockquote' ? 'quote' : 'list');
      if (action === 'indent' || action === 'outdent') return this.source.indent(action === 'outdent');
      if (action === 'clear') return this.source.clearFormatting();
      if (action === 'code') return this.source.inlineCode();
      if (action === 'codeBlock') return this.source.codeBlock();
      if (action === 'hardBreak') return this.source.insert('  \n');
    } else {
      const c = this.rich.chain().focus();
      if (markers[action]) return c.toggleMark(action).run();
      if (level) return c.toggleHeading({ level: Number(level[1]) as 1 | 2 | 3 | 4 | 5 | 6 }).run();
      if (action === 'paragraph') return c.setParagraph().run();
      if (action === 'bulletList') return c.toggleBulletList().run();
      if (action === 'orderedList') return c.toggleOrderedList().run();
      if (action === 'taskList') return c.toggleTaskList().run();
      if (action === 'blockquote') return c.toggleBlockquote().run();
      if (action === 'code') return c.toggleCode().run();
      if (action === 'codeBlock') return c.toggleCodeBlock().run();
      if (action === 'clear') return c.unsetAllMarks().clearNodes().run();
      if (action === 'hardBreak') return c.setHardBreak().run();
      if (action === 'indent' || action === 'outdent') { const type = this.rich.isActive('taskItem') ? 'taskItem' : 'listItem'; return action === 'indent' ? c.sinkListItem(type).run() : c.liftListItem(type).run(); }
      if (action === 'unlink') return c.extendMarkRange('link').unsetLink().run();
      if (action === 'horizontalRule') return c.setHorizontalRule().run();
    }
    if (action === 'link') return this.editValue('链接地址', this.mode === 'markdown' ? this.rich.getAttributes('link').href || 'https://' : 'https://', href => { const url = href.trim(); if (!url) { if (this.mode === 'markdown') this.rich.chain().focus().unsetLink().run(); return; } if (!/^(https?:|mailto:|#|[^:]+$)/i.test(url)) return; if (this.mode === 'source') this.source.wrap('[', '](<' + url.replace(/[<>\r\n]/g, '') + '>)'); else this.rich.chain().focus().setLink({ href: url }).run(); });
    if (action === 'unlink') return this.source.removeLink();
    if (action === 'horizontalRule') return this.insert('\n\n---\n\n');
    if (action === 'inlineMath' || action === 'math') return this.editValue(action === 'math' ? '块级公式 · LaTeX' : '行内公式 · LaTeX', 'E = mc^2', value => { if (value.trim()) this.insert(action === 'math' ? '$$\n' + value.trim() + '\n$$' : '$' + value.trim().replace(/\n/g, ' ') + '$'); });
    const diagrams: Record<string, string> = { flowchart: 'flowchart LR\n  A[开始] --> B{条件}\n  B -->|是| C[完成]\n  B -->|否| A', sequence: 'sequenceDiagram\n  participant A as 用户\n  participant B as 系统\n  A->>B: 提交请求\n  B-->>A: 返回结果', mindmap: 'mindmap\n  root((灵感))\n    想法\n      记录\n      实践\n    计划', pie: 'pie title 我的时间\n  "写作" : 45\n  "阅读" : 35\n  "休息" : 20' };
    if (diagrams[action]) return this.insert('```mermaid\n' + t(diagrams[action]) + '\n```');
    if (action === 'footnote') { const id = 'note-' + Date.now().toString(36); this.insert('[^' + id + ']'); const end = this.source.view.state.doc.length; this.source.view.dispatch({ changes: { from: end, insert: '\n\n[^' + id + ']: 在这里写脚注内容\n' } }); }
  }
  captureSession(): EditorSession {
    const r = this.rich.state.selection, s = this.source.view.state.selection.main;
    const view = this.source.view, height = view.scrollDOM.getBoundingClientRect().top - view.documentTop, block = view.lineBlockAtHeight(Math.max(0, height));
    return { mode: this.mode, richTop: this.richHost.scrollTop, sourceTop: view.scrollDOM.scrollTop, richAnchor: r.anchor, richHead: r.head, sourceAnchor: s.anchor, sourceHead: s.head, ...(this.mode === 'source' ? { sourceScrollAnchor: block.from, sourceScrollOffset: height - block.top } : {}) };
  }
  restoreSession(value: Partial<EditorSession>) {
    const clamp = (n: number | undefined, max: number) => Math.max(0, Math.min(Number.isFinite(n) ? n! : 0, max));
    const sourceMax = this.source.view.state.doc.length, richMax = this.rich.state.doc.content.size;
    const scrollAnchor = value.sourceScrollAnchor === undefined ? undefined : clamp(value.sourceScrollAnchor, sourceMax);
    this.source.view.dispatch({ selection: { anchor: clamp(value.sourceAnchor, sourceMax), head: clamp(value.sourceHead, sourceMax) }, ...(scrollAnchor === undefined ? {} : { effects: EditorView.scrollIntoView(scrollAnchor, { y: 'start', yMargin: 0 }) }) });
    this.rich.commands.setTextSelection({ from: clamp(value.richAnchor, richMax), to: clamp(value.richHead, richMax) });
    const restore = () => {
      if (this.destroyed) return;
      this.richHost.scrollTop = value.richTop || 0;
      const view = this.source.view, padding = view.documentTop - view.scrollDOM.getBoundingClientRect().top + view.scrollDOM.scrollTop;
      view.scrollDOM.scrollTop = scrollAnchor === undefined || this.mode !== 'source' ? value.sourceTop || 0 : view.lineBlockAt(scrollAnchor).top + (value.sourceScrollOffset || 0) + padding;
      this.scheduleOutline();
    };
    requestAnimationFrame(() => requestAnimationFrame(restore));
    // Equations, images and diagrams can change height after the first layout.
    this.richHost.querySelectorAll('img').forEach(image => image.addEventListener('load', restore, { once: true }));
  }
  replace(text: string) { this.source.replace(text); if (this.mode === 'source') this.richText = ''; }
  tableData() {
    if (this.mode === 'source') return this.source.tableData();
    const s = this.rich.state.selection;
    for (let d = s.$from.depth; d > 0; d--) {
      const n = s.$from.node(d); if (n.type.name !== 'table') continue;
      const rows: string[][] = [], align: (string | null)[] = [];
      n.forEach(row => { const cells: string[] = []; row.forEach((cell, _offset, i) => { cells.push(cell.content.content.map(c => serializeRichNode(c.toJSON())).join(' ')); if (!rows.length) align[i] = cell.attrs.textAlign; }); rows.push(cells); });
      return { from: s.$from.before(d), to: s.$from.after(d), rows, align };
    }
    return { from: s.from, to: s.to, rows: [['标题', '内容'], ['', ''], ['', '']], align: [null, null] };
  }
  applyTable(data: { from: number; to: number; rows: string[][]; align: (string | null)[] }) {
    if (this.mode === 'source') return this.source.applyTable(data);
    const cells = data.rows.map((row, i) => ({ type: 'tableRow', content: row.map((value, j) => {
      const parsed = richDocument(value).doc.content[0];
      return { type: i ? 'tableCell' : 'tableHeader', attrs: { textAlign: data.align[j] }, content: [{ type: 'paragraph', content: parsed?.type === 'paragraph' ? parsed.content : value ? [{ type: 'text', text: value }] : [] }] };
    }) }));
    this.rich.chain().focus().insertContentAt({ from: data.from, to: data.to }, { type: 'table', content: cells }).run();
  }
  goTo(offset: number, headingIndex?: number) {
    const index = headingIndex ?? Math.max(0, this.sourceHeadings.findIndex(h => h.from === offset));
    if (this.mode === 'source') {
      this.navigationLock = null;
      this.source.goTo(offset);
      this.scheduleOutline();
      return;
    }
    const target = this.richHeadings()[index]; if (!target) return;
    this.rich.commands.setTextSelection(target.pos + 1);
    this.rich.commands.focus(undefined, { scrollIntoView: false });
    const element = this.rich.view.nodeDOM(target.pos) as HTMLElement | null;
    if (element) {
      this.richHost.scrollTop += element.getBoundingClientRect().top - this.richHost.getBoundingClientRect().top - 36;
      this.navigationLock = { index, top: this.richHost.scrollTop };
    }
    this.onActiveHeading(index);
  }
  private sourceHeadings: { level: number; text: string; from: number }[] = [];
  private frame = 0;
  private destroyed = false;
  private resizeObserver?: ResizeObserver;
  private navigationLock: { index: number; top: number } | null = null;
  private richHeadings() {
    const targets: { pos: number }[] = [];
    this.rich.state.doc.descendants((node, pos) => { if (node.type.name === 'heading') targets.push({ pos }); });
    return targets;
  }
  private scheduleOutline = () => {
    if (this.destroyed || this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; if (!this.destroyed) this.updateOutline(); });
  };
  private updateOutline() {
    const scroller = this.mode === 'markdown' ? this.richHost : this.source.view.scrollDOM;
    if (this.navigationLock && Math.abs(scroller.scrollTop - this.navigationLock.top) < 2) { this.onActiveHeading(this.navigationLock.index); return; }
    this.navigationLock = null;
    let index = -1;
    if (this.mode === 'markdown') {
      const targets = this.richHeadings(), threshold = scroller.getBoundingClientRect().top + 48;
      targets.forEach((target, i) => { const el = this.rich.view.nodeDOM(target.pos) as HTMLElement | null; if (el && el.getBoundingClientRect().top <= threshold) index = i; });
      if (index < 0 && targets.length) index = 0;
    } else {
      const view = this.source.view;
      const block = view.lineBlockAtHeight(scroller.getBoundingClientRect().top + 48 - view.documentTop);
      this.sourceHeadings.forEach((h, i) => { if (h.from <= block.from) index = i; });
      if (index < 0 && this.sourceHeadings.length) index = 0;
    }
    this.onActiveHeading(index);
  }
  editValue(label: string, value: string, apply: (value: string) => void) {
    const dialog = document.createElement('dialog'); dialog.className = 'editor-dialog';
    const heading = document.createElement('h3'); heading.textContent = t(label);
    const input = document.createElement('textarea'); input.value = value; input.setAttribute('aria-label', t(label));
    const save = document.createElement('button'); save.textContent = t('应用'); save.className = 'primary'; save.onclick = () => { apply(input.value); dialog.close(); };
    const cancel = document.createElement('button'); cancel.textContent = t('取消'); cancel.onclick = () => dialog.close();
    dialog.append(heading, input, cancel, save); document.body.append(dialog); dialog.addEventListener('close', () => { dialog.remove(); this.rich.commands.focus(); }); dialog.showModal(); input.focus();
  }
  search() {
    if (this.mode === 'source') { openSearchPanel(this.source.view); return; }
    this.editValue('查找文字', '', query => {
      if (!query) return;
      let found = false; this.rich.state.doc.descendants((node, pos) => { if (!found && node.isText) { const at = node.text!.indexOf(query); if (at >= 0) { this.rich.commands.setTextSelection({ from: pos + at, to: pos + at + query.length }); this.rich.commands.scrollIntoView(); found = true; } } });
    });
  }
  destroy() { this.destroyed = true; cancelAnimationFrame(this.frame); this.resizeObserver?.disconnect(); this.richHost.removeEventListener('scroll', this.scheduleOutline); this.source.view.scrollDOM.removeEventListener('scroll', this.scheduleOutline); this.rich.destroy(); this.source.destroy(); this.sourceHost.remove(); this.richHost.remove(); }
}
