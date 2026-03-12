/**
 * NIP-46 Remote Signer Backend
 *
 * Use NSE as the key backend for a NIP-46 bunker signer.
 * The signer holds the key (in hardware on mobile, or encrypted on server).
 * Remote apps send signing requests via NIP-46 protocol.
 *
 * Use case: NostrKeep Signer (iOS/Android), remote signing service
 */

import { NSEServer } from '@nse-dev/server';
// In real code, use: import { NSEBrowser } from '@nse-dev/browser';
// or the iOS/Android native implementation
import type { NSEProvider } from '@nse-dev/core';

// On mobile, this would be:
// import { NSE } from '@nse-dev/ios';  // Swift
// import { NSE } from '@nse-dev/android';  // Kotlin

// nostr-crypto-utils has NIP-46 server-side signer primitives
import {
  Nip46Method,
  // In real code: createNip46Signer, handleNip46Request
} from 'nostr-crypto-utils';

// ---------------------------------------------------------------------------
// 1. Initialize NSE (the key backend)
// ---------------------------------------------------------------------------

async function createSigner(nse: NSEProvider) {

  // ---------------------------------------------------------------------------
  // 2. NIP-46 request handler — maps protocol requests to NSE methods
  // ---------------------------------------------------------------------------

  async function handleRequest(method: string, params: string[]) {
    switch (method) {
      case Nip46Method.GET_PUBLIC_KEY:
        return await nse.getPublicKey();

      case Nip46Method.SIGN_EVENT: {
        // params[0] is the unsigned event JSON
        const event = JSON.parse(params[0]);

        // On mobile: this triggers biometric unlock (Face ID / fingerprint)
        // On server: this decrypts with master key
        const signed = await nse.sign({
          kind: event.kind,
          content: event.content,
          tags: event.tags,
          created_at: event.created_at,
        });

        return JSON.stringify(signed);
      }

      case Nip46Method.PING:
        return 'pong';

      default:
        throw new Error(`Unsupported method: ${method}`);
    }
  }

  return { handleRequest };
}

// ---------------------------------------------------------------------------
// 3. Example: Bunker connection flow
// ---------------------------------------------------------------------------

async function exampleBunkerFlow() {
  // Server-side NSE (for demo — on mobile this would be Secure Enclave)
  const nse = new NSEServer({
    masterKey: process.env.NSE_MASTER_KEY!,
    storage: { /* your storage */ } as any,
  });

  // Generate signer identity if first run
  if (!await nse.exists()) {
    await nse.generate();
  }

  const signer = await createSigner(nse);
  const pubkey = await nse.getPublicKey();

  // The bunker URI that remote apps use to connect
  // Format: bunker://<signer-pubkey>?relay=wss://relay.nostrkeep.com&secret=<random>
  const bunkerURI = `bunker://${pubkey}?relay=wss://relay.nostrkeep.com`;
  console.log('Bunker URI:', bunkerURI);
  console.log('Share this with the app that wants to sign events.');
  console.log();

  // ---------------------------------------------------------------------------
  // 4. Listen for incoming NIP-46 requests on relay
  // ---------------------------------------------------------------------------

  // In real code: connect to relay, subscribe to kind 24133 events
  // addressed to our pubkey, decrypt with NIP-44, handle request

  // Simulated incoming request:
  const request = {
    id: 'req-123',
    method: 'sign_event',
    params: [JSON.stringify({
      kind: 1,
      content: 'Hello from remote app!',
      tags: [],
      created_at: Math.floor(Date.now() / 1000),
    })],
  };

  console.log('Incoming NIP-46 request:', request.method);

  // Handle it
  const result = await signer.handleRequest(request.method, request.params);
  console.log('Signed event:', JSON.parse(result).id);

  // In real code: encrypt result with NIP-44, publish kind 24133 response
}

// ---------------------------------------------------------------------------
// 5. Permission model (mobile app UX)
// ---------------------------------------------------------------------------

// On mobile, each sign request should:
// 1. Check if the requesting app has permission (origin-scoped)
// 2. If not, show a prompt: "App X wants to sign a kind 1 note. Allow?"
// 3. Options: Allow once, Allow always for this kind, Deny
// 4. If allowed, trigger biometric unlock (Face ID / fingerprint)
// 5. NSE decrypts key, signs, zeros memory
// 6. Return signed event via NIP-46

// Permission storage example:
interface SignPermission {
  origin: string;       // requesting app's pubkey or domain
  kinds: number[];      // allowed event kinds (empty = all)
  expires_at?: number;  // optional TTL
}

// ---------------------------------------------------------------------------
// 6. Mobile flow (pseudocode — iOS/Android native)
// ---------------------------------------------------------------------------

/*
// Swift (iOS)
let nse = try await NSE.init()  // uses Secure Enclave

// On NIP-46 sign_event request:
func handleSignRequest(eventJSON: String, origin: String) async throws -> String {
    // 1. Check permissions
    guard permissions.allows(origin: origin, kind: event.kind) else {
        // Show permission prompt
        let approved = await showPermissionSheet(origin: origin, event: event)
        guard approved else { throw NSEError.authFailed }
    }

    // 2. Biometric unlock + sign (NSE handles both)
    let signed = try await NSE.sign(event)  // Face ID → decrypt → sign → zero

    // 3. Return signed event
    return signed.toJSON()
}
*/

/*
// Kotlin (Android)
val nse = NSE  // uses StrongBox/TEE

// On NIP-46 sign_event request:
suspend fun handleSignRequest(eventJSON: String, origin: String): String {
    // 1. Check permissions
    if (!permissions.allows(origin, event.kind)) {
        val approved = showPermissionDialog(origin, event)
        if (!approved) throw NSEError(AUTH_FAILED)
    }

    // 2. Biometric unlock + sign
    val promptInfo = BiometricPrompt.PromptInfo.Builder()
        .setTitle("Sign Event")
        .setSubtitle("$origin wants to sign a kind ${event.kind} event")
        .build()

    val signed = NSE.sign(event, promptInfo)  // BiometricPrompt → decrypt → sign → zero

    // 3. Return signed event
    return signed.toJSON()
}
*/

exampleBunkerFlow().catch(console.error);
