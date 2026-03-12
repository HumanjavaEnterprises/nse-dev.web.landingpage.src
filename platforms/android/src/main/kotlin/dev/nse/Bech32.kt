package dev.nse

/**
 * Bech32 encoding for Nostr npub addresses.
 * Implements BIP-173 bech32 encoding used by NIP-19.
 */
object Bech32 {

    private const val CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"

    /**
     * Encode a byte array as bech32 with the given human-readable part.
     * For npub: bech32Encode("npub", 32-byte-pubkey)
     */
    fun bech32Encode(hrp: String, data: ByteArray): String {
        val converted = convertBits(data, 8, 5, true)
        val checksum = createChecksum(hrp, converted)
        val combined = converted + checksum

        val sb = StringBuilder(hrp.length + 1 + combined.size)
        sb.append(hrp)
        sb.append('1')
        for (b in combined) {
            sb.append(CHARSET[b.toInt() and 0xFF])
        }
        return sb.toString()
    }

    /**
     * Convert between bit groups.
     * Used to convert 8-bit bytes to 5-bit groups for bech32 encoding.
     */
    fun convertBits(data: ByteArray, fromBits: Int, toBits: Int, pad: Boolean): ByteArray {
        var acc = 0
        var bits = 0
        val maxv = (1 shl toBits) - 1
        val result = mutableListOf<Byte>()

        for (b in data) {
            val value = b.toInt() and 0xFF
            if (value ushr fromBits != 0) {
                throw NSEException(
                    "Invalid value in convertBits: $value",
                    NSEErrorCode.SIGN_FAILED
                )
            }
            acc = (acc shl fromBits) or value
            bits += fromBits
            while (bits >= toBits) {
                bits -= toBits
                result.add(((acc ushr bits) and maxv).toByte())
            }
        }

        if (pad) {
            if (bits > 0) {
                result.add(((acc shl (toBits - bits)) and maxv).toByte())
            }
        } else if (bits >= fromBits || ((acc shl (toBits - bits)) and maxv) != 0) {
            throw NSEException(
                "Invalid padding in convertBits",
                NSEErrorCode.SIGN_FAILED
            )
        }

        return result.toByteArray()
    }

    private fun polymod(values: ByteArray): Int {
        val generator = intArrayOf(
            0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3
        )
        var chk = 1
        for (v in values) {
            val top = chk ushr 25
            chk = ((chk and 0x1ffffff) shl 5) xor (v.toInt() and 0xFF)
            for (i in 0 until 5) {
                if ((top ushr i) and 1 == 1) {
                    chk = chk xor generator[i]
                }
            }
        }
        return chk
    }

    private fun hrpExpand(hrp: String): ByteArray {
        val result = ByteArray(hrp.length * 2 + 1)
        for (i in hrp.indices) {
            result[i] = (hrp[i].code ushr 5).toByte()
        }
        result[hrp.length] = 0
        for (i in hrp.indices) {
            result[hrp.length + 1 + i] = (hrp[i].code and 31).toByte()
        }
        return result
    }

    private fun createChecksum(hrp: String, data: ByteArray): ByteArray {
        val values = hrpExpand(hrp) + data + byteArrayOf(0, 0, 0, 0, 0, 0)
        val polymod = polymod(values) xor 1
        val result = ByteArray(6)
        for (i in 0 until 6) {
            result[i] = ((polymod ushr (5 * (5 - i))) and 31).toByte()
        }
        return result
    }
}
