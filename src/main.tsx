import { t, useLanguage, setLanguage, brandName } from './i18n';
import { LanguagePanel } from './language-panel';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { call, type Document, type Note, type Workspace, type Settings, type WorkspaceSession } from './types';
import { NoteEditor, type Mode } from './editor';
import { NoteTree } from './note-browser';
import { ThemePicker } from './theme-picker';
import { EditorToolbar } from './editor-toolbar';
import { TypographyPanel, CustomThemesPanel } from './preferences-panel';
import { PetDesktop, PetsPanel } from './pets';
import { fontStack } from '../shared/preferences.mjs';
import { Icon, ThemeUIContext, uiLabel } from './ui';
import { builtInThemes } from '../shared/themes.mjs';
import { backgroundStyle, themeFonts } from '../shared/theme-format.mjs';
import 'katex/dist/katex.min.css';
import './style.css';
import './widgets.css';
import './layout.css';
import './highlight.css';
import './sidebar.css';
import './themes.css';
import './responsive.css';
import './theme-canvas.css';
import './encryption.css';
import './theme-art.css';
import './workspace-controls.css';
import './editor-toolbar.css';
import './preferences.css';
import './pets.css';

function App() {
  const appLanguage = useLanguage();
  useEffect(() => { document.documentElement.lang = appLanguage; document.title = brandName(); editor.current?.updateLanguage(); }, [appLanguage]);
  const [password, setPassword] = useState(''), [confirmPassword, setConfirmPassword] = useState(''), [passwordError, setPasswordError] = useState('');
  const [directories, setDirectories] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; parent: string; path: string; folder: boolean } | null>(null), [newParent, setNewParent] = useState('');
  const [renameTarget, setRenameTarget] = useState<{ path: string; folder: boolean } | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(280), [resizing, setResizing] = useState(false), [integration, setIntegration] = useState<any>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null), [notes, setNotes] = useState<Note[]>([]), [doc, setDoc] = useState<Document | null>(null);
  const [text, setText] = useState(''), [mode, setMode] = useState<Mode>('markdown'), [theme, setTheme] = useState('simple'), [fontSize, setFontSize] = useState(16);
  const [sidebarHidden, setSidebarHidden] = useState(false), [activeHeading, setActiveHeading] = useState(-1);
  const [sidebarTab, setSidebarTab] = useState<'notes' | 'outline'>('notes'), [noteView, setNoteView] = useState<'list' | 'tree'>('list');
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const outlineList = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('已保存'), [error, setError] = useState(''), [notice, setNotice] = useState(''), [query, setQuery] = useState(''), [results, setResults] = useState<Note[] | null>(null);
  const [modal, setModal] = useState(''), [name, setName] = useState(''), [busy, setBusy] = useState(false), [outline, setOutline] = useState<any[]>([]), [html, setHtml] = useState(''), [cursor, setCursor] = useState([1, 1]);
  const [table, setTable] = useState<{ from: number; to: number; rows: string[][]; align: (string | null)[] } | null>(null);
  const [versions, setVersions] = useState<any[]>([]), [historyText, setHistoryText] = useState<string | null>(null), [focus, setFocus] = useState(false), [exportFormat, setExportFormat] = useState('pack'), [exportAll, setExportAll] = useState(false);
  const host = useRef<HTMLDivElement>(null), editor = useRef<NoteEditor | null>(null), preview = useRef<HTMLDivElement>(null), current = useRef<Document | null>(null), draft = useRef(''), savePromise = useRef<Promise<boolean> | null>(null), saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null), recoveryTimer = useRef<ReturnType<typeof setTimeout> | null>(null), worker = useRef<Worker | null>(null), rev = useRef(0), modeRef = useRef(mode);
  const customTheme = theme === 'custom' || theme.startsWith('custom:') ? workspace?.settings.customThemes?.find(t => t.id === theme)?.theme || workspace?.settings.customTheme : undefined;
  const themeUI = customTheme?.ui;
  const uiText = (value: string) => uiLabel(themeUI, value);
  const guard = async (fn: () => Promise<any>) => { try { await fn(); } catch (e) { setError((e as Error).message); } };
  const rootRef = useRef(''), sessions = useRef<Record<string, WorkspaceSession>>({}), collapsedRef = useRef(collapsedFolders), sessionTimer = useRef<ReturnType<typeof setTimeout> | null>(null), sessionReady = useRef(false), editorRoot = useRef('');
  collapsedRef.current = collapsedFolders;
  const captureSession = () => {
    const root = rootRef.current; if (!root) return;
    const session = sessions.current[root] ||= { lastPath: '', mode: 'markdown', collapsed: [], views: {} };
    if (current.current?.path) session.lastPath = current.current.path;
    session.mode = modeRef.current; session.collapsed = [...collapsedRef.current];
    if (editor.current && current.current?.path && editor.current.note === current.current.path && editorRoot.current === root && sessionReady.current) { const file = current.current.path, view = editor.current.captureSession(); delete session.views[file]; session.views[file] = view; const files = Object.keys(session.views); while (files.length > 100) delete session.views[files.shift()!]; }
    return session;
  };
  const flushSession = async () => { if (sessionTimer.current) clearTimeout(sessionTimer.current); const session = captureSession(); if (session) await call('workspaceSession', { root: rootRef.current, session }); };
  const flushSessionRef = useRef(flushSession); flushSessionRef.current = flushSession;
  const scheduleSession = () => { if (sessionTimer.current) clearTimeout(sessionTimer.current); sessionTimer.current = setTimeout(() => void flushSessionRef.current().catch(e => setError(e.message)), 500); };
  const toggleAlwaysOnTop = async (enabled: boolean) => { const previous = !!workspace?.settings.alwaysOnTop; setBusy(true); setWorkspace(w => w && { ...w, settings: { ...w.settings, alwaysOnTop: enabled } }); try { applySettings(await call('setAlwaysOnTop', { enabled })); } catch (error) { setWorkspace(w => w && { ...w, settings: { ...w.settings, alwaysOnTop: previous } }); setError((error as Error).message); } finally { setBusy(false); } };
  const applySettings = (settings: Settings) => { setLanguage(settings.language || "system", settings.systemLanguage || navigator.language); setWorkspace(w => w && { ...w, settings }); setTheme(settings.theme || 'simple'); };
  useEffect(() => window.notebook.onPreferences(() => void guard(async () => applySettings(await call('preferences')))), []);
  useEffect(() => window.notebook.onPetManage(() => { setModal('settings'); requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById('pet-settings')?.scrollIntoView({ block: 'start' }))); }), []);
  const refreshNotes = async () => { const [files, folders] = await Promise.all([call<Note[]>('list'), call<string[]>('directories')]); setNotes(files); setDirectories(folders); };
  const save = async (): Promise<boolean> => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (savePromise.current) { const ok = await savePromise.current; return ok ? save() : false; }
    const d = current.current; if (!d || d.locked) return true;
    if (draft.current === d.text) { setStatus(previous => previous === '编辑中' ? '已保存' : previous); return true; }
    const snapshot = draft.current; setStatus('保存中…');
    const pending = (async () => {
      try {
        const r = await call('save', { path: d.path, text: snapshot, expectedHash: d.hash, bom: d.bom });
        if (current.current === d) { d.hash = r.hash; d.text = snapshot; setStatus(draft.current === snapshot ? '已保存' : '编辑中'); }
        return true;
      } catch (e) { setStatus('保存失败'); setError((e as Error).message); return false; }
    })();
    savePromise.current = pending; const ok = await pending; savePromise.current = null;
    if (ok && current.current === d && draft.current !== snapshot) return save();
    return ok;
  };
  const openRequest = useRef(0);
  const saveRef = useRef(save); saveRef.current = save;
  const openNote = async (file: string) => {
    const request = ++openRequest.current;
    if (!(await save())) return;
    await flushSession();
    if (recoveryTimer.current) clearTimeout(recoveryTimer.current);
    let loaded: Document = await call('read', { path: file });
    if (request !== openRequest.current) return;
    if (!(await save()) || request !== openRequest.current) return;
    if (host.current) host.current.inert = true;
    try {
      await call('lockAll'); loaded = await call('read', { path: file });
      if (request !== openRequest.current) return;
      current.current = loaded; draft.current = loaded.text; setOutline([]); setActiveHeading(-1); setDoc({ ...loaded }); setText(loaded.text); setStatus('已保存'); setError('');
      setHistoryText(null); setVersions([]); setHtml(''); setTable(null);
      if (loaded.locked) { setStatus('已锁定'); return; }
      const recovered = await call('getRecovery', { path: file });
      if (request === openRequest.current && recovered && recovered.text !== loaded.text) { setHistoryText(recovered.text); setModal('recovery'); }
    } finally { if (request === openRequest.current && host.current) host.current.inert = false; }
  };
  const onChange = (value: string) => {
    if (current.current?.locked) return;
    draft.current = value; setText(value); setStatus('编辑中');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveRef.current(), 900);
    if (recoveryTimer.current) clearTimeout(recoveryTimer.current);
    const file = current.current?.path;
    recoveryTimer.current = setTimeout(() => { if (file) void call('recovery', { path: file, text: value }).catch(e => { setError('恢复日志写入失败：' + e.message); }); }, 250);
  };
  const resizeSidebar = (value: number, persist = false) => {
    const width = Math.round(Math.min(Math.max(200, value), Math.min(520, Math.max(200, innerWidth - 390))));
    setSidebarWidth(width); if (persist) void guard(() => call('settings', { sidebarWidth: width }));
  };
  const dragSidebar = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setResizing(true);
  };
  useEffect(() => { const handler = () => setSidebarWidth(value => Math.min(value, Math.min(520, Math.max(200, innerWidth - 390)))); window.addEventListener('resize', handler); return () => window.removeEventListener('resize', handler); }, []);
  useEffect(() => { if (modal === 'settings') void guard(async () => setIntegration(await call('integration'))); }, [modal]);
  const applyWorkspace = async (w: Workspace) => {
    rootRef.current = w.root; sessions.current = { ...sessions.current, ...w.settings.sessions };
    const session = sessions.current[w.root]; sessionReady.current = false;
    modeRef.current = session?.mode || 'markdown'; setMode(modeRef.current); setCollapsedFolders(new Set(session?.collapsed || [])); collapsedRef.current = new Set(session?.collapsed || []);
    setLanguage(w.settings.language || "system", w.settings.systemLanguage || navigator.language); setWorkspace(w); setNotes(w.notes); setDirectories(w.directories || []); current.current = null; draft.current = ''; setDoc(null); setText('');
    const target = w.notes.find(n => n.path === session?.lastPath) || w.notes[0]; if (target) await openNote(target.path);
  };
  const openingExternal = useRef(false), externalPending = useRef(false), externalHandler = useRef<() => Promise<void>>(async () => {});
  externalHandler.current = async () => {
    if (busy || openingExternal.current || !externalPending.current || !(await save())) return; externalPending.current = false; openingExternal.current = true; setModal(''); setContextMenu(null);
    await flushSession();
    if (recoveryTimer.current) clearTimeout(recoveryTimer.current); if (host.current) host.current.inert = true;
    try {
      let result;
      while ((result = await call('openExternalDocument'))) {
        if (result.type === 'document') { await applyWorkspace(result.workspace); await openNote(result.path); }
        else { await refreshNotes(); setNotice(`已导入 ${result.result.count} 篇笔记，存放于 ${result.result.folder}`); }
      }
    } finally { if (host.current) host.current.inert = false; openingExternal.current = false; if (externalPending.current) void guard(() => externalHandler.current()); }
  };
  useEffect(() => window.notebook.onExternalOpen(() => { externalPending.current = true; void guard(() => externalHandler.current()); }), []);
  useEffect(() => { if (!busy && workspace) void guard(() => externalHandler.current()); }, [busy]);
  useEffect(() => { void guard(async () => { const w: Workspace = await call('bootstrap'); setSidebarHidden(w.settings.sidebarHidden === true); setSidebarTab(w.settings.sidebarTab === 'outline' ? 'outline' : 'notes'); setNoteView(w.settings.noteView === 'tree' ? 'tree' : 'list'); setTheme(w.settings.theme || 'simple'); setFontSize(w.settings.fontSize || 16); resizeSidebar(w.settings.sidebarWidth || 280); await applyWorkspace(w); if (w.pendingExternal) { externalPending.current = true; await externalHandler.current(); } }); }, []);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const id = theme === 'system' ? media.matches && !workspace?.settings.deletedThemes?.includes('dark') ? 'dark' : 'simple' : theme;
      const preset = builtInThemes.find(t => t.id === id) || builtInThemes[0];
      const custom = customTheme;
      document.documentElement.dataset.theme = custom ? custom.colorScheme : preset.id;
      document.documentElement.dataset.colorScheme = custom ? custom.colorScheme : preset.colorScheme;
      document.documentElement.dataset.themeStyle = custom ? custom.appearance || 'plain' : preset.appearance;
      for (const [key, value] of Object.entries(custom?.tokens || preset.tokens)) document.documentElement.style.setProperty('--' + key, value);
      document.documentElement.style.setProperty('--writing-font', custom ? themeFonts[custom.typography?.body || 'sans'] : themeFonts[preset.typography.body as keyof typeof themeFonts]);
      document.documentElement.style.setProperty('--ui-font', custom ? themeFonts[custom.typography?.interface || 'sans'] : themeFonts.sans);
      document.documentElement.style.setProperty('--heading-font', custom ? themeFonts[custom.typography?.heading || custom.typography?.body || 'sans'] : themeFonts[preset.typography.heading as keyof typeof themeFonts]);
      const family = workspace?.settings.fontFamily || '';
      document.documentElement.dataset.fontOverride = String(!!family);
      document.documentElement.style.setProperty('--chosen-font', fontStack(family));
      document.documentElement.style.setProperty('--code-font', fontStack(workspace?.settings.codeFontFamily || '', true));
      const background = backgroundStyle(custom ? custom.background : preset.background);
      document.documentElement.style.setProperty('--canvas-image', background.image);
      document.documentElement.style.setProperty('--canvas-size', background.size);
      document.documentElement.style.setProperty('--canvas-opacity', background.opacity);
    };
    apply(); media.addEventListener('change', apply); return () => media.removeEventListener('change', apply);
  }, [theme, customTheme, workspace?.settings.deletedThemes, workspace?.settings.fontFamily, workspace?.settings.codeFontFamily]);
  useEffect(() => { document.documentElement.style.setProperty('--editor-size', fontSize + 'px'); }, [fontSize]);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const controls = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select, textarea, [tabindex="0"]') || []);
    if (dialog && !dialog.contains(document.activeElement)) controls()[0]?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); if (!busy) setModal(''); }
      if (event.key === 'Tab') {
        const items = controls(); if (!items.length) return;
        if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
      }
    };
    document.addEventListener('keydown', handler);
    return () => { document.removeEventListener('keydown', handler); previous?.focus(); };
  }, [modal, busy]);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(''), 6000); return () => clearTimeout(t); }, [notice]);
  useEffect(() => {
    const w = new Worker(new URL('./preview.worker.ts', import.meta.url), { type: 'module' }); worker.current = w;
    w.onmessage = e => { if (e.data.revision !== rev.current) return; if (e.data.error) setError(e.data.error); else { setHtml(e.data.html); setOutline(e.data.headings); } };
    w.onerror = e => setError('预览处理失败：' + e.message + '。正文仍可编辑和保存。');
    return () => w.terminate();
  }, []);
  useEffect(() => { const revision = ++rev.current; const t = setTimeout(() => worker.current?.postMessage({ text, note: doc?.path || '', revision }), 120); return () => clearTimeout(t); }, [text, doc?.path]);
  useEffect(() => {
    if (!host.current || !doc || doc.locked) return;
    editor.current?.destroy(); setActiveHeading(-1);
    editorRoot.current = rootRef.current;
    editor.current = new NoteEditor(host.current, doc.path, doc.text, modeRef.current, onChange, (l, c) => setCursor([l, c]), files => void guard(() => insertFiles(files)), url => void guard(() => followLink(url)), () => void saveRef.current(), setActiveHeading);
    sessionReady.current = false;
    const view = sessions.current[rootRef.current]?.views[doc.path]; if (view) editor.current.restoreSession(view);
    const ready = setTimeout(() => { sessionReady.current = true; }, 400);
    const changed = () => { if (sessionReady.current) scheduleSession(); };
    const el = host.current; el.addEventListener('scroll', changed, true); el.addEventListener('keyup', changed); el.addEventListener('pointerup', changed);
    return () => { captureSession(); clearTimeout(ready); el.removeEventListener('scroll', changed, true); el.removeEventListener('keyup', changed); el.removeEventListener('pointerup', changed); editor.current?.destroy(); editor.current = null; };

  }, [doc?.path, doc?.locked, workspace?.root]);
  useEffect(() => { if (modal !== 'encrypt' && modal !== 'unlock') { setPassword(''); setConfirmPassword(''); setPasswordError(''); } }, [modal]);
  useEffect(() => { modeRef.current = mode; editor.current?.setMode(mode); if (sessionReady.current) scheduleSession(); }, [mode]);
  useEffect(() => { if (rootRef.current) scheduleSession(); }, [collapsedFolders]);
  useEffect(() => {
    if (!query.trim()) { setResults(null); return; }
    let canceled = false;
    const timer = setTimeout(() => void call<Note[]>('search', { query }).then(r => { if (!canceled) setResults(r); }).catch(e => { if (!canceled) setError(e.message); }), 250);
    return () => { canceled = true; clearTimeout(timer); };
  }, [query, notes]);
  useEffect(() => window.notebook.onClose(() => void (async () => { try { if (await saveRef.current()) { await flushSessionRef.current(); window.notebook.finishClose(); } else setModal('closeFailed'); } catch (e) { setError((e as Error).message); setModal('closeFailed'); } })()), []);
  useEffect(() => {
    const check = () => { const d = current.current; if (!d) return; void call<string>('checkDisk', { path: d.path }).then(h => { if (current.current === d && h !== d.hash && !savePromise.current) { setError('文件已在外部修改。请先另存副本，或点击“载入磁盘版本”。'); setStatus('外部修改'); } }).catch(e => setError(e.message)); };
    window.addEventListener('focus', check); return () => window.removeEventListener('focus', check);
  }, []);
  useEffect(() => {
    const list = outlineList.current, item = list?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!list || !item) return;
    const top = item.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
    if (top < list.scrollTop + 8) list.scrollTop = Math.max(0, top - 8);
    else if (top + item.offsetHeight > list.scrollTop + list.clientHeight - 8) list.scrollTop = top + item.offsetHeight - list.clientHeight + 8;
  }, [activeHeading, outline, sidebarTab]);


  const changeSidebarTab = (tab: 'notes' | 'outline') => { setSidebarTab(tab); void guard(() => call('settings', { sidebarTab: tab })); };
  const changeNoteView = (view: 'list' | 'tree') => { setNoteView(view); void guard(() => call('settings', { noteView: view })); };
  const toggleFolder = (path: string) => {
    if (query.trim()) return;
    setCollapsedFolders(previous => { const next = new Set(previous); if (next.has(path)) next.delete(path); else next.add(path); return next; });
  };
  const toggleSidebar = () => {
    const hidden = focus ? false : !sidebarHidden;
    if (focus) setFocus(false);
    setSidebarHidden(hidden); void guard(() => call('settings', { sidebarHidden: hidden }));
  };
  const followLink = async (url: string) => { if (url.startsWith('#')) { setNotice('请在左侧“大纲”Tab 中定位章节。'); return; } const note = await call('followLink', { path: current.current?.path, url }); if (note) await openNote(note); };
  const insertFiles = async (files: File[]) => {
    const target = current.current?.path; if (!target) return;
    for (const file of files) {
      const attached = await call('attachBytes', { path: target, name: file.name || '粘贴图片.png', bytes: new Uint8Array(await file.arrayBuffer()) });
      if (current.current?.path !== target) { setNotice('附件已存储，请返回原笔记重新插入。'); return; }
      editor.current?.insert(`${attached.image ? '!' : ''}[${attached.name.replace(/[\[\]\\]/g, '')}](${attached.url})\n`);
    }
  };
  const attach = () => guard(async () => { const target = current.current?.path; if (!target) return; const items = await call('attach', { path: target }); if (current.current?.path === target) for (const a of items) editor.current?.insert(`${a.image ? '!' : ''}[${a.name.replace(/[\[\]\\]/g, '')}](${a.url})\n`); });
  const create = () => guard(async () => {
    if (busy || !(await save())) return;
    setBusy(true);
    try {
      if (modal === 'newFolder') {
        const result = await call('createFolder', { name: name.trim(), parent: newParent });
        setCollapsedFolders(previous => new Set([...previous].filter(folder => !result.path.startsWith(folder + '/') && folder !== result.path)));
        changeNoteView('tree'); setQuery(''); await refreshNotes(); setModal('');
      } else {
        const d: Document = await call('create', { name: name.trim(), parent: newParent, text: '# ' + name.trim().replace(/\.(md|markdown|pinwheel|moye)$/i, '') + '\n\n' });
        setQuery(''); setModal(''); await refreshNotes(); await openNote(d.path);
      }
    } finally { setBusy(false); }
  });
  const showContextMenu = (event: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>) => {
    if (busy) return;
    event.preventDefault();
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-path]');
    const path = target?.dataset.path || '';
    const parent = target?.classList.contains('folder-row') ? path : path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    const rect = target?.getBoundingClientRect() || event.currentTarget.getBoundingClientRect();
    const x = 'clientX' in event ? event.clientX : rect.left + 20, y = 'clientY' in event ? event.clientY : rect.top + 25;
    setContextMenu({ parent, path, folder: !!target?.classList.contains('folder-row'), x: Math.max(8, Math.min(x, innerWidth - 240)), y: Math.max(8, Math.min(y, innerHeight - 330)) });
  };
  useEffect(() => {
    if (!contextMenu) return;
    const close = (event: PointerEvent) => { if (!(event.target as HTMLElement).closest('.context-menu')) setContextMenu(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setContextMenu(null); event.preventDefault(); } };
    const resized = () => setContextMenu(null);
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape); window.addEventListener('resize', resized);
    const frame = requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.context-menu button')?.focus());
    return () => { cancelAnimationFrame(frame); document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); window.removeEventListener('resize', resized); };
  }, [contextMenu]);
  const renameSelected = () => guard(async () => {
    if (!renameTarget || busy || !(await save())) return;
    const selected = renameTarget; setBusy(true); if (host.current) host.current.inert = true;
    if (recoveryTimer.current) clearTimeout(recoveryTimer.current);
    try {
      const result = await call('rename', { path: selected.path, name: name.trim() });
      const old = current.current?.path;
      await refreshNotes(); setModal(''); setQuery('');
      if (old && (old === selected.path || selected.folder && old.startsWith(selected.path + '/'))) {
        const next = result.path + old.slice(selected.path.length); current.current = null; draft.current = ''; setDoc(null); setText(''); await openNote(next);
      }
      setCollapsedFolders(new Set()); setNotice('已重命名。');
    } finally { if (host.current) host.current.inert = false; setBusy(false); }
  });
  const duplicateSelected = (path: string) => guard(async () => {
    setContextMenu(null); if (busy || !(await save())) return; setBusy(true); if (host.current) host.current.inert = true;
    if (recoveryTimer.current) clearTimeout(recoveryTimer.current);
    try { const result = await call('duplicate', { path }); await refreshNotes(); setQuery(''); await openNote(result.path); setNotice('已创建副本，原文件保持不变。'); }
    finally { if (host.current) host.current.inert = false; setBusy(false); }
  });
  const importNotes = () => guard(async () => { if (!(await save())) return; setBusy(true); try { const result = await call('import'); if (result) { await refreshNotes(); setNotice(`已导入 ${result.count} 篇笔记，存放于 ${result.folder}`); } } finally { setBusy(false); } });
  const showHistory = () => guard(async () => { if (!doc) return; setVersions(await call('history', { path: doc.path })); setHistoryText(null); setModal('history'); });
  const reloadDisk = () => guard(async () => { if (!current.current) return; if (saveTimer.current) clearTimeout(saveTimer.current); const loaded: Document = await call('read', { path: current.current.path }); current.current = loaded; draft.current = loaded.text; editor.current?.replace(loaded.text); setStatus('已保存'); setError(''); });
  const backupCopy = () => guard(async () => { if (!current.current || current.current.locked) return; const copyName = current.current.path.split('/').pop()!.replace(/\.(md|markdown|pinwheel|moye)$/i, '') + '-副本-' + Date.now(); const d: Document = await call(current.current.encrypted ? 'encryptedCopy' : 'create', { path: current.current.path, name: copyName, text: draft.current }); current.current.text = draft.current; await refreshNotes(); await openNote(d.path); setError(''); });
  const submitPassword = async () => {
    if (busy || !current.current) return;
    const action = modal, path = current.current.path;
    if (action === 'encrypt' && password !== confirmPassword) { setPasswordError('两次输入的密码不一致。'); return; }
    setBusy(true); setPasswordError('');
    try {
      if (!(await save())) return;
      if (recoveryTimer.current) clearTimeout(recoveryTimer.current);
      const loaded: Document = await call(action, { path, password, expectedHash: current.current.hash });
      current.current = loaded; draft.current = loaded.text; setDoc({ ...loaded }); setText(loaded.text); setStatus('已保存');
      setHistoryText(null); setVersions([]); setPassword(''); setConfirmPassword(''); setModal(''); await refreshNotes();
      if (action === 'encrypt') setNotice('正文、历史版本和恢复记录已加密。图片和附件保持原样。');
      const recovered = await call('getRecovery', { path });
      if (recovered && recovered.text !== loaded.text) { setHistoryText(recovered.text); setModal('recovery'); }
    } catch (e) { setPasswordError((e as Error).message); setPassword(''); setConfirmPassword(''); }
    finally { setBusy(false); }
  };
  const lockDocument = () => guard(async () => {
    if (!current.current || busy) return;
    if (host.current) host.current.inert = true;
    setBusy(true);
    try {
      if (!(await save())) return;
      if (recoveryTimer.current) clearTimeout(recoveryTimer.current);
      await call('lockAll'); const loaded: Document = await call('read', { path: current.current.path });
      current.current = loaded; draft.current = ''; editor.current?.destroy(); editor.current = null;
      setDoc({ ...loaded }); setText(''); setHtml(''); setOutline([]); setHistoryText(null); setVersions([]); setTable(null); setStatus('已锁定');
      setQuery(''); setResults(null);
    } finally { if (host.current) host.current.inert = false; setBusy(false); }
  });
  const words = [...text.replace(/[#*`>\[\]()|_-]/g, '').replace(/\s/g, '')].length;
  const visibleNotes = useMemo(() => results || notes.filter(n => (n.name + ' ' + n.path).toLocaleLowerCase().includes(query.toLocaleLowerCase())), [results, notes, query]);
  return <ThemeUIContext.Provider value={themeUI || {}}><div className={'app' + (focus ? ' focused' : '') + (sidebarHidden ? ' sidebar-collapsed' : '') + (resizing ? ' resizing-sidebar' : '')} style={{ '--sidebar-width': sidebarWidth + 'px' } as React.CSSProperties}>
    <aside className="sidebar" id="notebook-sidebar">
      <div className="brand"><span className="brand-mark"><Icon name="brand" size={24}/></span><strong>{uiText("风车笔记")}<span>{uiText("pinwheel")}</span></strong></div>
      <button className="workspace-button" onClick={() => void guard(async () => { if (!(await save())) return; await flushSession(); if (recoveryTimer.current) clearTimeout(recoveryTimer.current); if (host.current) host.current.inert = true; try { const w = await call('chooseWorkspace'); if (w) await applyWorkspace(w); } finally { if (host.current) host.current.inert = false; } })}><Icon name="folder"/><span>{workspace?.root.split(/[\\/]/).pop() || t('我的笔记')}<small>{uiText("切换笔记文件夹")}</small></span><Icon name="arrow" size={14}/></button>
      <div className="sidebar-tabs" role="tablist" aria-label={uiText("侧栏内容")} onKeyDown={event => {
        const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']; if (!keys.includes(event.key)) return;
        event.preventDefault(); const tab = event.key === 'Home' ? 'notes' : event.key === 'End' ? 'outline' : sidebarTab === 'notes' ? 'outline' : 'notes';
        changeSidebarTab(tab); document.getElementById('sidebar-' + tab + '-tab')?.focus();
      }}>
        <button id="sidebar-notes-tab" role="tab" aria-selected={sidebarTab === 'notes'} aria-controls="sidebar-notes-panel" tabIndex={sidebarTab === 'notes' ? 0 : -1} onClick={() => changeSidebarTab('notes')}><Icon name="file" size={15}/>{uiText("笔记")}</button>
        <button id="sidebar-outline-tab" role="tab" aria-selected={sidebarTab === 'outline'} aria-controls="sidebar-outline-panel" tabIndex={sidebarTab === 'outline' ? 0 : -1} onClick={() => changeSidebarTab('outline')}><Icon name="outline" size={15}/>{uiText("大纲")}</button>
      </div>
      <section className="sidebar-panel notes-panel" role="tabpanel" id="sidebar-notes-panel" aria-labelledby="sidebar-notes-tab" hidden={sidebarTab !== 'notes'}>
        <label className="search"><Icon name="search" size={16}/><input aria-label={uiText("搜索笔记")} placeholder={uiText("搜索笔记内容…")} value={query} onChange={e => setQuery(e.target.value)}/></label>
        <div className="note-view-bar"><span>{uiText(query ? '搜索结果' : '全部笔记')} <b>{visibleNotes.length}</b></span><div role="group" aria-label={uiText("笔记展示方式")}><button title={uiText("文件树")} aria-label={uiText("文件树")} aria-pressed={noteView === 'tree'} onClick={() => changeNoteView('tree')}><Icon name="folder" size={15}/><span>{uiText("文件树")}</span></button><button title={uiText("文件列表")} aria-label={uiText("文件列表")} aria-pressed={noteView === 'list'} onClick={() => changeNoteView('list')}><Icon name="list" size={15}/><span>{uiText("列表")}</span></button></div></div>
        <nav className="note-list" onContextMenu={showContextMenu} onKeyDown={event => { if (event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey) showContextMenu(event); }} aria-label={uiText(noteView === 'tree' ? '文件树导航' : '文件列表导航')}>
          {noteView === 'tree' ? <NoteTree notes={visibleNotes} directories={directories} selected={doc?.path} collapsed={collapsedFolders} onToggle={toggleFolder} onOpen={path => void guard(() => openNote(path))} searching={!!query.trim()}/> : visibleNotes.map(n => <button key={n.path} title={n.path} data-path={n.path} className={'note-item' + (doc?.path === n.path ? ' active' : '')} onClick={() => void guard(() => openNote(n.path))}><Icon name={n.encrypted ? "lock" : "file"} size={17}/><span>{n.name}<small>{n.path.includes('/') ? n.path.slice(0, n.path.lastIndexOf('/')) : t('Markdown 笔记')}</small></span></button>)}
          {!visibleNotes.length && <div className="empty-list">{uiText(query ? '没有匹配的笔记' : '创建你的第一篇笔记')}</div>}
        </nav>
      </section>
        <section className="sidebar-panel outline" role="tabpanel" id="sidebar-outline-panel" aria-labelledby="sidebar-outline-tab" hidden={sidebarTab !== 'outline'}><div className="outline-header"><span title={doc?.path}>{doc?.path.split('/').pop()?.replace(/\.(md|markdown|pinwheel|moye)$/i, '') || t('文档大纲')}</span><small>{outline.length} {uiText("个标题")}</small></div><div className="outline-list" ref={outlineList}>{outline.map((h, i) => <button key={h.from} title={h.text} style={{ paddingLeft: 14 + (h.level - 1) * 12 }} onClick={() => editor.current?.goTo(h.from, i)} aria-current={i === activeHeading ? 'location' : undefined} className={i === activeHeading ? 'active' : ''}>{h.text || t('未命名标题')}</button>)}{!outline.length && <p>{uiText("添加标题后显示大纲")}</p>}</div></section>
      <div className="sidebar-bottom"><button onClick={importNotes} disabled={busy}><Icon name="import"/>{uiText("导入笔记")}</button><button onClick={() => setModal('settings')}><Icon name="settings"/>{uiText("设置")}</button></div>
    </aside>
    <div className="sidebar-resizer" role="separator" aria-label={uiText("调整侧栏宽度")} aria-orientation="vertical" aria-valuemin={200} aria-valuemax={Math.min(520, Math.max(200, innerWidth - 390))} aria-valuenow={sidebarWidth} tabIndex={0} onPointerDown={dragSidebar} onPointerMove={event => { if (resizing) resizeSidebar(event.clientX); }} onPointerUp={event => { if (resizing) { resizeSidebar(event.clientX, true); setResizing(false); event.currentTarget.releasePointerCapture(event.pointerId); } }} onPointerCancel={() => setResizing(false)} onDoubleClick={() => resizeSidebar(280, true)} onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); resizeSidebar(sidebarWidth + (event.key === 'ArrowRight' ? 16 : -16), true); } }}/>
    <main className="main">
      <header className="topbar"><div className="breadcrumb"><button title={uiText(sidebarHidden || focus ? "显示笔记栏" : "隐藏笔记栏")} aria-label={uiText(sidebarHidden || focus ? "显示笔记栏" : "隐藏笔记栏")} aria-expanded={!sidebarHidden && !focus} aria-controls="notebook-sidebar" onClick={toggleSidebar}><Icon name="panel" size={18}/></button><span>{workspace?.root.split(/[\\/]/).pop()}</span><span className="slash">{uiText("/")}</span><strong>{doc?.path.replace(/\.(md|markdown|pinwheel|moye)$/i, '') || t('开始写作')}</strong></div><div className="header-actions"><button className="icon-button pin-toggle" title={uiText(workspace?.settings.alwaysOnTop ? "取消保持最前" : "保持最前")} aria-label={uiText("保持最前")} aria-pressed={!!workspace?.settings.alwaysOnTop} disabled={busy || !workspace} onClick={() => void toggleAlwaysOnTop(!workspace?.settings.alwaysOnTop)}><Icon name="pin" size={17}/></button><button className="icon-button" title={uiText("专注模式")} aria-label={uiText("专注模式")} aria-pressed={focus} onClick={() => setFocus(!focus)}><Icon name="book" size={17}/></button><span className={'save-status ' + (status.includes('失败') || status.includes('修改') ? 'warning' : '')}>{status === '已保存' && <Icon name="check" size={14}/>} {uiText(status)}</span><button className="icon-button" title={uiText("历史版本")} onClick={showHistory} disabled={!doc || doc.locked}><Icon name="clock"/></button><button className="icon-button" disabled={!doc || busy} title={uiText(doc?.locked ? "解锁文档" : doc?.encrypted ? "锁定文档" : "加密文档")} aria-label={uiText(doc?.locked ? "解锁文档" : doc?.encrypted ? "锁定文档" : "加密文档")} onClick={() => { if (doc?.locked) setModal("unlock"); else if (doc?.encrypted) void lockDocument(); else setModal("encrypt"); }}><Icon name="lock"/></button><button className="export-button" disabled={!doc || doc.locked || busy} onClick={() => { setExportFormat(doc?.encrypted ? "encrypted" : "pack"); setModal("export"); }}><Icon name="export" size={16}/>{uiText("导出")}</button></div></header>
      <div className="toolbar" inert={!!doc?.locked}><EditorToolbar editor={editor} disabled={!doc || !!doc.locked} onAttach={attach} onTable={() => { const data = editor.current?.tableData(); if (data) { setTable(data); setModal('table'); } }}/><div className="mode-switch">{([['markdown', 'Markdown'], ['source', '源码']] as const).map(([m, label]) => <button key={m} className={mode === m ? 'selected' : ''} onClick={() => setMode(m)}>{uiText(label)}</button>)}</div></div>
      {error && <div className="error-banner"><span>{t(error)}</span>{status === '外部修改' || status === '保存失败' ? <><button onClick={backupCopy}>{uiText("另存副本")}</button><button onClick={() => setModal('reload')}>{uiText("载入磁盘版本")}</button></> : null}<button aria-label={uiText("关闭错误提示")} onClick={() => setError('')}>{uiText("×")}</button></div>}
      <div className={'writing-area mode-' + mode}>
        <div className="editor-column"><div ref={host} className="editor-host"/>{doc?.locked && <div className="locked-document"><span className="lock-emblem"><Icon name="lock" size={32}/></span><h1>{uiText("此文档已加密")}</h1><p>{uiText("输入你设置的密码后才能查看和编辑正文。")}</p><button className="primary" onClick={() => setModal("unlock")}>{uiText("输入密码解锁")}</button><small>{uiText("图片和附件不在加密范围内。")}</small></div>}{!doc && <div className="welcome-empty"><h1>{uiText("给想法一个地方。")}</h1><p>{uiText("创建一篇笔记，从第一行开始。")}</p><p>{uiText("在左侧笔记区右键，新建文件或文件夹。")}</p></div>}</div>

      </div>
      <footer className="statusbar"><span>{doc?.path || t('未打开笔记')}</span><span>{words.toLocaleString(appLanguage)} {uiText("字")} <span className="status-divider">{uiText("|")}</span> {appLanguage === "en" ? <>Line {cursor[0]}, column {cursor[1]}</> : <>{uiText("第")} {cursor[0]} {uiText("行，第")} {cursor[1]} {uiText("列")}</>} <span className="status-divider">{uiText("|")}</span> {uiText(doc?.encrypted ? "密码加密" : "UTF-8")}</span></footer>
    </main>
    {contextMenu && <div className="context-menu" role="menu" aria-label={uiText("笔记操作")} style={{ left: contextMenu.x, top: contextMenu.y }} onContextMenu={event => event.preventDefault()} onKeyDown={event => {
      const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')], index = items.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus(); }
    }}><div className="context-location" title={contextMenu.parent}>{contextMenu.parent || uiText('笔记库根目录')}</div><button role="menuitem" onClick={() => { setNewParent(contextMenu.parent); setName(''); setContextMenu(null); setModal('new'); }}><Icon name="file" size={16}/>{uiText("新建文件")}</button><button role="menuitem" onClick={() => { setNewParent(contextMenu.parent); setName(''); setContextMenu(null); setModal('newFolder'); }}><Icon name="folder" size={16}/>{uiText("新建文件夹")}</button>{contextMenu.path && <><div className="menu-divider"/><button role="menuitem" onClick={() => { setRenameTarget({ path: contextMenu.path, folder: contextMenu.folder }); setName(contextMenu.path.split('/').pop()!.replace(contextMenu.folder ? /$^/ : /\.(md|markdown|pinwheel|moye)$/i, '')); setContextMenu(null); setModal('rename'); }}><Icon name="rename" size={16}/>{uiText("重命名")}</button>{!contextMenu.folder && <button role="menuitem" onClick={() => void duplicateSelected(contextMenu.path)}><Icon name="copy" size={16}/>{uiText("创建副本")}</button>}</>}<div className="menu-divider"/><button role="menuitem" onClick={() => { const path = contextMenu.path; setContextMenu(null); void guard(() => call('showInFolder', { path })); }}><Icon name="folder" size={16}/>{uiText("打开文件位置")}</button><button role="menuitem" onClick={() => { const path = contextMenu.path; setContextMenu(null); void guard(async () => { await call('copyPath', { path }); setNotice('文件路径已复制。'); }); }}><Icon name="link" size={16}/>{uiText("复制文件路径")}</button></div>}
    {notice && <div className="toast"><Icon name="check"/>{t(notice)}<button onClick={() => setNotice('')}>{uiText("×")}</button></div>}
    {busy && <div className="busy-pill">{uiText("正在处理文件，请稍候…")}</div>}
    {modal && <div className="modal-shade" onMouseDown={e => { if (!busy && e.target === e.currentTarget) setModal(''); }}><section className={'modal ' + (modal === 'history' ? 'wide' : modal === 'settings' ? 'settings-modal' : '')} role="dialog" aria-modal="true" aria-label={modal}><button className="modal-close icon-button" disabled={busy} aria-label={uiText("关闭对话框")} onClick={() => setModal('')}><Icon name="close"/></button>
      {(modal === 'encrypt' || modal === 'unlock') && <><div className="eyebrow">{uiText('PRIVATE WRITING')}</div><h2>{uiText(modal === 'encrypt' ? '为文档设置密码' : '解锁文档')}</h2><p>{uiText(modal === 'encrypt' ? '正文、历史版本和恢复记录会加密保存。文件名、图片和附件不加密。密码丢失后无法找回。' : '输入此文档的密码，解锁后继续编辑。')}</p><form onSubmit={e => { e.preventDefault(); void submitPassword(); }}><label className="field">{uiText('文档密码')}<input type="password" autoComplete={modal === 'encrypt' ? 'new-password' : 'current-password'} autoFocus disabled={busy} value={password} onChange={e => setPassword(e.target.value)}/></label>{modal === 'encrypt' && <label className="field">{uiText('确认密码')}<input type="password" autoComplete="new-password" disabled={busy} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}/></label>}<p className="hint">{uiText('密码至少 8 个字符，建议使用较长且独有的密码。')}</p>{passwordError && <p className="password-error" role="alert">{t(passwordError)}</p>}<div className="modal-actions"><button type="button" disabled={busy} onClick={() => setModal('')}>{uiText('取消')}</button><button type="submit" className="primary" disabled={busy || password.length < 8 || modal === 'encrypt' && !confirmPassword}>{uiText(busy ? '正在处理…' : modal === 'encrypt' ? '加密正文' : '解锁')}</button></div></form></>}
      {modal === 'rename' && renameTarget && <><h2>{uiText("重命名")}</h2><p>{uiText("保留文档内容、历史版本和恢复记录。其他笔记中指向旧名称的链接需手动更新。")}</p><label className="field">{uiText("新名称")}<input autoFocus value={name} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && name.trim() && !busy) void renameSelected(); }}/></label><div className="modal-actions"><button disabled={busy} onClick={() => setModal('')}>{uiText("取消")}</button><button className="primary" disabled={!name.trim() || busy} onClick={renameSelected}>{uiText("确认重命名")}</button></div></>}
      {(modal === 'new' || modal === 'newFolder') && <><div className="eyebrow">{uiText("A NEW PLACE FOR YOUR IDEAS")}</div><h2>{uiText(modal === 'newFolder' ? '新建文件夹' : '新建文件')}</h2><p>{uiText(modal === 'newFolder' ? '建立一个文件夹，整理你的笔记。' : '文件以 Markdown（.md）保存。')}<br/>{uiText("位置：")}{newParent || uiText('笔记库根目录')}</p><label className="field">{uiText(modal === 'newFolder' ? '文件夹名称' : '文件名称')}<input autoFocus placeholder={uiText(modal === 'newFolder' ? '例如：学习资料' : '例如：今天的灵感')} value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && name.trim() && !busy) void create(); }}/></label><div className="modal-actions"><button onClick={() => setModal('')}>{uiText("取消")}</button><button className="primary" disabled={!name.trim() || busy} onClick={create}>{uiText(modal === 'newFolder' ? '创建文件夹' : '创建文件')}</button></div></>}

      {modal === 'settings' && <><div className="eyebrow">{uiText("MAKE IT YOURS")}</div><h2>{uiText("你的写作空间")}</h2><LanguagePanel settings={workspace?.settings || {}} onChange={applySettings} report={setError}/><div className="setting-divider"/><p>{uiText("让排版和存储方式，都合乎习惯。")}</p><label className="field">{uiText("外观主题")}</label><ThemePicker selected={theme} deleted={workspace?.settings.deletedThemes} onDelete={id => void guard(async () => applySettings(await call('deleteTheme', { id })))} onSelect={id => void guard(async () => { setTheme(id); await call('settings', { theme: id }); })}/><CustomThemesPanel settings={workspace?.settings || {}} selected={theme} onChange={applySettings} report={setError}/><div className="setting-divider"/><TypographyPanel settings={workspace?.settings || {}} onChange={applySettings} report={setError}/><div className="setting-divider"/><PetsPanel state={workspace?.settings.pets} onChange={pets => setWorkspace(w => w && { ...w, settings: { ...w.settings, pets } })} report={setError}/><div className="setting-divider"/><label className="field">{uiText("窗口")}</label><label className="integration-toggle"><span><b>{uiText("保持最前")}</b><small>{uiText("让风车笔记保持在其他普通窗口上方，重新打开后沿用此设置。")}</small></span><input type="checkbox" aria-label={uiText("保持最前")} checked={!!workspace?.settings.alwaysOnTop} disabled={busy || !workspace} onChange={event => void toggleAlwaysOnTop(event.target.checked)}/></label><div className="setting-divider"/><label className="field">{uiText("系统集成")}</label><label className="integration-toggle"><span><b>{uiText("开机自启")}</b><small>{uiText("登录电脑后自动打开风车笔记，可随时关闭。")}</small></span><input type="checkbox" aria-label={uiText("开机自启")} checked={!!integration?.openAtLogin} disabled={!integration?.supported || busy} onChange={event => { const enabled = event.target.checked, previous = !!integration?.openAtLogin; setIntegration((value: any) => ({ ...value, openAtLogin: enabled })); void guard(async () => { setBusy(true); try { setIntegration(await call('loginItem', { enabled })); } catch (error) { setIntegration((value: any) => ({ ...value, openAtLogin: previous })); throw error; } finally { setBusy(false); } }); }}/></label>{integration?.status === 'requires-approval' && <p className="hint">{uiText("请在系统设置的登录项中允许风车笔记运行。")}</p>}<button className="organize-button" disabled={!integration?.supported || busy} onClick={() => void guard(async () => { const result = await call('fileAssociation'); setNotice(result.message); })}>{uiText("设置文件打开方式")}</button><p className="hint">{uiText("支持从系统打开 Markdown、加密文档与笔记包。安装后可在系统中选择默认打开应用。")}</p><label className="field">{uiText("正文字号")} <span>{fontSize}{uiText("px")}</span><input type="range" min="13" max="26" value={fontSize} onChange={e => { const n = Number(e.target.value); setFontSize(n); void guard(() => call('settings', { fontSize: n })); }}/></label><div className="setting-divider"/><label className="field">{uiText("附件存储文件夹")}</label><div className="path-setting"><Icon name="folder"/><span>{workspace?.assetRoot}</span><button onClick={() => void guard(async () => { const dest = await call('chooseAssets'); if (dest) setWorkspace(w => w && { ...w, assetRoot: dest }); })}>{uiText("选择文件夹")}</button></div><p className="hint">{uiText("粘贴、拖入或插入的图片和文件会自动复制到这里。更改目录只影响新附件；已有文件保留原位置。")}</p><button className="organize-button" disabled={!doc || doc.locked || busy} onClick={() => void guard(async () => { const target = current.current?.path; if (!target) return; setBusy(true); try { const result = await call('organizeAssets', { path: target, text: draft.current }); if (current.current?.path === target) { editor.current?.replace(result.text); setNotice(`已整理 ${result.count} 个附件引用，原文件保留。`); } } finally { setBusy(false); } })}>{uiText("将本篇附件整理到当前文件夹")}</button><label className="field">{uiText("笔记文件夹")}</label><div className="path-text">{workspace?.root}</div><p className="hint">{uiText("保存采用 UTF-8。支持内置主题和可自定义字体、背景的主题 JSON。发行目录中提供主题模板与制作指南；本篇附件整理可撤销。")}</p></>}
      {modal === 'export' && <><div className="eyebrow">{uiText("TAKE YOUR WORDS WITH YOU")}</div><h2>{uiText("把笔记带走")}</h2><p>{uiText("选择可以继续编辑的笔记包，或适合阅读的文档。")}</p><div className="export-options">{(doc?.encrypted ? [['encrypted', '加密文档 .pinwheel', '保留密码加密，仅导出正文']] : [['pack','笔记包 .notepack','正文与附件，可导入后继续编辑'],['html','网页 .html','图片与公式内嵌，便于离线阅读'],['pdf','PDF 文档','A4 纸张，适合打印与分享'],['markdown','Markdown .md','仅正文，不包含附件文件']]).map(([v, title, desc]) => <label key={v} className={exportFormat === v ? 'chosen' : ''}><input type="radio" checked={exportFormat === v} onChange={() => setExportFormat(v)}/><span><b>{uiText(title)}</b><small>{uiText(desc)}</small></span></label>)}</div>{exportFormat === 'pack' && <label className="check-label"><input type="checkbox" checked={exportAll} onChange={e => setExportAll(e.target.checked)}/>{uiText("包含整个笔记库（默认仅当前笔记及关联笔记）")}</label>}<p className="hint">{uiText(doc?.encrypted ? "接收者导入风车笔记后，仍需输入此文档密码。图片和附件需单独传递。" : "网络图片不自动下载。HTML/PDF 中图表暂保留源码；笔记包完整保留 Markdown。已加密的笔记需单独导出密文。")}</p><div className="modal-actions"><button onClick={() => setModal('')}>{uiText("取消")}</button><button className="primary" disabled={busy} onClick={() => void guard(async () => { if (!doc || !(await save())) return; setBusy(true); try { const r = await call('export', { path: doc.path, text: draft.current, format: exportFormat, all: exportAll }); if (r) { setModal(''); setNotice('导出完成。' + (r.warning || '')); } } finally { setBusy(false); } })}>{uiText("导出")}</button></div></>}
      {modal === 'table' && table && <><div className="eyebrow">{uiText("A LITTLE STRUCTURE")}</div><h2>{uiText("编辑表格")}</h2><p>{uiText("第一行为表头，单元格中可使用 Markdown。更改作为一次操作提交，可撤销。")}</p><div className="table-form"><table><tbody>{table.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c}><input aria-label={t(`第${r + 1}行第${c + 1}列`)} value={cell} onChange={e => setTable(t => t && { ...t, rows: t.rows.map((row, i) => i === r ? row.map((v, j) => j === c ? e.target.value : v) : row) })}/></td>)}<td>{r > 0 && <button title={uiText("删除行")} onClick={() => setTable(t => t && { ...t, rows: t.rows.filter((_, i) => i !== r) })}>{uiText("×")}</button>}</td></tr>)}</tbody></table></div><div className="table-actions"><button onClick={() => setTable(t => t && { ...t, rows: [...t.rows, t.rows[0].map(() => '')] })}>{uiText("+ 添加行")}</button><button onClick={() => setTable(t => t && { ...t, rows: t.rows.map(row => [...row, '']), align: [...t.align, null] })}>{uiText("+ 添加列")}</button><button disabled={table.rows[0].length < 2} onClick={() => setTable(t => t && { ...t, rows: t.rows.map(row => row.slice(0, -1)), align: t.align.slice(0, -1) })}>{uiText("删除末列")}</button></div><div className="modal-actions"><button onClick={() => setModal('')}>{uiText("取消")}</button><button className="primary" onClick={() => { editor.current?.applyTable(table); setModal(''); }}>{uiText("应用表格")}</button></div></>}
      {modal === 'history' && <><div className="eyebrow">{uiText("LOCAL HISTORY")}</div><h2>{uiText("找回之前的文字")}</h2><p>{uiText("保留最近 30 次保存前的版本。恢复内容仍可撤销。")}</p><div className="history-layout"><div>{versions.map(v => <button key={v.id} onClick={() => void guard(async () => setHistoryText(await call('historyRead', { path: doc?.path, id: v.id })))}>{new Date(v.at).toLocaleString('zh-CN')}</button>)}{!versions.length && <p>{uiText("还没有历史版本。")}</p>}</div><pre>{historyText ?? uiText('选择一个版本查看内容')}</pre></div><div className="modal-actions"><button onClick={() => setModal('')}>{uiText("关闭")}</button><button className="primary" disabled={historyText === null} onClick={() => { if (historyText !== null) editor.current?.replace(historyText.replace(/^\uFEFF/, '')); setModal(''); }}>{uiText("恢复此版本")}</button></div></>}
      {modal === 'recovery' && <><h2>{uiText("发现未完成的编辑")}</h2><p>{uiText("上次退出前的恢复记录与当前文件不同，请选择需要保留的内容。")}</p><pre className="recovery-preview">{historyText}</pre><div className="modal-actions"><button onClick={() => setModal('')}>{uiText("暂不恢复")}</button><button className="primary" onClick={() => { if (historyText !== null) editor.current?.replace(historyText); setModal(''); }}>{uiText("恢复编辑")}</button></div></>}
      {modal === 'reload' && <><h2>{uiText("载入磁盘版本？")}</h2><p>{uiText("当前编辑会被磁盘内容替换。建议先另存副本；替换后仍可在编辑器撤销。")}</p><div className="modal-actions"><button onClick={() => setModal('')}>{uiText("取消")}</button><button className="primary" onClick={() => { setModal(''); void reloadDisk(); }}>{uiText("载入磁盘版本")}</button></div></>}
      {modal === 'closeFailed' && <><h2>{uiText("笔记尚未保存成功")}</h2><p>{uiText("关闭前请处理保存错误，或先将当前编辑另存副本。")}</p><div className="modal-actions"><button onClick={() => setModal('')}>{uiText("继续编辑")}</button><button className="primary" onClick={() => { setModal(''); void backupCopy(); }}>{uiText("另存副本")}</button></div></>}
    </section></div>}
  </div></ThemeUIContext.Provider>;
}
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has('pet') ? <PetDesktop/> : <App/>);


