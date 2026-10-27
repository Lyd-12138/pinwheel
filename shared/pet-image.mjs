import { imageSize } from 'image-size';
import { gifSize } from './gif.mjs';
import { validPetAsset } from './pet-format.mjs';
export function petImageSize(bytes, file) {
  if (!validPetAsset(file) || !bytes.length || bytes.length > 10*1024*1024) throw Error('宠物图片无效或超过 10MB。');
  let size;
  try { size = /\.gif$/i.test(file) ? gifSize(bytes) : imageSize(bytes); } catch { throw Error('图片无法读取。'); }
  if ('type' in size && !['png','jpg','webp'].includes(size.type) || !Number.isInteger(size.width) || !Number.isInteger(size.height) || size.width<1 || size.height<1 || size.width>4096 || size.height>4096) throw Error('图片尺寸不能超过 4096 × 4096。');
  return {width:size.width,height:size.height};
}
