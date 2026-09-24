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

## Current integration boundary

The escrow currently has no support-cost proof verifier, auditor commitment-signature check, or `submitSupportCostProof` entry point. This source file alone does not make the contract enforce the cap. The next integration must bind the auditor's signature to project ID, milestone ID, commitment, budget, and cap; verify the Groth16 proof against the exact on-chain milestone budget and configured cap; reject replay; and gate milestone verification on both the proof and the required independent role attestations.

The proof only establishes the arithmetic rule over committed amounts. It does not establish invoice authenticity or prove that any child received a service.
