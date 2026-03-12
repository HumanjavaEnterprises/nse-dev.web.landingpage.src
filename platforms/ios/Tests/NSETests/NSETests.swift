import XCTest
import CryptoKit
@testable import NSE

@available(iOS 15.0, macOS 13.0, *)
final class NSETests: XCTestCase {

    /// Unique key tag per test to avoid Keychain collisions
    private func makeNSE(tag: String = #function) -> NSE {
        return NSE(keyTag: "dev.nse.test.\(tag)", useSoftwareKey: true)
    }

    /// Clean up after each test
    override func tearDown() {
        super.tearDown()
        // Tests use unique tags so cleanup is handled per-test via destroy()
    }

    // MARK: - Generate Tests

    func testGenerateReturnsValidPubkey() throws {
        let nse = makeNSE()
        defer { nse.destroy() }

        let keyInfo = try nse.generate()

        // Pubkey should be 64 hex characters (32 bytes x-only)
        XCTAssertEqual(keyInfo.pubkey.count, 64)
        XCTAssertTrue(keyInfo.pubkey.allSatisfy { "0123456789abcdef".contains($0) },
                       "Pubkey should be lowercase hex")
    }

    func testGenerateReturnsValidNpub() throws {
        let nse = makeNSE()
        defer { nse.destroy() }

        let keyInfo = try nse.generate()

        // npub should start with "npub1"
        XCTAssertTrue(keyInfo.npub.hasPrefix("npub1"),
                       "npub should start with npub1, got: \(keyInfo.npub)")
        // npub is typically 63 characters
        XCTAssertEqual(keyInfo.npub.count, 63)
    }

    func testGenerateSetsSoftwareBacked() throws {
        let nse = makeNSE()
        defer { nse.destroy() }

        let keyInfo = try nse.generate()
        XCTAssertFalse(keyInfo.hardwareBacked,
                        "Software key mode should set hardwareBacked to false")
    }

    func testGenerateSetsCreatedAt() throws {
        let nse = makeNSE()
        defer { nse.destroy() }

        let before = Date()
        let keyInfo = try nse.generate()
        let after = Date()

        XCTAssertGreaterThanOrEqual(keyInfo.createdAt, before.addingTimeInterval(-1))
        XCTAssertLessThanOrEqual(keyInfo.createdAt, after.addingTimeInterval(1))
    }

    func testDoubleGenerateThrowsKeyExists() throws {
        let nse = makeNSE()
        defer { nse.destroy() }

        _ = try nse.generate()

        XCTAssertThrowsError(try nse.generate()) { error in
            XCTAssertEqual(error as? NSEError, NSEError.keyExists)
        }
    }

    // MARK: - Exists Tests

    func testExistsReturnsFalseBeforeGenerate() {
        let nse = makeNSE()
        defer { nse.destroy() }

        XCTAssertFalse(nse.exists())
    }

    func testExistsReturnsTrueAfterGenerate() throws {
        let nse = makeNSE()
        defer { nse.destroy() }

        _ = try nse.generate()
        XCTAssertTrue(nse.exists())
    }

    // MARK: - Destroy Tests

    func testDestroyRemovesKey() throws {
        let nse = makeNSE()

        _ = try nse.generate()
        XCTAssertTrue(nse.exists())

        nse.destroy()
        XCTAssertFalse(nse.exists())
    }

    func testDestroyAllowsRegenerate() throws {
        let nse = makeNSE()
        defer { nse.destroy() }

        let first = try nse.generate()
        nse.destroy()
        let second = try nse.generate()

        // New key should have a different pubkey
        XCTAssertNotEqual(first.pubkey, second.pubkey)
    }

    // MARK: - GetPublicKey / GetNpub Tests

    func testGetPublicKeyMatchesGenerate() throws {
        let nse = makeNSE()
        defer { nse.destroy() }

        let keyInfo = try nse.generate()
        let pubkey = try nse.getPublicKey()

        XCTAssertEqual(pubkey, keyInfo.pubkey)
    }

    func testGetNpubMatchesGenerate() throws {
        let nse = makeNSE()
        defer { nse.destroy() }

        let keyInfo = try nse.generate()
        let npub = try nse.getNpub()

        XCTAssertEqual(npub, keyInfo.npub)
    }

