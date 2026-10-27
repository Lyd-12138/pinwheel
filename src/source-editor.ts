import { t, getLanguage } from './i18n';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection, dropCursor } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab, redo, indentMore, indentLess } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, foldKeymap } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { parse } from '../shared/markdown.mjs';

export type Mode = 'source';
export class NoteEditor {
  locale = new Compartment();
  private phrases(): Record<string, string> { return getLanguage() === 'zh-CN' ? { 'Find': '查找', 'Replace': '替换', 'next': '下一个', 'previous': '上一个', 'all': '全部', 'match case': '区分大小写', 'by word': '完整词', 'regexp': '正则表达式', 'replace': '替换', 'replace all': '全部替换', 'close': '关闭', 'Go to line': '跳转到行', 'go': '跳转' } : {}; }
  updateLanguage() { this.view.dispatch({ effects: this.locale.reconfigure(EditorState.phrases.of(this.phrases())) }); this.view.contentDOM.setAttribute('aria-label', t('Markdown 编辑器')); }
  view: EditorView;
  mode = new Compartment();
  note: string;
  constructor(parent: HTMLElement, note: string, text: string, mode: Mode, onChange: (text: string) => void, onCursor: (line: number, col: number) => void, onFiles: (files: File[]) => void, onLink: (url: string) => void, onSave: () => void) {
    this.note = note;
    this.view = new EditorView({ parent, state: EditorState.create({ doc: text, extensions: [
      EditorState.lineSeparator.of(text.includes('\r\n') ? '\r\n' : '\n'),
      history(), drawSelection(), dropCursor(), EditorView.lineWrapping, this.locale.of(EditorState.phrases.of(this.phrases())),
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      syntaxHighlighting(defaultHighlightStyle), bracketMatching(), closeBrackets(), highlightSelectionMatches(),
      keymap.of([{ key: 'Mod-Shift-z', run: redo, preventDefault: true }, { key: 'Mod-s', run: () => { onSave(); return true; } }, { key: 'Mod-b', run: () => { this.wrap('**'); return true; } }, { key: 'Mod-i', run: () => { this.wrap('*'); return true; } }, ...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...searchKeymap, ...foldKeymap, indentWithTab]),
      this.mode.of([lineNumbers(), highlightActiveLine(), foldGutter()]),
      EditorView.contentAttributes.of({ 'aria-label': t('Markdown 编辑器'), spellcheck: 'false' }),
      EditorView.updateListener.of(update => {
        if (update.docChanged) onChange(update.state.sliceDoc());
        if (update.selectionSet || update.docChanged) { const p = update.state.selection.main.head; const line = update.state.doc.lineAt(p); onCursor(line.number, p - line.from + 1); }
      }),
      EditorView.domEventHandlers({
        paste: event => { const files = Array.from(event.clipboardData?.files || []); if (files.length) { event.preventDefault(); onFiles(files); return true; } return false; },
        dragover: event => { if (event.dataTransfer?.types.includes('Files')) { event.preventDefault(); return true; } return false; },
        drop: event => { const files = Array.from(event.dataTransfer?.files || []); if (files.length) { event.preventDefault(); onFiles(files); return true; } return false; },
        click: event => { const a = (event.target as HTMLElement).closest('a'); if (a) { event.preventDefault(); onLink(a.getAttribute('href') || ''); return true; } return false; },
      }),
    ] }) });
  }
  setMode(mode: Mode) { this.view.dispatch({ effects: this.mode.reconfigure([lineNumbers(), highlightActiveLine(), foldGutter()]) }); }
  insert(text: string) { const s = this.view.state.selection.main; this.view.dispatch({ changes: { from: s.from, to: s.to, insert: text }, selection: { anchor: s.from + text.length } }); this.view.focus(); }
  wrap(marker: string, end = marker) { const s = this.view.state.selection.main; const chosen = this.view.state.sliceDoc(s.from, s.to); this.view.dispatch({ changes: { from: s.from, to: s.to, insert: marker + chosen + end }, selection: { anchor: s.from + marker.length, head: s.from + marker.length + chosen.length } }); this.view.focus(); }
  linePrefix(prefix: string) { const s = this.view.state.selection.main; const line = this.view.state.doc.lineAt(s.from); this.view.dispatch({ changes: { from: line.from, insert: prefix } }); this.view.focus(); }
  blockPrefix(prefix: string, kind: 'heading' | 'list' | 'quote') {
    const { doc, selection } = this.view.state, s = selection.main;
    const first = doc.lineAt(s.from), last = doc.lineAt(s.to > s.from && doc.lineAt(s.to).from === s.to ? s.to - 1 : s.to);
    const pattern = kind === 'heading' ? /^( {0,3})(?:#{1,6}\s+)?/ : kind === 'list' ? /^(\s*)(?:(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)?/ : /^(\s*)(?:>\s?)?/;
    const lines = Array.from({ length: last.number - first.number + 1 }, (_, i) => doc.line(first.number + i).text);
    const same = prefix && lines.every(line => line.trimStart().startsWith(prefix));
    const text = lines.map((line, i) => line.replace(pattern, (_all, indent) => indent + (same ? '' : prefix === '1. ' ? `${i + 1}. ` : prefix))).join('\n');
    this.view.dispatch({ changes: { from: first.from, to: last.to, insert: text }, selection: { anchor: first.from, head: first.from + text.length } }); this.view.focus();
  }
  indent(out: boolean) { (out ? indentLess : indentMore)(this.view); this.view.focus(); }
  inlineCode() {
    const s = this.view.state.selection.main, text = this.view.state.sliceDoc(s.from, s.to);
    const fence = '`'.repeat(Math.max(0, ...[...text.matchAll(/`+/g)].map(m => m[0].length)) + 1), pad = /^`|`$|^ .* $/.test(text) ? ' ' : '';
    this.wrap(fence + pad, pad + fence);
  }
  codeBlock() {
    const s = this.view.state.selection.main, text = this.view.state.sliceDoc(s.from, s.to);
    const fence = '`'.repeat(Math.max(2, ...[...text.matchAll(/`+/g)].map(m => m[0].length)) + 1);
    this.wrap('\n' + fence + '\n', '\n' + fence + '\n');
  }
  clearFormatting() {
    const s = this.view.state.selection.main, from = s.empty ? this.view.state.doc.lineAt(s.from).from : s.from, to = s.empty ? this.view.state.doc.lineAt(s.to).to : s.to;
    const text = this.view.state.sliceDoc(from, to);
    const plain = (n: any): string => n.type === 'text' || n.type === 'inlineCode' || n.type === 'code' ? n.value : n.type === 'break' ? '\n' : n.children ? n.children.map(plain).join(['root', 'list', 'listItem', 'blockquote'].includes(n.type) ? '\n' : '') : text.slice(n.position.start.offset, n.position.end.offset);
    const value = plain(parse(text)); this.view.dispatch({ changes: { from, to, insert: value }, selection: { anchor: from, head: from + value.length } }); this.view.focus();
  }
  removeLink() {
    const { doc, selection } = this.view.state, s = selection.main, text = doc.toString();
    let found: any;
    const walk = (node: any) => { if (node.type === 'link' && s.from >= node.position.start.offset && s.to <= node.position.end.offset) found = node; node.children?.forEach(walk); }; walk(parse(text));
    if (!found) return;
    const first = found.children[0], last = found.children.at(-1), value = first ? text.slice(first.position.start.offset, last.position.end.offset) : '';
    this.view.dispatch({ changes: { from: found.position.start.offset, to: found.position.end.offset, insert: value } }); this.view.focus();
  }
  replace(text: string) { this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: text } }); }
  tableData() {
    const text = this.view.state.doc.toString(); const selection = this.view.state.selection.main;
    const table: any = (parse(text) as any).children.find((n: any) => n.type === 'table' && selection.head >= n.position.start.offset && selection.head <= n.position.end.offset);
    if (!table) return { from: selection.from, to: selection.to, rows: [['标题', '内容'], ['', ''], ['', '']], align: [null, null] };
    return { from: table.position.start.offset, to: table.position.end.offset, rows: table.children.map((row: any) => row.children.map((cell: any) => text.slice(cell.position.start.offset, cell.position.end.offset))), align: table.align };
  }
  applyTable(data: { from: number; to: number; rows: string[][]; align: (string | null)[] }) {
    const row = (cells: string[]) => '| ' + cells.map(c => c.replace(/(?<!\\)\|/g, '\\|').replace(/[\r\n]/g, ' ')).join(' | ') + ' |';
    const lines = [row(data.rows[0]), row(data.rows[0].map((_, i) => data.align[i] === 'center' ? ':---:' : data.align[i] === 'right' ? '---:' : data.align[i] === 'left' ? ':---' : '---')), ...data.rows.slice(1).map(row)];
    this.view.dispatch({ changes: { from: data.from, to: data.to, insert: (data.from === data.to ? '\n' : '') + lines.join('\n') + '\n' } }); this.view.focus();
  }
  goTo(offset: number) { const pos = Math.min(offset, this.view.state.doc.length); this.view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 36 }) }); this.view.focus(); }
  destroy() { this.view.destroy(); }
}
