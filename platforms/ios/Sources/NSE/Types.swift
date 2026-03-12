import Foundation

// MARK: - Error Types

/// Errors that can occur during NSE operations
public enum NSEError: Error, Equatable {
    case keyNotFound
    case authFailed
    case hardwareUnavailable
    case keyExists
    case decryptionFailed
    case storageError(String)
    case signFailed(String)

    public static func == (lhs: NSEError, rhs: NSEError) -> Bool {
        switch (lhs, rhs) {
        case (.keyNotFound, .keyNotFound): return true
        case (.authFailed, .authFailed): return true
        case (.hardwareUnavailable, .hardwareUnavailable): return true
        case (.keyExists, .keyExists): return true
        case (.decryptionFailed, .decryptionFailed): return true
        case (.storageError(let a), .storageError(let b)): return a == b
        case (.signFailed(let a), .signFailed(let b)): return a == b
        default: return false
        }
    }
}

// MARK: - Encrypted Blob

/// The JSON blob stored in Keychain containing the encrypted secp256k1 key
public struct EncryptedBlob: Codable {
    public let version: Int
    public let ciphertext: String
    public let iv: String
    public let pubkey: String
    public let npub: String
    public let createdAt: Int
    public let hardwareBacked: Bool

    enum CodingKeys: String, CodingKey {
        case version
        case ciphertext
        case iv
        case pubkey
        case npub
        case createdAt = "created_at"
        case hardwareBacked = "hardware_backed"
    }

    public init(
        version: Int,
        ciphertext: String,
        iv: String,
        pubkey: String,
        npub: String,
        createdAt: Int,
        hardwareBacked: Bool
    ) {
        self.version = version
        self.ciphertext = ciphertext
        self.iv = iv
        self.pubkey = pubkey
        self.npub = npub
        self.createdAt = createdAt
        self.hardwareBacked = hardwareBacked
    }
}

// MARK: - Public API Types

/// Information about a generated key
public struct KeyInfo {
    public let pubkey: String
    public let npub: String
    public let createdAt: Date
    public let hardwareBacked: Bool

    public init(pubkey: String, npub: String, createdAt: Date, hardwareBacked: Bool) {
        self.pubkey = pubkey
        self.npub = npub
        self.createdAt = createdAt
        self.hardwareBacked = hardwareBacked
    }
}

/// An unsigned Nostr event to be signed
public struct NostrEvent {
    public let kind: Int
    public let content: String
    public let tags: [[String]]
    public let createdAt: Int

    public init(kind: Int, content: String, tags: [[String]], createdAt: Int) {
        self.kind = kind
        self.content = content
        self.tags = tags
        self.createdAt = createdAt
    }
}

/// A signed Nostr event
public struct SignedEvent {
    public let id: String
    public let pubkey: String
    public let sig: String
    public let kind: Int
    public let content: String
    public let tags: [[String]]
    public let createdAt: Int

    public init(
        id: String,
        pubkey: String,
        sig: String,
        kind: Int,
        content: String,
        tags: [[String]],
        createdAt: Int
    ) {
        self.id = id
        self.pubkey = pubkey
        self.sig = sig
        self.kind = kind
        self.content = content
        self.tags = tags
        self.createdAt = createdAt
    }
}
