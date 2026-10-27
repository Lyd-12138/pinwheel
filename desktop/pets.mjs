import { t } from '../shared/i18n.mjs';
import { localizedOptions } from './localized-ui.mjs';
import { BrowserWindow, dialog, screen, nativeImage, Menu } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { initialPets, validatePet, removePet, petPosition } from '../shared/pets.mjs';
import { petActions, petAssetFiles, validateActions, validPetAsset } from '../shared/pet-format.mjs';
import { gifSize } from '../shared/gif.mjs';
import { petImageSize } from '../shared/pet-image.mjs';
import { readFileBounded } from './safe-io.mjs';
import { secureWindow, trustedRenderer } from './security-policy.mjs';
import { readPetPackage, writePetPackage } from './pet-package.mjs';
import { petGuide } from '../shared/pet-guide.mjs';
import { atomicWrite, inside } from './store.mjs';

const readPetFile=(file,encoding)=>readFileBounded(file,typeof file==='string'&&/\.json$/i.test(file)?256*1024:/\.(moye-pet|zip)$/i.test(file)?80*1024*1024:10*1024*1024,encoding);

export function desktopPets({ config, persist, dataRoot, appRoot, mainWindow, dispatch }) {
  let window, timer, syncing = false, disposed = false, drag, menu;
  const showOpenDialog = options => dialog.showOpenDialog(mainWindow(), localizedOptions(options));
  const showSaveDialog = options => dialog.showSaveDialog(mainWindow(), localizedOptions(options));
  const state = () => config.pets ||= initialPets();
  const notify = () => { const main = mainWindow(); if (main && !main.isDestroyed()) main.webContents.send('preferences-changed'); };
  const directory = path.join(dataRoot, 'pets');
  const emit = action => { if (window && !window.isDestroyed()) window.webContents.send('pet-action', { action, nonce: randomUUID() }); };
  const selected = () => state().items.find(p => p.id === state().selected);
  const inspect = (bytes, file) => {
    if (!validPetAsset(path.basename(file)) || bytes.length > 10 * 1024 * 1024) throw Error('图片不能超过 10 MB。');
    petImageSize(bytes,path.basename(file));
    const decoded = /\.gif$/i.test(file) ? null : nativeImage.createFromBuffer(bytes), size = decoded ? decoded.getSize() : gifSize(bytes);
    if (decoded?.isEmpty() || !size.width || !size.height || size.width > 4096 || size.height > 4096) throw Error('图片无法读取，或超过 4096 × 4096。');
    return size;
  };
  const bounds = () => {
    const s = state(), width = Math.round(s.size || 160) + 64, height = width + 32;
    const area = s.position && Number.isFinite(s.position.x) && Number.isFinite(s.position.y) ? screen.getDisplayNearestPoint(s.position).workArea : screen.getPrimaryDisplay().workArea;
    return { ...petPosition(s.position, area, width, height), width, height };
  };
  const sync = async () => {
    if (disposed) return;
    const s = state(); drag = null;
    if (!s.enabled || !selected()) { if (window && !window.isDestroyed()) window.destroy(); window = undefined; return; }
    if (window && !window.isDestroyed()) { syncing = true; window.setBounds(bounds()); syncing = false; window.webContents.send('pet-updated'); return; }
    const petWindow = new BrowserWindow({ ...bounds(), title: t('风车笔记桌面宠物'), show: false, frame: false, transparent: true, hasShadow: false, resizable: false, maximizable: false, minimizable: false, skipTaskbar: true, alwaysOnTop: true, webPreferences: { preload: path.join(appRoot, 'desktop', 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    window = petWindow; petWindow.setMenu(null); petWindow.on('page-title-updated', event => event.preventDefault());
    if (process.platform === 'darwin') petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    secureWindow(petWindow);
    petWindow.on('moved', () => { if (syncing || disposed || petWindow.isDestroyed()) return; const [x, y] = petWindow.getPosition(); state().position = { x, y }; clearTimeout(timer); timer = setTimeout(() => void persist().catch(console.error), 300); });
    petWindow.on('closed', () => { if (window === petWindow) window = undefined; drag = null; });
    await petWindow.loadFile(path.join(appRoot, 'dist', 'index.html'), { query: { pet: '1' } });
    if (!petWindow.isDestroyed() && !process.env.MOYE_HEADLESS) petWindow.showInactive();
  };
  const save = async () => { await persist(); await sync(); notify(); return state(); };
  const storeImages = async images => {
    const mapping = new Map(), created = []; await fs.mkdir(directory, { recursive: true });
    try { for (const [file, bytes] of images) { inspect(bytes, file); const image = randomUUID() + path.extname(file).toLowerCase(); await fs.writeFile(path.join(directory, image), bytes, { flag: 'wx' }); mapping.set(file, image); created.push(image); } return mapping; }
    catch (error) { for (const file of created) await fs.rm(path.join(directory, file), { force: true }).catch(console.error); throw error; }
  };
  const assetCapacity = async (pet, images) => {
    const remaining = petAssetFiles(pet); if (remaining.length + images.length > 300) throw Error('每只宠物最多 300 张素材。');
    let total = images.reduce((sum, [, bytes]) => sum + bytes.length, 0);
    for (const file of remaining) { total += (await fs.stat(path.join(directory, file))).size; if (total > 80 * 1024 * 1024) throw Error('这只宠物的素材合计不能超过 80 MB。'); }
  };
  const owned = file => typeof file === 'string' && /^[\da-f-]+\.(png|jpg|jpeg|webp|gif)$/i.test(file);
  const cleanup = async files => { for (const file of files) if (owned(file) && !state().items.some(p => petAssetFiles(p).includes(file))) await fs.rm(path.join(directory, file), { force: true }).catch(console.error); };
  const addImported = async ({ pet, assets }) => {
    if (state().items.length >= 100) throw Error('最多保存 100 只宠物。');
    const mapping = await storeImages([...assets].map(([file, asset]) => [file, asset.bytes]));
    if (pet.image) pet.image = mapping.get(pet.image);
    for (const action of Object.values(pet.actions)) action.files = action.files.map(file => mapping.get(file));
    const item = { ...pet, id: randomUUID() }; state().items.push(item); state().selected = item.id;
    return save();
  };
  const request = (name, args) => void dispatch(name, args).catch(error => { const main = mainWindow(); if (main && !main.isDestroyed()) dialog.showMessageBox(main, { type: 'error', message: t(error.message) }); });
  const contextMenu = () => {
    const s = state(), pet = selected(); if (!window || window.isDestroyed() || !pet) return false;
    drag = null;
    const custom = Object.entries(pet.actions || {}).filter(([id]) => !petActions.some(a => a.id === id));
    menu = Menu.buildFromTemplate(localizedOptions([
      { label: pet.name.replaceAll('&', '&&'), enabled: false },
      ...petActions.filter(a => !['idle', 'drag', 'drop'].includes(a.id)).map(a => ({ id: 'pet-action-' + a.id, label: a.name, click: () => emit(a.id) })),
      { id: 'pet-wake', label: '醒来 / 回到待机', click: () => emit('idle') },
      ...(custom.length ? [{ label: '自定义动作', submenu: custom.map(([id, a]) => ({ id: 'pet-custom-' + id, label: (a.label || id).replaceAll('&', '&&'), click: () => emit(id) })) }] : []),
      { type: 'separator' },
      { label: '切换伙伴', submenu: s.items.map(p => ({ id: 'pet-select-' + p.id, label: p.name.replaceAll('&', '&&'), type: 'radio', checked: p.id === s.selected, click: () => request('petSettings', { selected: p.id }) })) },
      { id: 'pet-motion', label: '待机动画', type: 'checkbox', checked: s.motion !== false, click: item => request('petSettings', { motion: item.checked }) },
      { id: 'pet-size-up', label: '放大一点', enabled: s.size < 256, click: () => request('petSettings', { size: (s.size || 160) + 16 }) },
      { id: 'pet-size-down', label: '缩小一点', enabled: s.size > 96, click: () => request('petSettings', { size: (s.size || 160) - 16 }) },
      { type: 'separator' }, { id: 'pet-manage', label: '管理与定制宠物…', click: () => request('petManage', {}) },
      { id: 'pet-hide', label: '关闭宠物', click: () => request('petHide', {}) },
    ], state().items.flatMap(p => [p.name.replaceAll('&', '&&'), ...Object.values(p.actions || {}).map(a => a.label).filter(Boolean)])));
    menu.popup({ window }); return true;
  };
  return {
    state, sync,
    languageChanged() { if (window && !window.isDestroyed()) { window.setTitle(t('风车笔记桌面宠物')); window.webContents.send('preferences-changed'); } },
    isPet: event => trustedRenderer(event,window,path.join(appRoot,'dist/index.html'),true),
    async asset(id, file) {
      const item = state().items.find(p => p.id === id), image = file || item?.image || item?.actions?.idle?.files?.[0];
      if (!item || !owned(image) || !petAssetFiles(item).includes(image)) throw Error('宠物图片不存在。');
      return { bytes: await readPetFile(path.join(directory, image)), type: ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' })[path.extname(image).slice(1)] };
    },
    async command(name, a) {
      const s = state();
      if (name === 'petState') return s;
      if (name === 'petContextMenu') return contextMenu();
      if (name === 'petDrag') {
        if (!window || window.isDestroyed()) return false;
        if (a.phase === 'start') { drag = { cursor: screen.getCursorScreenPoint(), bounds: window.getBounds() }; return true; }
        if (!drag) return false;
        if (a.phase === 'cancel') { drag = null; return true; }
        const point = screen.getCursorScreenPoint(), target = { x: drag.bounds.x + point.x - drag.cursor.x, y: drag.bounds.y + point.y - drag.cursor.y }, area = screen.getDisplayNearestPoint(point).workArea;
        const position = petPosition(target, area, drag.bounds.width, drag.bounds.height); window.setPosition(position.x, position.y); s.position = position;
        if (a.phase === 'end') { drag = null; await persist(); } return true;
      }
      if (name === 'petHide') { s.enabled = false; return save(); }
      if (name === 'petManage') { const main = mainWindow(); if (main.isMinimized()) main.restore(); main.show(); main.focus(); main.webContents.send('show-pet-settings'); return true; }
      if (name === 'petSettings') {
        const next = { ...s };
        if (typeof a.enabled === 'boolean') next.enabled = a.enabled;
        if (typeof a.motion === 'boolean') next.motion = a.motion;
        if (a.selected !== undefined) { if (!s.items.some(p => p.id === a.selected)) throw Error('宠物不存在。'); next.selected = a.selected; }
        if (Number.isFinite(a.size)) next.size = Math.max(96, Math.min(256, Math.round(a.size)));
        if (a.resetPosition) delete next.position;
        if (next.enabled && !s.items.length) throw Error('请先新增宠物。');
        config.pets = next; return save();
      }
      if (name === 'petAdd' || name === 'petEdit') {
        const values = validatePet(a);
        if (name === 'petEdit') {
          const item = s.items.find(p => p.id === a.id); if (!item) throw Error('宠物不存在。');
          if (values.kind === 'image' && !item.image && !values.actions.idle) throw Error('请先导入图片。');
          const old = petAssetFiles(item); for (const file of petAssetFiles(values)) if (!old.includes(file)) throw Error('只能使用已导入的宠物素材。');
          Object.assign(item, values); const result = await save(); await cleanup(old); return result;
        }
        if (s.items.length >= 100) throw Error('最多保存 100 只宠物。');
        if (values.kind === 'image' || petAssetFiles(values).length) throw Error('请使用导入图片或动作素材新增。');
        const item = { id: randomUUID(), ...values }; s.items.push(item); s.selected = item.id; return save();
      }
      if (name === 'petDelete') { const item = s.items.find(p => p.id === a.id); removePet(s, a.id); const result = await save(); await cleanup(petAssetFiles(item)); return result; }
      if (name === 'petExport' || name === 'petTemplate') {
        const item = name === 'petTemplate' ? { name: '我的伙伴', kind: 'cat', color: '#a899ed' } : s.items.find(p => p.id === a.id);
        if (!item) throw Error('宠物不存在。');
        const chosen = await showSaveDialog({ title: '导出宠物包', defaultPath: item.name.replace(/[<>:"/\\|?*]/g, '-') + '.moye-pet', filters: [{ name: '风车笔记宠物包', extensions: ['moye-pet'] }] }); if (chosen.canceled) return null;
        const bytes = await writePetPackage(item, file => readPetFile(path.join(directory, file)), petGuide); await atomicWrite(chosen.filePath, bytes); return { path: chosen.filePath };
      }
      if (name === 'petImportPackage') {
        const chosen = await showOpenDialog({ title: '导入宠物包', properties: ['openFile'], filters: [{ name: '风车笔记宠物包', extensions: ['moye-pet', 'zip'] }] }); if (chosen.canceled) return null;
        if ((await fs.stat(chosen.filePaths[0])).size > 80 * 1024 * 1024) throw Error('宠物包不能超过 80 MB。'); return addImported(await readPetPackage(await readPetFile(chosen.filePaths[0]), inspect));
      }
      if (name === 'petImportFolder') {
        const chosen = await showOpenDialog({ title: '选择含 pet.json 的宠物文件夹', properties: ['openDirectory'] }); if (chosen.canceled) return null;
        const root = await fs.realpath(chosen.filePaths[0]), spec = await fs.realpath(path.join(root, 'pet.json')); if (!inside(root, spec) || (await fs.stat(spec)).size > 256 * 1024) throw Error('宠物配置无效。');
        const original = JSON.parse(await readPetFile(spec, 'utf8')), pet = { ...validatePet(original) }; if (original.image) { if (!validPetAsset(original.image)) throw Error('宠物主图无效。'); pet.image = original.image; }
        const files = petAssetFiles(pet), assets = new Map(); if (files.length > 300) throw Error('宠物素材最多 300 张。'); let total = 0;
        for (const file of files) { const full = await fs.realpath(path.resolve(root, file)); const size = (await fs.stat(full)).size; if (!inside(root, full) || size > 10 * 1024 * 1024 || (total += size) > 80 * 1024 * 1024) throw Error('宠物素材路径或大小无效。'); const bytes = await readPetFile(full); assets.set(file, { bytes, size: inspect(bytes, file) }); }
        for (const action of Object.values(pet.actions)) if (action.kind === 'sheet') { const size = assets.get(action.files[0]).size; if (size.width % action.columns || size.height % action.rows) throw Error('精灵图尺寸必须整除行列数。'); action.aspectRatio = (size.width / action.columns) / (size.height / action.rows); }
        if (pet.kind === 'image' && !pet.image && !pet.actions.idle) throw Error('图片宠物需要待机素材。'); return addImported({ pet, assets });
      }
      if (name === 'petActionImport') {
        const item = s.items.find(p => p.id === a.id); if (!item) throw Error('请先保存宠物。');
        if (a.remove) { const old = petAssetFiles(item); const actions = { ...item.actions }; delete actions[a.action]; const messages = { ...item.behavior?.messages }; delete messages[a.action]; const behavior = { ...item.behavior, messages, click: item.behavior?.click === a.action ? 'pet' : item.behavior?.click, doubleClick: item.behavior?.doubleClick === a.action ? 'play' : item.behavior?.doubleClick }; const value = validatePet({ ...item, actions, behavior }); if (item.kind === 'image' && !item.image && !actions.idle) throw Error('不能移除图片宠物唯一的待机动作。'); Object.assign(item, value); const result = await save(); await cleanup(old); return result; }
        const chosen = await showOpenDialog({ title: '选择动作图片（逐帧按文件名排序）', properties: ['openFile', 'multiSelections'], filters: [{ name: '动作图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }] }); if (chosen.canceled) return null;
        const files = chosen.filePaths.sort((x, y) => path.basename(x).localeCompare(path.basename(y), undefined, { numeric: true })); if (files.length > 120 || a.kind === 'sheet' && files.length !== 1) throw Error('逐帧最多 120 张，精灵图请选择一张。');
        let total = 0; const images = [];
        for (let i = 0; i < files.length; i++) { const size = (await fs.stat(files[i])).size; if (size > 10 * 1024 * 1024 || (total += size) > 80 * 1024 * 1024) throw Error('动作素材超过限制。'); const bytes = await readPetFile(files[i]); inspect(bytes, files[i]); images.push(['frame-' + i + path.extname(files[i]), bytes]); }
        const entry = validateActions({ [a.action]: { ...a, files: images.map(([file]) => file) } })[a.action];
        if (entry.kind === 'sheet') { const size = inspect(images[0][1], images[0][0]); if (size.width % entry.columns || size.height % entry.rows) throw Error('精灵图尺寸必须整除行列数。'); }
        validateActions({ ...item.actions, [a.action]: entry });
        if (entry.kind === 'sheet') { const size = inspect(images[0][1], images[0][0]); entry.aspectRatio = (size.width / entry.columns) / (size.height / entry.rows); }
        const retained = { ...item.actions }; delete retained[a.action]; await assetCapacity({ ...item, actions: retained }, images);
        const old = petAssetFiles(item), mapping = await storeImages(images); entry.files = entry.files.map(file => mapping.get(file)); item.actions = { ...item.actions, [a.action]: entry };
        const result = await save(); await cleanup(old); return result;
      }
      if (name === 'petDrawing') {
        if (!Array.isArray(a.bytes) || a.bytes.length > 10 * 1024 * 1024) throw Error('画布图片无效。'); const bytes = Buffer.from(a.bytes); inspect(bytes, 'drawing.png');
        const item = s.items.find(p => p.id === a.id); if (!item && s.items.length >= 100) throw Error('最多保存 100 只宠物。');
        const drawingAction = validateActions({ [a.action || 'idle']: { kind: 'frames', files: ['drawing.png'], fps: 1, loop: true, duration: 1800 } })[a.action || 'idle'];
        if (item) validateActions({ ...item.actions, [a.action || 'idle']: drawingAction });
        if (item) { const retained = { ...item.actions }; delete retained[a.action || 'idle']; await assetCapacity({ ...item, actions: retained }, [['drawing.png', bytes]]); }
        const values = validatePet({ name: a.name || '我的手绘伙伴', kind: 'image', color: '#a899ed' }); const old = item ? petAssetFiles(item) : [], mapping = await storeImages([['drawing.png', bytes]]), image = mapping.get('drawing.png');
        if (item) { item.actions = { ...item.actions, [a.action || 'idle']: { kind: 'frames', files: [image], fps: 1, loop: true, duration: 1800, label: a.action || 'idle' } }; if ((a.action || 'idle') === 'idle') item.kind = 'image'; }
        else { const pet = { id: randomUUID(), ...values, image }; s.items.push(pet); s.selected = pet.id; }
        const result = await save(); await cleanup(old); return result;
      }
      if (name === 'petImport') {
        if (s.items.length >= 100) throw Error('最多保存 100 只宠物。');
        const chosen = await showOpenDialog({ title: '选择宠物图片或 GIF', properties: ['openFile'], filters: [{ name: '宠物图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }] }); if (chosen.canceled) return null;
        const source = chosen.filePaths[0]; if ((await fs.stat(source)).size > 10 * 1024 * 1024) throw Error('图片不能超过 10 MB。'); const bytes = await readPetFile(source); inspect(bytes, source);
        const mapping = await storeImages([[path.basename(source), bytes]]), pet = { id: randomUUID(), ...validatePet({ name: path.basename(source, path.extname(source)).slice(0, 40) || '我的宠物', kind: 'image', color: '#a899ed' }), image: mapping.get(path.basename(source)) };
        s.items.push(pet); s.selected = pet.id; return save();
      }
      throw Error('不支持的宠物操作。');
    },
    dispose() { disposed = true; clearTimeout(timer); if (window && !window.isDestroyed()) window.destroy(); },
  };
}

