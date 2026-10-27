// Electron nativeImage does not decode GIF; Chromium displays the original file.
// Validate the container and every frame before keeping it in the pet library.
export function gifSize(bytes) {
  const fail = () => { throw Error('GIF 文件损坏，或尺寸、帧数和累计像素超过限制。'); };
  if (bytes.length < 14 || !/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('ascii'))) return fail();
  const width = bytes.readUInt16LE(6), height = bytes.readUInt16LE(8);
  if (!width || !height || width > 4096 || height > 4096) return fail();
  let offset = 13 + (bytes[10] & 0x80 ? 3 * 2 ** ((bytes[10] & 7) + 1) : 0), frames = 0, pixels = 0;
  const blocks = () => { while (offset < bytes.length) { const size = bytes[offset++]; if (!size) return; offset += size; if (offset > bytes.length) return fail(); } fail(); };
  while (offset < bytes.length) {
    const type = bytes[offset++];
    if (type === 0x3b) { if (!frames) return fail(); return { width, height }; }
    if (type === 0x21) { if (offset >= bytes.length) return fail(); offset++; blocks(); continue; }
    if (type !== 0x2c || offset + 9 > bytes.length) return fail();
    const x = bytes.readUInt16LE(offset), y = bytes.readUInt16LE(offset + 2), w = bytes.readUInt16LE(offset + 4), h = bytes.readUInt16LE(offset + 6), flags = bytes[offset + 8];
    if (!w || !h || x + w > width || y + h > height) return fail();
    offset += 9 + (flags & 0x80 ? 3 * 2 ** ((flags & 7) + 1) : 0);
    if (offset >= bytes.length || bytes[offset] < 2 || bytes[offset] > 8) return fail();
    offset++; blocks(); frames++; pixels+=w*h; if(frames>500 || pixels>128*1024*1024)return fail();
  }
  return fail();
}
