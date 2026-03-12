# nse-dev

Python package for Nostr Secure Enclave. Server-side key management for AI entities, bots, and backend services.

## Package: `nse-dev` (PyPI)

## Approaches

1. **Wrapper** around `@nse-dev/server` (subprocess or FFI)
2. **Pure Python** using `cryptography` for AES-GCM + `secp256k1` for signing

## Use Cases

- OpenClaw / AI entity identity
- Bot process keypairs
- Backend service identity

## API

```python
from nse import NSE

nse = NSE(master_key=os.environ['NSE_MASTER_KEY'])
key_info = await nse.generate()
signed = await nse.sign(event)
pubkey = await nse.get_public_key()
exists = await nse.exists()
await nse.destroy()
```

## Status: Planned (Phase 6)
