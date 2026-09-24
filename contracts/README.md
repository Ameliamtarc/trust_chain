# Proof of Aid contracts

The prototype includes `ProofOfAidRoleRegistry`, `ProofOfAidEscrow`, a testnet-only `MockAidToken`, and an integrated Groth16 support-cost cap verifier. The role registry is the on-chain role source used by the backend. The escrow implements ERC-20 project funding, ordered milestone tranches paid to the NGO, auditor-signed support-cost commitments, and proof-gated milestone completion. The NGO pays suppliers off-chain. It uses the role hashes `ORGANIZER_ROLE`, `SAFEGUARDING_VERIFIER_ROLE`, `AUDITOR_ROLE`, and `ARBITRATOR_ROLE`.

The role administrator assigns roles after off-chain organization checks and binds wallets to opaque organization IDs. Never put organization legal names, personal information, or child/case data in `organizationId`. The mock token is only for testnet demos and must never be used for production funds.

## Compile and publish ABI

Requires Node.js 20 or newer:

```sh
npm ci
npm run compile
```

The canonical ABI copies for app code live under `../shared/abi/`. Refresh them from `out/*.abi` after changing contract interfaces.

## Deploy to Arbitrum Sepolia

The deployment script only accepts chain ID `421614`. After the circuit setup instructions in `../circuits/support-costs/README.md`, it compiles and deploys the generated Groth16 verifier, then deploys the mock token, role registry, and escrow. It assigns demo roles only when all four demo wallet addresses are supplied; each gets a distinct opaque demo organization ID. The deployer needs Sepolia ETH for gas. Never put a real key in a committed file.

```sh
cp .env.example .env
# Edit .env locally. Keep the deployer key private and use a dedicated test wallet.
npm --prefix ../circuits/support-costs ci
npm --prefix ../circuits/support-costs run compile
npm --prefix ../frontend ci
# Complete the local or production ceremony and generate the verifier before deploy.
npm run compile
npm run deploy:sepolia
```

The command sends deployment and role-assignment transactions when run. It prints backend `.env` values after deployment; paste those addresses into `backend/.env` locally. The backend starts with static demo copy and accepts additional project metadata after on-chain creation. The deployment output leaves `CHAIN_PROJECT_IDS` empty for a fresh deployment. New projects created by an authorized NGO wallet are linked through the backend `POST /api/v1/projects` endpoint after the creation transaction confirms; the endpoint requires the organizer wallet signature over the exact metadata and persists the slug-to-ID mapping locally. If you already have on-chain projects before starting the backend, add their public slugs and IDs to `CHAIN_PROJECT_IDS`. The script does not create a project, mint tokens, or send user funds. You can prepare and run the frontend and backend locally without a wallet or deployed contracts; those features become available after deployment and wallet connection.

## Prototype limits

The escrow currently supports one evidence hash and a configured role-confirmation policy per milestone. A nonzero support-cost cap also requires a Groth16 proof and valid EIP-712 auditor signature before the milestone can complete. Its enum order is part of the backend read interface: project `Funding, Active, Disputed, Overdue, Failed, Completed`; milestone `Locked, Released, EvidenceSubmitted, Verified, Disputed, Overdue`. This is a simplified hackathon implementation; it does not establish invoice authenticity, implement expense-level claims, reputation, or all production safeguards. The contracts have been compiled, not audited. No deployment transaction has been sent by this development work.
