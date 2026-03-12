/**
 * @nse-dev/browser — Browser Nostr Secure Enclave
 * WebAuthn + SubtleCrypto P-256 key wrapping for secp256k1
 */

import type { NSEProvider, NSEEvent, NSESignedEvent, NSEKeyInfo } from '../../core/src/index.js';

/**
 * Browser implementation using SubtleCrypto + WebAuthn
 * P-256 key wraps secp256k1 via AES-GCM, stored in IndexedDB
 */
export class NSEBrowser implements NSEProvider {
  // TODO: Phase 5 implementation
  // Research: Is WebAuthn biometric per-sign acceptable UX?

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
