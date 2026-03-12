# @nse-dev/core

Shared TypeScript interfaces and types for NSE. Every platform implementation conforms to these contracts.

## Package: `@nse-dev/core` (npm)

## Types

```typescript
interface NSEProvider {
  generate(): Promise<NSEKeyInfo>;
  sign(event: NSEEvent): Promise<NSESignedEvent>;
  getPublicKey(): Promise<string>;
  getNpub(): Promise<string>;
  exists(): Promise<boolean>;
  destroy(): Promise<void>;
}
```

## Status: Planned (Phase 4)
