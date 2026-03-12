# NSE — Nostr Secure Enclave

Open-source hardware-backed key management for Nostr. Your nsec, encrypted at rest by hardware you already own.

**Website:** [nse.dev](https://nse.dev) · **npm:** [nostr-secure-enclave](https://www.npmjs.com/package/nostr-secure-enclave) · **PyPI:** [nostr-secure-enclave](https://pypi.org/project/nostr-secure-enclave/)

## The Problem

Nostr keys (secp256k1/Schnorr) can't be generated or used directly inside mobile secure enclaves (iOS Secure Enclave, Android StrongBox/TEE) — those only support P-256. Most Nostr apps today store keys in software. If the device is compromised, the key is gone.

## The Solution

NSE uses hardware to **protect** the key, not to sign with it. A P-256 key lives in hardware (non-exportable, biometric-gated). It encrypts the secp256k1 key at rest via AES-256-GCM. At signing time: unlock, decrypt, sign, zero.

```
nse.sign(event)
  ├── Biometric unlock → Secure Enclave access
  ├── Derive AES key from hardware P-256 key
  ├── Decrypt secp256k1 key into memory
  ├── Schnorr sign the event
  ├── Zero plaintext key from memory
  └── Return signed event
```

## Install

```bash
# Server / CF Workers / Node.js
npm install nostr-secure-enclave-server

# Browser extensions / web apps
npm install nostr-secure-enclave-browser

# Python bots, AI entities, MCP servers
pip install nostr-secure-enclave

# Types only (peer dependency, installed automatically)
npm install nostr-secure-enclave
```

## Quick Start

```typescript
// Server
import { NSEServer, generateMasterKey } from 'nostr-secure-enclave-server';

const nse = new NSEServer({ masterKey: process.env.NSE_MASTER_KEY, storage });
const { pubkey, npub } = await nse.generate();
const signed = await nse.sign({ kind: 1, content: 'hello', tags: [], created_at: now });
```

```typescript
// Browser
import { NSEBrowser, NSEIndexedDBStorage } from 'nostr-secure-enclave-browser';

const nse = new NSEBrowser({ storage: new NSEIndexedDBStorage() });
const { pubkey, npub } = await nse.generate();
const signed = await nse.sign(event);
```

```python
# Python
from nse import NSE
nse = NSE(master_key=os.environ['NSE_MASTER_KEY'])
info = nse.generate()
signed = nse.sign(NostrEvent(kind=1, content="hello", tags=[], created_at=now))
```

## Packages

| Package | Platform | Registry | Status |
|---------|----------|----------|--------|
| [`nostr-secure-enclave`](https://www.npmjs.com/package/nostr-secure-enclave) | TypeScript types + NSEProvider interface | npm | **Published** |
| [`nostr-secure-enclave-server`](https://www.npmjs.com/package/nostr-secure-enclave-server) | CF Workers / Node.js | npm | **Published** |
| [`nostr-secure-enclave-browser`](https://www.npmjs.com/package/nostr-secure-enclave-browser) | WebAuthn + SubtleCrypto | npm | **Published** |
| [`nostr-secure-enclave`](https://pypi.org/project/nostr-secure-enclave/) | Python (AI entities, bots, MCP) | PyPI | **Published** |
| `nostr-secure-enclave-ios` | Swift via Secure Enclave | Swift Package | Planned |
| `nostr-secure-enclave-android` | Kotlin via StrongBox | Maven | Planned |

## Where NSE Fits

NSE is **Level 0 infrastructure** — the cryptographic foundation that makes sovereign key management possible without asking users to understand cryptography.

```
Level 0  NSE encrypts the key at rest
         └── Browser extension stores wrapped key in IndexedDB
         └── Server process holds encrypted identity in KV

Level 1  Mobile app as backup + authenticator
         └── iOS Secure Enclave / Android StrongBox wrap the key

Level 2  NIP-46 bunker — keys never leave hardware
         └── NSE signs behind the NIP-46 interface
         └── Remote apps request signatures, never see the nsec
```

Products like [NostrKey](https://nostrkey.com) use NSE to protect keys in the browser. NIP-46 bunker signers use NSE on the backend. The principle: **Don't explain cryptography. Explain consequences.**

## Direct Login — No Relay Required

Traditional NIP-46 bunker logins require both sides to connect through a Nostr relay for discovery and message passing. NSE changes that. When the signer is **local** — built into a browser extension or the app itself — signing is a direct, peer-to-peer operation. No relay lookup, no network round-trip, no discovery protocol.

Think of it like an **SSH key**. The key lives on your device. When a site asks you to prove your identity, the extension decrypts and signs locally. The Nostr network isn't involved in the authentication — only in what you do after.

```
Traditional NIP-46 bunker:
  App → relay → signer → relay → App
  (relay discovery, network latency, relay must be online)

NSE direct login:
  App → extension/local signer → App
  (peer-to-peer, instant, works offline)
```

For **cross-device** signing (phone as bunker for desktop), you still need a relay — but it can be **your own** relay with a known address. No public relay discovery, no hoping a third-party relay stays online. The connection is direct and deterministic, like pointing SSH at a specific host.

## Repo Structure

```
docs/                     ← GitHub Pages source (nse.dev)
  index.html              ← Single-page site (HTML + inline CSS)
  og-image.png            ← 1200x630 social card
  CNAME                   ← Custom domain: nse.dev
platforms/                ← Working code for each target platform
  core/                   ← nostr-secure-enclave — shared types + NSEProvider interface
  server/                 ← nostr-secure-enclave-server — AES-256-GCM + nostr-crypto-utils
  browser/                ← nostr-secure-enclave-browser — SubtleCrypto + IndexedDB
  python/                 ← nostr-secure-enclave (PyPI) — cryptography + secp256k1
  ios/                    ← Planned — Swift Package (Secure Enclave)
  android/                ← Planned — Kotlin (StrongBox / TEE)
examples/                 ← 7 real-world usage patterns
  server-process-identity.ts
  cloudflare-worker-identity.ts
  netlify-function-identity.ts
  browser-extension-signer.ts
  python-bot-identity.py
  nip46-signer-backend.ts
  multi-key-manager.ts
```

## Development

```bash
cd platforms
npm install          # Links workspaces (core, server, browser)
npm test             # Runs all 82 tests (core + server + browser + python)
npm run build        # Compiles TypeScript to dist/
```

Individual test suites: `npm run test:core`, `npm run test:server`, `npm run test:browser`, `npm run test:python`

Python tests require: `pip install cryptography secp256k1 pytest`

## API

All platforms implement the same `NSEProvider` interface:

```
nse.generate()          → { pubkey, npub, created_at, hardware_backed }
nse.sign(event)         → signed event (id + pubkey + sig populated)
nse.getPublicKey()      → hex pubkey (no unlock needed)
nse.getNpub()           → bech32 npub (no unlock needed)
nse.exists()            → boolean
nse.destroy()           → wipe all key material
```

## What NSE Is Not

- **Not a remote signer.** NSE is a local library. Use NIP-46 for remote signing.
- **Not custodial.** Keys never leave your device.
- **Not a wallet.** No Lightning, no transactions. Just keys and signing.
- **Not magic.** The secp256k1 key exists briefly in application memory during signing. NSE minimizes that window and zeros the key after — but a rooted/jailbroken device with memory access is out of scope.

## Part of the nostr-* Family

NSE is built on [`nostr-crypto-utils`](https://www.npmjs.com/package/nostr-crypto-utils) and sits alongside the rest of the [Humanjava nostr-* libraries](https://www.npmjs.com/~vveerrgg).

## License

MIT — A [Humanjava](https://humanjava.com) project
