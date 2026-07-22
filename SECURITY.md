# Security

lightifact hosts **arbitrary user-supplied HTML** and serves it back. That makes the
serving/isolation model the most security-sensitive part of the system. This document
describes the model, the guarantees, the known limitations, and how to harden a deployment.

## Security model

**Artifact execution is sandboxed.**
- Artifacts render inside `<iframe sandbox="allow-scripts allow-popups allow-forms">` **without
  `allow-same-origin`** → the artifact runs in an *opaque origin*: it cannot read the parent page,
  cannot access `document.cookie`, cannot use the viewer's session.
- The raw artifact (`/raw/:slug`) is served with a strict Content-Security-Policy:
  `default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline';
  img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none';
  frame-ancestors 'self'; form-action 'none'; base-uri 'none'`.
  - `connect-src 'none'` → the artifact cannot fetch/XHR/WebSocket anywhere (no exfiltration).
  - `form-action 'none'` + `base-uri 'none'` → the artifact cannot submit forms to app endpoints
    (blocks CSRF via auto-submitted forms).
  - Self-contained only: external CDNs/scripts/fonts are blocked, so artifacts must inline CSS/JS
    and use `data:` images.

**Sessions.**
- Session cookie is a random opaque token stored server-side (SQLite), `HttpOnly`, `SameSite=Lax`,
  and `Secure` when served over HTTPS. No signing secret to manage; sessions are revocable.
- Passwords hashed with scrypt (Node builtin) + per-user salt. Never stored in plaintext.

**Access control.**
- Read and write both require login. Upload also accepts a per-user Bearer API token (for agents).
- Artifacts can be `public` (listed) or `private` (unlisted — reachable only via its
  unguessable `slug`, i.e. a capability URL).

## Origin isolation (important for untrusted/multi-tenant use)

By default `/raw` is served from the **same origin** as the app UI. The sandbox + CSP + HttpOnly
cookie neutralize the obvious attacks, but serving attacker-controlled HTML from your app's own
origin is not ideal for a public/multi-tenant deployment.

For strong isolation, set `LIGHTIFACT_CONTENT_ORIGIN` (e.g. `https://usercontent.example.com`)
and route that host to the same app:
- Artifacts are then served only from that separate origin (a different host = a different origin).
- Because the session cookie is **host-scoped** (no `Domain` attribute), it is never sent to the
  content origin → even a top-level open of `/raw` has no session → same-origin attacks are
  structurally impossible.
- `/raw` on the main origin returns 404; the content host serves only `/raw`.

This mirrors how Claude serves Artifacts from `claudeusercontent.com`. **Recommended for any
internet-facing or multi-tenant deployment.**

## Threat model — what is and isn't covered

| Threat | Status |
|---|---|
| Artifact steals the viewer's session cookie | Mitigated — `HttpOnly` + sandbox opaque origin |
| Artifact exfiltrates data via network | Mitigated — CSP `connect-src 'none'` |
| Artifact CSRFs app endpoints via forms | Mitigated — CSP `form-action 'none'` |
| Same-origin serving of untrusted HTML | Residual — set `LIGHTIFACT_CONTENT_ORIGIN` to eliminate |
| Anyone with a private artifact's link (on the network) can view it | By design — capability URL |
| Brute-force / spam on login & upload | **Not covered** — no rate limiting; run behind a trusted network or add a proxy limiter |
| Abuse quotas / content moderation | **Not covered** |

## Deployment hardening checklist

- [ ] Serve over HTTPS (enables `Secure` cookies; the app trusts `X-Forwarded-Proto`).
- [ ] Restrict network exposure (VPN / private ingress) unless you have added rate limiting.
- [ ] Set `LIGHTIFACT_CONTENT_ORIGIN` + a separate host for `/raw` if serving untrusted content.
- [ ] Add a rate limiter (reverse proxy or gateway) on `/api/login` and `/artifacts` for public use.
- [ ] Back up the SQLite volume (`data/lightifact.db`) — it holds users, sessions, settings, artifacts.
- [ ] Restrict SSO with an allowed email domain; keep `autoJoin` off if you want invite-only.

## Reporting a vulnerability

Please report security issues privately to the maintainers rather than opening a public issue.
(Replace this line with your contact/security channel before publishing.)
