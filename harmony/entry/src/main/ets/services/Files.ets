import { fileIo as fs } from '@kit.CoreFileKit';
import { NoteCrypto, isEncrypted } from './Crypto';

export interface FileEntry { name: string; directory: boolean; size: number; modified: number; encrypted: boolean; }
export class NoteFiles {
  constructor(private root: string, private crypto: NoteCrypto) { if (!fs.accessSync(root)) fs.mkdirSync(root, true); }
  resolve(path: string, empty: boolean = false): string {
    if (typeof path !== 'string' || path.length > 900 || (!path && !empty) || /[\\\x00-\x1f:*?"<>|]/.test(path) || path.startsWith('/')) throw new Error('文件路径无效。');
    let target = this.root;
    if (!path && empty) return target;
    for (const segment of path.split('/')) {
      if (!segment || segment === '.' || segment === '..' || /[. ]$/.test(segment)) throw new Error('文件路径无效。');
      target += '/' + segment;
      if (fs.accessSync(target) && fs.lstatSync(target).isSymbolicLink()) throw new Error('不能访问符号链接。');
    }
    return target;
  }
  private parents(path: string): void { const parent = path.slice(0, path.lastIndexOf('/')); if (!fs.accessSync(parent)) fs.mkdirSync(parent, true); }
  readAbsolute(path: string, limit: number = 21 * 1024 * 1024): Uint8Array {
    const file = fs.openSync(path, fs.OpenMode.READ_ONLY);
    try {
      const size = fs.statSync(file.fd).size; if (size > limit) throw new Error('文件超过大小限制。');
      const result = new Uint8Array(size); let offset = 0;
      while (offset < size) { const buffer = new ArrayBuffer(Math.min(size - offset, 1024 * 1024)); const count = fs.readSync(file.fd, buffer); if (count <= 0) throw new Error('文件读取不完整。'); result.set(new Uint8Array(buffer, 0, count), offset); offset += count; } return result;
    } finally { fs.closeSync(file); }
  }
  read(path: string): string { const full = this.resolve(path); if (!fs.accessSync(full)) throw new Error('文件不存在（ENOENT）。'); return this.crypto.encode(this.readAbsolute(full)); }
  writeAbsolute(path: string, bytes: Uint8Array): void {
    const file = fs.openSync(path, fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE | fs.OpenMode.TRUNC);
    try { let offset = 0; while (offset < bytes.length) { const chunk = bytes.slice(offset, Math.min(offset + 1024 * 1024, bytes.length)); const count = fs.writeSync(file.fd, chunk.buffer); if (count <= 0) throw new Error('文件写入失败。'); offset += count; } fs.fsyncSync(file.fd); }
    finally { fs.closeSync(file); }
  }
  async write(path: string, data: string, expected: string | undefined): Promise<string> {
    const full = this.resolve(path), bytes = this.crypto.decode(data); if (bytes.length > 32 * 1024 * 1024) throw new Error('文件超过大小限制。');
    const exists = fs.accessSync(full);
    if (expected === 'new' && exists) throw new Error('已存在同名文件。');
    if (expected && expected !== 'new' && (!exists || await this.crypto.digest(this.readAbsolute(full)) !== expected)) throw new Error('文件已有其他修改，未覆盖。请导出当前内容后重新打开。');
    this.parents(full); const temp = full.slice(0, full.lastIndexOf('/') + 1) + '.write-' + Date.now() + '-' + this.crypto.encode(this.crypto.random(9)).replace(/[^a-zA-Z0-9]/g, '');
    try { this.writeAbsolute(temp, bytes); fs.renameSync(temp, full); }
    finally { if (fs.accessSync(temp)) fs.unlinkSync(temp); }
    return this.crypto.digest(bytes);
  }
  list(path: string): FileEntry[] {
    const full = this.resolve(path, true); const result: FileEntry[] = [];
    for (const name of fs.listFileSync(full)) {
      if (name.startsWith('.')) continue;
      const item = full + '/' + name, stat = fs.lstatSync(item); if (stat.isSymbolicLink()) continue;
      let encrypted = false;
      if (stat.isFile() && /\.(md|markdown|moye)$/i.test(name)) { const file = fs.openSync(item, fs.OpenMode.READ_ONLY); try { const header = new ArrayBuffer(8); const count = fs.readSync(file.fd, header); encrypted = count === 8 && isEncrypted(new Uint8Array(header)); } finally { fs.closeSync(file); } }
      result.push({ name, directory: stat.isDirectory(), size: stat.size, modified: stat.mtime * 1000, encrypted });
    } return result;
  }
  mkdir(path: string): void { const full = this.resolve(path); if (fs.accessSync(full)) throw new Error('已存在同名文件夹。'); fs.mkdirSync(full, true); }
  move(path: string, dest: string): void { const from = this.resolve(path), to = this.resolve(dest); if (fs.accessSync(to)) throw new Error('已存在同名文件。'); if (to.startsWith(from + '/')) throw new Error('不能移动到自身目录。'); this.parents(to); fs.renameSync(from, to); }
  trash(path: string): void { if (path.startsWith('.')) throw new Error('不能删除应用配置。'); this.move(path, '.moye/trash/' + Date.now() + '/' + path); }
}
