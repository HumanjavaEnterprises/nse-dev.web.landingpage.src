"""Tests for nse-dev Python package"""

import json
import os
import sys
import pytest

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from nse import NSE, NSEError, NSEErrorCode, KeyInfo, NostrEvent, SignedEvent, MemoryStorage
from nse.storage import FileStorage


def random_master_key() -> str:
    return os.urandom(32).hex()


class TestConstructor:
    def test_rejects_invalid_master_key_length(self):
        with pytest.raises(NSEError) as exc:
            NSE(master_key="tooshort")
        assert exc.value.code == NSEErrorCode.HARDWARE_UNAVAILABLE

    def test_rejects_empty_master_key(self):
        with pytest.raises(NSEError):
            NSE(master_key="")

    def test_accepts_valid_master_key(self):
        nse = NSE(master_key=random_master_key())
        assert nse is not None

    def test_defaults_to_memory_storage(self):
        nse = NSE(master_key=random_master_key())
        assert not nse.exists()


class TestGenerate:
    def test_generates_keypair(self):
        nse = NSE(master_key=random_master_key())
        info = nse.generate()

        assert len(info.pubkey) == 64
        assert info.npub.startswith("npub1")
        assert info.created_at > 0
        assert info.hardware_backed is False

    def test_stores_encrypted_blob(self):
        storage = MemoryStorage()
        nse = NSE(master_key=random_master_key(), storage=storage)
        nse.generate()

        raw = storage.get("nse:blob")
        assert raw is not None

        blob = json.loads(raw)
        assert blob["version"] == 1
        assert blob["hardware_backed"] is False
        assert len(blob["ciphertext"]) > 64  # encrypted, not raw key

    def test_throws_key_exists(self):
        nse = NSE(master_key=random_master_key())
        nse.generate()

        with pytest.raises(NSEError) as exc:
            nse.generate()
        assert exc.value.code == NSEErrorCode.KEY_EXISTS


class TestExists:
    def test_false_when_no_key(self):
        nse = NSE(master_key=random_master_key())
        assert nse.exists() is False

    def test_true_after_generate(self):
        nse = NSE(master_key=random_master_key())
        nse.generate()
        assert nse.exists() is True


class TestGetPublicKey:
    def test_returns_pubkey(self):
        nse = NSE(master_key=random_master_key())
        info = nse.generate()
        assert nse.get_public_key() == info.pubkey

    def test_returns_npub(self):
        nse = NSE(master_key=random_master_key())
        info = nse.generate()
        assert nse.get_npub() == info.npub

    def test_throws_key_not_found(self):
        nse = NSE(master_key=random_master_key())
        with pytest.raises(NSEError) as exc:
            nse.get_public_key()
        assert exc.value.code == NSEErrorCode.KEY_NOT_FOUND


class TestSign:
    def test_signs_event(self):
        nse = NSE(master_key=random_master_key())
        info = nse.generate()

        event = NostrEvent(kind=1, content="hello from Python NSE", tags=[], created_at=int(__import__("time").time()))
        signed = nse.sign(event)

        assert len(signed.id) == 64
        assert signed.pubkey == info.pubkey
        assert len(signed.sig) == 128
        assert signed.kind == 1
        assert signed.content == "hello from Python NSE"

    def test_signs_kind_0(self):
        nse = NSE(master_key=random_master_key())
        nse.generate()

        event = NostrEvent(
            kind=0,
            content=json.dumps({"name": "Python Bot", "about": "NSE test"}),
            tags=[],
            created_at=int(__import__("time").time()),
        )
        signed = nse.sign(event)
        assert signed.kind == 0
        assert json.loads(signed.content)["name"] == "Python Bot"

    def test_throws_key_not_found(self):
        nse = NSE(master_key=random_master_key())
        with pytest.raises(NSEError) as exc:
            nse.sign(NostrEvent(kind=1, content="no key", tags=[], created_at=0))
        assert exc.value.code == NSEErrorCode.KEY_NOT_FOUND

    def test_throws_decryption_failed_wrong_key(self):
        storage = MemoryStorage()
        key1 = random_master_key()
        key2 = random_master_key()

        nse1 = NSE(master_key=key1, storage=storage)
        nse1.generate()

        nse2 = NSE(master_key=key2, storage=storage)
        with pytest.raises(NSEError) as exc:
            nse2.sign(NostrEvent(kind=1, content="wrong key", tags=[], created_at=0))
        assert exc.value.code == NSEErrorCode.DECRYPTION_FAILED

    def test_verify_signature(self):
        """Verify the Schnorr signature using secp256k1 library directly."""
        import secp256k1 as _secp

        nse = NSE(master_key=random_master_key())
        info = nse.generate()

        event = NostrEvent(kind=1, content="verify me", tags=[["t", "nse"]], created_at=int(__import__("time").time()))
        signed = nse.sign(event)

        # Verify using secp256k1
        pubkey_bytes = bytes.fromhex(info.pubkey)
        sig_bytes = bytes.fromhex(signed.sig)
        msg_bytes = bytes.fromhex(signed.id)

        # Create a PublicKey from x-only bytes (prepend 0x02 for compressed)
        pk = _secp.PublicKey(b"\x02" + pubkey_bytes, raw=True)
        valid = pk.schnorr_verify(msg_bytes, sig_bytes, bip340tag=None, raw=True)
        assert valid is True


