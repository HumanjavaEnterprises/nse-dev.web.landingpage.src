/**
 * Browser AES-256-GCM encrypt/decrypt using SubtleCrypto
 *
 * Uses the Web Crypto API (crypto.subtle) — available in all modern browsers.
 * The wrapping key is derived from a P-256 key pair stored in SubtleCrypto
 * (non-extractable). This is NOT hardware-backed like Secure Enclave,
 * but it does keep the wrapping key inside the browser's crypto boundary.
 */

const IV_LENGTH = 12;
const ALGO = 'AES-GCM';

/** Generate a non-extractable AES-256-GCM wrapping key in SubtleCrypto */
export async function generateWrappingKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: ALGO, length: 256 },
    false, // non-extractable
    ['encrypt', 'decrypt'],
  );
}

/** Export a CryptoKey to JWK for IndexedDB storage (only if extractable) */
export async function exportKeyToJwk(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey('jwk', key);
}

/** Import a JWK back to a CryptoKey */
export async function importKeyFromJwk(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: ALGO },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Import a hex master key as CryptoKey (for server-compatible mode) */
export async function importHexKey(hexKey: string): Promise<CryptoKey> {
  const bytes = hexToBytes(hexKey);
  if (bytes.length !== 32) {
    throw new Error('Key must be 32 bytes (64 hex chars)');
  }
  return crypto.subtle.importKey(
    'raw',
    bytes,
    { name: ALGO },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypt plaintext bytes with AES-256-GCM */
export async function encrypt(
  plaintext: Uint8Array,
  key: CryptoKey,
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const encrypted = await crypto.subtle.encrypt(
    { name: ALGO, iv },
    key,
    plaintext,
  );

  return {
    ciphertext: new Uint8Array(encrypted),
    iv,
  };
}

/** Decrypt ciphertext with AES-256-GCM */
export async function decrypt(
  ciphertext: Uint8Array,
  iv: Uint8Array,
  key: CryptoKey,
): Promise<Uint8Array> {
  const decrypted = await crypto.subtle.decrypt(
    { name: ALGO, iv },
    key,
    ciphertext,
  );

  return new Uint8Array(decrypted);
}

// ---------------------------------------------------------------------------
// Hex utilities (avoid importing @noble/hashes in browser bundle if possible)
// ---------------------------------------------------------------------------

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
