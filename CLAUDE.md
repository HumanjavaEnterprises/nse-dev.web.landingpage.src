# CLAUDE.md — nse-dev.web.landingpage.src

## What This Is

Public landing page for **NSE (Nostr Secure Enclave)** at [nse.dev](https://nse.dev). Static HTML hosted on GitHub Pages.

## Repo Structure

```
docs/                  ← GitHub Pages source (served from main branch)
  index.html           ← Single-page site (HTML + inline CSS, no build step)
  og-image.png         ← 1200x630 OG/Twitter social card
  CNAME                ← Custom domain: nse.dev
platforms/             ← Working code for each target platform
  core/                ← nostr-secure-enclave — shared TypeScript types + NSEProvider interface
  ios/                 ← nostr-secure-enclave-ios — Swift Package (Secure Enclave)
  android/             ← nostr-secure-enclave-android — Kotlin (StrongBox / TEE)
  server/              ← nostr-secure-enclave-server — TypeScript (CF Workers + Node.js)
  browser/             ← nostr-secure-enclave-browser — TypeScript (WebAuthn + SubtleCrypto)
  python/              ← nostr-secure-enclave — Python (PyPI)
examples/              ← Real-world usage patterns (7 examples)
generate-og.py         ← Pillow script to regenerate the social card
README.md              ← Full project overview + DNS setup
```

## How to Work With This Repo

### Landing Page
- **No build step.** Edit `docs/index.html` directly. Push to `main` and GitHub Pages deploys.
- **Design system:** Dark theme with CSS custom properties. `--bg: #0a0a0f`, `--cyan: #22d3ee`, `--text: #f0f0f5`. System font stack, monospace for code.
- **OG image:** Regenerate with `python3 generate-og.py` (requires Pillow). Output goes to `docs/og-image.png`.
- **No JavaScript.** The page is pure HTML + CSS. Keep it that way unless there's a strong reason.
- **Mobile responsive.** Media query at 480px. Test any changes at small viewports.

### Platform Code
- **npm workspaces:** `platforms/package.json` defines workspaces for core, server, browser.
- **Install:** `cd platforms && npm install` — links `nostr-secure-enclave` for local development.
- **Run all tests:** `cd platforms && npm test` — runs core (vitest), server (vitest), browser (vitest), python (pytest). 82 tests total.
- **Individual tests:** `npm run test:core`, `npm run test:server`, `npm run test:browser`, `npm run test:python`
- **Build TypeScript:** `npm run build` — compiles core, server, browser to `dist/`.
- **Python tests:** Requires `pip install cryptography secp256k1 pytest`.
- **Imports:** Server and browser import from `nostr-secure-enclave` (workspace-linked). In development, vitest resolves to `core/src/index.ts` directly.

## Content Sections

The page follows this structure:
1. Hero (badge, title, tagline, code sample)
2. The Problem (secp256k1 vs P-256 curve mismatch)
3. The Solution (key wrapping flow diagram)
4. Platform Support (iOS, Android, Server, Browser table)
5. Architecture (ASCII diagram: app → NSE → hardware)
6. Full API (6 methods)
7. Prior Art (5 projects and what gap NSE fills)
8. NIP Integration (NIP-46, NIP-49, future attestation)
9. Planned Packages (6 packages across registries)
10. What NSE Is Not (honest threat model)
11. CTA (GitHub link)
12. Footer

## Conventions

- Inline CSS only (no external stylesheets, no CSS frameworks)
- Color classes: `.fn` (cyan), `.comment` (dim), `.str` (purple), `.kw` (pink), `.hl` (cyan highlight)
- Tables use `.platform-table` class. Hardware badges use `.badge-hw`.
- Flow diagrams use `.flow` class with `white-space: pre`.
- Keep claims honest. The "What NSE Is Not" section exists for a reason — don't weaken it.

## NSE Project

NSE is an open-source library for hardware-backed Nostr key management. It bridges the secp256k1/P-256 curve gap by using hardware enclaves to protect (not sign with) the Nostr private key.

- **License:** MIT
- **Org:** [HumanjavaEnterprises](https://github.com/HumanjavaEnterprises)
- **Website:** [nse.dev](https://nse.dev)
