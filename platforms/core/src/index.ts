/**
 * nostr-secure-enclave — Shared types for Nostr Secure Enclave
 *
 * These types align with nostr-crypto-utils where possible.
 * NSE adds hardware-backing metadata on top of standard Nostr types.
 */

// ---------------------------------------------------------------------------
// Event types — compatible with nostr-crypto-utils BaseNostrEvent / SignedNostrEvent
// ---------------------------------------------------------------------------

/** Unsigned Nostr event for signing (matches nostr-crypto-utils BaseNostrEvent) */
export interface NSEEvent {
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
  pubkey?: string;
}

/** Signed Nostr event (matches nostr-crypto-utils SignedNostrEvent) */
export interface NSESignedEvent {
  id: string;
  pubkey: string;
  sig: string;
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
}

// ---------------------------------------------------------------------------
// Key types
// ---------------------------------------------------------------------------

/** Key info returned by generate() */
export interface NSEKeyInfo {
  /** Hex pubkey (64 chars) */
  pubkey: string;
  /** Bech32 npub */
  npub: string;
  /** Unix timestamp of key creation */
  created_at: number;
  /** True if key is protected by hardware (Secure Enclave, StrongBox, TPM) */
  hardware_backed: boolean;
}

// ---------------------------------------------------------------------------
// Storage interface — each platform provides its own
// ---------------------------------------------------------------------------

/** Platform-specific encrypted blob storage */
export interface NSEStorage {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Provider interface — the contract every platform implementation conforms to
// ---------------------------------------------------------------------------

/** Platform-agnostic NSE contract */
export interface NSEProvider {
  /** Generate a new secp256k1 keypair, protected by hardware */
  generate(): Promise<NSEKeyInfo>;

  /** Sign a Nostr event (unlock → decrypt → sign → zero) */
  sign(event: NSEEvent): Promise<NSESignedEvent>;

  /** Get the hex pubkey (does not require unlock) */
  getPublicKey(): Promise<string>;

  /** Get the bech32 npub (does not require unlock) */
  getNpub(): Promise<string>;

  /** Check if a key exists in storage */
  exists(): Promise<boolean>;

  /** Wipe all key material */
  destroy(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Encrypted blob format — what gets stored at rest
// ---------------------------------------------------------------------------

/** The encrypted key blob stored by every platform */
export interface NSEEncryptedBlob {
  /** Version of the blob format (for future migration) */
  version: 1;
  /** AES-GCM encrypted secp256k1 private key (base64) */
  ciphertext: string;
  /** AES-GCM initialization vector (base64, 12 bytes) */
  iv: string;
  /** Hex pubkey (stored alongside for lookup without decryption) */
  pubkey: string;
  /** Bech32 npub */
  npub: string;
  /** Unix timestamp of key creation */
  created_at: number;
  /** Whether the wrapping key is hardware-backed */
  hardware_backed: boolean;
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class NSEError extends Error {
  constructor(
    message: string,
    public readonly code: NSEErrorCode,
  ) {
    super(message);
    this.name = 'NSEError';
  }
}

export enum NSEErrorCode {
  /** No key exists — call generate() first */
  KEY_NOT_FOUND = 'KEY_NOT_FOUND',
  /** Biometric / unlock was denied or failed */
  AUTH_FAILED = 'AUTH_FAILED',
  /** Hardware enclave not available on this device */
  HARDWARE_UNAVAILABLE = 'HARDWARE_UNAVAILABLE',
  /** Key already exists — call destroy() first if you want to regenerate */
  KEY_EXISTS = 'KEY_EXISTS',
  /** AES-GCM decryption failed (corrupted blob or wrong wrapping key) */
  DECRYPTION_FAILED = 'DECRYPTION_FAILED',
  /** Storage read/write failed */
  STORAGE_ERROR = 'STORAGE_ERROR',
  /** Signing failed */
  SIGN_FAILED = 'SIGN_FAILED',
}
