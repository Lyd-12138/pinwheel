import { t, setLanguage, getLanguage, brandName, validLanguagePreference } from '../shared/i18n.mjs';
import { migrateLegacyData } from './migration.mjs';
import { localizedOptions } from './localized-ui.mjs';
import { app, BrowserWindow, ipcMain, dialog, protocol, shell, net, nativeTheme, clipboard, Menu } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { NotebookStore, atomicWrite, hash, inside, validateName } from './store.mjs';
import { renderMarkdown, isRemote, references, rewriteLinks, splitUrl } from '../shared/markdown.mjs';

import { builtInThemes } from '../shared/themes.mjs';
import { validateTheme, themeTemplate } from '../shared/theme-format.mjs';
import { encrypted, header, seal } from './encryption.mjs';
import { systemIntegration } from './system-integration.mjs';
import { desktopPets } from './pets.mjs';
import { validateFont, fontStack, migrateThemes, removeTheme } from '../shared/preferences.mjs';
import { validateSession } from '../shared/session.mjs';
import { installedFonts } from './fonts.mjs';
import { readFileBounded } from './safe-io.mjs';
import { externalUrl, mayOpenAttachment, secureWindow, trustedRenderer } from './security-policy.mjs';
const MAX_NOTE_BYTES=21*1024*1024;

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.dirname(here);
if (process.env.MOYE_TEST_DATA) app.setPath('userData', path.resolve(process.env.MOYE_TEST_DATA));
const previousUserData = process.env.MOYE_TEST_DATA ? path.resolve(process.env.MOYE_TEST_DATA) : path.join(app.getPath('appData'), 'pinwheel'); app.setName('pinwheel'); app.setPath('userData', previousUserData);
if (process.platform === 'win32') app.setAppUserModelId('org.pinwheel.notes');
let win, store, pets, config = {}, closing = false;
let systemLanguage = 'en';
const preferences = () => ({ ...config, systemLanguage, resolvedLanguage: getLanguage() });
const showOpenDialog = (options) => dialog.showOpenDialog(win, localizedOptions(options));
const showSaveDialog = (options) => dialog.showSaveDialog(win, localizedOptions(options));
let petQueue = Promise.resolve(), preferenceQueue = Promise.resolve();
const pendingExternal = [];
const enqueueFiles = files => { for (const file of files) if (typeof file === 'string' && /\.(md|markdown|moye|notepack)$/i.test(file) && !file.startsWith('--')) pendingExternal.push(path.resolve(file)); if (pendingExternal.length && win && !win.webContents.isLoadingMainFrame()) win.webContents.send('external-open-ready'); };
app.on('open-file', (event, file) => { event.preventDefault(); enqueueFiles([file]); });
const ownsInstance = app.requestSingleInstanceLock();
if (!ownsInstance) app.quit();
app.on('second-instance', (_event, argv) => { enqueueFiles(argv.slice(1)); if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
enqueueFiles(process.argv.slice(app.isPackaged ? 1 : 2));
protocol.registerSchemesAsPrivileged([{ scheme: 'mnote', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
const integration = systemIntegration(app, shell);
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const persist = () => { const snapshot = JSON.stringify(config, null, 2); const task = preferenceQueue.catch(() => {}).then(() => atomicWrite(settingsFile(), snapshot)); preferenceQueue = task; return task; };
const mime = file => ({ '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif', '.webp':'image/webp', '.svg':'image/svg+xml', '.avif':'image/avif', '.bmp':'image/bmp' }[path.extname(file).toLowerCase()]);
const welcome = `# 欢迎来到风车笔记\n\n让文字安静地发生。\n\n风车笔记是你的本地 Markdown 笔记本。笔记以普通 **Markdown 文件** 保存，图片和附件留在你选择的文件夹。\n\n## 从这里开始\n\n- 在左侧笔记区右键，新建文件或文件夹\n- 默认「Markdown」模式直接按显示样式编辑\n- 粘贴截图，或拖入图片与文件\n- 在设置里选择附件目录和主题，也可导出自己的主题模板\n- 点击右上角锁图标，为正文设置密码\n- 导出「笔记包」，交给另一位使用者继续编辑\n\n## 一个小计划\n\n- [x] 留下今天的想法\n- [ ] 整理资料与附件\n- [ ] 写一篇值得分享的笔记\n\n> 文字是自己的，文件也是。\n\n## Markdown 示例\n\n| 功能 | 写法 |\n| --- | --- |\n| 强调 | **重要的事** |\n| 行内代码 | \`const idea = "hello"\` |\n| 链接 | [Markdown 指南](https://www.markdownguide.org/) |\n\n\`\`\`javascript\nfunction startWriting() {\n  return "把想法写下来。";\n}\n\`\`\`\n\n数学也可以优雅地表达：\n\n$$\nE = mc^2\n$$\n\n## 图表\n\n\`\`\`mermaid\nflowchart LR\n  A[想法] --> B[笔记]\n  B --> C[分享]\n\`\`\`\n`;
async function activate(root) {
  if (store) { await Promise.allSettled([...store.queues.values()]); store.lockAll(); }
  const binding = config.assetBindings?.[root];
  store = await new NotebookStore(root, binding, config.assetHistory?.[root] || []).init(); config.workspace = root; await persist();
  return { root: store.root, assetRoot: store.assetRoot, notes: await store.list(), directories: await store.directories(), settings: preferences() };
}
async function defaultWorkspace() {
  const root = process.env.MOYE_TEST_WORKSPACE || config.workspace || path.join(app.getPath('documents'), 'pinwheel Notes');
  const state = await activate(root);
  if (!state.notes.length) { await store.create(t('欢迎来到风车笔记'), getLanguage() === 'zh-CN' ? welcome : '# Welcome to pinwheel\n\nA place for your ideas.\n\n## Start writing\n\n- Right-click the notes area to create files and folders.\n- Edit styled Markdown directly, or switch to Source.\n- Paste images and choose an attachment folder in Settings.\n- Change your theme and app language in Settings.\n- Export a note package to share editable notes with attachments.\n\n```javascript\nconst idea = \"Keep writing.\";\n```\n'); state.notes = await store.list(); }
  return state;
}
function assertArgs(args) { if (!args || typeof args !== 'object' || Array.isArray(args)) throw Error('无效请求。'); }
async function exportDocument(args) {
  if(args.format!=='encrypted'&&(typeof args.text!=='string'||Buffer.byteLength(args.text)>20*1024*1024))throw Error('笔记内容超过 20MB 限制。');
  await store.resolve(args.path);
  const note = await store.read(args.path);
  if (note.encrypted && args.format !== 'encrypted') throw Error('加密文档只能导出密文，正文不会转为明文。');
  if (!note.encrypted && args.format === 'encrypted') throw Error('请先为文档设置密码。');
  const fileTypes = { encrypted: ['moye'], pack: ['notepack'], html: ['html'], pdf: ['pdf'], markdown: ['md'] };
  if (!fileTypes[args.format]) throw Error('不支持的导出格式。');
  const result = await showSaveDialog({ title: '导出笔记', defaultPath: path.basename(args.path).replace(/\.(md|markdown|moye)$/i, '') + '.' + fileTypes[args.format][0], filters: [{ name: '文档', extensions: fileTypes[args.format] }] });
  if (result.canceled) return null;
  if (args.format === 'encrypted') { await atomicWrite(result.filePath, await readFileBounded(await store.resolve(args.path),MAX_NOTE_BYTES)); return { path: result.filePath, warning: '已保留密码加密；仅包含正文，图片和附件需要单独携带。' }; }
  if (args.format === 'markdown') { await atomicWrite(result.filePath, args.text); return { path: result.filePath, warning: '仅导出正文；需要携带附件请使用笔记包。' }; }
  if (args.format === 'pack') {
    const files = args.all ? (await store.list()).map(x => x.path) : [args.path];
    const packed = await store.pack(files, { [args.path]: args.text }); await atomicWrite(result.filePath, packed.bytes);
    return { path: result.filePath, warning: packed.manifest.warnings.length ? '包含外部链接或网络图片；这些资源仍需要联网。' : '' };
  }
  const resolved = new Map();
  for (const ref of references(args.text)) {
    if (isRemote(ref.url) || ref.url.startsWith('#')) continue;
    const target = await store.localTarget(args.path, ref.url);
    if (target && mime(target)) resolved.set(ref.url, `data:${mime(target)};base64,${(await readFileBounded(target,100*1024*1024)).toString('base64')}`);
  }
  let content = renderMarkdown(args.text, (url, type) => resolved.get(url) || (isRemote(url) && type === 'image' ? '' : url));
  const assets = path.join(appRoot, 'dist', 'assets'); let css = '';
  for (const file of await fs.readdir(assets)) if (file.endsWith('.css')) {
    let source = await fs.readFile(path.join(assets, file), 'utf8');
    const replacements = [];
    for (const m of source.matchAll(/url\(([^)]+)\)/g)) {
      const p = m[1].replace(/["']/g, '');
      if (!p.startsWith('data:')) {
        const full = path.resolve(assets, p);
        if (inside(assets, full)) try { replacements.push([m[0], `url(data:font/woff2;base64,${(await fs.readFile(full)).toString('base64')})`]); } catch {}
      }
    }
    for (const [from, to] of replacements) source = source.replaceAll(from, to);
    css += source;
  }
  const title = path.basename(args.path).replace(/[<>&"]/g, '');
  const exportedFonts = `:root{--code-font:${fontStack(config.codeFontFamily || '', true)}}article.prose{font-family:${fontStack(config.fontFamily || '')}}`;
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:"><title>${title}</title><style>${css}${exportedFonts}\nhtml,body{background:#fff!important;color:#242424;color-scheme:light}body{margin:0;display:block;overflow:visible}article.prose{max-width:800px;margin:40px auto;padding:0 36px}@media print{article.prose{margin:0;max-width:none}pre,figure{break-inside:avoid}h1,h2,h3{break-after:avoid}}</style><body><article class="prose">${content}</article></body></html>`;
  if (args.format === 'html') await atomicWrite(result.filePath, html);
  else {
    const print = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } }); secureWindow(print);
    const temporary = path.join(app.getPath('userData'), 'export-' + randomUUID() + '.html');
    try {
      await atomicWrite(temporary, html); await print.loadFile(temporary);
      await print.webContents.executeJavaScript('Promise.all([document.fonts.ready,...Array.from(document.images).map(i=>i.decode().catch(()=>{}))])');
      await atomicWrite(result.filePath, await print.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { top: 0.5, bottom: 0.5, left: 0.4, right: 0.4 } }));
    } finally { print.destroy(); await fs.rm(temporary, { force: true }); }
  }
  return { path: result.filePath, warning: /```mermaid/.test(args.text) ? '此版本文档导出将 Mermaid 保留为代码；笔记包可完整保留可编辑图表。' : '' };
}
async function command(name, a) {
  assertArgs(a);
  if (typeof name !== 'string') throw Error('无效请求。');
  if (name === 'petLocale') return { language: config.language || 'system', systemLanguage, resolvedLanguage: getLanguage() };
  if (['petState', 'petContextMenu', 'petDrag'].includes(name)) return pets.command(name, a);
  if (name.startsWith('pet')) { const task = petQueue.catch(() => {}).then(() => pets.command(name, a)); petQueue = task; return task; }
  switch (name) {
    case 'preferences': return preferences();
    case 'setAlwaysOnTop': {
      if (typeof a.enabled !== 'boolean') throw Error('保持最前设置无效。');
      const previous = config.alwaysOnTop === true;
      win.setAlwaysOnTop(a.enabled);
      config.alwaysOnTop = a.enabled;
      try { await persist(); }
      catch (error) { config.alwaysOnTop = previous; win.setAlwaysOnTop(previous); throw error; }
      return preferences();
    }
    case 'installedFonts': return installedFonts();
    case 'workspaceSession': {
      if (a.root !== store.root) return false;
      const session = validateSession(a.session); config.sessions ||= {}; delete config.sessions[store.root]; config.sessions[store.root] = session;
      const roots = Object.keys(config.sessions); while (roots.length > 30) delete config.sessions[roots.shift()];
      await persist(); return true;
    }
    case 'bootstrap': return { root: store.root, assetRoot: store.assetRoot, settings: preferences(), notes: await store.list(), directories: await store.directories(), pendingExternal: pendingExternal.length > 0 };
    case 'integration': return integration.get();
    case 'loginItem': return integration.setLogin(a.enabled);
    case 'fileAssociation': return integration.associate();
    case 'openExternalDocument': {
      const file = pendingExternal.shift(); if (!file) return null;
      const full = await fs.realpath(file);
      const info=await fs.stat(full);
      if (!info.isFile() || info.size>(/\.notepack$/i.test(full)?128*1024*1024:MAX_NOTE_BYTES) || !/\.(md|markdown|moye|notepack)$/i.test(full)) throw Error('请选择大小合适的 Markdown、加密文档或笔记包。');
      if (/\.notepack$/i.test(full)) return { type: 'import', result: await store.importPackage(await readFileBounded(full,128*1024*1024)) };
      const root = path.dirname(full);
      if (!inside(store.root, full) || path.relative(store.root, full).split(path.sep).some(part => part.startsWith('.'))) await activate(root);
      const relative = path.relative(store.root, full).split(path.sep).join('/'); await store.resolve(relative); app.addRecentDocument(full);
      return { type: 'document', path: relative, workspace: { root: store.root, assetRoot: store.assetRoot, settings: preferences(), notes: await store.list(), directories: await store.directories() } };
    }
    case 'list': return store.list();
    case 'directories': return store.directories();
    case 'createFolder': return store.createFolder(a.name, a.parent);
    case 'rename': return store.rename(a.path, a.name);
    case 'duplicate': return store.duplicate(a.path);
    case 'copyPath': { const selected = await store.entry(a.path); clipboard.writeText(selected.full); return selected.full; }
    case 'showInFolder': { const selected = await store.entry(a.path); shell.showItemInFolder(selected.full); return true; }
    case 'chooseWorkspace': { const r = await showOpenDialog({ title: '选择笔记文件夹', properties: ['openDirectory', 'createDirectory'] }); return r.canceled ? null : activate(r.filePaths[0]); }
    case 'create': return store.create(a.name, a.text, a.parent);
    case 'read': return store.read(a.path);
    case 'encrypt': return store.encrypt(a.path, a.password, a.expectedHash);
    case 'unlock': return store.unlock(a.path, a.password);
    case 'lockAll': { await Promise.allSettled([...store.queues.values()]); store.lockAll(); return true; }
    case 'encryptedCopy': {
      const secret = store.secret(a.path); validateName(a.name);
      if (typeof a.text !== 'string' || Buffer.byteLength(a.text) > 20 * 1024 * 1024) throw Error('正文超过限制。');
      const name = a.name + '.moye', target = await store.resolve(name, { exists: false });
      await fs.writeFile(target, seal(Buffer.from(a.text), secret), { flag: 'wx' }); return { path: name };
    }
    case 'save': { const r = await store.save(a); await store.clearRecovery(a.path, a.text); return r; }
    case 'recovery': return store.recovery(a.path, a.text);
    case 'getRecovery': return store.getRecovery(a.path);
    case 'history': return store.history(a.path);
    case 'historyRead': return store.historyRead(a.path, a.id);
    case 'checkDisk': return hash(await readFileBounded(await store.resolve(a.path),MAX_NOTE_BYTES));
    case 'settings': {
      if (a.language !== undefined) { if (!validLanguagePreference(a.language)) throw Error('语言设置无效。'); config.language = a.language; setLanguage(a.language, systemLanguage); app.setName(brandName()); win?.setTitle(brandName()); updateApplicationMenu(); }
      if (a.fontFamily !== undefined) config.fontFamily = validateFont(a.fontFamily);
      if (a.codeFontFamily !== undefined) config.codeFontFamily = validateFont(a.codeFontFamily);
      if (['notes', 'outline'].includes(a.sidebarTab)) config.sidebarTab = a.sidebarTab;
      if (['list', 'tree'].includes(a.noteView)) config.noteView = a.noteView;
      if (typeof a.sidebarHidden === 'boolean') config.sidebarHidden = a.sidebarHidden;
      if (Number.isFinite(a.sidebarWidth)) config.sidebarWidth = Math.min(520, Math.max(200, Math.round(a.sidebarWidth)));
      if (['system', 'custom'].includes(a.theme) || builtInThemes.some(theme => theme.id === a.theme && !config.deletedThemes?.includes(theme.id))) config.theme = a.theme;
      const selected = config.customThemes?.find(item => item.id === a.theme);
      if (selected) { config.customTheme = selected.theme; config.theme = selected.id; }
      if (Number.isFinite(a.fontSize)) config.fontSize = Math.min(26, Math.max(13, a.fontSize));
      await persist(); if (a.language !== undefined) { win.webContents.send('preferences-changed'); pets?.languageChanged?.(); } return preferences();
    }
    case 'deleteTheme': { removeTheme(config, a.id); await persist(); return preferences(); }
    case 'restoreThemes': { config.deletedThemes = []; await persist(); return preferences(); }
    case 'chooseAssets': {
      const r = await showOpenDialog({ title: '选择今后插入附件的存储目录', properties: ['openDirectory', 'createDirectory'] });
      if (r.canceled) return null;
      const dest = await fs.realpath(r.filePaths[0]);
      if (inside(path.join(await fs.realpath(store.root),'.notebook'),dest))throw Error('不能选择内部存储作为附件目录。');
      const probe = path.join(dest, '.moye-write-' + randomUUID()); await fs.writeFile(probe, ''); await fs.rm(probe);
      config.assetHistory ||= {}; config.assetHistory[store.root] = [...new Set([...(config.assetHistory[store.root] || []), store.assetRoot, dest])];
      store.authorizedAssetRoots = config.assetHistory[store.root];
      store.assetRoot = dest; config.assetBindings ||= {}; config.assetBindings[store.root] = dest; await persist(); return dest;
    }
    case 'organizeAssets': {
      await store.resolve(a.path); const mapping = new Map();
      for (const ref of references(a.text)) {
        if (isRemote(ref.url) || ref.url.startsWith('#')) continue;
        const target = await store.localTarget(a.path, ref.url);
        if (!target || /\.md$/i.test(target)) continue;
        const attached = await store.ingest(await readFileBounded(target,100*1024*1024), path.basename(target), a.path);
        mapping.set(ref.url, attached.url + splitUrl(ref.url).suffix);
      }
      return { text: rewriteLinks(a.text, url => mapping.get(url)), count: mapping.size };
    }
    case 'exportThemeTemplate': {
      const selected = config.theme === 'system' ? nativeTheme.shouldUseDarkColors && !config.deletedThemes?.includes('dark') ? 'dark' : 'simple' : config.theme;
      const theme = (config.theme === 'custom' || config.theme?.startsWith('custom:')) && config.customTheme ? config.customTheme : builtInThemes.find(t => t.id === selected) || builtInThemes[0];
      const template = themeTemplate(theme);
      const filename = template.name.replace(/[<>:"/\\|?*]/g, '-') + '.moye-theme.json';
      const result = await showSaveDialog({ title: '导出可自定义的主题模板', defaultPath: filename, filters: [{ name: '风车笔记主题', extensions: ['json'] }] });
      if (result.canceled) return null;
      await atomicWrite(result.filePath, JSON.stringify(template, null, 2) + '\n');
      return { path: result.filePath };
    }
    case 'importTheme': {
      const r = await showOpenDialog({ title: '导入风车笔记主题 JSON', properties: ['openFile'], filters: [{ name: '风车笔记主题', extensions: ['json'] }] });
      if (r.canceled) return null;
      const bytes = await readFileBounded(r.filePaths[0],32768);
      const theme = validateTheme(JSON.parse(bytes.toString('utf8')));
      if (config.customThemes.length >= 100) throw Error('最多保存 100 个自定义主题。');
      const id = 'custom:' + randomUUID(); config.customThemes.push({ id, theme }); config.customTheme = theme; config.theme = id; await persist(); return preferences();
    }
    case 'attach': {
      const r = await showOpenDialog({ title: '插入图片或附件', properties: ['openFile', 'multiSelections'] });
      if (r.canceled) return [];
      const out = []; for (const f of r.filePaths) out.push(await store.ingest(await readFileBounded(f,100*1024*1024), path.basename(f), a.path)); return out;
    }
    case 'attachBytes': { if(!(a.bytes instanceof Uint8Array)||a.bytes.byteLength>100*1024*1024)throw Error('附件数据无效或超过限制。');return store.ingest(Buffer.from(a.bytes), a.name, a.path); }
    case 'export': return exportDocument(a);
    case 'import': {
      const r = await showOpenDialog({ title: '导入笔记包、Markdown 或加密文档', properties: ['openFile'], filters: [{ name: '笔记文件', extensions: ['notepack', 'md', 'moye'] }] });
      if (r.canceled) return null;
      const file = r.filePaths[0];
      const imported = await readFileBounded(file,/\.notepack$/i.test(file)?128*1024*1024:MAX_NOTE_BYTES);
      if (encrypted(imported) || /\.moye$/i.test(file)) {
        header(imported);
        const name = path.basename(file).replace(/\.(md|markdown|moye)$/i, '') + '-导入-' + randomUUID().slice(0, 6) + '.moye'; validateName(name);
        await fs.writeFile(await store.resolve(name, { exists: false }), imported, { flag: 'wx' });
        return { folder: name, count: 1, warnings: [] };
      }
      if (/\.md$/i.test(file)) {
        const source = new NotebookStore(path.dirname(file));
        const packed = await source.pack([path.basename(file)]); return store.importPackage(packed.bytes);
      }
      return store.importPackage(imported);
    }
    case 'followLink': {
      if (typeof a.url !== 'string') throw Error('链接地址无效。');
      if (/^https?:\/\//i.test(a.url) || /^mailto:/i.test(a.url)) { await shell.openExternal(externalUrl(a.url)); return null; }
      if (isRemote(a.url)) throw Error('不允许打开此链接类型。');
      const full = await store.localTarget(a.path, a.url); if (!full) return null;
      if (/\.(md|markdown|moye)$/i.test(full) && inside(store.root, full)) return path.relative(store.root, full).split(path.sep).join('/');
      if (!(await fs.stat(full)).isFile() || !mayOpenAttachment(full)) { shell.showItemInFolder(full); return null; }
      const error = await shell.openPath(full); if (error) throw Error(error); return null;
    }
    case 'search': {
      const query = String(a.query || '').toLocaleLowerCase().slice(0, 200); if (!query) return [];
      const results = [];
      for (const n of await store.list()) { const t = n.encrypted ? '' : (await store.read(n.path)).text; const pos = t.toLocaleLowerCase().indexOf(query); if (pos >= 0 || n.name.toLocaleLowerCase().includes(query)) results.push({ ...n, snippet: pos >= 0 ? t.slice(Math.max(0, pos - 20), pos + 80).replaceAll('\n', ' ') : '' }); if (results.length >= 100) break; }
      return results;
    }
    default: throw Error('不支持的操作。');
  }
}
function updateApplicationMenu() {
 if (process.platform !== 'darwin') return;
 const role = (role, label, accelerator) => ({role, label:t(label), ...(accelerator?{accelerator}:{})});
 Menu.setApplicationMenu(Menu.buildFromTemplate([
  {label:brandName(),submenu:[role('about','关于 pinwheel'),{type:'separator'},role('services','服务'),{type:'separator'},role('hide','隐藏 pinwheel'),role('hideOthers','隐藏其他应用'),role('unhide','显示全部'),{type:'separator'},role('quit','退出 pinwheel')]},
  {label:t('文件'),submenu:[{label:t('打开文档…'),accelerator:'CmdOrCtrl+O',click:async()=>{const selected=await showOpenDialog({properties:['openFile'],filters:[{name:'风车笔记文档',extensions:['md','markdown','moye','notepack']}]});if(!selected.canceled)enqueueFiles(selected.filePaths);}},role('close','关闭窗口')]},
  {label:t('编辑'),submenu:[role('undo','撤销'),role('redo','重做'),{type:'separator'},role('cut','剪切'),role('copy','复制'),role('paste','粘贴'),role('selectAll','全选')]},
  {label:t('视图'),submenu:[role('togglefullscreen','切换全屏')]},
  {label:t('窗口'),submenu:[role('minimize','最小化'),role('zoom','缩放窗口'),role('front','全部置于前面')]}
 ]));
}
if (ownsInstance) app.whenReady().then(async () => {
await migrateLegacyData(app.getPath('userData'), process.env.MOYE_TEST_DATA ? (process.env.MOYE_TEST_LEGACY_DATA ? [process.env.MOYE_TEST_LEGACY_DATA] : []) : [path.join(app.getPath('appData'), 'moye-notes'), path.join(app.getPath('appData'), '墨页')]);
try { config = JSON.parse(await readFileBounded(settingsFile(),32*1024*1024,'utf8')); } catch(error) { if(error.code!=='ENOENT')throw error; }
systemLanguage = process.env.MOYE_TEST_DATA && process.env.MOYE_TEST_LOCALE || app.getPreferredSystemLanguages()[0] || 'en';
setLanguage(config.language || 'system', systemLanguage); app.setName(brandName());
config.alwaysOnTop = config.alwaysOnTop === true;
if (!config.defaultThemeVersion) { if (!config.theme || config.theme === 'light') config.theme = 'simple'; config.defaultThemeVersion = 1; }
config.deletedThemes = (config.deletedThemes || []).filter(id => id !== 'simple');
if (config.deletedThemes.includes(config.theme)) config.theme = 'simple';
migrateThemes(config, 'custom:' + randomUUID());
if (config.theme === 'custom' && config.customThemes.length) { config.theme = config.customThemes[0].id; config.customTheme = config.customThemes[0].theme; }
pets = desktopPets({ config, persist, dataRoot: app.getPath('userData'), appRoot, mainWindow: () => win, dispatch: (name, args) => command(name, args) });
await defaultWorkspace();
protocol.handle('mnote', async request => {
  try {
    const url = new URL(request.url);
    if (url.hostname === 'pet') { const asset = await pets.asset(url.searchParams.get('id'), url.searchParams.get('file')); return new Response(asset.bytes, { headers: { 'Content-Type': asset.type, 'Cache-Control': 'private, max-age=31536000, immutable', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; sandbox", 'X-Content-Type-Options':'nosniff' } }); }
    if (url.hostname !== 'asset') return new Response('', { status: 404 });
    const note = url.searchParams.get('note'), ref = url.searchParams.get('url'); await store.resolve(note);
    const target = await store.localTarget(note, ref); const type = target && mime(target);
    if (!type) return new Response('', { status: 403 });
    return new Response(await readFileBounded(target,100*1024*1024), { headers: { 'Content-Type': type, 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; sandbox", 'X-Content-Type-Options':'nosniff', 'Cache-Control': 'no-cache' } });
  } catch { return new Response('', { status: 404 }); }
});
win = new BrowserWindow({ width: 1380, height: 900, minWidth: 720, minHeight: 520, title: brandName(), backgroundColor: '#f7f7f4', show: false, alwaysOnTop: config.alwaysOnTop, ...(process.platform === 'win32' ? { icon: app.isPackaged ? path.resolve(appRoot,'../../pinwheel.ico') : path.join(appRoot,'assets/pinwheel.png') } : {}),
  webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false, backgroundThrottling: false } });
updateApplicationMenu();
if (process.platform !== 'darwin') win.setMenu(null);
secureWindow(win);
win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
win.webContents.session.setPermissionCheckHandler(() => false);
ipcMain.handle('notebook', async (event, name, args) => {
  const main = trustedRenderer(event,win,path.join(appRoot,'dist/index.html'));
  if (!main && !(pets.isPet(event) && ['petState', 'petHide', 'petManage', 'petContextMenu', 'petDrag', 'petLocale'].includes(name))) return { ok: false, error: '未授权窗口。' };
  try { return { ok: true, value: await command(name, args) }; } catch (error) { return { ok: false, error: error.code === 'EEXIST' ? '已存在同名笔记，请换一个名称。' : error.message }; }
});
ipcMain.on('finish-close', event => { if (trustedRenderer(event,win,path.join(appRoot,'dist/index.html'))) { closing = true; win.close(); } });
win.on('close', event => { if (!closing) { event.preventDefault(); win.webContents.send('prepare-close'); } });
win.on('closed', () => pets.dispose());
win.on('ready-to-show', () => { if (!process.env.MOYE_HEADLESS) win.show(); });
await win.loadFile(path.join(appRoot, 'dist', 'index.html'));
await pets.sync();
}).catch(error => { console.error(error); dialog.showErrorBox(t('风车笔记启动失败'), t(error.message)); app.exit(1); });
app.on('window-all-closed', () => app.quit());
