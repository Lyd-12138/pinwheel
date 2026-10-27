// Test adapter for the documented Harmony APIs. It does not emulate ArkUI or replace SDK validation.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { promisify } from 'node:util';
const derive = promisify(crypto.scrypt);
const appStorage = new Map();
globalThis.AppStorage ??= { setOrCreate: (key, value) => appStorage.set(key, value), get: key => appStorage.get(key) };
export const i18n = { System: { getSystemLanguage: () => process.env.MOYE_TEST_LOCALE || 'zh-CN' } };
export const cryptoFramework = {
  CryptoMode: { ENCRYPT_MODE: 0, DECRYPT_MODE: 1 },
  createRandom: () => ({ generateRandomSync: size => ({ data: new Uint8Array(crypto.randomBytes(size)) }) }),
  createMd: () => { const md = crypto.createHash('sha256'); return { update: async blob => { md.update(blob.data); }, digest: async () => ({ data: new Uint8Array(md.digest()) }) }; },
  createKdf: name => { if (name !== 'SCRYPT') throw Error(name); return { generateSecret: async spec => ({ data: new Uint8Array(await derive(spec.passphrase, spec.salt, spec.keySize, { N: spec.n, r: spec.r, p: spec.p, maxmem: spec.maxMemory })) }) }; },
  createSymKeyGenerator: name => { if (name !== 'AES256') throw Error(name); return { convertKey: async blob => ({ bytes: Buffer.from(blob.data) }) }; },
  createCipher: name => {
    if (name !== 'AES256|GCM|NoPadding') throw Error(name); let engine, mode;
    return { init: async (selected, key, params) => { mode = selected; engine = mode === 0 ? crypto.createCipheriv('aes-256-gcm', key.bytes, params.iv.data) : crypto.createDecipheriv('aes-256-gcm', key.bytes, params.iv.data); engine.setAAD(params.aad.data); if (mode === 1) engine.setAuthTag(params.authTag.data); }, doFinal: async blob => { const output = Buffer.concat([engine.update(blob.data), engine.final()]); return { data: new Uint8Array(mode === 0 ? Buffer.concat([output, engine.getAuthTag()]) : output) }; } };
  },
};
export const util = { Base64Helper: class { decodeSync(s) { return new Uint8Array(Buffer.from(s, 'base64')); } encodeToStringSync(b) { return Buffer.from(b).toString('base64'); } }, TextEncoder: class { encodeInto(s) { return new TextEncoder().encode(s); } } };
export const fileIo = {
  OpenMode: { READ_ONLY: 0, READ_WRITE: fs.constants.O_RDWR, CREATE: fs.constants.O_CREAT, TRUNC: fs.constants.O_TRUNC },
  accessSync: path => fs.existsSync(path), mkdirSync: (path, recursive) => fs.mkdirSync(path, { recursive }),
  lstatSync: fs.lstatSync, statSync: fd => { const s = typeof fd === 'number' ? fs.fstatSync(fd) : fs.statSync(fd); return { size: s.size, mtime: s.mtimeMs / 1000 }; },
  openSync: (path, flags) => ({ fd: fs.openSync(path, flags) }), closeSync: file => fs.closeSync(file.fd),
  // Exercise partial reads/writes rather than relying on a single completed syscall.
  readSync: (fd, buffer) => fs.readSync(fd, new Uint8Array(buffer), 0, Math.min(buffer.byteLength, 377), null),
  writeSync: (fd, buffer) => fs.writeSync(fd, new Uint8Array(buffer), 0, Math.min(buffer.byteLength, 211), null),
  fsyncSync: fs.fsyncSync, renameSync: fs.renameSync, unlinkSync: fs.unlinkSync, listFileSync: path => fs.readdirSync(path),
};
export const text = { SystemFontType: { GENERIC: 0 }, getSystemFontFullNamesByType: async () => ['System Test'], getFontDescriptorByFullName: async () => ({ fontFamily: 'system-ui' }) };
export const picker = { DocumentSelectOptions: class {}, DocumentSaveOptions: class {}, DocumentViewPicker: class { async select() { return []; } async save() { return []; } } };
