/**
 * In-memory storage — for testing and ephemeral processes
 * NOT for production (keys lost on restart)
 */

import type { NSEStorage } from '@nse-dev/core';

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
