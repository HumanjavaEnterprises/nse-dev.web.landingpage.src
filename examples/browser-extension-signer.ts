/**
 * Browser Extension Signer
 *
 * A browser extension (like NostrKey) that manages keys in IndexedDB
 * and signs events via window.nostr (NIP-07).
 *
 * Use case: browser extension, web app with local key management
 */

import { NSEBrowser, NSEIndexedDBStorage } from 'nostr-secure-enclave-browser';

// ---------------------------------------------------------------------------
// 1. Initialize NSE with IndexedDB storage (origin-scoped, persistent)
// ---------------------------------------------------------------------------

const nse = new NSEBrowser({
  storage: new NSEIndexedDBStorage(),
  // No masterKey — SubtleCrypto generates a non-extractable wrapping key
  // The wrapping key JWK is stored in IndexedDB alongside the encrypted blob
});

// ---------------------------------------------------------------------------
// 2. Key generation (user action — e.g., "Create New Key" button)
// ---------------------------------------------------------------------------

async function createKey(): Promise<{ pubkey: string; npub: string }> {
  if (await nse.exists()) {
    // Key already exists — return existing identity
    return {
      pubkey: await nse.getPublicKey(),
      npub: await nse.getNpub(),
    };
  }

  const info = await nse.generate();
  console.log('Key created:', info.npub);
  return { pubkey: info.pubkey, npub: info.npub };
}

// ---------------------------------------------------------------------------
// 3. NIP-07 window.nostr interface
// ---------------------------------------------------------------------------

// This is what web apps call to interact with the extension

const nostr = {
  async getPublicKey(): Promise<string> {
    if (!await nse.exists()) {
      throw new Error('No key — open extension to create one');
    }
    return nse.getPublicKey();
  },

  async signEvent(event: {
    kind: number;
    content: string;
    tags: string[][];
    created_at: number;
  }) {
    if (!await nse.exists()) {
      throw new Error('No key — open extension to create one');
    }

    // In a real extension, show a popup asking user to approve the sign request
    // const approved = await showSignApprovalPopup(event);
    // if (!approved) throw new Error('User denied signing');

    const signed = await nse.sign(event);
    return signed;
  },

  // NIP-04 encrypt/decrypt would go here
  // NIP-44 encrypt/decrypt would go here
};

// Inject into page
// (window as any).nostr = nostr;

// ---------------------------------------------------------------------------
// 4. Extension popup — show identity, manage keys
// ---------------------------------------------------------------------------

async function renderPopup() {
  if (await nse.exists()) {
    const npub = await nse.getNpub();
    const pubkey = await nse.getPublicKey();
    console.log('Your identity:', npub);
    console.log('Hex pubkey:', pubkey);
    // Render: avatar, npub, copy button, delete button
  } else {
    console.log('No key yet. Click "Create Key" to get started.');
    // Render: create key button
  }
}

// ---------------------------------------------------------------------------
// 5. Danger zone — destroy key
// ---------------------------------------------------------------------------

async function deleteKey() {
  // In real extension: require user to type "DELETE" to confirm
  await nse.destroy();
  console.log('Key destroyed. All local key material wiped.');
}

// ---------------------------------------------------------------------------
// 6. Master key mode — for importing from server or sharing across devices
// ---------------------------------------------------------------------------

async function initWithMasterKey(masterKeyHex: string) {
  // If user provides a master key (e.g., from a backup or server),
  // NSE can use it instead of generating a SubtleCrypto wrapping key.
  // This makes the blob portable between server and browser.
  const nseWithKey = new NSEBrowser({
    storage: new NSEIndexedDBStorage(),
    masterKey: masterKeyHex,
  });

  // Now this NSE instance is compatible with nostr-secure-enclave-server
  // using the same master key — same blob format, same encryption.
  return nseWithKey;
}

export { createKey, nostr, renderPopup, deleteKey, initWithMasterKey };
