# Support-cost cap circuit

This prototype circuit proves that eight private support-cost amounts sum to no more than a public share of a milestone budget. Amounts and budget use the payment token's 18-decimal base units. `maxShareBps` is in basis points (`1000` means 10%). The circuit constrains each amount and budget to 128 bits, the sum to 132 bits, and `maxShareBps` to at most 10,000.

## Signals

Private witness:

- `items[8]`: support-cost amounts. Pad unused positions with zero.
- `salt`: a fresh cryptographically random field element for this commitment.

Public inputs (in this exact order):

1. `commitment`: `Poseidon(items[0], ..., items[7], salt)`.
2. `budget`: the milestone budget in token base units.
3. `maxShareBps`: the public cap in basis points.

The circuit checks `sum(items) * 10000 <= maxShareBps * budget` and binds the private witness to `commitment`. The salt and line items must never be logged, put in URLs, sent to the API, or included in a transaction.

## Compile

Install Node.js, then run the pinned prototype compiler and circuit library:

```sh
npm ci
npm run compile
```

This creates `build/main.r1cs`, `build/main.sym`, and `build/main_js/`. The package pins `circom2` 0.2.16, which wraps Circom 2.1.6, and circomlib 2.0.5. The WASM compiler is experimental; use the official Rust compiler and an independent circuit review for any release. Build outputs, proving keys, and witness files are ignored by Git.

## Proof system and trust setup

Use Groth16 with BN254 for the Arbitrum/EVM prototype. The compile step uses `circom2` 0.2.16 (the WASM port of Circom 2.1.6), which its maintainers describe as experimental; the source compiles for this prototype, but production artifacts must be independently rebuilt and reviewed with the official Rust compiler. Generate and verify them through a documented multi-party Powers of Tau ceremony and circuit-specific phase 2 before any real deployment. A local development setup is for demos only and does not establish a trustworthy production verifier. Pin the circuit source hash, compiler version, circomlib version, public signal order, and verification-key hash together before deployment.

## Current integration

The frontend generates and locally verifies the proof in the browser. It uses the compiled `main.wasm`, the Groth16 proving key, and `verification_key.json` from `frontend/public/zk/support-costs/`. The private amounts and salt are only passed to the browser prover. The on-chain proof contains the commitment, proof points, and an EIP-712 auditor signature; it does not contain line items or salt.

The escrow pins a verifier address at deployment. Each milestone has a public support-cost cap in basis points (`0` disables this proof requirement). `submitSupportCostProof` binds the circuit's exact public input order to the on-chain milestone budget and configured cap, checks the auditor's role and EIP-712 signature, rejects repeated commitments, and gates completion together with the regular role attestations. The signature binds project ID, milestone ID, commitment, budget, cap, chain ID, and escrow address.

## Local demo artifacts

Install the frontend dependencies first so `snarkjs` is available, then compile the circuit and create a **local demo-only** setup. Keep the generated proving key, witness files, and entropy out of Git. These single-party steps do not create production-trustworthy parameters:

```sh
npm run compile
cd ../../frontend
npx snarkjs powersoftau new bn128 12 ../circuits/support-costs/build/pot12_0000.ptau
npx snarkjs powersoftau contribute ../circuits/support-costs/build/pot12_0000.ptau ../circuits/support-costs/build/pot12_0001.ptau --name="local demo" -e="$(openssl rand -hex 32)"
npx snarkjs powersoftau prepare phase2 ../circuits/support-costs/build/pot12_0001.ptau ../circuits/support-costs/build/pot12_final.ptau
npx snarkjs groth16 setup ../circuits/support-costs/build/main.r1cs ../circuits/support-costs/build/pot12_final.ptau ../circuits/support-costs/build/support_costs_0000.zkey
npx snarkjs zkey contribute ../circuits/support-costs/build/support_costs_0000.zkey ../circuits/support-costs/build/support_costs_final.zkey --name="local demo" -e="$(openssl rand -hex 32)"
npx snarkjs zkey export verificationkey ../circuits/support-costs/build/support_costs_final.zkey ../circuits/support-costs/build/verification_key.json
npx snarkjs zkey export solidityverifier ../circuits/support-costs/build/support_costs_final.zkey ../circuits/support-costs/build/SupportCostVerifier.sol
mkdir -p public/zk/support-costs
cp ../circuits/support-costs/build/main_js/main.wasm public/zk/support-costs/main.wasm
cp ../circuits/support-costs/build/support_costs_final.zkey public/zk/support-costs/main.zkey
cp ../circuits/support-costs/build/verification_key.json public/zk/support-costs/verification_key.json
```

Then run `npm run compile` in `contracts/` and deploy with `npm run deploy:sepolia`. The deployment script compiles and deploys the generated verifier source before the escrow. Pass `SUPPORT_COST_VERIFIER_ADDRESS` only when using a verifier that has already been deployed for this exact circuit and verification key.

For any real deployment, use an independently reviewed circuit, a documented multi-party Powers of Tau and phase-2 ceremony, independent rebuilds, and publish the circuit/compiler/library versions plus verification-key hash. A one-person setup is not a substitute for that process.

The proof only establishes the arithmetic rule over committed amounts. It does not establish invoice authenticity or prove that any child received a service.
