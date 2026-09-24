# Proof of Aid backend

Fastify API for public project metadata and read-only escrow snapshots on Arbitrum Sepolia.

## Local setup

Use Node.js 20 or newer. The API can start without deployed contracts so local health and public catalog routes remain available. To enable on-chain reads and project registration, copy `.env.example` to `.env` and set `ROLE_REGISTRY_ADDRESS` and `ESCROW_ADDRESS` to the contracts deployed by `../contracts/scripts/deploy-sepolia.mjs`. `CHAIN_RPC_URL` and `CHAIN_ID` default to Arbitrum Sepolia. Role identifiers are derived from the same names used by the Solidity contract.

```sh
npm ci
npm run dev
```

The service binds to `127.0.0.1:4000` by default. `GET /` lists the API entry points, and `GET /health` reports process liveness, not RPC readiness. Public project metadata is stored locally under `data/project-registry/`; that directory must remain private and should contain only synthetic, non-identifying descriptions. Existing projects created before the metadata registry can be mapped with `CHAIN_PROJECT_IDS=slug:id,slug:id`.

## API

- `GET /api/v1/projects` — public project catalog.
- `GET /api/v1/projects/:slug` — public project description.
- `GET /api/v1/projects/:slug/evidence` — public evidence index entries only; this does not serve evidence files.
- `GET /api/v1/chain/projects/:id` — current on-chain project and milestone state.
- `POST /api/v1/projects` — registers metadata after validating the escrow's `ProjectCreated` receipt, the organizer's signed metadata binding, and live organizer role membership.

The evidence API and support-cost proof workflow are not part of the current backend slice. The service has no upload or case-management endpoint. Never submit child or family identities, disclosures, case records, referral details, or identifying narratives.
