package dev.nse

import org.json.JSONArray
import org.json.JSONObject

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

enum class NSEErrorCode {
    KEY_NOT_FOUND,
    AUTH_FAILED,
    HARDWARE_UNAVAILABLE,
    KEY_EXISTS,
    DECRYPTION_FAILED,
    STORAGE_ERROR,
    SIGN_FAILED
}

class NSEException(
    message: String,
    val code: NSEErrorCode
) : Exception(message)

// ---------------------------------------------------------------------------
// Key info returned by generate()
// ---------------------------------------------------------------------------

data class KeyInfo(
    val pubkey: String,
    val npub: String,
    val createdAt: Long,
    val hardwareBacked: Boolean
)

// ---------------------------------------------------------------------------
// Nostr event types
// ---------------------------------------------------------------------------

data class NostrEvent(
    val kind: Int,
    val content: String,
    val tags: List<List<String>>,
    val createdAt: Long
)

data class SignedEvent(
    val id: String,
    val pubkey: String,
    val sig: String,
    val kind: Int,
    val content: String,
    val tags: List<List<String>>,
    val createdAt: Long
)

// ---------------------------------------------------------------------------
// Encrypted blob — what gets stored at rest
// ---------------------------------------------------------------------------

data class EncryptedBlob(
    val version: Int,
    val ciphertext: String,
    val iv: String,
    val pubkey: String,
    val npub: String,
    val createdAt: Long,
    val hardwareBacked: Boolean
) {
    fun toJson(): String {
        val obj = JSONObject()
        obj.put("version", version)
        obj.put("ciphertext", ciphertext)
        obj.put("iv", iv)
        obj.put("pubkey", pubkey)
        obj.put("npub", npub)
        obj.put("created_at", createdAt)
        obj.put("hardware_backed", hardwareBacked)
        return obj.toString()
    }

    companion object {
        fun fromJson(json: String): EncryptedBlob {
            val obj = JSONObject(json)
            return EncryptedBlob(
                version = obj.getInt("version"),
                ciphertext = obj.getString("ciphertext"),
                iv = obj.getString("iv"),
                pubkey = obj.getString("pubkey"),
                npub = obj.getString("npub"),
                createdAt = obj.getLong("created_at"),
                hardwareBacked = obj.getBoolean("hardware_backed")
            )
        }
    }
}

// ---------------------------------------------------------------------------
// NSE configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for an NSE instance.
 *
 * @param context Android Context (for SharedPreferences access)
 * @param keyAlias Unique alias for the KeyStore entry (allows multiple keys)
 * @param useSoftwareKey If true, skip AndroidKeyStore and use in-memory keys (for testing)
 */
data class NSEConfig(
    val context: android.content.Context,
    val keyAlias: String = "dev.nse.default",
    val useSoftwareKey: Boolean = false
)
