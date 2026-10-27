import { randomBytes, scrypt, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

// Version 1 fixes the KDF parameters: untrusted files cannot request arbitrary work.
const magic = Buffer.from('MOYEENC\x01');
const derive = promisify(scrypt);
export const encrypted = bytes => bytes.length >= 8 && bytes.subarray(0, 8).equals(magic);
export function header(bytes) {
  if (!encrypted(bytes) || bytes.length < 52 || bytes.length > 21 * 1024 * 1024) throw Error('加密文档格式无效或已损坏。');
  return { salt: Buffer.from(bytes.subarray(8, 24)) };
}
export async function keyFor(password, salt = randomBytes(16)) {
  if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password) > 1024) throw Error('密码请使用至少 8 个字符，最长 1024 字节。');
  return { salt, key: await derive(password, salt, 32, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }) };
}
export function seal(bytes, secret, context = 'document') {
  const iv = randomBytes(12), prefix = Buffer.concat([magic, secret.salt, iv]);
  const cipher = createCipheriv('aes-256-gcm', secret.key, iv, { authTagLength: 16 });
  cipher.setAAD(Buffer.concat([prefix, Buffer.from(context)]));
  const content = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([prefix, cipher.getAuthTag(), content]);
}
export function unseal(bytes, secret, context = 'document') {
  const { salt } = header(bytes);
  try {
    if (!timingSafeEqual(salt, secret.salt)) throw Error();
    const decipher = createDecipheriv('aes-256-gcm', secret.key, bytes.subarray(24, 36), { authTagLength: 16 });
    decipher.setAAD(Buffer.concat([bytes.subarray(0, 36), Buffer.from(context)]));
    decipher.setAuthTag(bytes.subarray(36, 52));
    // Never return unauthenticated output before final() succeeds.
    return Buffer.concat([decipher.update(bytes.subarray(52)), decipher.final()]);
  } catch { throw Error('密码错误，或加密文件已损坏。'); }
}
