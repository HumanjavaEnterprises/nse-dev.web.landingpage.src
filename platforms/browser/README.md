# @nse-dev/browser

TypeScript library for browser-based Nostr key management via WebAuthn + SubtleCrypto.

## Package: `@nse-dev/browser` (npm)

## How It Works

1. SubtleCrypto P-256 key generation
2. AES-GCM wrapping of secp256k1 key
3. Encrypted blob stored in IndexedDB or localStorage
4. Biometric prompt per sign operation (WebAuthn)

## Open Questions

- Is WebAuthn biometric per-sign acceptable UX?
- Or is NIP-46 to a mobile signer always better?

## Status: Research (Phase 5)
