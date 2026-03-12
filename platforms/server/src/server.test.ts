import { describe, it, expect, beforeEach } from 'vitest';
import { NSEServer } from './server.js';
import { NSEMemoryStorage } from './storage-memory.js';
import { generateMasterKey } from './crypto.js';
import { NSEError, NSEErrorCode } from '../../core/src/index.js';
import { verifySignature } from 'nostr-crypto-utils';

describe('@nse-dev/server — NSEServer', () => {
  let nse: NSEServer;
  let storage: NSEMemoryStorage;
  let masterKey: string;

  beforeEach(() => {
    masterKey = generateMasterKey();
    storage = new NSEMemoryStorage();
    nse = new NSEServer({ masterKey, storage });
  });

  describe('constructor', () => {
    it('rejects invalid master key length', () => {
      expect(() => new NSEServer({ masterKey: 'tooshort', storage }))
        .toThrow(NSEError);
    });

    it('rejects empty master key', () => {
      expect(() => new NSEServer({ masterKey: '', storage }))
        .toThrow(NSEError);
    });
  });

  describe('generate()', () => {
    it('generates a keypair and returns key info', async () => {
      const info = await nse.generate();

      expect(info.pubkey).toHaveLength(64);
      expect(info.npub).toMatch(/^npub1/);
      expect(info.created_at).toBeGreaterThan(0);
      expect(info.hardware_backed).toBe(false); // server keys are honest
    });

    it('stores encrypted blob in storage', async () => {
      await nse.generate();

      const raw = await storage.get('nse:blob');
      expect(raw).not.toBeNull();

      const blob = JSON.parse(raw!);
      expect(blob.version).toBe(1);
      expect(blob.ciphertext).toBeTruthy();
      expect(blob.iv).toBeTruthy();
      expect(blob.pubkey).toHaveLength(64);
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
      const pubkey = await nse.getPublicKey();
      expect(pubkey).toBe(info.pubkey);
    });

    it('returns npub from stored blob', async () => {
      const info = await nse.generate();
      const npub = await nse.getNpub();
      expect(npub).toBe(info.npub);
    });

    it('throws KEY_NOT_FOUND when no key', async () => {
      await expect(nse.getPublicKey()).rejects.toThrow(NSEError);
    });
  });

  describe('sign()', () => {
    it('signs a Nostr event with valid Schnorr signature', async () => {
      const info = await nse.generate();

      const event = {
        kind: 1,
        content: 'hello from NSE server',
        tags: [],
        created_at: Math.floor(Date.now() / 1000),
      };

      const signed = await nse.sign(event);

      expect(signed.id).toHaveLength(64);
      expect(signed.pubkey).toBe(info.pubkey);
      expect(signed.sig).toHaveLength(128);
      expect(signed.kind).toBe(1);
      expect(signed.content).toBe('hello from NSE server');
    });

    it('produces a signature that verifies', async () => {
      await nse.generate();

      const event = {
        kind: 1,
        content: 'verify me',
        tags: [['t', 'nse']],
        created_at: Math.floor(Date.now() / 1000),
      };

      const signed = await nse.sign(event);
      const valid = await verifySignature(signed);
      expect(valid).toBe(true);
    });

    it('signs a kind 0 metadata event', async () => {
      await nse.generate();

      const event = {
        kind: 0,
        content: JSON.stringify({ name: 'relay.nostrkeep.com', about: 'NostrKeep Relay' }),
        tags: [],
        created_at: Math.floor(Date.now() / 1000),
      };

      const signed = await nse.sign(event);
      expect(signed.kind).toBe(0);
      expect(JSON.parse(signed.content).name).toBe('relay.nostrkeep.com');
    });

    it('throws KEY_NOT_FOUND when no key', async () => {
      await expect(nse.sign({
        kind: 1,
        content: 'no key',
        tags: [],
        created_at: 0,
      })).rejects.toThrow(NSEError);
    });

    it('throws DECRYPTION_FAILED with wrong master key', async () => {
      await nse.generate();

      // Create new NSE instance with different master key but same storage
      const wrongKey = generateMasterKey();
      const nse2 = new NSEServer({ masterKey: wrongKey, storage });

      try {
        await nse2.sign({ kind: 1, content: 'wrong key', tags: [], created_at: 0 });
        expect.unreachable('should have thrown');
      } catch (e) {
        expect((e as NSEError).code).toBe(NSEErrorCode.DECRYPTION_FAILED);
      }
    });
  });

  describe('destroy()', () => {
    it('removes the key from storage', async () => {
      await nse.generate();
      expect(await nse.exists()).toBe(true);

      await nse.destroy();
      expect(await nse.exists()).toBe(false);
    });

    it('allows re-generate after destroy', async () => {
      await nse.generate();
      await nse.destroy();

      const info = await nse.generate();
      expect(info.pubkey).toHaveLength(64);
    });
  });

  describe('sign/verify round-trip', () => {
    it('generate → sign → verify end to end', async () => {
      const info = await nse.generate();

      // Sign 3 different events
      for (let i = 0; i < 3; i++) {
        const signed = await nse.sign({
          kind: 1,
          content: `message ${i}`,
          tags: [['nonce', String(i)]],
          created_at: Math.floor(Date.now() / 1000) + i,
        });

        expect(signed.pubkey).toBe(info.pubkey);
        const valid = await verifySignature(signed);
        expect(valid).toBe(true);
      }
    });
  });

  describe('memory zeroing', () => {
    it('encrypted blob does not contain plaintext private key', async () => {
      await nse.generate();

      const raw = await storage.get('nse:blob');
      const blob = JSON.parse(raw!);

      // The ciphertext should not be a valid 64-char hex key
      // (it's longer due to GCM auth tag and different due to encryption)
      expect(blob.ciphertext.length).toBeGreaterThan(64);
    });
  });
});

describe('@nse-dev/server — NSEMemoryStorage', () => {
  it('get returns null for missing key', async () => {
    const s = new NSEMemoryStorage();
    expect(await s.get('missing')).toBeNull();
  });

  it('put then get returns value', async () => {
    const s = new NSEMemoryStorage();
    await s.put('key', 'value');
    expect(await s.get('key')).toBe('value');
  });

  it('delete removes the key', async () => {
    const s = new NSEMemoryStorage();
    await s.put('key', 'value');
    await s.delete('key');
    expect(await s.get('key')).toBeNull();
  });
});

describe('@nse-dev/server — crypto', () => {
  it('generateMasterKey returns 64-char hex', () => {
    const key = generateMasterKey();
    expect(key).toHaveLength(64);
    expect(key).toMatch(/^[0-9a-f]+$/);
  });
});
