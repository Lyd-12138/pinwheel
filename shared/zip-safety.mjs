import JSZip from 'jszip';

// Bound and validate the central directory before JSZip allocates entry objects.
// Note/pet packages never need ZIP64, encryption or multi-volume archives.
export function inspectZip(bytes, { maxBytes, maxEntries, maxExpanded, maxFile = maxExpanded, validName }) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > maxBytes || bytes.byteLength < 22) throw Error('压缩包大小或格式无效。');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), n = bytes.length;
  let end = -1;
  for (let i = n - 22; i >= Math.max(0, n - 65557); i--) if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === n) { end = i; break; }
  if (end < 0 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) throw Error('不支持此压缩包格式。');
  const count = view.getUint16(end + 10, true), size = view.getUint32(end + 12, true), offset = view.getUint32(end + 16, true);
  if (count === 65535 || count > maxEntries || count !== view.getUint16(end + 8, true) || offset + size !== end) throw Error('压缩包目录或条目数量无效。');
  const names = new Set(), folded = new Set(), ranges = [], decoder = new TextDecoder('utf-8', { fatal: true }); let pos = offset, total = 0;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > end || view.getUint32(pos, true) !== 0x02014b50) throw Error('压缩包目录损坏。');
    const flags = view.getUint16(pos + 8, true), method = view.getUint16(pos + 10, true), compressed = view.getUint32(pos + 20, true), expanded = view.getUint32(pos + 24, true);
    const nameSize = view.getUint16(pos + 28, true), extra = view.getUint16(pos + 30, true), comment = view.getUint16(pos + 32, true), local = view.getUint32(pos + 42, true);
    if ((flags & 1) || ![0, 8].includes(method) || !nameSize || nameSize > 4096 || pos + 46 + nameSize + extra + comment > end || expanded > maxFile || (total += expanded) > maxExpanded || view.getUint16(pos + 34, true)) throw Error('压缩包内容超过限制或格式不安全。');
    const rawName = bytes.subarray(pos + 46, pos + 46 + nameSize);
    if (!(flags & 0x800) && rawName.some(b => b >= 128)) throw Error('压缩包文件名编码不明确。');
    const name = decoder.decode(rawName), key = name.normalize('NFC').toLowerCase();
    if (folded.has(key) || !validName(name) || (view.getUint16(pos + 4, true) >>> 8) === 3 && ((view.getUint32(pos + 38, true) >>> 16) & 0xf000) === 0xa000) throw Error('压缩包含不安全路径、符号链接或重复条目。');
    if (local + 30 > offset || view.getUint32(local, true) !== 0x04034b50 || view.getUint16(local + 6, true) !== flags || view.getUint16(local + 8, true) !== method) throw Error('压缩包文件头无效。');
    const localNameSize = view.getUint16(local + 26, true), localExtra = view.getUint16(local + 28, true), data = local + 30 + localNameSize + localExtra;
    if (data + compressed > offset || localNameSize !== nameSize || rawName.some((b, j) => b !== bytes[local + 30 + j])) throw Error('压缩包文件路径或数据范围不一致。');
    if (!(flags & 8) && (view.getUint32(local + 18, true) !== compressed || view.getUint32(local + 22, true) !== expanded)) throw Error('压缩包文件大小声明不一致。');
    ranges.push([local, data + compressed]); names.add(name); folded.add(key); pos += 46 + nameSize + extra + comment;
  }
  if (pos !== end) throw Error('压缩包目录长度无效。');
  ranges.sort((a, b) => a[0] - b[0]); for (let i = 1; i < ranges.length; i++) if (ranges[i][0] < ranges[i - 1][1]) throw Error('压缩包数据区域重叠。');
  return names;
}

export async function loadSafeZip(bytes, limits) {
  const names = inspectZip(bytes, limits), zip = await JSZip.loadAsync(bytes, { checkCRC32: false, createFolders: false });
  if (Object.keys(zip.files).length !== names.size) throw Error('压缩包存在被覆盖的重复条目。');
  for (const entry of Object.values(zip.files)) if (!names.has(entry.name) || entry.unsafeOriginalName && entry.unsafeOriginalName !== entry.name) throw Error('压缩包路径被修改。');
  return zip;
}

// Do not use entry.async() on untrusted input: directory sizes can lie. Stop
// retaining output as soon as actual decompressed bytes exceed the budget.
export function readZipEntry(entry, limit, budget = { remaining: limit }) {
  const expected = entry?._data?.uncompressedSize;
  if (!entry || entry.dir || !Number.isSafeInteger(expected) || expected < 0 || expected > limit || expected > budget.remaining) return Promise.reject(Error('解压内容超过限制。'));
  return new Promise((resolve, reject) => {
    const stream = entry.internalStream('uint8array'); let chunks = [], length = 0, finished = false;
    const fail = error => { if (finished) return; finished = true; stream.pause(); chunks = []; reject(error); };
    stream.on('data', chunk => {
      if (finished) return;
      if (length + chunk.length > expected || chunk.length > budget.remaining) { fail(Error('实际解压内容超过声明大小或限制。')); return; }
      length += chunk.length; budget.remaining -= chunk.length; chunks.push(chunk);
    }).on('error', fail).on('end', () => {
      if (finished) return; if (length !== expected) { fail(Error('解压文件大小不一致。')); return; }
      const result = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
      finished = true; chunks = []; resolve(result);
    }).resume();
  });
}
