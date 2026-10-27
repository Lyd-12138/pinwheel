import path from 'node:path';
import { pathToFileURL } from 'node:url';
const viewable = new Set(['.pdf','.txt','.csv','.rtf','.docx','.xlsx','.pptx','.odt','.ods','.odp','.epub','.png','.jpg','.jpeg','.gif','.webp','.avif','.bmp','.mp3','.wav','.ogg','.flac','.mp4','.webm','.mov']);
export const mayOpenAttachment = file => typeof file === 'string' && viewable.has(path.extname(file).toLowerCase());
export function externalUrl(value) {
  if (typeof value !== 'string' || value.length > 4096 || /[\x00-\x20\x7f]/.test(value)) throw Error('链接地址无效。');
  let parsed; try { parsed = new URL(value); } catch { throw Error('链接地址无效。'); }
  if (!['https:','http:','mailto:'].includes(parsed.protocol) || parsed.protocol !== 'mailto:' && !parsed.hostname) throw Error('不允许打开此链接类型。');
  return parsed.href;
}
export function trustedRenderer(event, window, index, pet = false) {
  if (!window || window.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return false;
  try { const actual = new URL(event.senderFrame.url), expected = pathToFileURL(index); if (pet) expected.searchParams.set('pet','1'); actual.hash = ''; return actual.href === expected.href; } catch { return false; }
}
export function secureWindow(window) {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  for (const event of ['will-navigate','will-frame-navigate','will-redirect','will-attach-webview']) window.webContents.on(event, e => e.preventDefault());
}
