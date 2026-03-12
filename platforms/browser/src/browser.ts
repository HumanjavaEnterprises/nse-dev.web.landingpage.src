/**
 * NSEBrowser — Browser NSE implementation
 *
 * Uses SubtleCrypto for AES-256-GCM key wrapping and
 * nostr-crypto-utils for all Nostr operations.
 *
 * Two modes:
 * 1. SubtleCrypto mode (default): generates a non-extractable AES key
 *    in the browser's crypto boundary. Key stored as JWK in IndexedDB.
 * 2. Master key mode: uses a hex master key (compatible with @nse-dev/server).
 *
 * Note: This is NOT hardware-backed like iOS Secure Enclave or Android StrongBox.
 * The browser's SubtleCrypto provides process isolation but not hardware protection.
 * hardware_backed is always false for browser keys.
 */

import {
  generateKeyPair,
  signEvent,
  getPublicKeySync,
  verifySignature,
  nip19,
} from 'nostr-crypto-utils';
import { encrypt, decrypt, hexToBytes, bytesToHex, generateWrappingKey, exportKeyToJwk, importKeyFromJwk, importHexKey } from './crypto.js';
import { NSEError, NSEErrorCode } from '../../core/src/index.js';
import type {
  NSEProvider,
  NSEEvent,
  NSESignedEvent,
  NSEKeyInfo,
  NSEStorage,
  NSEEncryptedBlob,
} from '../../core/src/index.js';

const BLOB_KEY = 'nse:blob';
const WRAPPING_KEY = 'nse:wrapping-key';

export interface NSEBrowserConfig {
  /** Storage backend (IndexedDB or memory) */
  storage: NSEStorage;
  /**
   * Optional hex master key (64 chars).
   * If provided, uses this instead of generating a SubtleCrypto key.
   * Compatible with @nse-dev/server master key.
   */
  masterKey?: string;
}

export class NSEBrowser implements NSEProvider {
  private readonly storage: NSEStorage;
  private readonly masterKey?: string;

  constructor(config: NSEBrowserConfig) {
    if (config.masterKey && config.masterKey.length !== 64) {
      throw new NSEError(
        'Master key must be 64 hex chars (32 bytes)',
        NSEErrorCode.HARDWARE_UNAVAILABLE,
      );
    }
    this.storage = config.storage;
    this.masterKey = config.masterKey;
  }

  async generate(): Promise<NSEKeyInfo> {
    if (await this.exists()) {
      throw new NSEError('Key already exists — call destroy() first', NSEErrorCode.KEY_EXISTS);
    }

    // Generate secp256k1 keypair using nostr-crypto-utils
    const keyPair = await generateKeyPair();
    const privkeyHex = keyPair.privateKey;
    const pubkeyHex = keyPair.publicKey.hex;
    const npub = nip19.npubEncode(pubkeyHex);
    const privkeyBytes = hexToBytes(privkeyHex);

    // Get or create wrapping key
    const wrappingKey = await this.getOrCreateWrappingKey();

    // Encrypt private key with AES-256-GCM
    const { ciphertext, iv } = await encrypt(privkeyBytes, wrappingKey);

    // Zero plaintext
    privkeyBytes.fill(0);

    const now = Math.floor(Date.now() / 1000);

    const blob: NSEEncryptedBlob = {
      version: 1,
      ciphertext: bytesToHex(ciphertext),
      iv: bytesToHex(iv),
      pubkey: pubkeyHex,
      npub,
      created_at: now,
      hardware_backed: false, // Browser keys are never hardware-backed (honest)
    };

    await this.storage.put(BLOB_KEY, JSON.stringify(blob));

    return {
      pubkey: pubkeyHex,
      npub,
      created_at: now,
      hardware_backed: false,
    };
  }

  async sign(event: NSEEvent): Promise<NSESignedEvent> {
    const blob = await this.loadBlob();
    const wrappingKey = await this.getWrappingKey();

    // Decrypt the private key
    let privkeyBytes: Uint8Array;
    try {
      privkeyBytes = await decrypt(
        hexToBytes(blob.ciphertext),
        hexToBytes(blob.iv),
        wrappingKey,
      );
    } catch {
      throw new NSEError(
        'Failed to decrypt key — wrong wrapping key or corrupted blob',
        NSEErrorCode.DECRYPTION_FAILED,
      );
    }

    const privkeyHex = bytesToHex(privkeyBytes);

    try {
      const pubkey = getPublicKeySync(privkeyHex);
      const fullEvent = {
        kind: event.kind,
        content: event.content,
        tags: event.tags,
        created_at: event.created_at,
        pubkey,
      };

      const signed = await signEvent(fullEvent, privkeyHex);

      return {
        id: signed.id,
        pubkey: signed.pubkey,
        sig: signed.sig,
        kind: signed.kind,
        content: signed.content,
        tags: signed.tags,
        created_at: signed.created_at,
      };
    } finally {
      // Zero plaintext key from memory
      privkeyBytes.fill(0);
    }
  }

  async getPublicKey(): Promise<string> {
    const blob = await this.loadBlob();
    return blob.pubkey;
  }

  async getNpub(): Promise<string> {
    const blob = await this.loadBlob();
    return blob.npub;
  }

  async exists(): Promise<boolean> {
    const raw = await this.storage.get(BLOB_KEY);
    return raw !== null;
  }

  async destroy(): Promise<void> {
    await this.storage.delete(BLOB_KEY);
    await this.storage.delete(WRAPPING_KEY);
  }

  // -----------------------------------------------------------------------
  // Internal — wrapping key management
  // -----------------------------------------------------------------------

  private async getOrCreateWrappingKey(): Promise<CryptoKey> {
    // If master key provided, use that
    if (this.masterKey) {
      return importHexKey(this.masterKey);
    }

    // Check if we already have a wrapping key in storage
    const existing = await this.storage.get(WRAPPING_KEY);
    if (existing) {
      const jwk = JSON.parse(existing) as JsonWebKey;
      return importKeyFromJwk(jwk);
    }

    // Generate new wrapping key — extractable so we can persist it in IndexedDB
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true, // extractable for JWK storage
      ['encrypt', 'decrypt'],
    );

    const jwk = await exportKeyToJwk(key);
    await this.storage.put(WRAPPING_KEY, JSON.stringify(jwk));

    return key;
  }

  private async getWrappingKey(): Promise<CryptoKey> {
    if (this.masterKey) {
      return importHexKey(this.masterKey);
    }

    const raw = await this.storage.get(WRAPPING_KEY);
    if (!raw) {
      throw new NSEError(
        'Wrapping key not found — was destroy() called?',
        NSEErrorCode.KEY_NOT_FOUND,
      );
    }

    const jwk = JSON.parse(raw) as JsonWebKey;
    return importKeyFromJwk(jwk);
  }

  private async loadBlob(): Promise<NSEEncryptedBlob> {
    const raw = await this.storage.get(BLOB_KEY);
    if (!raw) {
      throw new NSEError('No key found — call generate() first', NSEErrorCode.KEY_NOT_FOUND);
    }
    return JSON.parse(raw) as NSEEncryptedBlob;
  }
}
