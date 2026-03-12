import { describe, it, expect } from 'vitest';
import { NSEError, NSEErrorCode } from './index.js';
import type {
  NSEEvent,
  NSESignedEvent,
  NSEKeyInfo,
  NSEProvider,
  NSEStorage,
  NSEEncryptedBlob,
} from './index.js';

describe('nostr-secure-enclave types', () => {
  it('NSEEvent is compatible with nostr-crypto-utils BaseNostrEvent', () => {
    const event: NSEEvent = {
      kind: 1,
      content: 'hello nostr',
      tags: [['p', 'abc123']],
      created_at: Math.floor(Date.now() / 1000),
    };
    expect(event.kind).toBe(1);
    expect(event.content).toBe('hello nostr');
    expect(event.tags).toHaveLength(1);
    expect(typeof event.created_at).toBe('number');
  });

  it('NSEEvent accepts optional pubkey', () => {
    const event: NSEEvent = {
      kind: 0,
      content: '{}',
      tags: [],
      created_at: 1710000000,
      pubkey: 'aabbccdd'.repeat(8),
    };
    expect(event.pubkey).toHaveLength(64);
  });

  it('NSESignedEvent has all required fields', () => {
    const signed: NSESignedEvent = {
      id: 'a'.repeat(64),
      pubkey: 'b'.repeat(64),
      sig: 'c'.repeat(128),
      kind: 1,
      content: 'test',
      tags: [],
      created_at: 1710000000,
    };
    expect(signed.id).toHaveLength(64);
    expect(signed.pubkey).toHaveLength(64);
    expect(signed.sig).toHaveLength(128);
  });

  it('NSEKeyInfo includes hardware_backed flag', () => {
    const info: NSEKeyInfo = {
      pubkey: 'a'.repeat(64),
      npub: 'npub1' + 'x'.repeat(58),
      created_at: 1710000000,
      hardware_backed: true,
    };
    expect(info.hardware_backed).toBe(true);
  });

  it('NSEEncryptedBlob has version 1', () => {
    const blob: NSEEncryptedBlob = {
      version: 1,
      ciphertext: 'base64encoded==',
      iv: 'aWluaXR2ZWN0',
      pubkey: 'a'.repeat(64),
      npub: 'npub1' + 'x'.repeat(58),
      created_at: 1710000000,
      hardware_backed: true,
    };
    expect(blob.version).toBe(1);
  });

  it('NSEError carries error code', () => {
    const err = new NSEError('No key found', NSEErrorCode.KEY_NOT_FOUND);
    expect(err.message).toBe('No key found');
    expect(err.code).toBe('KEY_NOT_FOUND');
    expect(err.name).toBe('NSEError');
    expect(err instanceof Error).toBe(true);
  });

  it('NSEErrorCode has all expected codes', () => {
    const codes = Object.values(NSEErrorCode);
    expect(codes).toContain('KEY_NOT_FOUND');
    expect(codes).toContain('AUTH_FAILED');
    expect(codes).toContain('HARDWARE_UNAVAILABLE');
    expect(codes).toContain('KEY_EXISTS');
    expect(codes).toContain('DECRYPTION_FAILED');
    expect(codes).toContain('STORAGE_ERROR');
    expect(codes).toContain('SIGN_FAILED');
    expect(codes).toHaveLength(7);
  });

  it('NSEStorage interface is structurally valid', () => {
    // Verify the interface works with a mock implementation
    const storage: NSEStorage = {
      get: async (key: string) => key === 'exists' ? 'value' : null,
      put: async (_key: string, _value: string) => {},
      delete: async (_key: string) => {},
    };
    expect(storage.get).toBeDefined();
    expect(storage.put).toBeDefined();
    expect(storage.delete).toBeDefined();
  });

  it('NSEProvider interface accepts a mock implementation', () => {
    // Structural type check — a mock provider satisfies the interface
    const mock: NSEProvider = {
      generate: async () => ({
        pubkey: 'a'.repeat(64),
        npub: 'npub1test',
        created_at: Date.now(),
        hardware_backed: false,
      }),
      sign: async (event) => ({
        ...event,
        id: 'a'.repeat(64),
        pubkey: 'b'.repeat(64),
        sig: 'c'.repeat(128),
      }),
      getPublicKey: async () => 'a'.repeat(64),
      getNpub: async () => 'npub1test',
      exists: async () => true,
      destroy: async () => {},
    };
    expect(mock.generate).toBeDefined();
    expect(mock.sign).toBeDefined();
  });
});
