# Proof of Aid contracts

The prototype includes `ProofOfAidRoleRegistry`, `ProofOfAidEscrow`, and a testnet-only `MockAidToken`. The role registry is the on-chain role source used by the backend. The escrow implements ERC-20 project funding and ordered milestone tranches paid to the NGO. The NGO pays suppliers off-chain. It uses the role hashes `ORGANIZER_ROLE`, `SAFEGUARDING_VERIFIER_ROLE`, `AUDITOR_ROLE`, and `ARBITRATOR_ROLE`.

The role administrator assigns roles after off-chain organization checks and binds wallets to opaque organization IDs. Never put organization legal names, personal information, or child/case data in `organizationId`. The mock token is only for testnet demos and must never be used for production funds.

## Compile and publish ABI

Requires Node.js 20 or newer:

```sh
npm ci
npm run compile
```

The canonical ABI copies for app code live under `../shared/abi/`. Refresh them from `out/*.abi` after changing contract interfaces.

## Deploy to Arbitrum Sepolia

The deployment script only accepts chain ID `421614`. It deploys the mock token, role registry, and escrow. It assigns demo roles only when all four demo wallet addresses are supplied; each gets a distinct opaque demo organization ID. The deployer needs Sepolia ETH for gas. Never put a real key in a committed file.

```sh
export CHAIN_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
export DEPLOYER_PRIVATE_KEY=0x... # use a dedicated test wallet; never commit this value
export DEMO_NGO_WALLET=0x...
export DEMO_VERIFIER_WALLET=0x...
export DEMO_AUDITOR_WALLET=0x...
export DEMO_ARBITRATOR_WALLET=0x...
npm run compile
npm run deploy:sepolia
```

The command sends deployment and role-assignment transactions when run. It prints backend `.env` values after deployment; paste those addresses into `backend/.env` locally. The backend starts with static demo copy and accepts additional project metadata after on-chain creation. The deployment output leaves `CHAIN_PROJECT_IDS` empty for a fresh deployment. New projects created by an authorized NGO wallet are linked through the backend `POST /api/v1/projects` endpoint after the creation transaction confirms; the endpoint requires the organizer wallet signature over the exact metadata and persists the slug-to-ID mapping locally. If you already have on-chain projects before starting the backend, add their public slugs and IDs to `CHAIN_PROJECT_IDS`. The script does not create a project, mint tokens, or send user funds.

## Prototype limits

The escrow currently supports one evidence hash and a configured role-confirmation policy per milestone. Its enum order is part of the backend read interface: project `Funding, Active, Disputed, Overdue, Failed, Completed`; milestone `Locked, Released, EvidenceSubmitted, Verified, Disputed, Overdue`. This is a simplified hackathon implementation; it does not implement expense-level claims, the ZK verifier, reputation, or all production safeguards. The contracts have been compiled, not audited. No deployment transaction has been sent by this development work.
