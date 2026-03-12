/**
 * nostr-secure-enclave-server — Server-side Nostr Secure Enclave
 *
 * Process keypairs for relays, blossom, MCP, app servers.
 * Uses nostr-crypto-utils for all Nostr crypto operations.
 */

export type { NSEProvider, NSEEvent, NSESignedEvent, NSEKeyInfo, NSEStorage, NSEEncryptedBlob } from 'nostr-secure-enclave';
export { NSEError, NSEErrorCode } from 'nostr-secure-enclave';

export { NSEServer } from './server.js';
export type { NSEServerConfig } from './server.js';
export { NSEMemoryStorage } from './storage-memory.js';
export { generateMasterKey } from './crypto.js';
