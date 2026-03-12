# NSE — Nostr Secure Enclave

Landing page for [nse.dev](https://nse.dev), hosted on GitHub Pages.

## What Is NSE

Open-source hardware-backed key management for Nostr. Bridges the secp256k1/P-256 curve gap via key wrapping — your nsec encrypted at rest by the Secure Enclave (iOS), StrongBox (Android), or TPM (server).

See [nse-dev.bizdocs.src](https://github.com/HumanjavaEnterprises/nse-dev.bizdocs.src) for the full product brief and architecture.

## Setup

- **Repo:** [HumanjavaEnterprises/nse-dev.web.landingpage.src](https://github.com/HumanjavaEnterprises/nse-dev.web.landingpage.src)
- **Pages source:** `main` branch, `/docs` folder
- **Custom domain:** `nse.dev`

## DNS Configuration

Point the domain to GitHub Pages:

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

HTTPS enforced automatically by GitHub Pages.
