import { t } from '../shared/i18n.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {documentTypes,windowsAssociationEntries} from '../shared/windows-association.mjs';
const execute = promisify(execFile);
export {documentTypes};
export function systemIntegration(app, shell, { platform = process.platform, executable = process.execPath, run = execute } = {}) {
  const supported = ['win32','darwin'].includes(platform) && app.isPackaged;
  const options = () => platform === 'win32' ? { path: executable, args: ['--login'] } : {};
  const get = () => ({ supported, platform, ...(supported ? app.getLoginItemSettings(options()) : { openAtLogin: false }), packaged: app.isPackaged });
  return {
    get,
    setLogin(enabled) {
      if (!supported) throw Error('请在已安装的 Windows 或 macOS 应用中设置开机自启。');
      if (typeof enabled !== 'boolean') throw Error('自启设置无效。');
      app.setLoginItemSettings({ ...options(), ...(platform === 'win32' ? { name:'Pinwheel' } : {}), openAtLogin: enabled });
      return get();
    },
    async associate() {
      if (!supported) throw Error('请先安装应用，再设置文件打开方式。');
      if (platform === 'darwin') return { message: '在 Finder 中右键文档 → 显示简介 → 打开方式，选择风车笔记并点击“全部更改”。' };
      for(const item of windowsAssociationEntries(executable,{typeNames:documentTypes.map(type=>t(type.name))}))await run('reg.exe',['add','HKCU\\'+item.key,...(item.name?['/v',item.name]:['/ve']),'/t',item.type,'/d',item.value,'/f'],{windowsHide:true});
      await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public static class PinwheelShell { [DllImport("shell32.dll")] public static extern void SHChangeNotify(uint e,uint f,System.IntPtr a,System.IntPtr b); }'; [PinwheelShell]::SHChangeNotify(0x08000000,0,[System.IntPtr]::Zero,[System.IntPtr]::Zero)`],{windowsHide:true});
      await shell.openExternal('ms-settings:defaultapps');
      return { message: '已注册风车笔记打开方式。请在 Windows 默认应用中选择风车笔记，或右键文档 → 打开方式。' };
    },
  };
}
