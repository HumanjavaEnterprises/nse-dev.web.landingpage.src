# nostr-secure-enclave-android

Kotlin library for hardware-backed Nostr key management via Android StrongBox / TEE.

**Package:** `nostr-secure-enclave-android` (Maven)

## How It Works

1. P-256 key generated in StrongBox (API 28+, fallback to TEE) via `android.security.keystore`
2. Ephemeral P-256 key generated in software for ECDH
3. ECDH shared secret → HKDF-SHA256 (salt: "nse-v1") → AES-256-GCM symmetric key
4. secp256k1 keypair generated (via `secp256k1-kmp`)
5. secp256k1 private key encrypted with AES-GCM key
6. Encrypted blob + ephemeral public key stored in SharedPreferences
7. Plaintext secp256k1 key zeroed via `ByteArray.fill(0)`

## Quick Start

```kotlin
import dev.nse.NSE
import dev.nse.NSEConfig
import dev.nse.NostrEvent

// Create NSE instance
val config = NSEConfig(context = applicationContext)
val nse = NSE(config)

// Generate a new keypair
val keyInfo = nse.generate()
println(keyInfo.npub)  // npub1...

// Sign a Nostr event
val event = NostrEvent(
    kind = 1,
    content = "hello nostr",
    tags = emptyList(),
    createdAt = System.currentTimeMillis() / 1000
)
val signed = nse.sign(event)
println(signed.id)   // 64-char hex
println(signed.sig)  // 128-char hex (Schnorr)

// Read-only (no unlock needed)
val pubkey = nse.getPublicKey()  // hex
val npub = nse.getNpub()         // bech32

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
nse.exists()         → Boolean
nse.destroy()        → Unit (wipes all key material)
```

## Configuration

```kotlin
// Default (StrongBox → TEE → error)
val config = NSEConfig(context = ctx)

// Custom alias (for multi-key support)
val config = NSEConfig(context = ctx, keyAlias = "com.myapp.nostr")

// Software fallback (for unit testing)
val config = NSEConfig(context = ctx, useSoftwareKey = true)
```

## Architecture

```
generate()
  ├── KeyStore P-256 key (StrongBox preferred, TEE fallback)
  ├── Ephemeral P-256 key pair (software)
  ├── ECDH(KeyStore private, ephemeral public) → shared secret
  ├── HKDF-SHA256(shared secret, salt: "nse-v1") → AES-256-GCM key
  ├── secp256k1 keypair via secp256k1-kmp
  ├── AES-GCM encrypt(secp256k1 privkey) → encrypted blob
  ├── SharedPreferences.save(blob JSON, ephemeral pubkey)
  └── Zero plaintext secp256k1 key

sign(event)
  ├── Load KeyStore P-256 key + ephemeral pubkey + blob
  ├── ECDH → same shared secret → same AES key
  ├── AES-GCM decrypt → secp256k1 privkey (plaintext)
  ├── SHA-256([0, pubkey, created_at, kind, tags, content]) → event ID
  ├── Secp256k1.signSchnorr(event ID, privkey) → 64-byte BIP-340 signature
  ├── Zero plaintext secp256k1 key
  └── Return SignedEvent { id, pubkey, sig, ... }
```

## Dependencies

- `android.security.keystore` (Android, built-in) — StrongBox/TEE P-256
- `javax.crypto` (Android, built-in) — AES-GCM, ECDH
- [`secp256k1-kmp`](https://github.com/niclas/secp256k1-kmp) — Schnorr signing (BIP-340)
- `androidx.biometric:biometric` — BiometricPrompt (optional, app-level)

## Tests

22 unit tests covering AES-GCM round-trip, HKDF, ECDH, hex conversion, bech32 encoding, Nostr event ID computation, Schnorr signing, and blob serialization.

```bash
./gradlew test
```

## First Consumer

NostrKeep Signer (`nostrkey.app.android.src`)

## Status: Implemented
