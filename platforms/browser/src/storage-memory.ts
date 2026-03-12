/**
 * In-memory storage — for testing (no IndexedDB needed)
 */

import type { NSEStorage } from 'nostr-secure-enclave';

export class NSEMemoryStorage implements NSEStorage {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}
