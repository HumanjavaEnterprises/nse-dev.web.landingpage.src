package dev.nse

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import androidx.biometric.BiometricPrompt
import java.security.KeyPairGenerator
import java.security.KeyStore

/**
 * Nostr Secure Enclave — Android implementation
 * Hardware-backed key management using StrongBox/TEE P-256 to protect secp256k1 keys
 */
object NSE {

    private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
    private const val ENCLAVE_KEY_ALIAS = "dev.nse.enclave.p256"
    private const val BLOB_PREF_KEY = "dev.nse.encrypted.secp256k1"

    /**
     * Generate a new secp256k1 keypair, protected by a StrongBox/TEE P-256 key
     */
    suspend fun generate(context: Context): KeyInfo {
        // TODO: Phase 2 implementation
        // 1. Generate P-256 key in StrongBox/TEE (setIsStrongBoxBacked, biometric-gated)
        // 2. Generate secp256k1 keypair
        // 3. Derive AES-256-GCM key from P-256 via ECDH + HKDF
        // 4. Encrypt secp256k1 private key with AES key
        // 5. Store encrypted blob in EncryptedSharedPreferences
        // 6. Zero the plaintext: privateKeyBytes.fill(0)
        // 7. Return pubkey + npub
        throw NotImplementedError("Not yet implemented")
    }

    /**
     * Sign a Nostr event
     * Biometric unlock → decrypt secp256k1 key → Schnorr sign → zero memory
     */
    suspend fun sign(event: NostrEvent, promptInfo: BiometricPrompt.PromptInfo): SignedEvent {
        // TODO: Phase 2 implementation
        // 1. Biometric unlock via BiometricPrompt
        // 2. Access KeyStore P-256 key
        // 3. Derive AES key
        // 4. Decrypt secp256k1 private key into memory
        // 5. Schnorr sign the event (BIP-340)
        // 6. Zero the plaintext: privateKeyBytes.fill(0)
        // 7. Return signed event
        throw NotImplementedError("Not yet implemented")
    }

    /** Get the hex pubkey (does not require biometric unlock) */
    suspend fun getPublicKey(context: Context): String {
        throw NotImplementedError("Not yet implemented")
    }

    /** Get the bech32 npub */
    suspend fun getNpub(context: Context): String {
        throw NotImplementedError("Not yet implemented")
    }

    /** Check if a key exists */
    fun exists(): Boolean {
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER)
        keyStore.load(null)
        return keyStore.containsAlias(ENCLAVE_KEY_ALIAS)
    }

    /** Wipe all key material */
    suspend fun destroy(context: Context) {
        // TODO: Delete KeyStore entry + EncryptedSharedPreferences blob
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER)
        keyStore.load(null)
        keyStore.deleteEntry(ENCLAVE_KEY_ALIAS)
    }

    // Types

    data class KeyInfo(
        val pubkey: String,
        val npub: String,
        val createdAt: Long,
        val hardwareBacked: Boolean
    )

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
}
