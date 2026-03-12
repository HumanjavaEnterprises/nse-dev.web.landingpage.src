# nostr-secure-enclave-ios

Swift Package for hardware-backed Nostr key management via iOS Secure Enclave.

## Package: `nostr-secure-enclave-ios` (Swift Package Manager)

## How It Works

1. P-256 key generated in Secure Enclave via `CryptoKit SecureEnclave.P256`
2. AES-256-GCM key derived from enclave P-256 key (ECDH + HKDF)
3. secp256k1 keypair generated (via K1 or swift-secp256k1)
4. secp256k1 private key encrypted with enclave-derived AES key
5. Encrypted blob stored in Keychain (`kSecAttrAccessibleWhenUnlockedThisDeviceOnly`)
6. Biometric-gated unlock via Face ID / Touch ID (LAContext)

## First Consumer

NostrKeep Signer (`nostrkey.app.ios.src`)

## Dependencies

- `CryptoKit` (Apple, built-in)
- `LocalAuthentication` (Apple, built-in)
- `K1` or `swift-secp256k1` (secp256k1 Schnorr signing)

## Status: Planned (Phase 1)
