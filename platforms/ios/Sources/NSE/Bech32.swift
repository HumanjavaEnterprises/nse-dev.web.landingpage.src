import Foundation

// MARK: - Bech32 Encoding

/// Bech32 character set
private let bech32Charset = Array("qpzry9x8gf2tvdw0s3jn54khce6mua7l")

/// Bech32 polymod for checksum computation
private func bech32Polymod(_ values: [UInt8]) -> UInt32 {
    let generator: [UInt32] = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
    var chk: UInt32 = 1
    for v in values {
        let b = chk >> 25
        chk = ((chk & 0x1ffffff) << 5) ^ UInt32(v)
        for i in 0..<5 {
            if (b >> i) & 1 != 0 {
                chk ^= generator[i]
            }
        }
    }
    return chk
}

/// Expand the human-readable part for checksum computation
private func bech32HrpExpand(_ hrp: String) -> [UInt8] {
    var result: [UInt8] = []
    for char in hrp.utf8 {
        result.append(char >> 5)
    }
    result.append(0)
    for char in hrp.utf8 {
        result.append(char & 31)
    }
    return result
}

/// Create the bech32 checksum
private func bech32CreateChecksum(hrp: String, data: [UInt8]) -> [UInt8] {
    let values = bech32HrpExpand(hrp) + data + [0, 0, 0, 0, 0, 0]
    let polymod = bech32Polymod(values) ^ 1
    var result: [UInt8] = []
    for i in 0..<6 {
        result.append(UInt8((polymod >> (5 * (5 - i))) & 31))
    }
    return result
}

/// Convert data from one bit-grouping to another (e.g. 8-bit to 5-bit)
private func convertBits(data: Data, fromBits: Int, toBits: Int, pad: Bool) -> [UInt8]? {
    var acc: Int = 0
    var bits: Int = 0
    var result: [UInt8] = []
    let maxv = (1 << toBits) - 1

    for byte in data {
        acc = (acc << fromBits) | Int(byte)
        bits += fromBits
        while bits >= toBits {
            bits -= toBits
            result.append(UInt8((acc >> bits) & maxv))
        }
    }

    if pad {
        if bits > 0 {
            result.append(UInt8((acc << (toBits - bits)) & maxv))
        }
    } else {
        if bits >= fromBits {
            return nil
        }
        if (acc << (toBits - bits)) & maxv != 0 {
            return nil
        }
    }

    return result
}

/// Encode data as a bech32 string
/// - Parameters:
///   - hrp: Human-readable part (e.g. "npub", "nsec")
///   - data: Raw data bytes to encode
/// - Returns: Bech32-encoded string
public func bech32Encode(hrp: String, data: Data) -> String? {
    guard let converted = convertBits(data: data, fromBits: 8, toBits: 5, pad: true) else {
        return nil
    }
    let checksum = bech32CreateChecksum(hrp: hrp, data: converted)
    let allData = converted + checksum
    var result = hrp + "1"
    for byte in allData {
        result.append(bech32Charset[Int(byte)])
    }
    return result
}
