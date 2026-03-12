/**
 * Netlify Function Identity
 *
 * A Netlify serverless function that generates its process keypair
 * on first invocation. Since Netlify Functions are stateless,
 * the encrypted blob is stored in Netlify Blobs (or an external KV).
 *
 * Use case: API endpoints, webhook handlers, signed responses,
 * Nostr-authenticated backends on Netlify
 */

import { NSEServer } from '@nse-dev/server';
import type { NSEStorage } from '@nse-dev/core';
import { getStore } from '@netlify/blobs';
import type { Context } from '@netlify/functions';

// ---------------------------------------------------------------------------
// 1. Netlify Blobs storage backend
// ---------------------------------------------------------------------------

class NetlifyBlobStorage implements NSEStorage {
  private store;

  constructor(siteName?: string) {
    // Netlify Blobs — globally available in Netlify Functions
    // Persists across deploys and function invocations
    this.store = getStore({ name: 'nse-keys', consistency: 'strong' });
  }

  async get(key: string): Promise<string | null> {
    const value = await this.store.get(key);
    return value ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    await this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    await this.store.delete(key);
  }
}

// ---------------------------------------------------------------------------
// 2. Alternative: environment variable storage (simpler, read-only after deploy)
// ---------------------------------------------------------------------------

// If you don't need to generate keys at runtime, you can pre-generate
// the encrypted blob and store it as an env var:
//
//   1. Generate locally:
//      node -e "
//        const { NSEServer } = require('@nse-dev/server');
//        const { NSEMemoryStorage } = require('@nse-dev/server');
//        const s = new NSEMemoryStorage();
//        const nse = new NSEServer({ masterKey: process.env.NSE_MASTER_KEY, storage: s });
//        nse.generate().then(() => s.get('nse:blob').then(console.log));
//      "
//
//   2. Set as Netlify env var: NSE_ENCRYPTED_BLOB = <the JSON output>
//
//   3. Use EnvStorage in your function:

class EnvStorage implements NSEStorage {
  async get(key: string): Promise<string | null> {
    if (key === 'nse:blob') return process.env.NSE_ENCRYPTED_BLOB ?? null;
    return null;
  }
  async put(_key: string, _value: string): Promise<void> {
    throw new Error('EnvStorage is read-only — set NSE_ENCRYPTED_BLOB in Netlify dashboard');
  }
  async delete(_key: string): Promise<void> {
    throw new Error('EnvStorage is read-only');
  }
}

// ---------------------------------------------------------------------------
// 3. Netlify Function — API endpoint with signed responses
// ---------------------------------------------------------------------------

export default async function handler(request: Request, context: Context) {
  const nse = new NSEServer({
    masterKey: Netlify.env.get('NSE_MASTER_KEY')!,
    storage: new NetlifyBlobStorage(),
  });

  // Auto-generate on first invocation
  if (!await nse.exists()) {
    const info = await nse.generate();
    console.log(`Function identity created: ${info.npub}`);
  }

  const url = new URL(request.url);

  // ---------------------------------------------------------------------------
  // Public identity endpoint
  // ---------------------------------------------------------------------------

  if (url.pathname === '/.well-known/nostr.json') {
    const pubkey = await nse.getPublicKey();
    return Response.json({
      names: { '_': pubkey },
    });
  }

  // ---------------------------------------------------------------------------
  // Signed API response — prove this response came from your backend
  // ---------------------------------------------------------------------------

  if (url.pathname === '/api/data') {
    const data = {
      message: 'Hello from Netlify',
      timestamp: Date.now(),
    };

    // Sign the response so clients can verify authenticity
    const signed = await nse.sign({
      kind: 1,
      content: JSON.stringify(data),
      tags: [
        ['t', 'api-response'],
        ['url', url.pathname],
      ],
      created_at: Math.floor(Date.now() / 1000),
    });

    return Response.json({
      data,
      proof: {
        event_id: signed.id,
        pubkey: signed.pubkey,
        sig: signed.sig,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Webhook handler — sign incoming webhook acknowledgments
  // ---------------------------------------------------------------------------

  if (url.pathname === '/api/webhook' && request.method === 'POST') {
    const body = await request.json();

    // Process the webhook...
    console.log('Webhook received:', body);

    // Sign an acknowledgment event
    const ack = await nse.sign({
      kind: 1,
      content: JSON.stringify({
        type: 'webhook_ack',
        received_at: Date.now(),
        source: request.headers.get('x-webhook-source') ?? 'unknown',
      }),
      tags: [['t', 'webhook-ack']],
      created_at: Math.floor(Date.now() / 1000),
    });

    return Response.json({ ok: true, ack_event: ack.id });
  }

  return new Response('NSE on Netlify', { status: 200 });
}

// ---------------------------------------------------------------------------
// Netlify configuration (netlify.toml)
// ---------------------------------------------------------------------------
//
// [functions]
//   directory = "netlify/functions"
//
// [[redirects]]
//   from = "/api/*"
//   to = "/.netlify/functions/handler"
//   status = 200
//
// [[redirects]]
//   from = "/.well-known/*"
//   to = "/.netlify/functions/handler"
//   status = 200
//
// Environment variables (set in Netlify dashboard):
//   NSE_MASTER_KEY = <64 hex chars>
//
// To generate a master key:
//   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

// ---------------------------------------------------------------------------
// Netlify Edge Function variant (Deno runtime)
// ---------------------------------------------------------------------------
//
// If using Edge Functions instead of serverless functions,
// the same pattern works but storage must be external
// (Netlify Blobs, Upstash Redis, etc.) since Edge Functions
// are even more ephemeral than serverless functions.
//
// import { NSEServer } from '@nse-dev/server';
//
// export default async (request: Request, context: any) => {
//   const nse = new NSEServer({
//     masterKey: Deno.env.get('NSE_MASTER_KEY')!,
//     storage: new NetlifyBlobStorage(),
//   });
//   // ... same pattern
// };
//
// export const config = { path: "/api/*" };
