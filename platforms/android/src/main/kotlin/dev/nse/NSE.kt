package dev.nse

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import dev.nse.Crypto.hexToByteArray
import dev.nse.Crypto.toHex
import fr.acinq.secp256k1.Secp256k1
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.SecureRandom
import java.security.spec.ECGenParameterSpec

/**
 * Nostr Secure Enclave — Android implementation.
 *
 * Uses AndroidKeyStore hardware security (StrongBox preferred, TEE fallback)
 * to protect secp256k1 Nostr private keys via P-256 ECDH key wrapping.
 *
 * Architecture:
 * 1. P-256 key lives in AndroidKeyStore (hardware-backed)
 * 2. Ephemeral P-256 key used for ECDH → HKDF → AES-256-GCM symmetric key
 * 3. secp256k1 private key encrypted with that AES key and stored in SharedPreferences
 * 4. On sign: re-derive AES key → decrypt → Schnorr sign → zero plaintext
 */
class NSE(private val config: NSEConfig) {

    private val storage = NSEStorage(config.context, config.keyAlias)
    private val secp = Secp256k1.get()

    companion object {
        private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
    }

    /** The KeyStore alias for the P-256 wrapping key */
    private val keyStoreAlias: String get() = "${config.keyAlias}.p256"

    // ---------------------------------------------------------------------------
    // generate() — Create a new hardware-protected secp256k1 keypair
    // ---------------------------------------------------------------------------

    /**
     * Generate a new secp256k1 keypair, protected by a hardware-backed P-256 key.
     *
     * Flow:
     * 1. Create P-256 key in StrongBox/TEE (or software if configured)
     * 2. Create ephemeral P-256 key pair
     * 3. ECDH + HKDF to derive AES-256-GCM key
     * 4. Generate secp256k1 key pair
     * 5. Encrypt secp256k1 private key with AES key
     * 6. Store blob + ephemeral public key
     * 7. Zero plaintext, return KeyInfo
     *
     * @throws NSEException with KEY_EXISTS if a key already exists
     */
    suspend fun generate(): KeyInfo {
        if (exists()) {
            throw NSEException(
                "Key already exists for alias '${config.keyAlias}'. Call destroy() first.",
                NSEErrorCode.KEY_EXISTS
            )
        }

        var secp256k1PrivKey: ByteArray? = null
        var hardwareBacked = false

        try {
            // Step 1: Create or get the P-256 wrapping key
            val keystoreKeyPair = if (config.useSoftwareKey) {
                // Software fallback for testing
                hardwareBacked = false
                null // We'll use ephemeral key pair directly
            } else {
                hardwareBacked = createKeyStoreP256Key()
                getKeyStoreKeyPair()
            }

            // Step 2: Create ephemeral P-256 key pair
            val ephemeralKeyPair = Crypto.generateEphemeralP256KeyPair()

            // Step 3: Derive AES key via ECDH + HKDF
            val aesKey = if (config.useSoftwareKey) {
                // In software mode, we use the ephemeral key pair for both sides
                // Store the private key of the ephemeral pair as the "keystore" key
                // and generate a second ephemeral for the ECDH
                val softwareKeyPair = Crypto.generateEphemeralP256KeyPair()
                val derivedKey = Crypto.deriveAESKey(softwareKeyPair.private, ephemeralKeyPair.public)

                // Store software private key encoded form alongside ephemeral public
                storage.saveEphemeralPublicKey(ephemeralKeyPair.public.encoded)
                // We also need to store the software wrapping key — encode it in a second pref
                config.context.getSharedPreferences("nse_${config.keyAlias}", 0)
                    .edit()
                    .putString("software_private_key", softwareKeyPair.private.encoded.toHex())
                    .putString("software_public_key", softwareKeyPair.public.encoded.toHex())
                    .apply()

                derivedKey
            } else {
                // Hardware mode: use KeyStore private key + ephemeral public key
                val aesKey = Crypto.deriveAESKey(keystoreKeyPair!!.private, ephemeralKeyPair.public)
                storage.saveEphemeralPublicKey(ephemeralKeyPair.public.encoded)
                aesKey
            }

            // Step 4: Generate secp256k1 key pair
            secp256k1PrivKey = ByteArray(32).also { SecureRandom().nextBytes(it) }
            val compressedPubKey = secp.pubkeyCreate(secp256k1PrivKey)
            val xOnlyPubKey = secp.xOnlyPubkeyCreate(compressedPubKey)
            val pubkeyHex = xOnlyPubKey.toHex()
            val npub = Bech32.bech32Encode("npub", xOnlyPubKey)

            // Step 5: Encrypt secp256k1 private key
            val (ciphertext, iv) = Crypto.aesEncrypt(secp256k1PrivKey, aesKey)

            // Step 6: Store blob
            val now = System.currentTimeMillis() / 1000
            val blob = EncryptedBlob(
                version = 1,
                ciphertext = ciphertext.toHex(),
                iv = iv.toHex(),
                pubkey = pubkeyHex,
                npub = npub,
                createdAt = now,
                hardwareBacked = hardwareBacked
            )
            storage.saveBlob(blob)

            // Step 7: Return key info
            return KeyInfo(
                pubkey = pubkeyHex,
                npub = npub,
                createdAt = now,
                hardwareBacked = hardwareBacked
            )
        } catch (e: NSEException) {
            throw e
        } catch (e: Exception) {
            throw NSEException(
                "Key generation failed: ${e.message}",
                NSEErrorCode.HARDWARE_UNAVAILABLE
            )
        } finally {
            // Zero plaintext
            secp256k1PrivKey?.fill(0)
        }
    }