    func testGetPublicKeyThrowsWhenNoKey() {
        let nse = makeNSE()

        XCTAssertThrowsError(try nse.getPublicKey()) { error in
            XCTAssertEqual(error as? NSEError, NSEError.keyNotFound)
        }
    }

    func testGetNpubThrowsWhenNoKey() {
        let nse = makeNSE()

        XCTAssertThrowsError(try nse.getNpub()) { error in
            XCTAssertEqual(error as? NSEError, NSEError.keyNotFound)
        }
    }

    // MARK: - Sign Tests

    func testSignBeforeGenerateThrowsKeyNotFound() {
        let nse = makeNSE()

        let event = NostrEvent(kind: 1, content: "hello", tags: [], createdAt: 1234567890)

        XCTAssertThrowsError(try nse.sign(event)) { error in
            XCTAssertEqual(error as? NSEError, NSEError.keyNotFound)
        }
    }

    func testSignReturnsValidSignedEvent() throws {
        let nse = makeNSE()
        defer { nse.destroy() }

        let keyInfo = try nse.generate()
        let event = NostrEvent(kind: 1, content: "hello nostr", tags: [], createdAt: 1234567890)
        let signed = try nse.sign(event)

        // Event ID should be 64 hex chars (SHA-256)
        XCTAssertEqual(signed.id.count, 64)
        XCTAssertTrue(signed.id.allSatisfy { "0123456789abcdef".contains($0) })

        // Signature should be 128 hex chars (64 bytes Schnorr)
        XCTAssertEqual(signed.sig.count, 128)
        XCTAssertTrue(signed.sig.allSatisfy { "0123456789abcdef".contains($0) })

        // Pubkey should match the generated key
        XCTAssertEqual(signed.pubkey, keyInfo.pubkey)

        // Event fields should be preserved
        XCTAssertEqual(signed.kind, 1)
        XCTAssertEqual(signed.content, "hello nostr")
        XCTAssertEqual(signed.createdAt, 1234567890)
        XCTAssertEqual(signed.tags.count, 0)
    }

    func testSignEventIdIsCorrectHash() throws {
        let nse = makeNSE()
        defer { nse.destroy() }

        let keyInfo = try nse.generate()
        let event = NostrEvent(kind: 1, content: "test", tags: [["e", "abc123"]], createdAt: 1700000000)
        let signed = try nse.sign(event)

        // Independently compute the event ID
        let expectedId = computeEventId(
            pubkey: keyInfo.pubkey,
            createdAt: 1700000000,
            kind: 1,
            tags: [["e", "abc123"]],
            content: "test"
        )

        XCTAssertEqual(signed.id, expectedId)
    }

    func testSignWithSpecialCharactersInContent() throws {
        let nse = makeNSE()
        defer { nse.destroy() }

        _ = try nse.generate()
        let event = NostrEvent(
            kind: 1,
            content: "hello \"world\"\nnew line\ttab\\backslash",
            tags: [],
            createdAt: 1234567890
        )
        let signed = try nse.sign(event)

        // Should succeed without error and produce valid output
        XCTAssertEqual(signed.id.count, 64)
        XCTAssertEqual(signed.sig.count, 128)
        XCTAssertEqual(signed.content, "hello \"world\"\nnew line\ttab\\backslash")
    }

    func testSignWithTags() throws {
        let nse = makeNSE()
        defer { nse.destroy() }

        _ = try nse.generate()
        let event = NostrEvent(
            kind: 1,
            content: "tagged event",
            tags: [["e", "abc"], ["p", "def456"]],
            createdAt: 1234567890
        )
        let signed = try nse.sign(event)

        XCTAssertEqual(signed.tags.count, 2)
        XCTAssertEqual(signed.tags[0], ["e", "abc"])
        XCTAssertEqual(signed.tags[1], ["p", "def456"])
    }

    func testSignProducesDifferentSigsForDifferentEvents() throws {
        let nse = makeNSE()
        defer { nse.destroy() }

        _ = try nse.generate()

        let event1 = NostrEvent(kind: 1, content: "first", tags: [], createdAt: 1234567890)
        let event2 = NostrEvent(kind: 1, content: "second", tags: [], createdAt: 1234567890)

        let signed1 = try nse.sign(event1)
        let signed2 = try nse.sign(event2)

        XCTAssertNotEqual(signed1.id, signed2.id)
        XCTAssertNotEqual(signed1.sig, signed2.sig)
    }

    // MARK: - Multiple Instance Tests

