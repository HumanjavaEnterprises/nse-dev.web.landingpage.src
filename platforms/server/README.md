# nostr-secure-enclave-server

TypeScript library for server-side Nostr key management. Process keypairs for relays, blossom servers, MCP servers, and app backends.

## Package: `nostr-secure-enclave-server` (npm)

## Implementations

### Cloudflare Workers
- `crypto.subtle` for AES-GCM encryption
- KV-stored Data Encryption Key (DEK)
- No hardware enclave, but key-at-rest protection

### Node.js
- AES-GCM with environment-provided master key
- Optional TPM 2.0 integration via `tpm2-tss` (linux servers)

## Features

- `NSE.generate()` — generate process keypair on first boot
- `NSE.sign(event)` — sign with process identity
- Auto-announce: publish kind 0 profile event on first boot (mutual recognition)
- Key rotation: generate new key, re-announce kind 0

## First Consumers

- `nostrkeep.srvr.relay.src` — relay process identity
- `nostrkeep.srvr.blossom.src` — blossom process identity
- `nostrkeep.srvr.app.src` — app server process identity

## Status: Planned (Phase 3)
