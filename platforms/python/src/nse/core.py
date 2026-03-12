"""
NSE core — key generation, encryption, signing

Uses:
- cryptography library for AES-256-GCM
- secp256k1 library for Schnorr signing (BIP-340)
"""

import hashlib
import json
import os
import time
from dataclasses import dataclass, asdict
from enum import Enum
from typing import Optional, Protocol

import secp256k1


class NSEErrorCode(str, Enum):
    KEY_NOT_FOUND = "KEY_NOT_FOUND"
    AUTH_FAILED = "AUTH_FAILED"
    HARDWARE_UNAVAILABLE = "HARDWARE_UNAVAILABLE"
    KEY_EXISTS = "KEY_EXISTS"
    DECRYPTION_FAILED = "DECRYPTION_FAILED"
    STORAGE_ERROR = "STORAGE_ERROR"
    SIGN_FAILED = "SIGN_FAILED"


class NSEError(Exception):
    def __init__(self, message: str, code: NSEErrorCode):
        super().__init__(message)
        self.code = code


@dataclass
class KeyInfo:
    pubkey: str
    npub: str
    created_at: int
    hardware_backed: bool


@dataclass
class NostrEvent:
    kind: int
    content: str
    tags: list[list[str]]
    created_at: int


@dataclass
class SignedEvent:
    id: str
    pubkey: str
    sig: str
    kind: int
    content: str
    tags: list[list[str]]
    created_at: int


class NSEStorage(Protocol):
    """Storage backend protocol"""

    def get(self, key: str) -> Optional[str]: ...
    def put(self, key: str, value: str) -> None: ...
    def delete(self, key: str) -> None: ...


@dataclass
class EncryptedBlob:
    version: int
    ciphertext: str  # hex
    iv: str  # hex
    pubkey: str
    npub: str
    created_at: int
    hardware_backed: bool


# ---------------------------------------------------------------------------
# Bech32 encoding for npub (NIP-19)
# ---------------------------------------------------------------------------

BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"


def _bech32_polymod(values: list[int]) -> int:
    gen = [0x3B6A57B2, 0x26508E6D, 0x1EA119FA, 0x3D4233DD, 0x2A1462B3]
    chk = 1
    for v in values:
        b = chk >> 25
        chk = ((chk & 0x1FFFFFF) << 5) ^ v
        for i in range(5):
            chk ^= gen[i] if ((b >> i) & 1) else 0
    return chk


def _bech32_hrp_expand(hrp: str) -> list[int]:
    return [ord(x) >> 5 for x in hrp] + [0] + [ord(x) & 31 for x in hrp]


def _bech32_create_checksum(hrp: str, data: list[int]) -> list[int]:
    values = _bech32_hrp_expand(hrp) + data
    polymod = _bech32_polymod(values + [0, 0, 0, 0, 0, 0]) ^ 1
    return [(polymod >> 5 * (5 - i)) & 31 for i in range(6)]


def _convertbits(data: bytes, frombits: int, tobits: int, pad: bool = True) -> list[int]:
    acc = 0
    bits = 0
    ret = []
    maxv = (1 << tobits) - 1
    for value in data:
        acc = (acc << frombits) | value
        bits += frombits
        while bits >= tobits:
            bits -= tobits
            ret.append((acc >> bits) & maxv)
    if pad and bits:
        ret.append((acc << (tobits - bits)) & maxv)
    return ret


def npub_encode(pubkey_hex: str) -> str:
    """Encode a hex pubkey as bech32 npub (NIP-19)"""
    hrp = "npub"
    pubkey_bytes = bytes.fromhex(pubkey_hex)
    data = _convertbits(pubkey_bytes, 8, 5)
    checksum = _bech32_create_checksum(hrp, data)
    return hrp + "1" + "".join(BECH32_CHARSET[d] for d in data + checksum)


# ---------------------------------------------------------------------------
# AES-256-GCM encryption
# ---------------------------------------------------------------------------

def _aes_encrypt(plaintext: bytes, master_key_hex: str) -> tuple[bytes, bytes]:
    """Encrypt with AES-256-GCM. Returns (ciphertext + tag, iv)."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    key = bytes.fromhex(master_key_hex)
    if len(key) != 32:
        raise NSEError("Master key must be 32 bytes", NSEErrorCode.HARDWARE_UNAVAILABLE)

    iv = os.urandom(12)
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(iv, plaintext, None)
    return ciphertext, iv


def _aes_decrypt(ciphertext: bytes, iv: bytes, master_key_hex: str) -> bytes:
    """Decrypt with AES-256-GCM."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    key = bytes.fromhex(master_key_hex)
    aesgcm = AESGCM(key)
    try:
        return aesgcm.decrypt(iv, ciphertext, None)
    except Exception:
        raise NSEError(
            "Failed to decrypt key — wrong master key or corrupted blob",
            NSEErrorCode.DECRYPTION_FAILED,
        )


# ---------------------------------------------------------------------------
# Schnorr signing (BIP-340 / NIP-01)
# ---------------------------------------------------------------------------

