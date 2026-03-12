package dev.nse

import dev.nse.Crypto.hexToByteArray
import dev.nse.Crypto.toHex
import org.junit.Assert.*
import org.junit.Test
import java.security.SecureRandom
import javax.crypto.spec.SecretKeySpec

/**
 * Unit tests for NSE Android.
 *
 * These tests exercise the pure crypto functions directly since
 * AndroidKeyStore is not available in unit tests. The full generate->sign
 * flow is tested via software mode with Robolectric.
 */
class NSETest {

    // -----------------------------------------------------------------------
    // Hex conversion
    // -----------------------------------------------------------------------

    @Test
    fun `hex encode empty array`() {
        with(Crypto) {
            assertEquals("", ByteArray(0).toHex())
        }
    }

    @Test
    fun `hex encode known value`() {
        with(Crypto) {
            val bytes = byteArrayOf(0x00, 0x0f, 0x10, 0xff.toByte())
            assertEquals("000f10ff", bytes.toHex())
        }
    }

    @Test
    fun `hex decode known value`() {
        with(Crypto) {
            val result = "000f10ff".hexToByteArray()
            assertArrayEquals(byteArrayOf(0x00, 0x0f, 0x10, 0xff.toByte()), result)
        }
    }

    @Test
    fun `hex round trip`() {
        with(Crypto) {
            val original = ByteArray(32).also { SecureRandom().nextBytes(it) }
            val hex = original.toHex()
            assertEquals(64, hex.length)
            assertArrayEquals(original, hex.hexToByteArray())
        }
    }

    @Test(expected = IllegalArgumentException::class)
    fun `hex decode odd length throws`() {
        with(Crypto) {
            "abc".hexToByteArray()
        }
    }

    // -----------------------------------------------------------------------
    // AES-GCM encrypt/decrypt
    // -----------------------------------------------------------------------

    @Test
    fun `aes gcm round trip`() {
        val key = SecretKeySpec(ByteArray(32).also { SecureRandom().nextBytes(it) }, "AES")
        val plaintext = "hello nostr secure enclave".toByteArray()

        val (ciphertext, iv) = Crypto.aesEncrypt(plaintext, key)
        val decrypted = Crypto.aesDecrypt(ciphertext, iv, key)

        assertArrayEquals(plaintext, decrypted)
    }

    @Test
    fun `aes gcm produces different ciphertexts for same plaintext`() {
        val key = SecretKeySpec(ByteArray(32).also { SecureRandom().nextBytes(it) }, "AES")
        val plaintext = "same data".toByteArray()

        val (ct1, iv1) = Crypto.aesEncrypt(plaintext, key)
        val (ct2, iv2) = Crypto.aesEncrypt(plaintext, key)

        // Different IVs means different ciphertexts
        assertFalse(iv1.contentEquals(iv2))
        assertFalse(ct1.contentEquals(ct2))

        // Both decrypt to same plaintext
        assertArrayEquals(plaintext, Crypto.aesDecrypt(ct1, iv1, key))
        assertArrayEquals(plaintext, Crypto.aesDecrypt(ct2, iv2, key))
    }

    @Test(expected = Exception::class)
    fun `aes gcm decrypt with wrong key fails`() {
        val key1 = SecretKeySpec(ByteArray(32).also { SecureRandom().nextBytes(it) }, "AES")
        val key2 = SecretKeySpec(ByteArray(32).also { SecureRandom().nextBytes(it) }, "AES")
        val plaintext = "secret".toByteArray()

        val (ciphertext, iv) = Crypto.aesEncrypt(plaintext, key1)
        Crypto.aesDecrypt(ciphertext, iv, key2) // Should throw AEADBadTagException
    }

    // -----------------------------------------------------------------------
    // HKDF
    // -----------------------------------------------------------------------

    @Test
    fun `hkdf produces consistent output`() {
        val ikm = ByteArray(32) { it.toByte() }
        val salt = "test-salt".toByteArray()
        val info = "test-info".toByteArray()

        val result1 = Crypto.hkdf(ikm, salt, info, 32)
        val result2 = Crypto.hkdf(ikm, salt, info, 32)

        assertEquals(32, result1.size)
        assertArrayEquals(result1, result2)
    }

    @Test
    fun `hkdf different info produces different keys`() {
        val ikm = ByteArray(32) { it.toByte() }
        val salt = "test-salt".toByteArray()

        val result1 = Crypto.hkdf(ikm, salt, "info-1".toByteArray(), 32)
        val result2 = Crypto.hkdf(ikm, salt, "info-2".toByteArray(), 32)

        assertFalse(result1.contentEquals(result2))
    }

