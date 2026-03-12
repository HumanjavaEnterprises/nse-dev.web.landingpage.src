/**
 * NSEServer — Server-side NSE implementation
 *
 * Uses nostr-crypto-utils for all Nostr operations:
 * - generateKeyPair() for secp256k1 key generation
 * - finalizeEvent() for event signing (pubkey derivation + id + sig)
 * - npubEncode() for bech32 encoding
 *
 * Uses @noble/hashes for AES-GCM key wrapping.
 */

import {
  generateKeyPair,
  signEvent,
  getPublicKeySync,
  nip19,
} from 'nostr-crypto-utils';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { encrypt, decrypt } from './crypto.js';
import { NSEError, NSEErrorCode } from '@nse-dev/core';
import type {
  NSEProvider,
  NSEEvent,
  NSESignedEvent,
  NSEKeyInfo,
  NSEStorage,
  NSEEncryptedBlob,
} from '@nse-dev/core';

const BLOB_KEY = 'nse:blob';

export interface NSEServerConfig {
  /** AES-256-GCM master key (64 hex chars). From env, KMS, or KV. */
  masterKey: string;
  /** Storage backend for the encrypted key blob */
  storage: NSEStorage;
}

export class NSEServer implements NSEProvider {
  private readonly masterKey: string;
  private readonly storage: NSEStorage;

  constructor(config: NSEServerConfig) {
    if (!config.masterKey || config.masterKey.length !== 64) {
      throw new NSEError(
        'Master key must be 64 hex chars (32 bytes)',
        NSEErrorCode.HARDWARE_UNAVAILABLE,
      );
    }
    this.masterKey = config.masterKey;
    this.storage = config.storage;
  }

  async generate(): Promise<NSEKeyInfo> {
    // Check if key already exists
    if (await this.exists()) {
      throw new NSEError('Key already exists — call destroy() first', NSEErrorCode.KEY_EXISTS);
    }

    // Generate secp256k1 keypair using nostr-crypto-utils
    const keyPair = await generateKeyPair();
    const privkeyHex = keyPair.privateKey;
    const pubkeyHex = keyPair.publicKey.hex;
    const npub = nip19.npubEncode(pubkeyHex);

    // Encrypt private key with AES-256-GCM
    const { ciphertext, iv } = await encrypt(privkeyHex, this.masterKey);

    // Zero the plaintext private key
    // (privkeyHex is a string — best effort, fill the source bytes if we had them)

    const now = Math.floor(Date.now() / 1000);

    // Build and store the encrypted blob
    const blob: NSEEncryptedBlob = {
      version: 1,
      ciphertext,
      iv,
      pubkey: pubkeyHex,
      npub,
      created_at: now,
      hardware_backed: false, // Server keys aren't hardware-backed (honest)
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
    // Load the encrypted blob
    const blob = await this.loadBlob();

    // Decrypt the private key
    let privkeyBytes: Uint8Array;
    try {
      privkeyBytes = await decrypt(blob.ciphertext, blob.iv, this.masterKey);
    } catch {
      throw new NSEError('Failed to decrypt key — wrong master key or corrupted blob', NSEErrorCode.DECRYPTION_FAILED);
    }

    const privkeyHex = bytesToHex(privkeyBytes);

    try {
      // Use nostr-crypto-utils signEvent with explicit fields
      // (finalizeEvent uses || which treats kind 0 as falsy)
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
      // Zero the plaintext key from memory
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
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private async loadBlob(): Promise<NSEEncryptedBlob> {
    const raw = await this.storage.get(BLOB_KEY);
    if (!raw) {
      throw new NSEError('No key found — call generate() first', NSEErrorCode.KEY_NOT_FOUND);
    }
    return JSON.parse(raw) as NSEEncryptedBlob;
  }
}