    // ---------------------------------------------------------------------------
    // sign() — Decrypt secp256k1 key, Schnorr-sign a Nostr event
    // ---------------------------------------------------------------------------

    /**
     * Sign a Nostr event using the stored secp256k1 key.
     *
     * Flow:
     * 1. Load KeyStore P-256 key + ephemeral public key
     * 2. Re-derive AES key via ECDH + HKDF
     * 3. Decrypt secp256k1 private key
     * 4. Compute event ID (sha256 of canonical serialization)
     * 5. Schnorr sign (BIP-340)
     * 6. Zero plaintext
     * 7. Return SignedEvent
     */
    suspend fun sign(event: NostrEvent): SignedEvent {
        val blob = storage.loadBlob()
            ?: throw NSEException("No key found. Call generate() first.", NSEErrorCode.KEY_NOT_FOUND)

        val ephemeralPubKeyBytes = storage.loadEphemeralPublicKey()
            ?: throw NSEException("Ephemeral public key not found.", NSEErrorCode.KEY_NOT_FOUND)

        var secp256k1PrivKey: ByteArray? = null

        try {
            // Step 1-2: Re-derive AES key
            val aesKey = if (config.useSoftwareKey) {
                val prefs = config.context.getSharedPreferences("nse_${config.keyAlias}", 0)
                val softPrivHex = prefs.getString("software_private_key", null)
                    ?: throw NSEException("Software private key not found.", NSEErrorCode.KEY_NOT_FOUND)
                val softPrivEncoded = softPrivHex.hexToByteArray()
                val softPrivKey = java.security.KeyFactory.getInstance("EC")
                    .generatePrivate(java.security.spec.PKCS8EncodedKeySpec(softPrivEncoded))
                val ephPubKey = Crypto.decodeP256PublicKey(ephemeralPubKeyBytes)
                Crypto.deriveAESKey(softPrivKey, ephPubKey)
            } else {
                val keystoreKeyPair = getKeyStoreKeyPair()
                    ?: throw NSEException("KeyStore key not found.", NSEErrorCode.KEY_NOT_FOUND)
                val ephPubKey = Crypto.decodeP256PublicKey(ephemeralPubKeyBytes)
                Crypto.deriveAESKey(keystoreKeyPair.private, ephPubKey)
            }

            // Step 3: Decrypt secp256k1 private key
            val ciphertext = blob.ciphertext.hexToByteArray()
            val iv = blob.iv.hexToByteArray()
            secp256k1PrivKey = try {
                Crypto.aesDecrypt(ciphertext, iv, aesKey)
            } catch (e: Exception) {
                throw NSEException(
                    "Decryption failed: ${e.message}",
                    NSEErrorCode.DECRYPTION_FAILED
                )
            }

            // Step 4: Compute event ID
            val eventId = Crypto.computeEventId(
                pubkey = blob.pubkey,
                createdAt = event.createdAt,
                kind = event.kind,
                tags = event.tags,
                content = event.content
            )

            // Step 5: Schnorr sign (BIP-340)
            val auxiliaryRand = ByteArray(32).also { SecureRandom().nextBytes(it) }
            val signature = try {
                secp.signSchnorr(eventId, secp256k1PrivKey, auxiliaryRand)
            } catch (e: Exception) {
                throw NSEException(
                    "Schnorr signing failed: ${e.message}",
                    NSEErrorCode.SIGN_FAILED
                )
            }

            // Step 7: Return signed event
            return SignedEvent(
                id = eventId.toHex(),
                pubkey = blob.pubkey,
                sig = signature.toHex(),
                kind = event.kind,
                content = event.content,
                tags = event.tags,
                createdAt = event.createdAt
            )
        } finally {
            // Step 6: Zero plaintext
            secp256k1PrivKey?.fill(0)
        }
    }

