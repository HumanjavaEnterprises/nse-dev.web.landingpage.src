/**
 * Server Process Identity
 *
 * Every running process gets its own Nostr keypair.
 * The key is generated on first boot, encrypted at rest,
 * and persists across restarts via file storage.
 *
 * Use case: relay, blossom server, MCP server, app backend
 */

import { NSEServer } from '@nse-dev/server';
import type { NSEStorage } from '@nse-dev/core';

// ---------------------------------------------------------------------------
// 1. Define your storage backend (file, KV, database, etc.)
// ---------------------------------------------------------------------------

class FileStorage implements NSEStorage {
  private dir: string;
  constructor(dir = '.nse') {
    this.dir = dir;
    // In real code: fs.mkdirSync(dir, { recursive: true })
  }
  async get(key: string) {
    // fs.readFileSync(`${this.dir}/${key}`, 'utf-8') or null
    return null; // stub
  }
  async put(key: string, value: string) {
    // fs.writeFileSync(`${this.dir}/${key}`, value)
  }
  async delete(key: string) {
    // fs.unlinkSync(`${this.dir}/${key}`)
  }
}

// ---------------------------------------------------------------------------
// 2. Initialize NSE on process boot
// ---------------------------------------------------------------------------

async function boot() {
  // Master key from environment (generate once, store securely)
  // To generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  const masterKey = process.env.NSE_MASTER_KEY!;
  if (!masterKey) {
    console.error('NSE_MASTER_KEY not set — cannot protect process key');
    process.exit(1);
  }

  const nse = new NSEServer({
    masterKey,
    storage: new FileStorage('.nse'),
  });

  // ---------------------------------------------------------------------------
  // 3. Generate key on first boot, reuse on subsequent boots
  // ---------------------------------------------------------------------------

  if (!await nse.exists()) {
    console.log('First boot — generating process keypair...');
    const info = await nse.generate();
    console.log(`Process identity: ${info.npub}`);
    console.log(`Pubkey: ${info.pubkey}`);

    // Announce ourselves to the network (kind 0 profile)
    const profileEvent = await nse.sign({
      kind: 0,
      content: JSON.stringify({
        name: 'relay.nostrkeep.com',
        about: 'NostrKeep Relay — sovereign storage for Nostr',
        picture: 'https://nostrkeep.com/icon.png',
      }),
      tags: [],
      created_at: Math.floor(Date.now() / 1000),
    });

    // Send profileEvent to relays via nostr-websocket-utils
    console.log('Published kind 0 profile event:', profileEvent.id);
  } else {
    console.log(`Process identity loaded: ${await nse.getNpub()}`);
  }

  // ---------------------------------------------------------------------------
  // 4. Sign events during normal operation
  // ---------------------------------------------------------------------------

  // Example: relay signing a NIP-42 AUTH challenge
  const authEvent = await nse.sign({
    kind: 22242,
    content: '',
    tags: [
      ['relay', 'wss://relay.nostrkeep.com'],
      ['challenge', 'random-challenge-string'],
    ],
    created_at: Math.floor(Date.now() / 1000),
  });

  console.log('Signed AUTH event:', authEvent.id);

  // Example: signing a notification DM to a user
  const dmEvent = await nse.sign({
    kind: 4,
    content: 'encrypted-message-here', // use nostr-crypto-utils NIP-04/44
    tags: [['p', 'recipient-pubkey-hex']],
    created_at: Math.floor(Date.now() / 1000),
  });

  console.log('Signed DM event:', dmEvent.id);

  return nse;
}

// ---------------------------------------------------------------------------
// 5. Graceful shutdown — key stays encrypted on disk
// ---------------------------------------------------------------------------

// No cleanup needed — the key is always encrypted at rest.
// The plaintext only existed in memory during sign() calls,
// and was zeroed immediately after.

boot().catch(console.error);
