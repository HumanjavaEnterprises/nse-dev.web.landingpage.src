# NSE Examples

Real-world usage patterns for Nostr Secure Enclave.

## Patterns

### Process Identity (Server)
Every running process gets its own Nostr keypair — relay, blossom, MCP server, bot.
The key is generated on first boot and persists across restarts.

→ [`server-process-identity.ts`](./server-process-identity.ts)

### Cloudflare Worker Identity
A Cloudflare Worker that generates its process keypair on first request
and stores the encrypted blob in KV.

→ [`cloudflare-worker-identity.ts`](./cloudflare-worker-identity.ts)

### Browser Extension Signer
A browser extension (like NostrKey) that manages keys in IndexedDB
and signs events on behalf of the user.

→ [`browser-extension-signer.ts`](./browser-extension-signer.ts)

### Python Bot / AI Entity
A Python bot or AI entity (OpenClaw) that has its own Nostr identity.
Generates on first run, signs events, announces itself.

→ [`python-bot-identity.py`](./python-bot-identity.py)

### NIP-46 Remote Signer
Use NSE as the key backend for a NIP-46 bunker signer.
The mobile app holds the key in hardware; remote apps request signatures.

→ [`nip46-signer-backend.ts`](./nip46-signer-backend.ts)

### Multi-Key Manager
Manage multiple identities — one process with several keys
(e.g., a relay that also has a blossom identity).

→ [`multi-key-manager.ts`](./multi-key-manager.ts)
