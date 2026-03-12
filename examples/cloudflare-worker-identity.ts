/**
 * Cloudflare Worker Identity
 *
 * A Worker that generates its process keypair on first request
 * and stores the encrypted blob in KV. Every subsequent request
 * uses the same identity.
 *
 * Use case: relay worker, blossom worker, API worker, MCP endpoint
 */

import { NSEServer } from 'nostr-secure-enclave-server';
import type { NSEStorage } from 'nostr-secure-enclave';

// ---------------------------------------------------------------------------
// KV-backed storage (Cloudflare Workers KV)
// ---------------------------------------------------------------------------

class KVStorage implements NSEStorage {
  constructor(private kv: KVNamespace) {}

  async get(key: string): Promise<string | null> {
    return this.kv.get(key);
  }
  async put(key: string, value: string): Promise<void> {
    await this.kv.put(key, value);
  }
  async delete(key: string): Promise<void> {
    await this.kv.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Worker types
// ---------------------------------------------------------------------------

interface Env {
  NSE_MASTER_KEY: string;  // Set via `wrangler secret put NSE_MASTER_KEY`
  NSE_KV: KVNamespace;     // Bound in wrangler.toml
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const nse = new NSEServer({
      masterKey: env.NSE_MASTER_KEY,
      storage: new KVStorage(env.NSE_KV),
    });

    // Auto-generate on first request
    if (!await nse.exists()) {
      const info = await nse.generate();
      console.log(`Worker identity created: ${info.npub}`);

      // Optional: announce to relays
      // await announceToRelays(nse);
    }

    const url = new URL(request.url);

    // Expose the worker's public identity
    if (url.pathname === '/.well-known/nostr.json') {
      const pubkey = await nse.getPublicKey();
      return Response.json({
        names: { '_': pubkey },
        relays: { [pubkey]: ['wss://relay.nostrkeep.com'] },
      });
    }

    // Sign a response event (e.g., API response with proof of origin)
    if (url.pathname === '/api/signed-response') {
      const data = { timestamp: Date.now(), message: 'Hello from Worker' };

      const signed = await nse.sign({
        kind: 1,
        content: JSON.stringify(data),
        tags: [['t', 'api-response']],
        created_at: Math.floor(Date.now() / 1000),
      });

      return Response.json({ event: signed });
    }

    return new Response('NSE Worker', { status: 200 });
  },
};

// ---------------------------------------------------------------------------
// wrangler.toml (for reference)
// ---------------------------------------------------------------------------
//
// name = "my-worker"
// main = "src/index.ts"
// compatibility_date = "2024-01-01"
//
// [[kv_namespaces]]
// binding = "NSE_KV"
// id = "your-kv-namespace-id"
//
// # Then: wrangler secret put NSE_MASTER_KEY
// # Paste your 64-char hex key when prompted
