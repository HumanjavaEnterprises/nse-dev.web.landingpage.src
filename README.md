# NSE — Nostr Secure Enclave

Open-source hardware-backed key management for Nostr.

**Website:** [nse.dev](https://nse.dev) · **GitHub:** [HumanjavaEnterprises/nse-dev.web.landingpage.src](https://github.com/HumanjavaEnterprises/nse-dev.web.landingpage.src)

## The Problem

Nostr keys (secp256k1/Schnorr) can't be generated or used directly inside mobile secure enclaves (iOS Secure Enclave, Android StrongBox/TEE) — those only support P-256. Every Nostr app today stores keys in software. If the device is compromised, the key is gone.

## The Solution

NSE wraps the gap:

1. **Generate** a secp256k1 keypair
2. **Protect** it with a hardware-backed P-256 key (non-exportable, biometric-gated)
3. **Sign** Nostr events with the secp256k1 key (briefly decrypted in memory, then zeroed)
4. **Expose** a simple API: `generate()`, `sign()`, `getPublicKey()`

The nsec never exists unprotected at rest. The P-256 key never leaves hardware.

## Platform Support

| Platform | Hardware | Key Wrapping | Status |
|----------|----------|-------------|--------|
| iOS | Secure Enclave (SEP) | P-256 → AES-GCM → secp256k1 | Planned |
| Android | StrongBox / TEE | KeyStore → AES-GCM → secp256k1 | Planned |
| Server (CF Workers) | `crypto.subtle` | AES-GCM with KV-stored DEK | Planned |
| Server (Node.js) | TPM 2.0 (optional) | AES-GCM with file/env key | Planned |
| Browser | WebAuthn / SubtleCrypto | P-256 → AES-GCM → secp256k1 | Research |

## API Surface

```
// All platforms — same interface
nse.generate()          → { pubkey, npub }
nse.sign(event)         → signed event (id + sig populated)
nse.getPublicKey()      → hex pubkey
nse.getNpub()           → bech32 npub
nse.exists()            → boolean (has a stored key?)
nse.destroy()           → wipe key material
```

## Architecture

```
┌─────────────────────────────────────┐
│          Your Nostr App             │
│   nse.sign(event) / nse.generate() │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│            NSE Library              │
│  Platform detection + unified API   │
└──────────────┬──────────────────────┘
               │
   ┌───────────┼───────────┐
   │           │           │
┌──▼──┐   ┌───▼───┐   ┌───▼───┐
│ iOS │   │Android│   │Server │
│ SEP │   │StrongB│   │ TPM/  │
│P-256│   │ P-256 │   │ KMS   │
└─────┘   └───────┘   └───────┘
   │           │           │
   └───────────┼───────────┘
               │
        AES-GCM encrypted
        secp256k1 key blob
        (stored in Keychain/
         KeyStore/KV/env)
```

## Prior Art

| Project | Scope | Gap NSE Fills |
|---------|-------|---------------|
| noauth-enclaved | NIP-46 signer in AWS Nitro | Server-only, not mobile |
| keycrux | Key persistence for Nitro enclaves | Server-only |
| K1 (Swift) | secp256k1 Schnorr signing | No enclave key wrapping |
| LNbits NSD | ESP32 hardware signer | DIY device, not phone-native |
| HardKey SDK | Cross-platform hardware keys | P-256 only, no secp256k1 |

## NIP Integration

- **NIP-46** — NSE sits behind the NIP-46 signer interface. The app calls `nse.sign()`, NSE handles hardware unlock + decryption.
- **NIP-49** — NSE replaces ncryptsec for key storage. Instead of passphrase-encrypted keys, the enclave protects them.
- **Future NIP** — We may propose a NIP for hardware-backed key attestation (prove to a relay that a key is hardware-protected).

## Packages (planned)

| Package | Platform | Registry |
|---------|----------|----------|
| `@nse-dev/core` | TypeScript types + interface | npm |
| `@nse-dev/ios` | Swift via Secure Enclave | Swift Package |
| `@nse-dev/android` | Kotlin via StrongBox | Maven |
| `@nse-dev/server` | CF Workers / Node.js | npm |
| `@nse-dev/browser` | WebAuthn + SubtleCrypto | npm |
| `nse-dev` | Python wrapper | PyPI |

## Hosting

- **Pages source:** `main` branch, `/docs` folder
- **Custom domain:** `nse.dev`

### DNS Configuration

**A records** (apex domain):
```
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

**CNAME** (www subdomain):
```
www → humanjavaenterprises.github.io
```

HTTPS enforced automatically by GitHub Pages.

## OG Image

Regenerate the social card: `python3 generate-og.py`

## License

MIT — A [Humanjava](https://humanjava.com) project