    func testMultipleInstancesCoexist() throws {
        let nse1 = NSE(keyTag: "dev.nse.test.instance1", useSoftwareKey: true)
        let nse2 = NSE(keyTag: "dev.nse.test.instance2", useSoftwareKey: true)
        defer {
            nse1.destroy()
            nse2.destroy()
        }

        let key1 = try nse1.generate()
        let key2 = try nse2.generate()

        // Different instances should produce different keys
        XCTAssertNotEqual(key1.pubkey, key2.pubkey)

        // Each instance should see only its own key
        XCTAssertEqual(try nse1.getPublicKey(), key1.pubkey)
        XCTAssertEqual(try nse2.getPublicKey(), key2.pubkey)
    }

    func testDestroyOneInstanceDoesNotAffectOther() throws {
        let nse1 = NSE(keyTag: "dev.nse.test.isolate1", useSoftwareKey: true)
        let nse2 = NSE(keyTag: "dev.nse.test.isolate2", useSoftwareKey: true)
        defer {
            nse1.destroy()
            nse2.destroy()
        }

        _ = try nse1.generate()
        _ = try nse2.generate()

        nse1.destroy()

        XCTAssertFalse(nse1.exists())
        XCTAssertTrue(nse2.exists())
    }

    // MARK: - Blob Format Tests

    func testBlobJsonFormat() throws {
        let nse = makeNSE()
        defer { nse.destroy() }

        _ = try nse.generate()

        // Load the raw blob data from Keychain to verify format
        let keychain = KeychainStorage(keyPrefix: "dev.nse.test.\(#function)")
        guard let blobData = keychain.load(forKey: "blob") else {
            XCTFail("Blob not found in Keychain")
            return
        }

        let blob = try JSONDecoder().decode(EncryptedBlob.self, from: blobData)

        XCTAssertEqual(blob.version, 1)
        XCTAssertFalse(blob.hardwareBacked)
        XCTAssertEqual(blob.pubkey.count, 64)
        XCTAssertTrue(blob.npub.hasPrefix("npub1"))
        XCTAssertGreaterThan(blob.createdAt, 0)
        XCTAssertFalse(blob.ciphertext.isEmpty)
        XCTAssertFalse(blob.iv.isEmpty)
    }

    // MARK: - Crypto Helper Tests

    func testHexRoundTrip() {
        let original = Data([0x00, 0x01, 0xab, 0xcd, 0xef, 0xff])
        let hex = original.hexString
        XCTAssertEqual(hex, "0001abcdefff")

        let decoded = Data(hexString: hex)
        XCTAssertEqual(decoded, original)
    }

    func testHexInvalidReturnsNil() {
        XCTAssertNil(Data(hexString: "zz"))
        XCTAssertNil(Data(hexString: "abc")) // odd length
    }

    // MARK: - Bech32 Tests

    func testBech32EncodeKnownVector() {
        // A 32-byte all-zeros key should produce a valid npub
        let zeroKey = Data(repeating: 0, count: 32)
        let result = bech32Encode(hrp: "npub", data: zeroKey)
        XCTAssertNotNil(result)
        XCTAssertTrue(result!.hasPrefix("npub1"))
        XCTAssertEqual(result!.count, 63) // npub1 (5) + 52 data chars + 6 checksum
    }

    // MARK: - Event ID Computation Tests

    func testEventIdComputation() {
        // Verify deterministic event ID computation
        let id1 = computeEventId(pubkey: "a".repeated(64), createdAt: 1000, kind: 1, tags: [], content: "hello")
        let id2 = computeEventId(pubkey: "a".repeated(64), createdAt: 1000, kind: 1, tags: [], content: "hello")
        XCTAssertEqual(id1, id2)
        XCTAssertEqual(id1.count, 64)

        // Different content should produce different ID
        let id3 = computeEventId(pubkey: "a".repeated(64), createdAt: 1000, kind: 1, tags: [], content: "world")
        XCTAssertNotEqual(id1, id3)
    }

    func testJsonEscaping() {
        let input = "hello \"world\"\nnewline\ttab\\backslash"
        let escaped = jsonEscape(input)
        XCTAssertEqual(escaped, "hello \\\"world\\\"\\nnewline\\ttab\\\\backslash")
    }
}

// MARK: - Test Helpers

private extension String {
    func repeated(_ count: Int) -> String {
        return String(repeating: self, count: count)
    }
}
