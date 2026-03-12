# nostr-secure-enclave

Python package for Nostr Secure Enclave. Server-side key management for AI entities, bots, and backend services.

## Package: `nostr-secure-enclave` (PyPI)

## Implementation

Pure Python using `cryptography` for AES-256-GCM + `secp256k1` for Schnorr signing (BIP-340).

## Use Cases

- OpenClaw / AI entity identity
- Bot process keypairs
- Backend service identity
- MCP tool server signing

## API

```python
import os
from nse import NSE, NostrEvent
from nse.storage import FileStorage

# Initialize with master key + persistent storage
nse = NSE(
    master_key=os.environ['NSE_MASTER_KEY'],
    storage=FileStorage('.nse'),
)

# Generate on first run
if not nse.exists():
    info = nse.generate()
    print(f"Identity: {info.npub}")

# Sign events
signed = nse.sign(NostrEvent(
    kind=1,
    content="Hello Nostr",
    tags=[],
    created_at=int(time.time()),
))

# Read identity (no unlock needed)
pubkey = nse.get_public_key()
npub = nse.get_npub()

# Wipe everything
nse.destroy()
```

## Storage Backends

- `MemoryStorage` — testing / ephemeral processes
- `FileStorage(directory)` — persistent file storage

## Security Notes

- AES-256-GCM encryption with unique IV per operation
- Best-effort memory zeroing after signing (`bytearray.fill(0)`)
- Python's GC may retain copies of key material — this is a documented limitation
- `hardware_backed` is always `False` for Python keys (honest)

## Status: Implemented (Phase 6) — 27 tests passing
