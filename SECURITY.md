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

**Prize money.** The app holds no private key and can move no funds: settlement only writes who is owed what,
derived from a settled leaderboard, bounded by a per-payout and a daily cap, and idempotent per (challenge,
rank). An operator transfers the prizes from the prize pool wallet by hand and records the transaction hash
through the admin surface, so the worst case of a compromised server is wrong bookkeeping, not lost NIM.

**Data minimisation.** We store the wallet address, run data, streaks, referral relationships and coarse
product events. No IP logging for analytics, no device fingerprinting, no third-party trackers.
