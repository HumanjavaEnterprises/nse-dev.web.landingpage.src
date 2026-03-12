/**
 * Multi-Key Manager
 *
 * Manage multiple Nostr identities from a single process.
 * Each identity has its own encrypted key blob with a unique storage key.
 *
 * Use case: relay + blossom sharing a process, multi-tenant services,
 * AI entities with multiple personas
 */

import { NSEServer } from '@nse-dev/server';
import type { NSEStorage, NSEProvider } from '@nse-dev/core';

// ---------------------------------------------------------------------------
// 1. Prefixed storage — each identity gets its own namespace
// ---------------------------------------------------------------------------

class PrefixedStorage implements NSEStorage {
  constructor(
    private inner: NSEStorage,
    private prefix: string,
  ) {}

  async get(key: string) { return this.inner.get(`${this.prefix}:${key}`); }
  async put(key: string, value: string) { return this.inner.put(`${this.prefix}:${key}`, value); }
  async delete(key: string) { return this.inner.delete(`${this.prefix}:${key}`); }
}

// ---------------------------------------------------------------------------
// 2. Key manager — creates and retrieves named identities
// ---------------------------------------------------------------------------

class NSEKeyManager {
  private instances = new Map<string, NSEServer>();

  constructor(
    private masterKey: string,
    private storage: NSEStorage,
  ) {}

  /** Get or create an NSE instance for a named identity */
  get(name: string): NSEServer {
    let nse = this.instances.get(name);
    if (!nse) {
      nse = new NSEServer({
        masterKey: this.masterKey,
        storage: new PrefixedStorage(this.storage, name),
      });
      this.instances.set(name, nse);
    }
    return nse;
  }

  /** List all identity names that have generated keys */
  async list(): Promise<string[]> {
    const names: string[] = [];
    for (const [name, nse] of this.instances) {
      if (await nse.exists()) names.push(name);
    }
    return names;
  }
}

// ---------------------------------------------------------------------------
// 3. Example: relay + blossom + MCP in one process
// ---------------------------------------------------------------------------

async function main() {
  const masterKey = process.env.NSE_MASTER_KEY!;

  // In-memory storage for demo (use FileStorage or KV in production)
  const storage: NSEStorage = {
    _store: new Map<string, string>(),
    async get(key: string) { return (this as any)._store.get(key) ?? null; },
    async put(key: string, value: string) { (this as any)._store.set(key, value); },
    async delete(key: string) { (this as any)._store.delete(key); },
  };

  const keys = new NSEKeyManager(masterKey, storage);

  // ---------------------------------------------------------------------------
  // Each service gets its own identity
  // ---------------------------------------------------------------------------

  const relay = keys.get('relay');
  const blossom = keys.get('blossom');
  const mcp = keys.get('mcp');

  // Generate identities on first boot
  for (const [name, nse] of [['relay', relay], ['blossom', blossom], ['mcp', mcp]] as const) {
    if (!await nse.exists()) {
      const info = await nse.generate();
      console.log(`${name}: ${info.npub}`);
    } else {
      console.log(`${name}: ${await nse.getNpub()}`);
    }
  }

  console.log();

  // ---------------------------------------------------------------------------
  // Each service signs events with its own identity
  // ---------------------------------------------------------------------------

  // Relay signs an AUTH event
  const relayAuth = await relay.sign({
    kind: 22242,
    content: '',
    tags: [['relay', 'wss://relay.nostrkeep.com'], ['challenge', 'abc']],
    created_at: Math.floor(Date.now() / 1000),
  });
  console.log(`Relay AUTH:   ${relayAuth.id.slice(0, 16)}... by ${relayAuth.pubkey.slice(0, 16)}...`);

  // Blossom signs a blob metadata event
  const blobMeta = await blossom.sign({
    kind: 1,
    content: JSON.stringify({ hash: 'abc123', size: 1024, type: 'image/png' }),
    tags: [['t', 'blossom']],
    created_at: Math.floor(Date.now() / 1000),
  });
  console.log(`Blossom blob: ${blobMeta.id.slice(0, 16)}... by ${blobMeta.pubkey.slice(0, 16)}...`);

  // MCP signs a tool response
  const mcpResponse = await mcp.sign({
    kind: 5050,
    content: JSON.stringify({ tool: 'search', result: { count: 42 } }),
    tags: [['t', 'mcp']],
    created_at: Math.floor(Date.now() / 1000),
  });
  console.log(`MCP response: ${mcpResponse.id.slice(0, 16)}... by ${mcpResponse.pubkey.slice(0, 16)}...`);

  console.log();
  console.log('Three identities, one master key, one process.');
  console.log('Each key encrypted separately. Each signs independently.');
}

main().catch(console.error);
