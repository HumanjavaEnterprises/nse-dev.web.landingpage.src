import Foundation
import CryptoKit

// MARK: - Key Derivation

/// Derive an AES-256-GCM symmetric key using ECDH + HKDF
/// from a Secure Enclave P-256 private key and an ephemeral P-256 public key
@available(iOS 15.0, macOS 13.0, *)
func deriveAESKeyWithSEKey(
    sePrivateKey: SecureEnclave.P256.KeyAgreement.PrivateKey,
    ephemeralPublicKey: P256.KeyAgreement.PublicKey
) throws -> SymmetricKey {
    let sharedSecret = try sePrivateKey.sharedSecretFromKeyAgreement(with: ephemeralPublicKey)
    let salt = "nse-v1".data(using: .utf8)!
    let key = sharedSecret.hkdfDerivedSymmetricKey(
        using: SHA256.self,
        salt: salt,
        sharedInfo: Data(),
        outputByteCount: 32
    )
    return key
}

/// Derive an AES-256-GCM symmetric key using ECDH + HKDF
/// from a software P-256 private key and an ephemeral P-256 public key (simulator fallback)
func deriveAESKeyWithSoftwareKey(
    softwarePrivateKey: P256.KeyAgreement.PrivateKey,
    ephemeralPublicKey: P256.KeyAgreement.PublicKey
) throws -> SymmetricKey {
    let sharedSecret = try softwarePrivateKey.sharedSecretFromKeyAgreement(with: ephemeralPublicKey)
    let salt = "nse-v1".data(using: .utf8)!
    let key = sharedSecret.hkdfDerivedSymmetricKey(
        using: SHA256.self,
        salt: salt,
        sharedInfo: Data(),
        outputByteCount: 32
    )
    return key
}

// MARK: - AES-GCM Encryption / Decryption

/// Encrypt data with AES-256-GCM
/// Returns the ciphertext (which includes the GCM tag appended) and the nonce/IV
func aesEncrypt(data: Data, key: SymmetricKey) throws -> (ciphertext: Data, iv: Data) {
    let nonce = AES.GCM.Nonce()
    let sealedBox = try AES.GCM.seal(data, using: key, nonce: nonce)
    // combined = nonce + ciphertext + tag; we store nonce separately
    // sealedBox.ciphertext includes just ciphertext, tag is separate
    let ciphertextWithTag = sealedBox.ciphertext + sealedBox.tag
    let ivData = Data(nonce)
    return (ciphertext: ciphertextWithTag, iv: ivData)
}

/// Decrypt AES-256-GCM encrypted data
/// ciphertext here includes the appended GCM tag (last 16 bytes)
func aesDecrypt(ciphertext: Data, iv: Data, key: SymmetricKey) throws -> Data {
    // combined format: nonce (12 bytes) + ciphertext + tag (16 bytes)
    let combined = iv + ciphertext
    let sealedBox = try AES.GCM.SealedBox(combined: combined)
    let plaintext = try AES.GCM.open(sealedBox, using: key)
    return plaintext
}

// MARK: - Hex Utilities

extension Data {
    /// Convert Data to lowercase hex string
    var hexString: String {
        map { String(format: "%02x", $0) }.joined()
    }

    /// Initialize Data from a hex string
    init?(hexString: String) {
        let hex = hexString.lowercased()
        guard hex.count % 2 == 0 else { return nil }
        var data = Data(capacity: hex.count / 2)
        var index = hex.startIndex
        while index < hex.endIndex {
            let nextIndex = hex.index(index, offsetBy: 2)
            guard let byte = UInt8(hex[index..<nextIndex], radix: 16) else { return nil }
            data.append(byte)
            index = nextIndex
        }
        self = data
    }
}

// MARK: - JSON Serialization for Nostr Event ID

/// Compute the Nostr event ID: sha256 of the canonical JSON serialization
/// Format: [0, pubkey_hex, created_at, kind, tags, content]
func computeEventId(pubkey: String, createdAt: Int, kind: Int, tags: [[String]], content: String) -> String {
    let serialized = serializeForEventId(pubkey: pubkey, createdAt: createdAt, kind: kind, tags: tags, content: content)
    let hash = SHA256.hash(data: Data(serialized.utf8))
    return Data(hash).hexString
}

/// Serialize the event fields into the canonical JSON string for hashing
func serializeForEventId(pubkey: String, createdAt: Int, kind: Int, tags: [[String]], content: String) -> String {
    let escapedContent = jsonEscape(content)
    let tagsJson = serializeTags(tags)
    return "[0,\"\(pubkey)\",\(createdAt),\(kind),\(tagsJson),\"\(escapedContent)\"]"
}

/// Escape special characters for JSON string values
func jsonEscape(_ string: String) -> String {
    var result = ""
    for char in string {
        switch char {
        case "\\": result += "\\\\"
        case "\"": result += "\\\""
        case "\n": result += "\\n"
        case "\t": result += "\\t"
        case "\r": result += "\\r"
        case "\u{08}": result += "\\b"
        case "\u{0C}": result += "\\f"
        default:
            if char.asciiValue != nil && char.asciiValue! < 0x20 {
                result += String(format: "\\u%04x", char.asciiValue!)
            } else {
                result.append(char)
            }
        }
    }
    return result
}

/// Serialize tags array to JSON
func serializeTags(_ tags: [[String]]) -> String {
    let inner = tags.map { tag -> String in
        let elements = tag.map { "\"\(jsonEscape($0))\"" }.joined(separator: ",")
        return "[\(elements)]"
    }.joined(separator: ",")
    return "[\(inner)]"
}
