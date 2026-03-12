import Foundation
import CryptoKit
import LocalAuthentication
import secp256k1

/// Nostr Secure Enclave — iOS implementation
/// Hardware-backed key management using Secure Enclave P-256 to protect secp256k1 keys
@available(iOS 15.0, macOS 13.0, *)
public final class NSE {

    // MARK: - Configuration

    /// Tag prefix used to identify Keychain items for this instance
    private let keyTag: String

    /// Whether to use software P-256 keys instead of Secure Enclave
    private let useSoftwareKey: Bool

    /// Whether hardware Secure Enclave is actually available
    private var isHardwareBacked: Bool {
        return !useSoftwareKey && SecureEnclave.isAvailable
    }

    /// Keychain storage instance
    let keychain: KeychainStorage

    // MARK: - Keychain Key Suffixes

    private let seKeySuffix = "se.p256"
    private let ephemeralPubSuffix = "ephemeral.pub"
    let blobSuffix = "blob"

    // MARK: - Initialization

    /// Create a new NSE instance
    /// - Parameters:
    ///   - keyTag: Prefix for Keychain item identifiers (default: "dev.nse.default")
    ///   - useSoftwareKey: Force software P-256 keys (for simulator/testing)
    public init(keyTag: String = "dev.nse.default", useSoftwareKey: Bool = false) {
        self.keyTag = keyTag
        self.useSoftwareKey = useSoftwareKey
        self.keychain = KeychainStorage(keyPrefix: keyTag)
    }

    // MARK: - Public API

    /// Generate a new secp256k1 keypair, protected by a P-256 key (Secure Enclave or software)
    ///
    /// 1. Create P-256 KeyAgreement key (SE or software)
    /// 2. Create ephemeral P-256 key for ECDH
    /// 3. Derive AES-256-GCM key via ECDH + HKDF
    /// 4. Generate secp256k1 keypair
    /// 5. Encrypt secp256k1 private key with AES key
    /// 6. Store everything in Keychain
    /// 7. Zero plaintext secp256k1 key from memory
    /// 8. Return pubkey + npub
    public func generate() throws -> KeyInfo {
        // Check if key already exists
        if exists() {
            throw NSEError.keyExists
        }

        // Step 1: Create P-256 key (SE or software) and ephemeral key
        let useHardware = isHardwareBacked
        let seKeyData: Data
        let ephemeralKey = P256.KeyAgreement.PrivateKey()

        if useHardware {
            let seKey = try SecureEnclave.P256.KeyAgreement.PrivateKey()
            seKeyData = seKey.dataRepresentation
        } else {
            let softwareKey = P256.KeyAgreement.PrivateKey()
            seKeyData = softwareKey.rawRepresentation
        }

        // Step 2: Derive AES key via ECDH + HKDF
        let aesKey: SymmetricKey
        if useHardware {
            let seKey = try SecureEnclave.P256.KeyAgreement.PrivateKey(
                dataRepresentation: seKeyData
            )
            aesKey = try deriveAESKeyWithSEKey(
                sePrivateKey: seKey,
                ephemeralPublicKey: ephemeralKey.publicKey
            )
        } else {
            let softwareKey = try P256.KeyAgreement.PrivateKey(rawRepresentation: seKeyData)
            aesKey = try deriveAESKeyWithSoftwareKey(
                softwarePrivateKey: softwareKey,
                ephemeralPublicKey: ephemeralKey.publicKey
            )
        }

        // Step 3: Generate secp256k1 keypair
        let secp256k1Key = try secp256k1.Schnorr.PrivateKey()
        var privKeyBytes = Data(secp256k1Key.dataRepresentation)
        let xOnlyPubKeyBytes = secp256k1Key.xonly.bytes
        let xOnlyPubKeyData = Data(xOnlyPubKeyBytes)
        let pubkeyHex = xOnlyPubKeyData.hexString

        // Step 4: Encrypt the secp256k1 private key
        let encrypted = try aesEncrypt(data: privKeyBytes, key: aesKey)

        // Step 5: Zero plaintext key from memory
        privKeyBytes.resetBytes(in: 0..<privKeyBytes.count)

        // Step 6: Compute npub
        guard let npub = bech32Encode(hrp: "npub", data: xOnlyPubKeyData) else {
            throw NSEError.signFailed("Failed to bech32-encode public key")
        }

        // Step 7: Build encrypted blob
        let now = Int(Date().timeIntervalSince1970)
        let blob = EncryptedBlob(
            version: 1,
            ciphertext: encrypted.ciphertext.hexString,
            iv: encrypted.iv.hexString,
            pubkey: pubkeyHex,
            npub: npub,
            createdAt: now,
            hardwareBacked: useHardware
        )

        // Step 8: Store in Keychain
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        let blobData = try encoder.encode(blob)

        guard keychain.save(data: seKeyData, forKey: seKeySuffix) else {
            throw NSEError.storageError("Failed to save SE key to Keychain")
        }
        guard keychain.save(data: ephemeralKey.publicKey.rawRepresentation, forKey: ephemeralPubSuffix) else {
            keychain.delete(forKey: seKeySuffix)
            throw NSEError.storageError("Failed to save ephemeral public key to Keychain")
        }
        guard keychain.save(data: blobData, forKey: blobSuffix) else {
            keychain.delete(forKey: seKeySuffix)
            keychain.delete(forKey: ephemeralPubSuffix)
            throw NSEError.storageError("Failed to save encrypted blob to Keychain")
        }

        return KeyInfo(
            pubkey: pubkeyHex,
            npub: npub,
            createdAt: Date(timeIntervalSince1970: TimeInterval(now)),
            hardwareBacked: useHardware
        )
    }

