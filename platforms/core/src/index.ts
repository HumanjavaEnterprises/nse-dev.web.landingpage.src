/**
 * @nse-dev/core — Shared types for Nostr Secure Enclave
 */

/** Minimal Nostr event for signing */
export interface NSEEvent {
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
}

/** Signed Nostr event (id + sig populated) */
export interface NSESignedEvent extends NSEEvent {
  id: string;
  pubkey: string;
  sig: string;
}

/** Key info returned by generate() */
export interface NSEKeyInfo {
  pubkey: string;
  npub: string;
  created_at: number;
  hardware_backed: boolean;
}

/** Platform-agnostic NSE contract — every implementation conforms to this */
export interface NSEProvider {
  /** Generate a new secp256k1 keypair, protected by hardware */
  generate(): Promise<NSEKeyInfo>;

  /** Sign a Nostr event (biometric unlock → decrypt → sign → zero) */
  sign(event: NSEEvent): Promise<NSESignedEvent>;

  /** Get the hex pubkey */
  getPublicKey(): Promise<string>;

  /** Get the bech32 npub */
  getNpub(): Promise<string>;

  /** Check if a key exists in storage */
  exists(): Promise<boolean>;

  /** Wipe all key material */
  destroy(): Promise<void>;
}
