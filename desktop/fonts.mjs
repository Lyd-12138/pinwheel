import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
let pending;
export function installedFonts() {
  return pending ||= (async () => {
    let names = [];
    if (process.platform === 'win32') {
      const { stdout } = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new(); Add-Type -AssemblyName System.Drawing; @([System.Drawing.Text.InstalledFontCollection]::new().Families | ForEach-Object { $_.Name }) | ConvertTo-Json -Compress'], { windowsHide: true, timeout: 12000, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' });
      names = JSON.parse(stdout.replace(/^\uFEFF/, ''));
    } else if (process.platform === 'darwin') {
      const { stdout } = await execute('/usr/sbin/system_profiler', ['SPFontsDataType', '-json', '-detailLevel', 'mini'], { timeout: 20000, maxBuffer: 12 * 1024 * 1024, encoding: 'utf8' });
      const walk = value => { if (!value || typeof value !== 'object') return; for (const [key, child] of Object.entries(value)) { if (['family', 'family_name', 'familyName'].includes(key) && typeof child === 'string') names.push(child); else if (key === 'typefaces' && Array.isArray(child)) for (const face of child) { if (face.family) names.push(face.family); else if (face._name) names.push(face._name); } else walk(child); } }; walk(JSON.parse(stdout));
    }
    return [...new Set(names)].filter(n => typeof n === 'string' && n.length <= 100 && !/[\x00-\x1f<>]/.test(n)).sort((a, b) => a.localeCompare(b));
  })().catch(error => { pending = undefined; throw Error('读取本机字体失败，可手动输入字体名称。' + (error.killed ? '读取超时。' : '')); });
}
