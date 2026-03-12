/**
 * AES-256-GCM encrypt/decrypt for key wrapping
 *
 * The master key protects the secp256k1 private key at rest.
 * On servers without hardware enclaves, this is the best we can do —
 * the master key comes from env/KMS/KV, and the private key is
 * only in plaintext during signing.
 */

import { bytesToHex, hexToBytes, randomBytes } from '@noble/hashes/utils.js';

const IV_LENGTH = 12; // AES-GCM standard
const ALGO = 'AES-GCM';

/** Import a hex master key for AES-256-GCM */
async function importKey(masterKeyHex: string): Promise<CryptoKey> {
  const keyBytes = hexToBytes(masterKeyHex);
  if (keyBytes.length !== 32) {
    throw new Error('Master key must be 32 bytes (64 hex chars)');
  }
  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: ALGO },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypt a secp256k1 private key with AES-256-GCM */
export async function encrypt(
  plaintextHex: string,
  masterKeyHex: string,
): Promise<{ ciphertext: string; iv: string }> {
  const key = await importKey(masterKeyHex);
  const iv = randomBytes(IV_LENGTH);
  const plaintext = hexToBytes(plaintextHex);

  const encrypted = await crypto.subtle.encrypt(
    { name: ALGO, iv },
    key,
    plaintext,
  );

  // Zero plaintext bytes
  plaintext.fill(0);

  return {
    ciphertext: bytesToHex(new Uint8Array(encrypted)),
    iv: bytesToHex(iv),
  };
}

/** Decrypt a secp256k1 private key from AES-256-GCM ciphertext */
export async function decrypt(
  ciphertextHex: string,
  ivHex: string,
  masterKeyHex: string,
): Promise<Uint8Array> {
  const key = await importKey(masterKeyHex);
  const iv = hexToBytes(ivHex);
  const ciphertext = hexToBytes(ciphertextHex);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGO, iv },
    key,
    ciphertext,
  );

  return new Uint8Array(decrypted);
}

/** Generate a random 32-byte master key (hex) */
export function generateMasterKey(): string {
  return bytesToHex(randomBytes(32));
}
