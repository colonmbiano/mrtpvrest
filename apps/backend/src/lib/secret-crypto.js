// Cifrado simétrico para secretos almacenados en DB (AES-256-GCM).
//
// Uso: se cifra con una clave de 32 bytes leída de AI_ENCRYPTION_KEY (hex de
// 64 caracteres). Para generarla:
//   openssl rand -hex 32
//
// Formato del ciphertext: `<ivHex>:<tagHex>:<dataHex>`. El IV es único por
// operación (12 bytes), el tag GCM (16 bytes) autentica los datos. Si el tag
// no coincide en decrypt, crypto.createDecipheriv lanza — lo tratamos como
// corrupción y devolvemos null.

const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;

function getKey() {
  const raw = process.env.AI_ENCRYPTION_KEY;
  if (!raw) {
    const err = new Error('AI_ENCRYPTION_KEY no está configurada. Genera una con `openssl rand -hex 32`.');
    err.code = 'CRYPTO_UNCONFIGURED';
    throw err;
  }
  const key = Buffer.from(raw, 'hex');
  if (key.length !== 32) {
    const err = new Error('AI_ENCRYPTION_KEY debe ser hex de 64 caracteres (32 bytes).');
    err.code = 'CRYPTO_UNCONFIGURED';
    throw err;
  }
  return key;
}

function encryptSecret(plaintext) {
  if (plaintext == null || plaintext === '') return null;
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function decryptSecret(ciphertext) {
  if (!ciphertext) return null;
  try {
    const parts = String(ciphertext).split(':');
    if (parts.length !== 3) return null;
    const [ivHex, tagHex, dataHex] = parts;
    const key = getKey();
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const data = Buffer.from(dataHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return dec.toString('utf8');
  } catch (e) {
    if (e.code === 'CRYPTO_UNCONFIGURED') throw e;
    return null; // tag inválido / datos corruptos
  }
}

function maskSecret(plaintext) {
  if (!plaintext) return '';
  const s = String(plaintext);
  if (s.length <= 8) return '•'.repeat(s.length);
  return `${s.slice(0, 4)}${'•'.repeat(Math.max(8, s.length - 8))}${s.slice(-4)}`;
}

module.exports = { encryptSecret, decryptSecret, maskSecret };