    // ---------------------------------------------------------------------------
    // getPublicKey() / getNpub() — Read from stored blob (no unlock needed)
    // ---------------------------------------------------------------------------

    /**
     * Get the hex pubkey (64 chars, x-only).
     * Does not require biometric unlock — reads from the stored blob.
     */
    suspend fun getPublicKey(): String {
        val blob = storage.loadBlob()
            ?: throw NSEException("No key found. Call generate() first.", NSEErrorCode.KEY_NOT_FOUND)
        return blob.pubkey
    }

    /**
     * Get the bech32-encoded npub.
     * Does not require biometric unlock — reads from the stored blob.
     */
    suspend fun getNpub(): String {
        val blob = storage.loadBlob()
            ?: throw NSEException("No key found. Call generate() first.", NSEErrorCode.KEY_NOT_FOUND)
        return blob.npub
    }

    // ---------------------------------------------------------------------------
    // exists() — Check if a key is stored
    // ---------------------------------------------------------------------------

    /**
     * Check if a key exists for the configured alias.
     * Checks both the blob storage and the KeyStore entry.
     */
    fun exists(): Boolean {
        val blobExists = storage.loadBlob() != null

        if (config.useSoftwareKey) {
            return blobExists
        }

        return try {
            val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER)
            keyStore.load(null)
            keyStore.containsAlias(keyStoreAlias) && blobExists
        } catch (e: Exception) {
            false
        }
    }

    // ---------------------------------------------------------------------------
    // destroy() — Wipe all key material
    // ---------------------------------------------------------------------------

    /**
     * Destroy all key material for the configured alias.
     * Deletes the KeyStore entry and clears SharedPreferences.
     */
    suspend fun destroy() {
        // Delete KeyStore entry
        if (!config.useSoftwareKey) {
            try {
                val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER)
                keyStore.load(null)
                if (keyStore.containsAlias(keyStoreAlias)) {
                    keyStore.deleteEntry(keyStoreAlias)
                }
            } catch (e: Exception) {
                // Best effort — continue to clear storage even if KeyStore fails
            }
        }

        // Clear SharedPreferences
        storage.clear()
    }

    // ---------------------------------------------------------------------------
    // Private helpers — KeyStore P-256 key management
    // ---------------------------------------------------------------------------

    /**
     * Create a P-256 key in AndroidKeyStore.
     * Tries StrongBox first (API 28+), falls back to TEE.
     *
     * @return true if hardware-backed (StrongBox or TEE), false otherwise
     */
    private fun createKeyStoreP256Key(): Boolean {
        val kpg = KeyPairGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_EC,
            KEYSTORE_PROVIDER
        )

        // Try StrongBox first (API 28+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            try {
                val spec = KeyGenParameterSpec.Builder(
                    keyStoreAlias,
                    KeyProperties.PURPOSE_AGREE_KEY
                )
                    .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
                    .setUserAuthenticationRequired(false) // Biometric gating handled at app level
                    .setIsStrongBoxBacked(true)
                    .build()

                kpg.initialize(spec)
                kpg.generateKeyPair()
                return true // StrongBox-backed
            } catch (e: StrongBoxUnavailableException) {
                // Fall through to TEE
            } catch (e: Exception) {
                // StrongBox not available, fall through
            }
        }

        // TEE fallback
        try {
            val specBuilder = KeyGenParameterSpec.Builder(
                keyStoreAlias,
                KeyProperties.PURPOSE_AGREE_KEY
            )
                .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
                .setUserAuthenticationRequired(false)

            kpg.initialize(specBuilder.build())
            kpg.generateKeyPair()
            return true // TEE-backed
        } catch (e: Exception) {
            throw NSEException(
                "Failed to create KeyStore key: ${e.message}",
                NSEErrorCode.HARDWARE_UNAVAILABLE
            )
        }
    }

    /**
     * Get the existing P-256 key pair from AndroidKeyStore.
     */
    private fun getKeyStoreKeyPair(): java.security.KeyPair? {
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER)
        keyStore.load(null)

        if (!keyStore.containsAlias(keyStoreAlias)) return null

        val entry = keyStore.getEntry(keyStoreAlias, null) as? KeyStore.PrivateKeyEntry
            ?: return null

        return java.security.KeyPair(
            entry.certificate.publicKey,
            entry.privateKey
        )
    }
}
