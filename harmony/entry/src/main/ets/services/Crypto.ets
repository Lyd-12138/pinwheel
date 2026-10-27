import { cryptoFramework } from '@kit.CryptoArchitectureKit';
import { util } from '@kit.ArkTS';

export interface CryptoResult { data: string; token: string; }
interface Secret { salt: Uint8Array; key: cryptoFramework.SymKey; }
const MAGIC: number[] = [77, 79, 89, 69, 69, 78, 67, 1];
export function join(parts: Uint8Array[]): Uint8Array {
  let size = 0; for (const p of parts) size += p.length;
  const result = new Uint8Array(size); let offset = 0;
  for (const p of parts) { result.set(p, offset); offset += p.length; } return result;
}
export function isEncrypted(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false; for (let i = 0; i < 8; i++) if (bytes[i] !== MAGIC[i]) return false; return true;
}
export class NoteCrypto {
  private secrets: Map<string, Secret> = new Map();
  private base64: util.Base64Helper = new util.Base64Helper();
  decode(value: string): Uint8Array {
    if (typeof value !== 'string' || value.length > 46 * 1024 * 1024) throw new Error('文件超过限制。');
    return this.base64.decodeSync(value);
  }
  encode(value: Uint8Array): string { return this.base64.encodeToStringSync(value); }
  random(size: number): Uint8Array { return cryptoFramework.createRandom().generateRandomSync(size).data; }
  async digest(data: Uint8Array): Promise<string> {
    const md = cryptoFramework.createMd('SHA256'); await md.update({ data }); const result = await md.digest();
    let value = ''; for (const byte of result.data) value += byte.toString(16).padStart(2, '0'); return value;
  }
  private async derive(password: string, salt: Uint8Array): Promise<Secret> {
    const passphrase = new util.TextEncoder().encodeInto(password);
    if (password.length < 8 || passphrase.length > 1024) throw new Error('密码至少 8 个字符，最长 1024 字节。');
    const spec: cryptoFramework.ScryptSpec = { algName: 'SCRYPT', passphrase, salt, n: 131072, r: 8, p: 1, maxMemory: 256 * 1024 * 1024, keySize: 32 };
    const derived = await cryptoFramework.createKdf('SCRYPT').generateSecret(spec);
    try { return { salt, key: await cryptoFramework.createSymKeyGenerator('AES256').convertKey(derived) }; }
    finally { passphrase.fill(0); derived.data.fill(0); }
  }
  async seal(data: string, token: string = '', password: string = ''): Promise<CryptoResult> {
    const bytes = this.decode(data); if (bytes.length > 20 * 1024 * 1024) throw new Error('文档超过 20MB。');
    let secret = this.secrets.get(token), fresh = false;
    if (!secret) { if (!password) throw new Error('文档已锁定，请重新输入密码。'); secret = await this.derive(password, this.random(16)); token = this.encode(this.random(24)); fresh = true; }
    const iv = this.random(12), prefix = join([new Uint8Array(MAGIC), secret.salt, iv]);
    const params: cryptoFramework.GcmParamsSpec = { algName: 'GcmParamsSpec', iv: { data: iv }, aad: { data: join([prefix, new util.TextEncoder().encodeInto('document')]) }, authTag: { data: new Uint8Array(16) } };
    const cipher = cryptoFramework.createCipher('AES256|GCM|NoPadding'); await cipher.init(cryptoFramework.CryptoMode.ENCRYPT_MODE, secret.key, params);
    const output = (await cipher.doFinal({ data: bytes })).data;
    // CryptoFramework appends the GCM tag; MOYEENC v1 stores it before ciphertext.
    const stored = join([prefix, output.slice(output.length - 16), output.slice(0, output.length - 16)]);
    if (fresh) this.secrets.set(token, secret); bytes.fill(0); return { token, data: this.encode(stored) };
  }
  async open(data: string, password: string = '', token: string = ''): Promise<CryptoResult> {
    const bytes = this.decode(data); if (!isEncrypted(bytes) || bytes.length < 52 || bytes.length > 21 * 1024 * 1024) throw new Error('加密文档格式无效或已损坏。');
    let secret = this.secrets.get(token), fresh = false;
    if (!secret) { secret = await this.derive(password, bytes.slice(8, 24)); token = this.encode(this.random(24)); fresh = true; }
    let difference = 0; for (let i = 0; i < 16; i++) difference |= secret.salt[i] ^ bytes[8 + i];
    if (difference) throw new Error('密码错误，或加密文件已损坏。');
    const params: cryptoFramework.GcmParamsSpec = { algName: 'GcmParamsSpec', iv: { data: bytes.slice(24, 36) }, aad: { data: join([bytes.slice(0, 36), new util.TextEncoder().encodeInto('document')]) }, authTag: { data: bytes.slice(36, 52) } };
    try {
      const cipher = cryptoFramework.createCipher('AES256|GCM|NoPadding'); await cipher.init(cryptoFramework.CryptoMode.DECRYPT_MODE, secret.key, params);
      const plain = (await cipher.doFinal({ data: bytes.slice(52) })).data;
      const encoded = this.encode(plain); plain.fill(0); if (fresh) this.secrets.set(token, secret); return { token, data: encoded };
    } catch { throw new Error('密码错误，或加密文件已损坏。'); }
  }
  forget(token: string): void { this.secrets.delete(token); }
  forgetAll(): void { this.secrets.clear(); }
}
