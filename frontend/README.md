# Proof of Aid frontend

Next.js app for the Arbitrum Sepolia prototype. The current slice provides project discovery, project detail snapshots, an injected MetaMask wallet, and NGO project creation.

## Local setup

1. Start the backend from `../backend` and configure its deployed escrow, role registry, and optionally set `CHAIN_PROJECT_IDS` only for projects created before this backend registry existed.
2. Copy `.env.example` to `.env.local`. Set `NEXT_PUBLIC_ESCROW_ADDRESS` and `NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS` to the same deployed contracts used by the backend. `NEXT_PUBLIC_API_URL` should point to the backend; its default is `http://127.0.0.1:4000`.
3. Install and run:

   ```sh
   npm install
   npm run dev
   ```

4. Open `http://localhost:3000`, connect MetaMask, and select Arbitrum Sepolia. Project creation needs a funded test wallet with `ORGANIZER_ROLE`; the arbitrator address entered in the form must have `ARBITRATOR_ROLE`. The selected milestone verifiers/auditors must have their corresponding roles before anyone can confirm those milestones.

The create flow sends `createProject` directly from the organizer wallet. Once confirmed, the organizer wallet signs a message binding the public metadata to the escrow address, chain ID, transaction hash, and project ID. The backend verifies both proofs before storing the project metadata. No wallet private key is sent to the backend.

Use only synthetic, non-identifying program descriptions. Never enter child/family names, case details, disclosures, referrals, or identifying narratives. The app does not handle supplier payments; verified tranches go to the NGO.

## Implemented routes

- `/` — public project catalog plus on-chain funding and milestone status.
- `/organizer/projects/new` — NGO project creation and public metadata registration.
- `/projects/[projectId]` — public project details with escrow state and an ERC-20 approval/donation flow. Donors need test tokens minted by the testnet token owner.

The current UI also includes donor dispute/refund actions and a milestone evidence hash flow: the browser hashes a selected, redacted file locally, then the organizer wallet submits only the hash; required role holders can simulate and confirm it on-chain. The prototype does not upload that file or provide production evidence sharing. The support-cost circuit source is in `../circuits/support-costs/` and compiles to three public inputs, but browser proof generation, auditor commitment signatures, trusted setup artifacts, and on-chain verification remain to be built. Configure `.env.local` locally; it is ignored by Git.
