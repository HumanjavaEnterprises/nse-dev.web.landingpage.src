# nostr-secure-enclave-ios

Swift Package for hardware-backed Nostr key management via iOS Secure Enclave.

**Package:** `nostr-secure-enclave-ios` (Swift Package Manager)

## How It Works

1. P-256 key generated in Secure Enclave via `CryptoKit SecureEnclave.P256.KeyAgreement`
2. Ephemeral P-256 key generated in software for ECDH
3. ECDH shared secret → HKDF-SHA256 (salt: "nse-v1") → AES-256-GCM symmetric key
4. secp256k1 keypair generated (via `swift-secp256k1`)
5. secp256k1 private key encrypted with AES-GCM key
6. Encrypted blob + SE key reference + ephemeral public key stored in Keychain (`kSecAttrAccessibleWhenUnlockedThisDeviceOnly`)
7. Plaintext secp256k1 key zeroed via `Data.resetBytes(in:)`

## Install

```swift
// Package.swift
dependencies: [
    .package(url: "https://github.com/HumanjavaEnterprises/nse-dev.web.landingpage.src", from: "0.1.0")
]
```

## Quick Start

```swift
import NSE

// Create NSE instance (uses Secure Enclave when available)
let nse = NSE()

// Generate a new keypair
let keyInfo = try nse.generate()
print(keyInfo.npub)  // npub1...

// Sign a Nostr event
let event = NostrEvent(kind: 1, content: "hello nostr", tags: [], createdAt: Int(Date().timeIntervalSince1970))
let signed = try nse.sign(event)
print(signed.id)   // 64-char hex
print(signed.sig)  // 128-char hex (Schnorr)

// Read-only (no unlock needed)
let pubkey = try nse.getPublicKey()  // hex
let npub = try nse.getNpub()         // bech32

// Check / destroy
nse.exists()   // true
nse.destroy()  // wipes all key material
```

## API

```
nse.generate()       → KeyInfo { pubkey, npub, createdAt, hardwareBacked }
nse.sign(event)      → SignedEvent { id, pubkey, sig, kind, content, tags, createdAt }
nse.getPublicKey()   → String (hex pubkey)
nse.getNpub()        → String (bech32 npub)
nse.exists()         → Bool
nse.destroy()        → Void (wipes all key material)
```

## Configuration

```swift
// Custom key tag (for multi-key support)
let nse = NSE(keyTag: "com.myapp.nostr")

// Software fallback (for Simulator / testing)
let nse = NSE(useSoftwareKey: true)
```

## Architecture

```
generate()
  ├── SecureEnclave.P256.KeyAgreement.PrivateKey() → SE key (non-exportable)
  ├── P256.KeyAgreement.PrivateKey() → ephemeral key
  ├── ECDH(SE private, ephemeral public) → shared secret
  ├── HKDF-SHA256(shared secret, salt: "nse-v1") → AES-256-GCM key
  ├── secp256k1.Schnorr.PrivateKey() → Nostr keypair
  ├── AES-GCM.seal(secp256k1 privkey, using: AES key) → encrypted blob
  ├── Keychain.save(SE key data, ephemeral pubkey, blob JSON)
  └── Zero plaintext secp256k1 key

sign(event)
  ├── Keychain.load(SE key, ephemeral pubkey, blob)
  ├── ECDH(SE private, ephemeral public) → same shared secret → same AES key
  ├── AES-GCM.open(blob) → secp256k1 privkey (plaintext)
  ├── SHA-256([0, pubkey, created_at, kind, tags, content]) → event ID
  ├── secp256k1.Schnorr.sign(event ID) → 64-byte BIP-340 signature
  ├── Zero plaintext secp256k1 key
  └── Return SignedEvent { id, pubkey, sig, ... }
```

## Dependencies

- `CryptoKit` (Apple, built-in) — Secure Enclave P-256, AES-GCM, SHA-256, HKDF
- `LocalAuthentication` (Apple, built-in) — biometric gating
- [`swift-secp256k1`](https://github.com/21-DOT-DEV/swift-secp256k1) — Schnorr signing (BIP-340)

## Tests

27 tests covering generate, sign, exists, destroy, multi-instance isolation, crypto helpers, bech32, and event ID computation. All tests use software mode (`useSoftwareKey: true`).

```bash
swift test
```

## First Consumer

NostrKeep Signer (`nostrkey.app.ios.src`)

## Status: Implemented
