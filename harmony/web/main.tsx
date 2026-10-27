import { t, useLanguage, setLanguage, getLanguage, brandName } from '../../src/i18n';
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { NoteEditor, type Mode } from '../../src/editor';
import { EditorToolbar } from '../../src/editor-toolbar';
import { NoteTree } from '../../src/note-browser';
import { Icon, ThemeUIContext, uiLabel } from '../../src/ui';
import { builtInThemes } from '../../shared/themes.mjs';
import { backgroundStyle, validateTheme, themeTemplate } from '../../shared/theme-format.mjs';
import { headings, renderMarkdown } from '../../shared/markdown.mjs';
import { MobileStore, encode, decode, bytes64, resolvePath } from './store.mjs';
import { native } from './bridge';
import 'katex/dist/katex.min.css';
import '../../src/style.css';
import '../../src/highlight.css';
import '../../src/sidebar.css';
import '../../src/editor-toolbar.css';
import './mobile.css';

type Doc = { path: string; text: string; hash: string; encrypted: boolean; locked: boolean };
type Picked = { name: string; data: string };
const store = new MobileStore(native);
function App() {
  const appLanguage = useLanguage();
  useEffect(() => { document.documentElement.lang = appLanguage; document.title = brandName(); editor.current?.updateLanguage?.(); }, [appLanguage]);
  const [catalog, setCatalog] = useState<{ notes: any[]; directories: string[] }>({ notes: [], directories: [] });
  const [settings, setSettings] = useState<any>(store.settings), [doc, setDoc] = useState<Doc | null>(null), [text, setText] = useState('');
  const [mode, setMode] = useState<Mode>('markdown'), [drawer, setDrawer] = useState(false), [tab, setTab] = useState('notes'), [filter, setFilter] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set()), [activeHeading, setActiveHeading] = useState(-1), [modal, setModal] = useState('');
  const [name, setName] = useState(''), [password, setPassword] = useState(''), [repeat, setRepeat] = useState(''), [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('正在打开…'), [fonts, setFonts] = useState<string[]>([]), [assetFolder, setAssetFolder] = useState('attachments'), [trash, setTrash] = useState<any[]>([]);
  const host = useRef<HTMLDivElement>(null), editor = useRef<NoteEditor | null>(null), current = useRef<Doc | null>(null), draft = useRef('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null), sessionTimer = useRef<ReturnType<typeof setTimeout> | null>(null), saveJob = useRef<Promise<void> | null>(null), assets = useRef(new Map<string, string>());
  const modeRef = useRef<Mode>('markdown'), ready = useRef(false), suspending = useRef(false), dead = useRef(false), switching = useRef(false);
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const navigation = useRef({ drawer, modal }); navigation.current = { drawer, modal };
  const selected = [...builtInThemes, ...(settings.customThemes || [])].find(t => t.id === settings.theme) || builtInThemes[0];
  const label = (value: string) => uiLabel(selected.ui, value);
  const report = (e: unknown) => { if (!dead.current) { setError(e instanceof Error ? e.message : String(e)); } };
  const prefs = async (patch: any) => { await store.preferences(patch); setLanguage(store.settings.language || "system", store.settings.systemLanguage || navigator.language); await native("language", { language: getLanguage() }); setSettings({ ...store.settings }); };
  const refresh = async () => { setCatalog(await store.catalog()); };
  const flush = async (): Promise<void> => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (saveJob.current) await saveJob.current;
    const run = async () => {
      while (current.current && !current.current.locked && current.current.text !== draft.current) {
        const document = current.current, value = draft.current;
        setStatus('正在保存…'); await store.save(document, value);
        if (current.current !== document) break;
      }
      setStatus('已保存');
    };
    const job = run(); saveJob.current = job;
    try { await job; } catch (error) { setStatus('保存失败'); throw error; } finally { if (saveJob.current === job) saveJob.current = null; }
  };
  const persistView = async () => {
    if (sessionTimer.current) clearTimeout(sessionTimer.current);
    if (!ready.current) return;
    const path = current.current?.path, views: Record<string, any> = { ...store.settings.views };
    if (path && editor.current) { delete views[path]; views[path] = editor.current.captureSession(); }
    const keys = Object.keys(views); while (keys.length > 100) delete views[keys.shift()!];
    await prefs({ lastPath: path || store.settings.lastPath, mode: modeRef.current, views });
  };
  const changed = (value: string) => {
    draft.current = value; setText(value); setStatus('未保存');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flush().catch(report), 450);
  };
  const teardown = () => { editor.current?.destroy(); editor.current = null; assets.current.clear(); };
  const install = async (document: Doc) => {
    const images = document.locked ? new Map<string, string>() : await store.images(document.path, document.text);
    teardown(); current.current = document; draft.current = document.text; assets.current = images; setDoc({ ...document }); setText(document.text); setActiveHeading(-1);
    if (!document.locked && host.current) {
      editor.current = new NoteEditor(host.current, document.path, document.text, modeRef.current, changed, () => {}, files => void attachFiles(files).catch(report), url => void follow(url).catch(report), () => void flush().catch(report), setActiveHeading, url => assets.current.get(url) || '');
      const view = (store.settings.views as Record<string, any>)?.[document.path]; if (view) editor.current.restoreSession({ ...view, mode: modeRef.current });
    }
    setStatus('已保存');
  };
  const open = async (path: string, secret?: string) => {
    await flush(); await persistView(); const document = await store.open(path, secret); await install(document as Doc); await prefs({ lastPath: path }); setDrawer(false);
  };
  const act = async (fn: () => Promise<void>) => {
    if (switching.current) return; switching.current = true; setBusy(true); setError('');
    try { await fn(); } catch (error) { report(error); } finally { switching.current = false; setBusy(false); }
  };
  const attachPicked = async (items: Picked[]) => {
    const document = current.current; if (!document || document.locked) return;
    for (const picked of items) {
      const attachment = await store.attachment(document.path, picked), name = picked.name.replace(/[\[\]\\\r\n]/g, '_');
      if (attachment.image) { const imageMap = await store.images(document.path, `![](<${attachment.url}>)`); for (const [url, value] of imageMap) assets.current.set(url, value); }
      editor.current?.insert(`${attachment.image ? '!' : ''}[${name}](<${attachment.url}>)`);
    }
    await flush();
  };
  const attachFiles = async (files: File[]) => { await attachPicked(await Promise.all(files.map(async file => ({ name: file.name, data: bytes64(new Uint8Array(await file.arrayBuffer())) })))); };
  const attach = () => void act(async () => attachPicked(await native<Picked[]>('pick', { kind: 'attachments' })));
  const follow = async (url: string) => {
    if (url.startsWith('#')) { const wanted = decodeURIComponent(url.slice(1)); const heading = headings(draft.current).find(h => h.text === wanted); if (heading) editor.current?.goTo(heading.from); return; }
    if (/^https?:|^mailto:/i.test(url)) { await native('openLink', { url }); return; }
    const path = resolvePath(current.current!.path, url);
    if (/\.(md|markdown|pinwheel|moye)$/i.test(path)) await act(() => open(path));
    else { const data = await native<string>('read', { path }); await native('export', { name: path.split('/').at(-1), data }); }
  };
  const importNotes = () => void act(async () => {
    await flush(); const picked = await native<Picked[]>('pick', { kind: 'notes' }); let first = '';
    for (const item of picked) { const path = /\.notepack$/i.test(item.name) ? await store.importPack(item.data) : await store.importMarkdown(item); first ||= path; }
    await refresh(); if (first) await open(first); setModal('');
  });
  const exportNote = (kind: 'markdown' | 'pack' | 'html', all = false) => void act(async () => {
    await flush(); const document = current.current; if (!document) return;
    const base = document.path.split('/').at(-1)!.replace(/\.(md|markdown|pinwheel|moye)$/i, ''); let data: string, name: string;
    if (document.encrypted) { if (kind !== 'markdown') throw Error('加密笔记只能导出加密文档。'); data = await native('read', { path: document.path }); name = base + '.pinwheel'; }
    else if (kind === 'pack') { data = await store.exportPack(all ? catalog.notes.map(n => n.path) : [document.path]); name = (all ? '风车笔记笔记' : base) + '.notepack'; }
    else if (kind === 'html') { const images = await store.images(document.path, draft.current), content = renderMarkdown(draft.current, (url: string, type: string) => type === 'image' ? images.get(url) || '' : /^(https?:|mailto:|#)/i.test(url) ? url : ''); data = encode('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>风车笔记导出</title><style>body{font:17px/1.8 sans-serif;max-width:850px;padding:32px;margin:auto;overflow-wrap:anywhere}img,svg{max-width:100%}pre{white-space:pre-wrap;background:#f3f4f6;padding:16px}.katex-html{display:none}.katex-display{display:block;text-align:center;margin:1em 0}.katex-mathml math{font-size:1.1em}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:8px}</style><body>' + content + '</body></html>'); name = base + '.html'; }
    else { data = await native('read', { path: document.path }); name = base + '.md'; }
    await native('export', { name, data }); setModal('');
  });
  const closeModal = () => { if (switching.current) return; setModal(''); setPassword(''); setRepeat(''); };
  const show = (value: string, path = current.current?.path || '') => { setError(''); setTarget(path); setName(''); setPassword(''); setRepeat(''); setModal(value); };
  useEffect(() => {
    void act(async () => {
      const files = await store.init(); store.settings.systemLanguage = await native<string>("locale"); setLanguage(store.settings.language || "system", store.settings.systemLanguage); await native("language", { language: store.settings.language === "zh-CN" || store.settings.language === "system" && /^zh(?:-CN|-SG|-Hans|$)/i.test(store.settings.systemLanguage) ? "zh-CN" : "en" }); setCatalog(files); setSettings({ ...store.settings }); setAssetFolder(store.settings.assetFolder); setCollapsed(new Set(store.settings.collapsed));
      const savedMode = store.settings.mode === 'source' ? 'source' : 'markdown'; modeRef.current = savedMode; setMode(savedMode);
      setFonts(await native<string[]>('fonts').catch(() => []));
      const first = files.notes.find(n => n.path === store.settings.lastPath)?.path || files.notes[0]?.path;
      if (first) await install(await store.open(first) as Doc); else setStatus('已就绪'); ready.current = true;
    });
    const scheduleView = () => { if (sessionTimer.current) clearTimeout(sessionTimer.current); sessionTimer.current = setTimeout(() => void persistView().catch(report), 700); };
    const viewport = () => document.documentElement.style.setProperty('--mobile-height', (window.visualViewport?.height || innerHeight) + 'px'); viewport(); window.visualViewport?.addEventListener('resize', viewport);
    document.addEventListener('scroll', scheduleView, true); document.addEventListener('selectionchange', scheduleView);
    const suspend = async () => {
      if (suspending.current) return; suspending.current = true;
      try { await flush(); await persistView(); await store.lockAll(); if (current.current?.encrypted) await install({ ...current.current, text: '', locked: true }); }
      catch (error) { report(error); } finally { suspending.current = false; }
    };
    window.pinwheelSuspend = () => void suspend(); window.pinwheelResume = () => { if (current.current?.encrypted && !current.current.locked) void suspend(); };
    const onVisibility = () => { if (document.hidden) void suspend(); }; document.addEventListener('visibilitychange', onVisibility);
    const tapLink = (event: MouseEvent) => { const a = (event.target as HTMLElement).closest<HTMLAnchorElement>('.rich-editor a'); if (a && !event.ctrlKey && !event.metaKey) { event.preventDefault(); event.stopPropagation(); void follow(a.getAttribute('href') || '').catch(report); } };
    host.current?.addEventListener('click', tapLink, true);
    window.pinwheelBack = () => { if (switching.current) return; if (document.querySelector('dialog[open]')) (document.querySelector('dialog[open]') as HTMLDialogElement).close(); else if (navigation.current.modal) closeModal(); else if (navigation.current.drawer) setDrawer(false); else void act(async () => { await flush(); await persistView(); await native('background'); }); };
    return () => { dead.current = true; teardown(); host.current?.removeEventListener('click', tapLink, true); window.visualViewport?.removeEventListener('resize', viewport); document.removeEventListener('scroll', scheduleView, true); document.removeEventListener('selectionchange', scheduleView); document.removeEventListener('visibilitychange', onVisibility); delete window.pinwheelSuspend; delete window.pinwheelResume; delete window.pinwheelBack; };
  }, []);
  useEffect(() => {
    const root = document.documentElement; root.dataset.theme = selected.id; root.dataset.colorScheme = selected.colorScheme;
    root.style.colorScheme = selected.colorScheme;
    for (const [key, value] of Object.entries(selected.tokens)) root.style.setProperty('--' + key, String(value));
    const bg = backgroundStyle(selected.background); root.style.setProperty('--mobile-canvas', bg.image); root.style.setProperty('--mobile-canvas-size', bg.size); root.style.setProperty('--mobile-canvas-opacity', bg.opacity);
    const generic = selected.typography?.body === 'serif' ? 'serif' : selected.typography?.body === 'mono' ? 'monospace' : 'system-ui,sans-serif'; const font = String(settings.font || '').replace(/["\\\x00-\x1f]/g, ''); root.style.setProperty('--editor-font', font ? '"' + font + '",system-ui,sans-serif' : generic); root.style.setProperty('--editor-size', Math.max(13, Math.min(28, settings.fontSize || 17)) + 'px');
  }, [selected, settings.font, settings.fontSize]);
  const outline = doc?.locked ? [] : headings(text), notes = catalog.notes.filter(n => n.path.toLowerCase().includes(filter.toLowerCase()));
  const context = (event: React.MouseEvent) => { event.preventDefault(); const item = (event.target as HTMLElement).closest<HTMLElement>('[data-path]'); show('actions', item?.dataset.path || ''); };
  const chooseMode = (value: Mode) => { void act(async () => { const document = current.current; if (value === 'markdown' && document && !document.locked) assets.current = await store.images(document.path, draft.current); editor.current?.setMode(value); modeRef.current = value; setMode(value); await persistView(); }); };
  return <ThemeUIContext.Provider value={selected.ui || {}}><div className="mobile-root">
    {drawer && <button className="drawer-shade" aria-label={t("关闭笔记栏")} onClick={() => setDrawer(false)}/>}
    <aside className={'mobile-sidebar ' + (drawer ? 'open' : '')} aria-label={t("笔记导航")}>
      <div className="mobile-brand"><Icon name="brand" size={26}/><strong>{label('风车笔记')}</strong><button aria-label={t("笔记操作")} onClick={() => show('actions', '')}><Icon name="plus"/></button></div>
      <div className="mobile-tabs" role="tablist"><button role="tab" aria-selected={tab === 'notes'} onClick={() => setTab('notes')}>{label('笔记')}</button><button role="tab" aria-selected={tab === 'outline'} onClick={() => setTab('outline')}>{label('大纲')}</button></div>
      {tab === 'notes' ? <><div className="mobile-filter"><Icon name="search" size={17}/><input aria-label={t("筛选笔记")} placeholder={t("筛选笔记…")} value={filter} onChange={e => setFilter(e.target.value)}/><button aria-label={t("切换文件树或列表")} onClick={() => void prefs({ noteView: settings.noteView === 'tree' ? 'list' : 'tree' }).catch(report)}><Icon name="list"/></button></div><div className="mobile-note-list" onContextMenu={context}>{settings.noteView === 'tree' ? <NoteTree notes={notes} directories={catalog.directories} selected={doc?.path} collapsed={collapsed} searching={!!filter} onToggle={path => { const next = new Set(collapsed); if (next.has(path)) next.delete(path); else next.add(path); setCollapsed(next); void prefs({ collapsed: [...next] }).catch(report); }} onOpen={path => void act(() => open(path))}/> : notes.map(note => <button className={'mobile-note ' + (note.path === doc?.path ? 'chosen' : '')} key={note.path} data-path={note.path} onClick={() => void act(() => open(note.path))}><Icon name={note.encrypted ? 'lock' : 'file'}/><span><b>{note.name}</b><small>{note.path}</small></span></button>)}{!notes.length && <div className="mobile-empty-list">{t("还没有笔记")}<br/>{t("点击上方 ＋ 创建，或导入已有笔记。")}</div>}</div></> : <div className="mobile-note-list mobile-outline">{outline.map((heading, index) => <button key={index} aria-current={activeHeading === index ? 'location' : undefined} style={{ paddingLeft: 16 + (heading.level - 1) * 14 }} onClick={() => { editor.current?.goTo(heading.from, index); setDrawer(false); }}>{heading.text || t('未命名标题')}</button>)}{!outline.length && <p>{t("使用标题组织你的想法。")}</p>}</div>}
      <div className="mobile-sidebar-bottom"><button disabled={busy} onClick={importNotes}><Icon name="import"/>{label('导入笔记')}</button><button onClick={() => show('settings')}><Icon name="settings"/>{label('设置')}</button></div>
    </aside>
    <main className="mobile-main"><header className="mobile-topbar"><button aria-label={t("显示笔记栏")} onClick={() => setDrawer(v => !v)}><Icon name="panel"/></button><div className="mobile-document-title"><strong>{doc?.path.split('/').at(-1)?.replace(/\.(md|markdown|pinwheel|moye)$/i, '') || t('给想法一个地方')}</strong><small role="status">{t(status)}</small></div><button aria-label={t("笔记菜单")} onClick={() => show('actions')}><span className="dots">•••</span></button></header>
      <div className="mobile-mode" role="group" aria-label={t("编辑模式")}><button disabled={busy} aria-pressed={mode === 'markdown'} onClick={() => chooseMode('markdown')}>Markdown</button><button disabled={busy} aria-pressed={mode === 'source'} onClick={() => chooseMode('source')}>{label('源码')}</button><button className="mobile-export" disabled={!doc || busy} onClick={() => show('export')}><Icon name="export" size={16}/>{label('导出')}</button></div>
      {error && !modal && <div className="mobile-error" role="alert"><span>{t(error)}</span><button onClick={() => setError('')} aria-label={t("关闭提示")}>×</button>{status === '保存失败' && <button onClick={() => void act(flush)}>{t("重试保存")}</button>}</div>}
      <div className="mobile-writing"><div className="editor-host" ref={host} inert={busy || !!doc?.locked}/>{doc?.locked && <div className="mobile-empty"><Icon name="lock" size={38}/><h1>{t("此文档已加密")}</h1><p>{t("输入密码后查看和编辑正文。")}</p><button className="primary" onClick={() => show('unlock')}>{t("解锁文档")}</button></div>}{!doc && <div className="mobile-empty"><Icon name="book" size={38}/><h1>{t("从第一行开始。")}</h1><p>{t("打开笔记栏创建笔记，")}<br/>{t("也可以导入电脑上的笔记包。")}</p><button className="primary" disabled={busy} onClick={importNotes}>{t("导入笔记")}</button></div>}</div>
      <div className="mobile-toolbar"><EditorToolbar editor={editor} disabled={!doc || !!doc.locked || busy} onAttach={attach} onTable={() => editor.current?.insert('\n| 项目 | 内容 |\n| --- | --- |\n|  |  |\n')}/></div>
    </main>
    {modal && <div className="mobile-modal-shade" onClick={event => { if (event.target === event.currentTarget) closeModal(); }}><section className="mobile-sheet" role="dialog" aria-modal="true" aria-label={modal === 'settings' ? t('设置') : t('笔记操作')}><div className="mobile-sheet-heading"><h2>{t(({ actions:'笔记操作', settings:'你的写作空间', create:'新建笔记', folder:'新建文件夹', rename:'重命名', trash:'移到回收站', encrypt:'设置文档密码', unlock:'解锁文档', export:'导出笔记', recycle:'回收站' } as any)[modal] || '风车笔记')}</h2><button aria-label={t("关闭对话框")} disabled={busy} onClick={closeModal}><Icon name="close"/></button></div>
      {modal === 'actions' && <div className="mobile-action-list"><button disabled={busy} onClick={() => { setName(''); setModal('create'); }}><Icon name="plus"/>{t("新建文件")}</button><button disabled={busy} onClick={() => { setName(''); setModal('folder'); }}><Icon name="folder"/>{t("新建文件夹")}</button>{target && <><div className="mobile-action-target">{target}</div><button disabled={busy} onClick={() => { setName(target.split('/').at(-1)!); setModal('rename'); }}><Icon name="rename"/>{t("重命名")}</button>{catalog.notes.some(n => n.path === target) && <button disabled={busy} onClick={() => void act(async () => { await flush(); const path = await store.duplicate(target); await refresh(); await open(path); setModal(''); })}><Icon name="copy"/>{t("创建副本")}</button>}<button disabled={busy} onClick={() => { setModal('trash'); }}><Icon name="folder"/>{t("移到回收站")}</button></>}{doc && <><button disabled={busy} onClick={() => setModal('export')}><Icon name="export"/>{t("导出当前笔记")}</button><button disabled={busy} onClick={() => { if (doc.encrypted && !doc.locked) void act(async () => { await flush(); await persistView(); await store.lockAll(); await install(await store.open(doc.path) as Doc); setModal(''); }); else { setPassword(''); setRepeat(''); setModal(doc.encrypted ? 'unlock' : 'encrypt'); } }}><Icon name="lock"/>{doc.locked ? t('解锁文档') : doc.encrypted ? t('锁定文档') : t('加密文档')}</button></>}<button onClick={() => setModal('settings')}><Icon name="settings"/>{t("设置")}</button></div>}
      {['create', 'folder', 'rename'].includes(modal) && <form onSubmit={e => { e.preventDefault(); void act(async () => { await flush(); const parent = catalog.directories.includes(target) ? target : target.includes('/') ? target.slice(0, target.lastIndexOf('/')) : ''; if (modal === 'rename') { const active = current.current?.path; const path = await store.rename(target, name); await refresh(); if (active === target || active?.startsWith(target + '/')) await open(path + active.slice(target.length)); } else { const path = (parent ? parent + '/' : '') + name; await store.create(path, modal === 'folder'); await refresh(); if (modal === 'create') await open(/\.(md|markdown|pinwheel|moye)$/i.test(path) ? path : path + '.md'); } setModal(''); }); }}><label>{t("名称")}<input aria-label={t("名称")} autoFocus value={name} maxLength={120} onChange={e => setName(e.target.value)}/></label><p>{t("名称使用单独的文件名，不含 / 或 \\。")}</p><button className="primary" disabled={busy || !name.trim()}>{t("确定")}</button></form>}
      {modal === 'trash' && <><p>{t("将“")}{target}{t("”移到回收站？文件会保留在应用回收目录。")}</p><button className="primary" disabled={busy} onClick={() => void act(async () => { await flush(); await store.trash(target); if (current.current?.path === target || current.current?.path.startsWith(target + '/')) { teardown(); current.current = null; draft.current = ''; setDoc(null); setText(''); } await refresh(); setModal(''); })}>{t("移到回收站")}</button></>}
      {(modal === 'encrypt' || modal === 'unlock') && <form onSubmit={e => { e.preventDefault(); void act(async () => { if (modal === 'encrypt') { if (password !== repeat) throw Error('两次输入的密码不同。'); await flush(); await store.encrypt(current.current, password); await install({ ...current.current! }); await refresh(); } else await open(current.current!.path, password); setPassword(''); setRepeat(''); setModal(''); }); }}><p>{modal === 'encrypt' ? t('仅加密文档正文。图片、附件和文件名不加密。密码丢失无法找回。') : t('使用此文档原来的密码。')}</p><label>{t("密码")}<input type="password" aria-label={t("密码")} autoFocus autoComplete="off" value={password} onChange={e => setPassword(e.target.value)}/></label>{modal === 'encrypt' && <label>{t("确认密码")}<input type="password" aria-label={t("确认密码")} autoComplete="off" value={repeat} onChange={e => setRepeat(e.target.value)}/></label>}<button className="primary" disabled={busy || password.length < 8}>{busy ? t('正在处理…') : modal === 'encrypt' ? t('加密正文') : t('解锁')}</button></form>}
      {modal === 'export' && <div className="mobile-action-list"><p>{t("选择保存位置后导出。笔记包包含图片和附件，可导入桌面版或其他人的风车笔记。")}</p><button disabled={busy} onClick={() => exportNote('markdown')}><Icon name="file"/>{doc?.encrypted ? t('加密文档 .pinwheel') : 'Markdown .md'}</button>{!doc?.encrypted && <><button disabled={busy} onClick={() => exportNote('pack')}><Icon name="export"/>{t("本篇笔记包（含附件）")}</button><button disabled={busy} onClick={() => exportNote('pack', true)}><Icon name="folder"/>{t("全部笔记包（含附件）")}</button><button disabled={busy} onClick={() => exportNote('html')}><Icon name="code"/>{t("HTML（图片内嵌）")}</button><p>{t("单篇附件上限 20MB，笔记包总内容上限 32MB。")}</p></>}</div>}
      {modal === 'settings' && <><p>{t("主题、排版与存储，都合乎习惯。")}</p><h3>{t("应用语言")}</h3><label>{t("应用语言")}<select aria-label={t("应用语言")} value={settings.language || "system"} onChange={e => void prefs({ language: e.target.value }).catch(report)}><option value="system">{t("跟随系统")}</option><option value="zh-CN">简体中文</option><option value="en">English</option></select></label><p>{t("默认跟随系统语言，不支持的系统语言使用英语。")}</p><h3>{t("外观主题")}</h3><div className="mobile-theme-grid">{[...builtInThemes, ...(settings.customThemes || [])].filter(t => !settings.deletedThemes?.includes(t.id)).map(preset => <div className="mobile-theme-cell" key={preset.id}><button aria-label={(preset.id.startsWith('custom:') ? preset.name : t(preset.name))} aria-pressed={settings.theme === preset.id} style={{ background: preset.tokens.bg, color: preset.tokens.text, borderColor: settings.theme === preset.id ? preset.tokens.accent : preset.tokens.border }} onClick={() => void prefs({ theme: preset.id }).catch(report)}><span style={{ color: preset.tokens.accent }}>{t("Aa 文")}</span><b>{(preset.id.startsWith('custom:') ? preset.name : t(preset.name))}</b></button>{preset.id !== 'simple' && <button className="theme-remove" aria-label={t('删除主题 ' + preset.name)} onClick={() => void prefs({ deletedThemes: [...settings.deletedThemes, preset.id], theme: settings.theme === preset.id ? 'simple' : settings.theme }).catch(report)}>×</button>}</div>)}</div><div className="mobile-setting-buttons"><button disabled={busy} onClick={() => void act(async () => { const picked = await native<Picked[]>('pick', { kind: 'theme' }); if (!picked[0]) return; const theme = validateTheme(JSON.parse(decode(picked[0].data))), id = 'custom:' + Date.now(); await prefs({ customThemes: [...settings.customThemes, { ...theme, id }], theme: id }); })}>{t("导入主题 JSON")}</button><button disabled={busy} onClick={() => void act(async () => { await native('export', { name: '风车笔记主题模板.json', data: encode(JSON.stringify(themeTemplate(selected), null, 2)) }); })}>{t("导出主题模板")}</button><button onClick={() => void prefs({ deletedThemes: [] }).catch(report)}>{t("恢复主题")}</button></div><h3>{t("文字排版")}</h3><label>{t("系统字体")}<select aria-label={t("系统字体")} value={settings.font} onChange={e => void prefs({ font: e.target.value }).catch(report)}><option value="">{t("跟随系统")}</option>{fonts.map(font => <option key={font} value={font}>{font}</option>)}</select></label><p>{t("优先使用选定的系统字体；缺少的字符由系统默认字体补充。不建立字体库。")}</p><label>{t("正文字号 · ")}{settings.fontSize}px<input aria-label={t("正文字号")} type="range" min="13" max="28" value={settings.fontSize} onChange={e => void prefs({ fontSize: Number(e.target.value) }).catch(report)}/></label><h3>{t("附件文件夹")}</h3><form onSubmit={e => { e.preventDefault(); void act(async () => { await prefs({ assetFolder }); }); }}><label>{t("笔记库内的文件夹")}<input aria-label={t("附件文件夹")} value={assetFolder} onChange={e => setAssetFolder(e.target.value)}/></label><button disabled={busy}>{t("保存附件目录")}</button></form><p>{t("新插入的图片和附件自动归档。已有附件保留原位置。笔记库保存在应用文件目录，可通过笔记包迁移。")}</p><h3>{t("数据与隐私")}</h3><button disabled={busy} onClick={() => void act(async () => { setTrash(await store.trashEntries()); setModal('recycle'); })}>{t("打开回收站")}</button><p>{t("正文使用 UTF-8 保存。加密文档切到后台后自动锁定。删除的文档保留在应用回收目录；卸载应用会清除应用数据，请先导出笔记包。")}</p></>}
      {error && <p className="mobile-sheet-error" role="alert">{t(error)}</p>}
      {modal === 'recycle' && <div className="mobile-action-list"><p>{t("恢复到原位置；同名文件已存在时会停止，不覆盖原文档。")}</p>{trash.map(item => <button key={item.path} disabled={busy} onClick={() => void act(async () => { const path = await store.restoreTrash(item.path); await refresh(); await open(path); setModal(''); })}><Icon name="file"/>{item.original}<small>{t("恢复")}</small></button>)}{!trash.length && <p>{t("回收站是空的。")}</p>}</div>}
      {busy && <p role="status">{t("正在处理，请稍候…")}</p>}
    </section></div>}
  </div></ThemeUIContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<App/>);
