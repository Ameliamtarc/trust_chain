# Proof of Aid local evidence API

Minimal Fastify service for the prototype. It serves one synthetic, non-identifying evidence fixture after a one-time wallet signature and a live `hasRole(bytes32,address)` check against the configured EVM role registry. Contract actions remain in the user's wallet.

## Local setup

1. Use Node.js 20 or newer.
2. Copy `.env.example` to `.env` and set the deployed Arbitrum Sepolia RPC, role registry address, and exact role IDs used by that contract. The placeholder zero address/role IDs are not usable configuration.
3. Install dependencies with `npm install`.
4. Start with `npm run dev`; the service listens on `127.0.0.1:4000` by default.

The configured contract must implement OpenZeppelin-compatible `hasRole(bytes32,address)`. This is an integration boundary: verify the ABI and role IDs against the actual deployment before use. At present there is no contract deployment/ABI in the repository, so evidence access cannot be authorized until those values are configured. The first slice checks on-chain role membership and a static evidence allowlist; it does not yet query whether the evidence hash/claim is registered or whether a dispute is active. Arbitrator access is therefore denied pending a dispute-state adapter.

## API

- `GET /health` — process liveness only; it does not indicate RPC readiness.
- `POST /api/evidence/:evidenceId/challenge` JSON `{ "wallet": "0x…", "chainId": 421614 }` — returns a 5-minute single-use message.
- `POST /api/evidence/:evidenceId/access` JSON `{ "wallet": "0x…", "challengeId": "…", "signature": "0x…" }` — verifies the signature and role, then streams only the built-in synthetic fixture. Its bytes are checked against the canonical fixture on startup and before each response. The evidence hash is returned in `x-evidence-hash`.

Unknown IDs do not reveal local file paths. Challenges bind action, evidence ID, wallet, chain ID, nonce and expiry. A challenge is consumed before authorization and cannot be replayed. Arbitrator access is denied until a trustworthy on-chain dispute-state check is implemented.

## Safeguarding boundary

This service is not a child-facing service, abuse-reporting channel, referral service, case-management system, or emergency service. There is no upload endpoint. Only files named in the static evidence registry can be served. Never add child or family identities, disclosures, case records, referral details, images, audio, exact locations, or identifying narratives to this store, filenames, logs, or API requests. Store only synthetic fixtures in `data/local-store/`; that directory is ignored by Git.

This local prototype is not production-grade encrypted storage. Do not use it for real NGO operations or real evidence.
