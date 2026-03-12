# @nse-dev/android

Kotlin library for hardware-backed Nostr key management via Android StrongBox / TEE.

## Package: `@nse-dev/android` (Maven)

## How It Works

1. P-256 key generated in StrongBox / TEE via `android.security.keystore`
2. AES-256-GCM key derived from KeyStore P-256 key
3. secp256k1 keypair generated (via secp256k1-kmp or libsecp256k1 JNI)
4. secp256k1 private key encrypted with KeyStore-derived AES key
5. Encrypted blob stored in EncryptedSharedPreferences
6. Biometric-gated unlock via BiometricPrompt

## First Consumer

NostrKeep Signer (`nostrkey.app.android.src`)

## Dependencies

- `android.security.keystore` (Android, built-in)
- `androidx.biometric:biometric` (BiometricPrompt)
- `secp256k1-kmp` or `libsecp256k1` JNI (secp256k1 signing)
- `androidx.security:security-crypto` (EncryptedSharedPreferences)

## Status: Planned (Phase 2)
