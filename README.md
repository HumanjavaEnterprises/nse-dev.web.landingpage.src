# nSec Locker

Landing page for nSec Locker, hosted on GitHub Pages.

## Product Vision

nSec Locker is the "1Password for Nostr" — a developer-facing platform that enables tools and services to securely work with nsec keys and NIP-46 bunker connections.

### The problem

Every Nostr tool needs to handle private keys somehow. Most do it badly — plaintext storage, no encryption at rest, no delegation model. Developers reinvent key management for every app.

### What nSec Locker does

A secure enclave platform where:

1. **Users store nsec keys** — encrypted at rest, never exposed in plaintext
2. **Tools connect via NIP-46** — apps request signing permission, users approve from the locker
3. **Bunker management** — create, revoke, and audit bunker connections from one place
4. **Developer SDK** — `npm install nsec-locker` gives any Nostr app secure key access without handling raw nsec

### How it fits the ecosystem

| Layer | Product | Role |
|-------|---------|------|
| Hold keys | **NostrKey** | Browser extension, holds keys locally |
| Store keys | **nSec Locker** | Platform/vault, manages keys + bunker connections |
| Protect keys | **NostrKeep** | Relay + storage, sovereign data layer |
| Sign remotely | **NIP-46 bunker** | Protocol — Locker is the bunker manager |

nSec Locker is the missing middle layer: NostrKey holds one key in one browser. nSec Locker manages all your keys across all your tools.

### Developer experience

```js
import { NSecLocker } from 'nsec-locker';

const locker = new NSecLocker();
const signer = await locker.connect('bunker://...');
const signed = await signer.signEvent(event);
```

Tools never touch the nsec. They get a signer interface. The user approves from their locker.

### Target audience

- **Developers** building Nostr tools who need secure key management
- **Power users** with multiple npubs/nsecs across many apps
- **Services** that need to sign on behalf of users (with consent)

### Domain

`nse.dev` — short, memorable, developer-facing. The platform that other Nostr tools build on.

## Setup

- **Repo:** [HumanjavaEnterprises/nse-locker.web.landingpage.src](https://github.com/HumanjavaEnterprises/nse-locker.web.landingpage.src)
- **Pages source:** `main` branch, `/docs` folder
- **Custom domain:** `nse.dev`

## DNS Configuration

Point your domain to GitHub Pages:

**A records** (apex domain):
```
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

**CNAME** (www subdomain):
```
www → humanjavaenterprises.github.io
```

Once DNS propagates, HTTPS is enforced automatically by GitHub Pages.