    @Test
    fun `hkdf output length is correct`() {
        val ikm = ByteArray(32) { it.toByte() }
        val salt = "salt".toByteArray()
        val info = "info".toByteArray()

        assertEquals(16, Crypto.hkdf(ikm, salt, info, 16).size)
        assertEquals(32, Crypto.hkdf(ikm, salt, info, 32).size)
        assertEquals(64, Crypto.hkdf(ikm, salt, info, 64).size)
    }

    // -----------------------------------------------------------------------
    // ECDH key derivation
    // -----------------------------------------------------------------------

    @Test
    fun `ecdh derive aes key produces consistent result`() {
        val kp1 = Crypto.generateEphemeralP256KeyPair()
        val kp2 = Crypto.generateEphemeralP256KeyPair()

        // ECDH is symmetric: A.priv + B.pub == B.priv + A.pub
        val key1 = Crypto.deriveAESKey(kp1.private, kp2.public)
        val key2 = Crypto.deriveAESKey(kp2.private, kp1.public)

        assertArrayEquals(key1.encoded, key2.encoded)
    }

    @Test
    fun `ecdh full encrypt decrypt round trip`() {
        val kp1 = Crypto.generateEphemeralP256KeyPair()
        val kp2 = Crypto.generateEphemeralP256KeyPair()

        val aesKey = Crypto.deriveAESKey(kp1.private, kp2.public)
        val plaintext = ByteArray(32).also { SecureRandom().nextBytes(it) }

        val (ciphertext, iv) = Crypto.aesEncrypt(plaintext, aesKey)

        // Re-derive with reversed roles
        val aesKey2 = Crypto.deriveAESKey(kp2.private, kp1.public)
        val decrypted = Crypto.aesDecrypt(ciphertext, iv, aesKey2)

        assertArrayEquals(plaintext, decrypted)
    }

    // -----------------------------------------------------------------------
    // Bech32 encoding
    // -----------------------------------------------------------------------

    @Test
    fun `bech32 encode npub known vector`() {
        // A known 32-byte pubkey (all zeros) should produce a valid npub
        val pubkey = ByteArray(32)
        val npub = Bech32.bech32Encode("npub", pubkey)

        assertTrue(npub.startsWith("npub1"))
        // bech32 of 32 zero bytes
        assertEquals("npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsutse2s", npub)
    }

    @Test
    fun `bech32 encode produces valid length`() {
        val pubkey = ByteArray(32).also { SecureRandom().nextBytes(it) }
        val npub = Bech32.bech32Encode("npub", pubkey)

        assertTrue(npub.startsWith("npub1"))
        // npub1 (5) + 52 data chars + 6 checksum = 63 chars total
        assertEquals(63, npub.length)
    }

    @Test
    fun `convertBits 8 to 5 round trip`() {
        val original = ByteArray(32).also { SecureRandom().nextBytes(it) }
        val fiveBit = Bech32.convertBits(original, 8, 5, true)
        val recovered = Bech32.convertBits(fiveBit, 5, 8, false)

        assertArrayEquals(original, recovered)
    }

    // -----------------------------------------------------------------------
    // Nostr event ID computation
    // -----------------------------------------------------------------------

    @Test
    fun `event id is 32 bytes sha256`() {
        val id = Crypto.computeEventId(
            pubkey = "0".repeat(64),
            createdAt = 1234567890L,
            kind = 1,
            tags = emptyList(),
            content = "hello"
        )
        assertEquals(32, id.size)
    }

    @Test
    fun `event id is deterministic`() {
        val params = arrayOf(
            "abc123".padEnd(64, '0'),
            1700000000L,
            1,
            listOf(listOf("e", "abc")),
            "Hello, Nostr!"
        )
        val id1 = Crypto.computeEventId(
            params[0] as String, params[1] as Long, params[2] as Int,
            @Suppress("UNCHECKED_CAST") (params[3] as List<List<String>>),
            params[4] as String
        )
        val id2 = Crypto.computeEventId(
            params[0] as String, params[1] as Long, params[2] as Int,
            @Suppress("UNCHECKED_CAST") (params[3] as List<List<String>>),
            params[4] as String
        )
        assertArrayEquals(id1, id2)
    }

    @Test
    fun `event id changes with different content`() {
        val pubkey = "0".repeat(64)
        val id1 = Crypto.computeEventId(pubkey, 1000L, 1, emptyList(), "hello")
        val id2 = Crypto.computeEventId(pubkey, 1000L, 1, emptyList(), "world")
        assertFalse(id1.contentEquals(id2))
    }

    @Test
    fun `event id json escaping`() {
        // Content with special characters should be escaped
        val id1 = Crypto.computeEventId(
            "0".repeat(64), 1000L, 1, emptyList(),
            "line1\nline2\ttab\"quote\\backslash"
        )
        assertEquals(32, id1.size)
    }

