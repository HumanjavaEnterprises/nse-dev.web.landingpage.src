/**
 * @nse-dev/server — Server-side Nostr Secure Enclave
 * Process keypairs for relays, blossom, MCP, app servers
 */

import type { NSEProvider, NSEEvent, NSESignedEvent, NSEKeyInfo } from '../../core/src/index.js';

export interface NSEServerConfig {
  /** AES-GCM master key (hex string, from env or KMS) */
  masterKey: string;
  /** Storage backend for encrypted key blob */
  storage: NSEStorage;
}

export interface NSEStorage {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * Cloudflare Workers implementation
 * Uses crypto.subtle for AES-GCM, KV for blob storage
 */
export class NSECloudflare implements NSEProvider {
  // TODO: Phase 3 implementation
  // 1. Import master key via crypto.subtle.importKey
  // 2. Generate secp256k1 keypair
  // 3. Encrypt with AES-GCM
  // 4. Store in KV
  // 5. On sign: decrypt, sign (Schnorr), zero

  constructor(private config: NSEServerConfig) {}

  async generate(): Promise<NSEKeyInfo> {
    throw new Error('Not yet implemented');
  }

  async sign(event: NSEEvent): Promise<NSESignedEvent> {
    throw new Error('Not yet implemented');
  }

  async getPublicKey(): Promise<string> {
    throw new Error('Not yet implemented');
  }

  async getNpub(): Promise<string> {
    throw new Error('Not yet implemented');
  }

  async exists(): Promise<boolean> {
    throw new Error('Not yet implemented');
  }

  async destroy(): Promise<void> {
    throw new Error('Not yet implemented');
  }
}

/**
 * Node.js implementation
 * Uses crypto module for AES-GCM, env-provided master key
 * Optional TPM 2.0 via tpm2-tss
 */
export class NSENode implements NSEProvider {
  // TODO: Phase 3 implementation

  constructor(private config: NSEServerConfig) {}

  async generate(): Promise<NSEKeyInfo> {
    throw new Error('Not yet implemented');
  }

  async sign(event: NSEEvent): Promise<NSESignedEvent> {
    throw new Error('Not yet implemented');
  }

  async getPublicKey(): Promise<string> {
    throw new Error('Not yet implemented');
  }

  async getNpub(): Promise<string> {
    throw new Error('Not yet implemented');
  }

  async exists(): Promise<boolean> {
    throw new Error('Not yet implemented');
  }

  async destroy(): Promise<void> {
    throw new Error('Not yet implemented');
  }
}
