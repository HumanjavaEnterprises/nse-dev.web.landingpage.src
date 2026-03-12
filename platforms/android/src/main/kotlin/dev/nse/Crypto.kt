package dev.nse

import java.security.KeyFactory
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.PrivateKey
import java.security.PublicKey
import java.security.SecureRandom
import java.security.spec.ECGenParameterSpec
import java.security.spec.X509EncodedKeySpec
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.Mac
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Cryptographic helpers for NSE Android.
 *
 * - ECDH key agreement (P-256)
 * - HKDF key derivation (HMAC-SHA256 based)
 * - AES-256-GCM encrypt/decrypt
 * - Hex conversion utilities
 */
object Crypto {

    private const val AES_GCM_IV_LENGTH = 12
    private const val AES_GCM_TAG_LENGTH = 128 // bits
    private const val AES_KEY_LENGTH = 32 // bytes (256 bits)
    private const val HKDF_SALT = "nse-v1"

    // ---------------------------------------------------------------------------
    // ECDH + HKDF → AES key derivation
    // ---------------------------------------------------------------------------

    /**
     * Derive an AES-256-GCM key from a P-256 private key and a P-256 public key
     * using ECDH key agreement followed by HKDF.
     */
    fun deriveAESKey(privateKey: PrivateKey, publicKey: PublicKey): SecretKey {
        // ECDH key agreement
        val keyAgreement = KeyAgreement.getInstance("ECDH")
        keyAgreement.init(privateKey)
        keyAgreement.doPhase(publicKey, true)
        val sharedSecret = keyAgreement.generateSecret()

        try {
            // HKDF to derive AES-256 key
            val aesKeyBytes = hkdf(
                ikm = sharedSecret,
                salt = HKDF_SALT.toByteArray(Charsets.UTF_8),
                info = "nse-aes-key".toByteArray(Charsets.UTF_8),
                length = AES_KEY_LENGTH
            )
            return SecretKeySpec(aesKeyBytes, "AES")
        } finally {
            sharedSecret.fill(0)
        }
    }

    // ---------------------------------------------------------------------------
    // AES-256-GCM
    // ---------------------------------------------------------------------------

    /**
     * Encrypt data with AES-256-GCM.
     * @return Pair of (ciphertext, iv)
     */
    fun aesEncrypt(data: ByteArray, key: SecretKey): Pair<ByteArray, ByteArray> {
        val iv = ByteArray(AES_GCM_IV_LENGTH)
        SecureRandom().nextBytes(iv)

        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(AES_GCM_TAG_LENGTH, iv))
        val ciphertext = cipher.doFinal(data)

