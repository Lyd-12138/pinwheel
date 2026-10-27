const { contextBridge, ipcRenderer } = require('electron');
const allowed = new Set(['petLocale','setAlwaysOnTop','petContextMenu','petDrag','petExport','petTemplate','petImportPackage','petImportFolder','petActionImport','petDrawing','restoreThemes','installedFonts','workspaceSession','preferences','deleteTheme','petState','petHide','petManage','petSettings','petAdd','petEdit','petDelete','petImport','bootstrap','directories','createFolder','chooseWorkspace','create','read','save','recovery','getRecovery','history','historyRead','list','chooseAssets','attach','attachBytes','export','import','settings','checkDisk','followLink','search','organizeAssets','importTheme','exportThemeTemplate','encrypt','unlock','lockAll','encryptedCopy','rename','duplicate','copyPath','showInFolder','integration','loginItem','fileAssociation','openExternalDocument']);
contextBridge.exposeInMainWorld('notebook', {
  call: async (command, args = {}) => {
    if (!allowed.has(command)) throw Error('Unknown command');
    const result = await ipcRenderer.invoke('notebook', command, args);
    if (!result.ok) throw Error(result.error);
    return result.value;
  },
  onClose: callback => { const fn = () => callback(); ipcRenderer.on('prepare-close', fn); return () => ipcRenderer.removeListener('prepare-close', fn); },
  onExternalOpen: callback => { const fn = () => callback(); ipcRenderer.on('external-open-ready', fn); return () => ipcRenderer.removeListener('external-open-ready', fn); },
  onPreferences: callback => { const fn = () => callback(); ipcRenderer.on('preferences-changed', fn); return () => ipcRenderer.removeListener('preferences-changed', fn); },
  onPetUpdate: callback => { const fn = () => callback(); ipcRenderer.on('pet-updated', fn); return () => ipcRenderer.removeListener('pet-updated', fn); },
  onPetAction: callback => { const fn = (_event, action) => callback(action); ipcRenderer.on('pet-action', fn); return () => ipcRenderer.removeListener('pet-action', fn); },
  onPetManage: callback => { const fn = () => callback(); ipcRenderer.on('show-pet-settings', fn); return () => ipcRenderer.removeListener('show-pet-settings', fn); },
  finishClose: () => ipcRenderer.send('finish-close'),
});
