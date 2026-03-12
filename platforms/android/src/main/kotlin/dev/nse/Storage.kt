package dev.nse

import android.content.Context
import android.content.SharedPreferences

/**
 * SharedPreferences-based encrypted blob storage for NSE.
 *
 * Stores the encrypted secp256k1 key blob and the ephemeral P-256 public key
 * used for ECDH key derivation.
 *
 * Each NSE instance gets its own SharedPreferences file based on the key alias.
 */
class NSEStorage(context: Context, keyAlias: String) {

    private val prefs: SharedPreferences = context.getSharedPreferences(
        "nse_$keyAlias",
        Context.MODE_PRIVATE
    )

    companion object {
        private const val KEY_BLOB = "encrypted_blob"
        private const val KEY_EPHEMERAL_PUBKEY = "ephemeral_pubkey"
    }

    /**
     * Save the encrypted blob as JSON.
     */
    fun saveBlob(blob: EncryptedBlob) {
        prefs.edit()
            .putString(KEY_BLOB, blob.toJson())
            .apply()
    }

    /**
     * Load the encrypted blob, or null if none exists.
     */
    fun loadBlob(): EncryptedBlob? {
        val json = prefs.getString(KEY_BLOB, null) ?: return null
        return try {
            EncryptedBlob.fromJson(json)
        } catch (e: Exception) {
            throw NSEException(
                "Failed to parse stored blob: ${e.message}",
                NSEErrorCode.STORAGE_ERROR
            )
        }
    }

    /**
     * Save the ephemeral P-256 public key (X.509 encoded) as hex.
     */
    fun saveEphemeralPublicKey(key: ByteArray) {
        with(Crypto) {
            prefs.edit()
                .putString(KEY_EPHEMERAL_PUBKEY, key.toHex())
                .apply()
        }
    }

    /**
     * Load the ephemeral P-256 public key, or null if none exists.
     */
    fun loadEphemeralPublicKey(): ByteArray? {
        val hex = prefs.getString(KEY_EPHEMERAL_PUBKEY, null) ?: return null
        return with(Crypto) { hex.hexToByteArray() }
    }

    /**
     * Clear all stored data for this key alias.
     */
    fun clear() {
        prefs.edit().clear().apply()
    }
}