        return Pair(ciphertext, iv)
    }

    /**
     * Decrypt data with AES-256-GCM.
     */
    fun aesDecrypt(ciphertext: ByteArray, iv: ByteArray, key: SecretKey): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(AES_GCM_TAG_LENGTH, iv))
        return cipher.doFinal(ciphertext)
    }

    // ---------------------------------------------------------------------------
    // HKDF (HMAC-based Key Derivation Function, RFC 5869)
    // ---------------------------------------------------------------------------

    /**
     * HKDF-SHA256: Extract + Expand.
     * Implements RFC 5869 since Android < API 31 has no built-in HKDF.
     */
    fun hkdf(ikm: ByteArray, salt: ByteArray, info: ByteArray, length: Int): ByteArray {
        // Extract
        val prk = hmacSha256(key = if (salt.isEmpty()) ByteArray(32) else salt, data = ikm)

        // Expand
        val n = (length + 31) / 32 // ceil(length / hashLen)
        val okm = ByteArray(length)
        var t = ByteArray(0)
        var offset = 0

        for (i in 1..n) {
            val input = t + info + byteArrayOf(i.toByte())
            t = hmacSha256(key = prk, data = input)
            val toCopy = minOf(32, length - offset)
            System.arraycopy(t, 0, okm, offset, toCopy)
            offset += toCopy
        }

        prk.fill(0)
        return okm
    }

    private fun hmacSha256(key: ByteArray, data: ByteArray): ByteArray {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(key, "HmacSHA256"))
        return mac.doFinal(data)
    }

    // ---------------------------------------------------------------------------
    // Software P-256 key pair (for testing without AndroidKeyStore)
    // ---------------------------------------------------------------------------

    /**
     * Generate an ephemeral P-256 key pair using the default JCE provider.
     */
    fun generateEphemeralP256KeyPair(): KeyPair {
        val kpg = KeyPairGenerator.getInstance("EC")
        kpg.initialize(ECGenParameterSpec("secp256r1"))
        return kpg.generateKeyPair()
    }

    /**
     * Reconstruct a P-256 public key from its X.509 encoded form.
     */
    fun decodeP256PublicKey(encoded: ByteArray): PublicKey {
        val keyFactory = KeyFactory.getInstance("EC")
        return keyFactory.generatePublic(X509EncodedKeySpec(encoded))
    }

    // ---------------------------------------------------------------------------
    // Nostr event ID computation
    // ---------------------------------------------------------------------------

    /**
     * Compute the Nostr event ID: sha256 of the canonical JSON serialization.
     *
     * Serialized form: [0, pubkey_hex, created_at, kind, tags, content]
     */
    fun computeEventId(
        pubkey: String,
        createdAt: Long,
        kind: Int,
        tags: List<List<String>>,
        content: String
    ): ByteArray {
        val sb = StringBuilder()
        sb.append("[0,\"")
        sb.append(pubkey)
        sb.append("\",")
        sb.append(createdAt)
        sb.append(',')
        sb.append(kind)
        sb.append(',')
        // Tags array
        sb.append('[')
        for (i in tags.indices) {
            sb.append('[')
            for (j in tags[i].indices) {
                sb.append('"')
                sb.append(escapeJsonString(tags[i][j]))
                sb.append('"')
                if (j < tags[i].size - 1) sb.append(',')
            }
            sb.append(']')
            if (i < tags.size - 1) sb.append(',')
        }
        sb.append(']')
        sb.append(",\"")
        sb.append(escapeJsonString(content))
        sb.append("\"]")

        val serialized = sb.toString().toByteArray(Charsets.UTF_8)
        return sha256(serialized)
    }

    /**
     * Escape special characters in a JSON string value.
     */
    internal fun escapeJsonString(s: String): String {
        val sb = StringBuilder(s.length)
        for (c in s) {
            when (c) {
                '\\' -> sb.append("\\\\")
                '"' -> sb.append("\\\"")
                '\n' -> sb.append("\\n")
                '\r' -> sb.append("\\r")
                '\t' -> sb.append("\\t")
                '\b' -> sb.append("\\b")
                '\u000C' -> sb.append("\\f")
                else -> {
                    if (c.code < 0x20) {
                        sb.append("\\u")
                        sb.append(String.format("%04x", c.code))
                    } else {
                        sb.append(c)
                    }
                }
            }
        }
        return sb.toString()
    }

    /**
     * SHA-256 hash.
     */
    fun sha256(data: ByteArray): ByteArray {
        val md = java.security.MessageDigest.getInstance("SHA-256")
        return md.digest(data)
    }

    // ---------------------------------------------------------------------------
    // Hex conversion utilities
    // ---------------------------------------------------------------------------

    private val HEX_CHARS = "0123456789abcdef".toCharArray()

    fun ByteArray.toHex(): String {
        val sb = StringBuilder(size * 2)
        for (b in this) {
            val i = b.toInt() and 0xFF
            sb.append(HEX_CHARS[i ushr 4])
            sb.append(HEX_CHARS[i and 0x0F])
        }
        return sb.toString()
    }

    fun String.hexToByteArray(): ByteArray {
        require(length % 2 == 0) { "Hex string must have even length" }
        return ByteArray(length / 2) { i ->
            val hi = Character.digit(this[i * 2], 16)
            val lo = Character.digit(this[i * 2 + 1], 16)
            require(hi != -1 && lo != -1) { "Invalid hex character at position ${i * 2}" }
            ((hi shl 4) or lo).toByte()
        }
    }
}
