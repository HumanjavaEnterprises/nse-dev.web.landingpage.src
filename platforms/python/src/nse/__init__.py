"""
nse-dev — Nostr Secure Enclave for Python

Server-side key management for AI entities, bots, and backend services.
AES-256-GCM key wrapping for secp256k1 Nostr keys.
"""

from nse.core import NSE, NSEError, NSEErrorCode, KeyInfo, SignedEvent, NostrEvent
from nse.storage import MemoryStorage

__version__ = "0.1.0"
__all__ = [
    "NSE",
    "NSEError",
    "NSEErrorCode",
    "KeyInfo",
    "SignedEvent",
    "NostrEvent",
    "MemoryStorage",
]