def _get_schnorr_pubkey(privkey_bytes: bytes) -> bytes:
    """Get the 32-byte x-only public key from a private key."""
    pk = secp256k1.PrivateKey(privkey_bytes)
    # Get serialized public key (33 bytes compressed), take x-coordinate (bytes 1-33)
    pubkey_serialized = pk.pubkey.serialize(compressed=True)
    return pubkey_serialized[1:]  # x-only (32 bytes)


def _schnorr_sign(message_hash: bytes, privkey_bytes: bytes) -> bytes:
    """Sign a 32-byte hash with Schnorr (BIP-340)."""
    pk = secp256k1.PrivateKey(privkey_bytes)
    sig = pk.schnorr_sign(message_hash, bip340tag=None, raw=True)
    return sig


def _compute_event_id(pubkey: str, created_at: int, kind: int, tags: list, content: str) -> str:
    """Compute NIP-01 event ID: SHA-256 of serialized event."""
    serialized = json.dumps(
        [0, pubkey, created_at, kind, tags, content],
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# NSE main class
# ---------------------------------------------------------------------------

BLOB_KEY = "nse:blob"


class NSE:
    """Nostr Secure Enclave — Python implementation"""

    def __init__(self, master_key: str, storage: Optional[NSEStorage] = None):
        """
        Args:
            master_key: AES-256 master key (64 hex chars)
            storage: Storage backend (defaults to MemoryStorage)
        """
        if not master_key or len(master_key) != 64:
            raise NSEError(
                "Master key must be 64 hex chars (32 bytes)",
                NSEErrorCode.HARDWARE_UNAVAILABLE,
            )
        try:
            bytes.fromhex(master_key)
        except ValueError:
            raise NSEError(
                "Master key must be valid hex",
                NSEErrorCode.HARDWARE_UNAVAILABLE,
            )
        self._master_key = master_key

        if storage is None:
            from nse.storage import MemoryStorage
            storage = MemoryStorage()
        self._storage = storage

    def generate(self) -> KeyInfo:
        """Generate a new secp256k1 keypair, encrypted at rest with AES-GCM."""
        if self.exists():
            raise NSEError("Key already exists — call destroy() first", NSEErrorCode.KEY_EXISTS)

        # Generate random 32-byte private key as mutable bytearray
        privkey_ba = bytearray(os.urandom(32))

        # Derive public key (x-only, 32 bytes)
        pubkey_bytes = _get_schnorr_pubkey(bytes(privkey_ba))
        pubkey_hex = pubkey_bytes.hex()
        npub = npub_encode(pubkey_hex)

        # Encrypt private key
        ciphertext, iv = _aes_encrypt(bytes(privkey_ba), self._master_key)

        # Zero plaintext private key (best effort — Python GC may retain copies
        # of the intermediate bytes objects passed to _get_schnorr_pubkey and
        # _aes_encrypt, but at least the primary copy is zeroed)
        for i in range(len(privkey_ba)):
            privkey_ba[i] = 0

        now = int(time.time())

        blob = EncryptedBlob(
            version=1,
            ciphertext=ciphertext.hex(),
            iv=iv.hex(),
            pubkey=pubkey_hex,
            npub=npub,
            created_at=now,
            hardware_backed=False,
        )

        self._storage.put(BLOB_KEY, json.dumps(asdict(blob)))

        return KeyInfo(
            pubkey=pubkey_hex,
            npub=npub,
            created_at=now,
            hardware_backed=False,
        )

    def sign(self, event: NostrEvent) -> SignedEvent:
        """Decrypt key, Schnorr sign, zero memory."""
        blob = self._load_blob()

        # Decrypt the private key into mutable bytearray
        privkey_bytes = _aes_decrypt(
            bytes.fromhex(blob.ciphertext),
            bytes.fromhex(blob.iv),
            self._master_key,
        )
        privkey_ba = bytearray(privkey_bytes)

        try:
            pubkey_hex = blob.pubkey

            # Compute event ID (NIP-01)
            event_id = _compute_event_id(
                pubkey_hex, event.created_at, event.kind, event.tags, event.content,
            )

            # Schnorr sign the event ID hash
            event_id_bytes = bytes.fromhex(event_id)
            sig = _schnorr_sign(event_id_bytes, bytes(privkey_ba))

            return SignedEvent(
                id=event_id,
                pubkey=pubkey_hex,
                sig=sig.hex(),
                kind=event.kind,
                content=event.content,
                tags=event.tags,
                created_at=event.created_at,
            )
        finally:
            # Zero the mutable copy (best effort — Python GC may retain the
            # immutable bytes returned by _aes_decrypt)
            for i in range(len(privkey_ba)):
                privkey_ba[i] = 0

    def get_public_key(self) -> str:
        """Get the hex pubkey."""
        return self._load_blob().pubkey

    def get_npub(self) -> str:
        """Get the bech32 npub."""
        return self._load_blob().npub

    def exists(self) -> bool:
        """Check if a key exists in storage."""
        return self._storage.get(BLOB_KEY) is not None

    def destroy(self) -> None:
        """Wipe all key material."""
        self._storage.delete(BLOB_KEY)

    def _load_blob(self) -> EncryptedBlob:
        raw = self._storage.get(BLOB_KEY)
        if raw is None:
            raise NSEError("No key found — call generate() first", NSEErrorCode.KEY_NOT_FOUND)
        data = json.loads(raw)
        return EncryptedBlob(**data)
