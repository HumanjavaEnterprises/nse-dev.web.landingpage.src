import Foundation
import Security

/// Simple Keychain wrapper for storing NSE data
/// All items use kSecAttrAccessibleWhenUnlockedThisDeviceOnly
struct KeychainStorage {
    private let keyPrefix: String

    init(keyPrefix: String) {
        self.keyPrefix = keyPrefix
    }

    /// Build the full service name for a given key suffix
    private func serviceName(forKey key: String) -> String {
        return "\(keyPrefix).\(key)"
    }

    /// Save data to the Keychain
    @discardableResult
    func save(data: Data, forKey key: String) -> Bool {
        let service = serviceName(forKey: key)

        // Delete any existing item first
        let deleteQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: service
        ]
        SecItemDelete(deleteQuery as CFDictionary)

        // Add new item
        let addQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: service,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        let status = SecItemAdd(addQuery as CFDictionary, nil)
        return status == errSecSuccess
    }

    /// Load data from the Keychain
    func load(forKey key: String) -> Data? {
        let service = serviceName(forKey: key)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: service,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess else { return nil }
        return result as? Data
    }

    /// Delete data from the Keychain
    @discardableResult
    func delete(forKey key: String) -> Bool {
        let service = serviceName(forKey: key)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: service
        ]
        let status = SecItemDelete(query as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }
}