    // -----------------------------------------------------------------------
    // JSON escape
    // -----------------------------------------------------------------------

    @Test
    fun `json escape special characters`() {
        assertEquals("hello", Crypto.escapeJsonString("hello"))
        assertEquals("line1\\nline2", Crypto.escapeJsonString("line1\nline2"))
        assertEquals("tab\\there", Crypto.escapeJsonString("tab\there"))
        assertEquals("quote\\\"here", Crypto.escapeJsonString("quote\"here"))
        assertEquals("back\\\\slash", Crypto.escapeJsonString("back\\slash"))
    }

    // -----------------------------------------------------------------------
    // Schnorr signing (secp256k1-kmp)
    // -----------------------------------------------------------------------

    @Test
    fun `schnorr sign produces 64 byte signature`() {
        val secp = Secp256k1.get()
        val privKey = ByteArray(32).also { SecureRandom().nextBytes(it) }
        val messageHash = Crypto.sha256("test message".toByteArray())
        val auxRand = ByteArray(32).also { SecureRandom().nextBytes(it) }

        val signature = secp.signSchnorr(messageHash, privKey, auxRand)
        assertEquals(64, signature.size)
    }

    @Test
    fun `schnorr sign verify round trip`() {
        val secp = Secp256k1.get()
        val privKey = ByteArray(32).also { SecureRandom().nextBytes(it) }
        val pubKey = secp.pubkeyCreate(privKey)
        val xOnlyPubKey = secp.xOnlyPubkeyCreate(pubKey)

        val messageHash = Crypto.sha256("nostr event".toByteArray())
        val auxRand = ByteArray(32).also { SecureRandom().nextBytes(it) }

        val signature = secp.signSchnorr(messageHash, privKey, auxRand)
        val valid = secp.verifySchnorr(signature, messageHash, xOnlyPubKey)
        assertTrue("Schnorr signature should verify", valid)
    }

    @Test
    fun `x-only pubkey is 32 bytes`() {
        val secp = Secp256k1.get()
        val privKey = ByteArray(32).also { SecureRandom().nextBytes(it) }
        val pubKey = secp.pubkeyCreate(privKey)
        val xOnlyPubKey = secp.xOnlyPubkeyCreate(pubKey)

        assertEquals(32, xOnlyPubKey.size)
    }

    // -----------------------------------------------------------------------
    // EncryptedBlob JSON serialization
    // -----------------------------------------------------------------------

    @Test
    fun `blob json round trip`() {
        val blob = EncryptedBlob(
            version = 1,
            ciphertext = "aabbccdd",
            iv = "112233",
            pubkey = "0".repeat(64),
            npub = "npub1test",
            createdAt = 1700000000L,
            hardwareBacked = true
        )

        val json = blob.toJson()
        val restored = EncryptedBlob.fromJson(json)

        assertEquals(blob.version, restored.version)
        assertEquals(blob.ciphertext, restored.ciphertext)
        assertEquals(blob.iv, restored.iv)
        assertEquals(blob.pubkey, restored.pubkey)
        assertEquals(blob.npub, restored.npub)
        assertEquals(blob.createdAt, restored.createdAt)
        assertEquals(blob.hardwareBacked, restored.hardwareBacked)
    }

    @Test
    fun `blob json format matches spec`() {
        val blob = EncryptedBlob(
            version = 1,
            ciphertext = "aabb",
            iv = "ccdd",
            pubkey = "ee".repeat(32),
            npub = "npub1xyz",
            createdAt = 1234567890L,
            hardwareBacked = false
        )

        val json = blob.toJson()
        assertTrue(json.contains("\"version\":1"))
        assertTrue(json.contains("\"ciphertext\":\"aabb\""))
        assertTrue(json.contains("\"iv\":\"ccdd\""))
        assertTrue(json.contains("\"created_at\":1234567890"))
        assertTrue(json.contains("\"hardware_backed\":false"))
    }

    // -----------------------------------------------------------------------
    // P-256 key encoding round trip
    // -----------------------------------------------------------------------

    @Test
    fun `p256 public key encode decode round trip`() {
        val kp = Crypto.generateEphemeralP256KeyPair()
        val encoded = kp.public.encoded
        val decoded = Crypto.decodeP256PublicKey(encoded)

        assertArrayEquals(kp.public.encoded, decoded.encoded)
    }

    // -----------------------------------------------------------------------
    // Memory zeroing
    // -----------------------------------------------------------------------

    @Test
    fun `byte array fill zeros`() {
        val sensitive = byteArrayOf(1, 2, 3, 4, 5)
        sensitive.fill(0)
        assertArrayEquals(ByteArray(5), sensitive)
    }
}