    /// Sign a Nostr event
    /// Loads the SE key, re-derives AES key, decrypts secp256k1 key, Schnorr signs, zeros memory
    public func sign(_ event: NostrEvent) throws -> SignedEvent {
        // Step 1: Load keys and blob from Keychain
        guard let seKeyData = keychain.load(forKey: seKeySuffix),
              let ephemeralPubData = keychain.load(forKey: ephemeralPubSuffix),
              let blobData = keychain.load(forKey: blobSuffix) else {
            throw NSEError.keyNotFound
        }

        let blob = try JSONDecoder().decode(EncryptedBlob.self, from: blobData)
        let ephemeralPubKey = try P256.KeyAgreement.PublicKey(rawRepresentation: ephemeralPubData)

        // Step 2: Re-derive AES key
        let aesKey: SymmetricKey
        if blob.hardwareBacked {
            let seKey = try SecureEnclave.P256.KeyAgreement.PrivateKey(
                dataRepresentation: seKeyData
            )
            aesKey = try deriveAESKeyWithSEKey(
                sePrivateKey: seKey,
                ephemeralPublicKey: ephemeralPubKey
            )
        } else {
            let softwareKey = try P256.KeyAgreement.PrivateKey(rawRepresentation: seKeyData)
            aesKey = try deriveAESKeyWithSoftwareKey(
                softwarePrivateKey: softwareKey,
                ephemeralPublicKey: ephemeralPubKey
            )
        }

        // Step 3: Decrypt secp256k1 private key
        guard let ciphertextData = Data(hexString: blob.ciphertext),
              let ivData = Data(hexString: blob.iv) else {
            throw NSEError.decryptionFailed
        }

        var privKeyData: Data
        do {
            privKeyData = try aesDecrypt(ciphertext: ciphertextData, iv: ivData, key: aesKey)
        } catch {
            throw NSEError.decryptionFailed
        }

        // Step 4: Compute event ID
        let eventId = computeEventId(
            pubkey: blob.pubkey,
            createdAt: event.createdAt,
            kind: event.kind,
            tags: event.tags,
            content: event.content
        )

        // Step 5: Schnorr sign the event ID
        // The event ID is already a 32-byte SHA-256 hash, so we sign it directly
        // using the message:auxiliaryRand: method to avoid double-hashing
        guard let eventIdBytes = Data(hexString: eventId) else {
            privKeyData.resetBytes(in: 0..<privKeyData.count)
            throw NSEError.signFailed("Invalid event ID")
        }

        let sig: String
        do {
            let schnorrKey = try secp256k1.Schnorr.PrivateKey(dataRepresentation: privKeyData)
            var messageBytes = Array(eventIdBytes)
            var auxRand = SecureRandom.bytes(count: 32)
            let signature = try schnorrKey.signature(
                message: &messageBytes,
                auxiliaryRand: &auxRand,
                strict: true
            )
            sig = signature.dataRepresentation.hexString
        } catch {
            privKeyData.resetBytes(in: 0..<privKeyData.count)
            throw NSEError.signFailed("Schnorr signing failed: \(error.localizedDescription)")
        }

        // Step 6: Zero plaintext key from memory
        privKeyData.resetBytes(in: 0..<privKeyData.count)

        return SignedEvent(
            id: eventId,
            pubkey: blob.pubkey,
            sig: sig,
            kind: event.kind,
            content: event.content,
            tags: event.tags,
            createdAt: event.createdAt
        )
    }

    /// Get the hex pubkey (does not require biometric unlock)
    public func getPublicKey() throws -> String {
        guard let blobData = keychain.load(forKey: blobSuffix) else {
            throw NSEError.keyNotFound
        }
        let blob = try JSONDecoder().decode(EncryptedBlob.self, from: blobData)
        return blob.pubkey
    }

    /// Get the bech32 npub (does not require biometric unlock)
    public func getNpub() throws -> String {
        guard let blobData = keychain.load(forKey: blobSuffix) else {
            throw NSEError.keyNotFound
        }
        let blob = try JSONDecoder().decode(EncryptedBlob.self, from: blobData)
        return blob.npub
    }

    /// Check if a key exists in Keychain
    public func exists() -> Bool {
        return keychain.load(forKey: blobSuffix) != nil
    }

    /// Wipe all key material (SE/software key + ephemeral pubkey + encrypted blob)
    public func destroy() {
        keychain.delete(forKey: seKeySuffix)
        keychain.delete(forKey: ephemeralPubSuffix)
        keychain.delete(forKey: blobSuffix)
    }
}

// MARK: - Secure Random Helper

enum SecureRandom {
    static func bytes(count: Int) -> [UInt8] {
        var bytes = [UInt8](repeating: 0, count: count)
        _ = SecRandomCopyBytes(kSecRandomDefault, count, &bytes)
        return bytes
    }
}
