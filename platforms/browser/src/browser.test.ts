import { describe, it, expect, beforeEach } from 'vitest';
import { NSEBrowser } from './browser.js';
import { NSEMemoryStorage } from './storage-memory.js';
import { NSEError, NSEErrorCode } from '@nse-dev/core';
import { verifySignature } from 'nostr-crypto-utils';
import { bytesToHex } from './crypto.js';

describe('@nse-dev/browser — NSEBrowser', () => {
  let nse: NSEBrowser;
  let storage: NSEMemoryStorage;

  beforeEach(() => {
    storage = new NSEMemoryStorage();
    nse = new NSEBrowser({ storage });
  });

  describe('constructor', () => {
    it('accepts no master key (SubtleCrypto mode)', () => {
      expect(() => new NSEBrowser({ storage })).not.toThrow();
    });

    it('accepts a valid master key', () => {
      const key = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
      expect(() => new NSEBrowser({ storage, masterKey: key })).not.toThrow();
    });

    it('rejects invalid master key length', () => {
      expect(() => new NSEBrowser({ storage, masterKey: 'tooshort' })).toThrow(NSEError);
    });
  });

  describe('generate()', () => {
    it('generates a keypair and returns key info', async () => {
      const info = await nse.generate();

      expect(info.pubkey).toHaveLength(64);
      expect(info.npub).toMatch(/^npub1/);
      expect(info.created_at).toBeGreaterThan(0);
      expect(info.hardware_backed).toBe(false);
    });

    it('stores encrypted blob + wrapping key in storage', async () => {
      await nse.generate();

      const blob = await storage.get('nse:blob');
      expect(blob).not.toBeNull();

      const parsed = JSON.parse(blob!);
      expect(parsed.version).toBe(1);
      expect(parsed.hardware_backed).toBe(false);

      // Wrapping key should also be stored (SubtleCrypto mode)
      const wrappingKey = await storage.get('nse:wrapping-key');
      expect(wrappingKey).not.toBeNull();
    });

    it('throws KEY_EXISTS if key already exists', async () => {
      await nse.generate();
      await expect(nse.generate()).rejects.toThrow(NSEError);

      try {
        await nse.generate();
      } catch (e) {
        expect((e as NSEError).code).toBe(NSEErrorCode.KEY_EXISTS);
      }
    });
  });

  describe('exists()', () => {
    it('returns false when no key', async () => {
      expect(await nse.exists()).toBe(false);
    });

    it('returns true after generate', async () => {
      await nse.generate();
      expect(await nse.exists()).toBe(true);
    });
  });

  describe('getPublicKey() / getNpub()', () => {
    it('returns pubkey from stored blob', async () => {
      const info = await nse.generate();
      expect(await nse.getPublicKey()).toBe(info.pubkey);
    });

    it('returns npub from stored blob', async () => {
      const info = await nse.generate();
      expect(await nse.getNpub()).toBe(info.npub);
    });

    it('throws KEY_NOT_FOUND when no key', async () => {
      await expect(nse.getPublicKey()).rejects.toThrow(NSEError);
    });
  });

  describe('sign()', () => {
    it('signs a Nostr event with valid Schnorr signature', async () => {
      const info = await nse.generate();

      const signed = await nse.sign({
        kind: 1,
        content: 'hello from NSE browser',
        tags: [],
        created_at: Math.floor(Date.now() / 1000),
      });

      expect(signed.id).toHaveLength(64);
      expect(signed.pubkey).toBe(info.pubkey);
      expect(signed.sig).toHaveLength(128);
    });

    it('produces a signature that verifies', async () => {
      await nse.generate();

      const signed = await nse.sign({
        kind: 1,
        content: 'verify me in browser',
        tags: [['t', 'nse']],
        created_at: Math.floor(Date.now() / 1000),
      });

      const valid = await verifySignature(signed);
      expect(valid).toBe(true);
    });

    it('signs kind 0 metadata events correctly', async () => {
      await nse.generate();

      const signed = await nse.sign({
        kind: 0,
        content: JSON.stringify({ name: 'NSE Browser Test' }),
        tags: [],
        created_at: Math.floor(Date.now() / 1000),
      });

      expect(signed.kind).toBe(0);
      const valid = await verifySignature(signed);
      expect(valid).toBe(true);
    });

    it('throws KEY_NOT_FOUND when no key', async () => {
      await expect(nse.sign({
        kind: 1, content: 'no key', tags: [], created_at: 0,
      })).rejects.toThrow(NSEError);
    });
  });

  describe('destroy()', () => {
    it('removes key and wrapping key from storage', async () => {
      await nse.generate();
      expect(await nse.exists()).toBe(true);

      await nse.destroy();
      expect(await nse.exists()).toBe(false);

      // Wrapping key also removed
      expect(await storage.get('nse:wrapping-key')).toBeNull();
    });

    it('allows re-generate after destroy', async () => {
      await nse.generate();
      await nse.destroy();
      const info = await nse.generate();
      expect(info.pubkey).toHaveLength(64);
    });
  });

  describe('master key mode', () => {
    it('works with explicit master key (server-compatible)', async () => {
      const masterKey = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
      const nseWithKey = new NSEBrowser({ storage: new NSEMemoryStorage(), masterKey });

      const info = await nseWithKey.generate();
      expect(info.pubkey).toHaveLength(64);

      const signed = await nseWithKey.sign({
        kind: 1,
        content: 'master key mode',
        tags: [],
        created_at: Math.floor(Date.now() / 1000),
      });

      const valid = await verifySignature(signed);
      expect(valid).toBe(true);
    });

    it('does not store wrapping key when master key provided', async () => {
      const masterKey = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
      const memStorage = new NSEMemoryStorage();
      const nseWithKey = new NSEBrowser({ storage: memStorage, masterKey });

      await nseWithKey.generate();
      expect(await memStorage.get('nse:wrapping-key')).toBeNull();
    });

    it('fails to decrypt with wrong master key', async () => {
      const key1 = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
      const key2 = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
      const memStorage = new NSEMemoryStorage();

      const nse1 = new NSEBrowser({ storage: memStorage, masterKey: key1 });
      await nse1.generate();

      const nse2 = new NSEBrowser({ storage: memStorage, masterKey: key2 });
      try {
        await nse2.sign({ kind: 1, content: 'wrong key', tags: [], created_at: 0 });
        expect.unreachable('should have thrown');
      } catch (e) {
        expect((e as NSEError).code).toBe(NSEErrorCode.DECRYPTION_FAILED);
      }
    });
  });

  describe('sign/verify round-trip', () => {
    it('generate → sign 5 events → verify all', async () => {
      const info = await nse.generate();

      for (let i = 0; i < 5; i++) {
        const signed = await nse.sign({
          kind: 1,
          content: `browser message ${i}`,
          tags: [['nonce', String(i)]],
          created_at: Math.floor(Date.now() / 1000) + i,
        });

        expect(signed.pubkey).toBe(info.pubkey);
        const valid = await verifySignature(signed);
        expect(valid).toBe(true);
      }
    });
  });

  describe('encrypted blob security', () => {
    it('ciphertext is not the raw private key', async () => {
      await nse.generate();

      const raw = await storage.get('nse:blob');
      const blob = JSON.parse(raw!);

      // Ciphertext includes AES-GCM auth tag, so it's longer than 64 chars
      expect(blob.ciphertext.length).toBeGreaterThan(64);
    });

    it('different generates produce different ciphertexts', async () => {
      await nse.generate();
      const blob1 = await storage.get('nse:blob');
      await nse.destroy();

      await nse.generate();
      const blob2 = await storage.get('nse:blob');

      // Different keys + different IVs = different ciphertexts
      expect(JSON.parse(blob1!).ciphertext).not.toBe(JSON.parse(blob2!).ciphertext);
    });
  });
});
