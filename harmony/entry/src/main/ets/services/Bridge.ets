import { common } from '@kit.AbilityKit';
import { picker } from '@kit.CoreFileKit';
import { webview } from '@kit.ArkWeb';
import { text } from '@kit.ArkGraphics2D';
import { BusinessError } from '@kit.BasicServicesKit';
import { i18n } from '@kit.LocalizationKit';
import { NoteCrypto } from './Crypto';
import { NoteFiles } from './Files';

interface Request { id: number; command: string; path?: string; dest?: string; data?: string; name?: string; kind?: string; expected?: string; token?: string; password?: string; url?: string; language?: string; }
interface Picked { name: string; data: string; }
export function trustedPage(url: string): boolean { return /^resource:\/\/rawfile\/web\/index\.html$/i.test(url); }
export class NativeBridge {
  private crypto: NoteCrypto = new NoteCrypto();
  private files: NoteFiles;
  private queue: Promise<void> = Promise.resolve();
  private active: boolean = true;
  constructor(private context: common.UIAbilityContext, private controller: webview.WebviewController) { this.files = new NoteFiles(context.filesDir + '/moye', this.crypto); }
  post(message: string): void {
    if (!this.active || !trustedPage(this.controller.getUrl()) || typeof message !== 'string' || message.length > 46 * 1024 * 1024) return;
    let request: Request;
    try { request = JSON.parse(message) as Request; if (!Number.isSafeInteger(request.id) || request.id < 1 || typeof request.command !== 'string') return; } catch { return; }
    this.queue = this.queue.then(async () => {
      try { const result = await this.execute(request); this.reply(request.id, true, result); }
      catch (error) { const issue = error as BusinessError; this.reply(request.id, false, JSON.stringify(issue.message || '操作失败，请重试。')); }
    });
  }
  private reply(id: number, ok: boolean, result: string): void {
    if (!this.active || !trustedPage(this.controller.getUrl())) return;
    const field = ok ? 'value' : 'error';
    this.controller.runJavaScript(`window.moyeReply?.({"id":${id},"ok":${ok},"${field}":${result}})`).catch(() => {});
  }
  private async execute(r: Request): Promise<string> {
    switch (r.command) {
      case 'locale': return JSON.stringify(i18n.System.getSystemLanguage());
      case 'language': AppStorage.setOrCreate('pinwheelLanguage', r.language === 'zh-CN' ? 'zh-CN' : 'en'); return 'true';
      case 'list': return JSON.stringify(this.files.list(r.path || ''));
      case 'read': return JSON.stringify(this.files.read(r.path || ''));
      case 'write': return JSON.stringify(await this.files.write(r.path || '', r.data || '', r.expected));
      case 'digest': return JSON.stringify(await this.crypto.digest(this.crypto.decode(r.data || '')));
      case 'mkdir': this.files.mkdir(r.path || ''); return 'true';
      case 'move': this.files.move(r.path || '', r.dest || ''); return 'true';
      case 'trash': this.files.trash(r.path || ''); return 'true';
      case 'seal': return JSON.stringify(await this.crypto.seal(r.data || '', r.token || '', r.password || ''));
      case 'open': return JSON.stringify(await this.crypto.open(r.data || '', r.password || '', r.token || ''));
      case 'forget': this.crypto.forget(r.token || ''); return 'true';
      case 'forgetAll': this.crypto.forgetAll(); return 'true';
      case 'background': await this.context.moveAbilityToBackground(); return 'true';
      case 'openLink': {
        const url = r.url || '';
        if (!/^(https?:\/\/|mailto:)[^\s\x00-\x1f]+$/i.test(url) || url.length > 4096) throw new Error('链接地址无效。');
        if (/^mailto:/i.test(url)) await this.context.startAbility({ action: 'ohos.want.action.viewData', uri: url });
        else await this.context.openLink(url);
        return 'true';
      }
      case 'fonts': {
        const fullNames = await text.getSystemFontFullNamesByType(text.SystemFontType.GENERIC), families: Set<string> = new Set();
        for (const fullName of fullNames) { const descriptor = await text.getFontDescriptorByFullName(fullName, text.SystemFontType.GENERIC); families.add(descriptor.fontFamily); }
        return JSON.stringify(Array.from(families).sort());
      }
      case 'pick': {
        const options = new picker.DocumentSelectOptions(); options.maxSelectNumber = r.kind === 'theme' ? 1 : 10;
        if (r.kind === 'notes') options.fileSuffixFilters = [(AppStorage.get<string>('pinwheelLanguage') === 'zh-CN' ? '风车笔记笔记' : 'pinwheel notes') + '|.md,.markdown,.moye,.notepack'];
        if (r.kind === 'theme') options.fileSuffixFilters = [(AppStorage.get<string>('pinwheelLanguage') === 'zh-CN' ? '主题 JSON' : 'Theme JSON') + '|.json'];
        const uris = await new picker.DocumentViewPicker(this.context).select(options), result: Picked[] = []; let total = 0;
        for (const uri of uris) {
          const bytes = this.files.readAbsolute(uri, 32 * 1024 * 1024); total += bytes.length;
          if (total > 32 * 1024 * 1024) throw new Error('一次选择的文件总量不能超过 32MB，请分批导入。');
          const data = this.crypto.encode(bytes);
          const name = decodeURIComponent(uri.slice(uri.lastIndexOf('/') + 1)).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_'); result.push({ name, data });
        } return JSON.stringify(result);
      }
      case 'export': {
        const name = r.name || 'pinwheel.md'; if (/[\\/:*?"<>|\x00-\x1f]/.test(name) || name.length > 180) throw new Error('导出文件名无效。');
        const bytes = this.crypto.decode(r.data || ''), options = new picker.DocumentSaveOptions(); options.newFileNames = [name];
        const uris = await new picker.DocumentViewPicker(this.context).save(options); if (!uris.length) return 'false';
        this.files.writeAbsolute(uris[0], bytes); return 'true';
      }
      default: throw new Error('不支持的操作。');
    }
  }
  forgetAfterPending(): void { this.queue = this.queue.then(() => this.crypto.forgetAll()); }
  dispose(): void { this.active = false; this.crypto.forgetAll(); }
}
