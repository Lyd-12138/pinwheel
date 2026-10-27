import fs from 'node:fs/promises';
import path from 'node:path';

// Check size/type before allocation, then enforce the bound again while reading
// so a concurrently growing file cannot bypass a single stat() check.
export async function readFileBounded(file, limit, encoding) {
  const before = await fs.stat(file); if (!before.isFile() || before.size > limit) throw Error('文件不是普通文件，或超过大小限制。');
  const handle = await fs.open(file, 'r');
  try {
    const current = await handle.stat(); if (!current.isFile() || current.size > limit) throw Error('文件超过大小限制。');
    const chunks = []; let total = 0;
    while (true) {
      const buffer = Buffer.alloc(Math.min(65536, limit - total + 1)), { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break; total += bytesRead; if (total > limit) throw Error('文件读取过程中超过大小限制。'); chunks.push(buffer.subarray(0, bytesRead));
    }
    const bytes = Buffer.concat(chunks, total); return encoding ? bytes.toString(encoding) : bytes;
  } finally { await handle.close(); }
}

export async function ensurePrivateDirectory(root, relative) {
  if (typeof relative !== 'string' || relative.split('/').some(p => !p || p === '..' || p === '.')) throw Error('内部存储路径无效。');
  let folder = path.resolve(root);
  for (const segment of relative.split('/')) {
    folder = path.join(folder, segment); await fs.mkdir(folder).catch(e => { if (e.code !== 'EEXIST') throw e; });
    const stat = await fs.lstat(folder); if (stat.isSymbolicLink() || !stat.isDirectory()) throw Error('内部存储目录不能是符号链接或普通文件。');
  }
  return folder;
}
export async function privateFile(root, relative) {
  if (typeof relative !== 'string' || !relative.startsWith('.notebook/') || relative.split('/').some(p => !p || p === '..' || p === '.')) throw Error('内部文件路径无效。');
  await ensurePrivateDirectory(root, relative.slice(0, relative.lastIndexOf('/')));
  const file=path.join(root,relative), stat=await fs.lstat(file).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  if(stat && (stat.isSymbolicLink() || !stat.isFile()))throw Error('内部存储文件不能是链接或特殊文件。');
  return file;
}
