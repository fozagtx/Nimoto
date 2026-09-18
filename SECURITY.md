# Security

## Reporting a vulnerability

Please open a private security advisory on the repository rather than a public issue. Include reproduction
steps and the impact you observed. We aim to acknowledge reports within 72 hours.

## Threat model and controls

**Identity.** Sign-in is a wallet challenge–response. The server issues a cryptographically random nonce,
stores it with an expiry, and accepts it exactly once. The signature is verified against the supplied public
key, and the address derived from that public key must match the claimed address. No passwords, no email.

**Sessions.** Sessions are HTTP-only, SameSite cookies where the API and web app share a site, plus an opaque
bearer token for Mini App webviews that cannot rely on third-party cookies. Logout revokes server-side.

**Game integrity.** The question bank never reaches the browser. Questions are served one at a time, the
correct option is withheld until an answer is submitted, and all timing and scoring is computed from server
timestamps. Duplicate answers, out-of-order answers, expired attempts and attempts belonging to another user
are rejected. One ranked attempt per wallet per UTC day is enforced by a database uniqueness constraint.
Answers faster than 350 ms are flagged.

**Admin surface.** `/api/admin/*` and the CLI require `ADMIN_API_TOKEN`. A wallet session — including the
operator's own — never grants admin access.

**Treasury.** The private key lives only in the server process environment, injected from a secret manager. It
is never present in the frontend, in Git, in logs, or in any API response. There is no endpoint that sends an
arbitrary amount to an arbitrary address: payouts are derived from a settled leaderboard, verified against the
recorded recipient and amount, bounded by a per-payout and a daily cap, and idempotent per (challenge, rank).

**Data minimisation.** We store the wallet address, run data, streaks, referral relationships and coarse
product events. No IP logging for analytics, no device fingerprinting, no third-party trackers.