class TestDestroy:
    def test_removes_key(self):
        nse = NSE(master_key=random_master_key())
        nse.generate()
        assert nse.exists() is True

        nse.destroy()
        assert nse.exists() is False

    def test_allows_regenerate(self):
        nse = NSE(master_key=random_master_key())
        nse.generate()
        nse.destroy()
        info = nse.generate()
        assert len(info.pubkey) == 64


class TestRoundTrip:
    def test_generate_sign_verify_multiple(self):
        import secp256k1 as _secp

        nse = NSE(master_key=random_master_key())
        info = nse.generate()

        for i in range(3):
            event = NostrEvent(
                kind=1,
                content=f"message {i}",
                tags=[["nonce", str(i)]],
                created_at=int(__import__("time").time()) + i,
            )
            signed = nse.sign(event)
            assert signed.pubkey == info.pubkey

            # Verify
            pk = _secp.PublicKey(b"\x02" + bytes.fromhex(info.pubkey), raw=True)
            valid = pk.schnorr_verify(
                bytes.fromhex(signed.id), bytes.fromhex(signed.sig),
                bip340tag=None, raw=True,
            )
            assert valid is True


class TestBlobSecurity:
    def test_ciphertext_not_raw_key(self):
        storage = MemoryStorage()
        nse = NSE(master_key=random_master_key(), storage=storage)
        nse.generate()

        blob = json.loads(storage.get("nse:blob"))
        assert len(blob["ciphertext"]) > 64

    def test_different_generates_different_ciphertexts(self):
        storage = MemoryStorage()
        key = random_master_key()
        nse = NSE(master_key=key, storage=storage)

        nse.generate()
        blob1 = json.loads(storage.get("nse:blob"))["ciphertext"]
        nse.destroy()

        nse.generate()
        blob2 = json.loads(storage.get("nse:blob"))["ciphertext"]

        assert blob1 != blob2


class TestMemoryStorage:
    def test_get_returns_none_for_missing(self):
        s = MemoryStorage()
        assert s.get("missing") is None

    def test_put_then_get(self):
        s = MemoryStorage()
        s.put("key", "value")
        assert s.get("key") == "value"

    def test_delete(self):
        s = MemoryStorage()
        s.put("key", "value")
        s.delete("key")
        assert s.get("key") is None


class TestFileStorage:
    def test_roundtrip(self, tmp_path):
        s = FileStorage(directory=str(tmp_path / ".nse"))
        s.put("test_key", "test_value")
        assert s.get("test_key") == "test_value"
        s.delete("test_key")
        assert s.get("test_key") is None


class TestNpubEncode:
    def test_known_encoding(self):
        """Test npub encoding produces valid format."""
        from nse.core import npub_encode
        # Any 64-char hex pubkey should produce npub1...
        pubkey = "a" * 64
        npub = npub_encode(pubkey)
        assert npub.startswith("npub1")
        assert len(npub) > 10
