import { createHash, createHmac, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import { hash, verify, Algorithm } from '@node-rs/argon2';
export const opaqueToken = () => randomBytes(32).toString('base64url');
export const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export const csrfFor = (secret: string, token: string) => createHmac('sha256', secret).update(`csrf:${token}`).digest('base64url');
export function safeEquals(left: string, right: string) { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }
export const hashPassword = (value: string) => hash(value, { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 });
export const verifyPassword = (encoded: string, value: string) => verify(encoded, value);
export const normalizeDocument = (value: string) => value.normalize('NFKC').trim().toUpperCase().replace(/[\s.\-]/g, '');
export const documentFingerprint = (secret: string, organizationId: string, kind: string, value: string) => createHmac('sha256', Buffer.from(secret, 'hex')).update(`player-document:v1:${organizationId}:${kind}:${normalizeDocument(value)}`).digest('hex');
export function encryptDocument(secret: string, value: string) {
  const key = createHmac('sha256', Buffer.from(secret, 'hex')).update('player-document-encryption:v1').digest();
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}
export function decryptDocument(secret: string, encoded: string) {
  const raw = Buffer.from(encoded, 'base64url');
  if (raw.length < 29) throw new Error('Documento cifrado inválido.');
  const key = createHmac('sha256', Buffer.from(secret, 'hex')).update('player-document-encryption:v1').digest();
  const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}
