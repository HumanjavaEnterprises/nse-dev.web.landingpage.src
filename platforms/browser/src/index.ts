/**
 * @nse-dev/browser — Browser Nostr Secure Enclave
 *
 * Uses SubtleCrypto for AES-256-GCM key wrapping and
 * nostr-crypto-utils for Schnorr signing.
 */

export type { NSEProvider, NSEEvent, NSESignedEvent, NSEKeyInfo, NSEStorage, NSEEncryptedBlob } from '../../core/src/index.js';
export { NSEError, NSEErrorCode } from '../../core/src/index.js';

export { NSEBrowser } from './browser.js';
export type { NSEBrowserConfig } from './browser.js';
export { NSEIndexedDBStorage } from './storage-indexeddb.js';
export { NSEMemoryStorage } from './storage-memory.js';
