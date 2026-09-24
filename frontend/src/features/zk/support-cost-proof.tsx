'use client';

import { useState } from 'react';
import { isAddress, parseEther, toHex, type Address, type Hex } from 'viem';
import { useWallet } from '@/app/providers';
import { chain, escrowAddress } from '@/lib/chain/config';
import { escrowAbi } from '@/lib/chain/escrow-abi';

const BN254_SCALAR = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const typedData = {
  SupportCostAttestation: [
    { name: 'projectId', type: 'uint256' }, { name: 'milestoneId', type: 'uint8' },
    { name: 'commitment', type: 'bytes32' }, { name: 'budget', type: 'uint256' },
    { name: 'maxShareBps', type: 'uint16' },
  ],
} as const;

type ProofData = {
  pi_a: [string, string, string];
  pi_b: [[string, string], [string, string], [string, string]];
  pi_c: [string, string, string];
};

export function SupportCostProof({ projectId, milestoneId, budget, maxShareBps, onSubmitted }: {
  projectId: string; milestoneId: number; budget: string; maxShareBps: number; onSubmitted: () => void;
}) {
  const { address, chainId, walletClient, publicClient, switchToSepolia } = useWallet();
  const [amounts, setAmounts] = useState(['', '', '', '', '', '', '', '']);
  const [proof, setProof] = useState<{ data: ProofData; commitment: Hex; budget: bigint; maxShareBps: number }>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function generateAndSubmit() {
    setBusy(true); setError(''); setMessage(''); setProof(undefined);
    try {
      if (!address || !walletClient) throw new Error('Conecta la wallet auditora para firmar y enviar la prueba.');
      if (chainId !== chain.id) { await switchToSepolia(); throw new Error('Cambia a Arbitrum Sepolia y vuelve a intentarlo.'); }
      if (!isAddress(escrowAddress) || escrowAddress === '0x0000000000000000000000000000000000000000') throw new Error('Falta configurar el contrato escrow.');
      const budgetWei = BigInt(budget);
      const parsedItems = amounts.map((value) => value.trim() ? parseEther(value.trim()) : 0n);
      const saltBytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
      const salt = BigInt(`0x${Array.from(saltBytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`) % BN254_SCALAR;
      setMessage('Generando la prueba en este navegador… Los importes y el valor aleatorio no se envían.');

      const snark = await import('snarkjs');
      const input = {
        items: parsedItems.map(String), salt: salt.toString(), budget: budgetWei.toString(), maxShareBps: String(maxShareBps),
        commitment: '0',
      };
      // Compute the Poseidon commitment using the same circomlib implementation as the circuit.
      const { buildPoseidon } = await import('circomlibjs');
      const poseidon = await buildPoseidon();
      const commitmentField = poseidon.F.toString(poseidon([...parsedItems, salt].map((value) => value.toString())));
      input.commitment = commitmentField;
      const { proof: generatedProof, publicSignals } = await snark.groth16.fullProve(
        input,
        '/zk/support-costs/main.wasm',
        '/zk/support-costs/main.zkey',
      ) as { proof: ProofData; publicSignals: string[] };
      if (publicSignals.length !== 3 || BigInt(publicSignals[0]) !== BigInt(commitmentField) ||
          BigInt(publicSignals[1]) !== budgetWei || BigInt(publicSignals[2]) !== BigInt(maxShareBps)) {
        throw new Error('La prueba no coincide con el presupuesto y límite configurados en cadena.');
      }
      const vkeyResponse = await fetch('/zk/support-costs/verification_key.json', { cache: 'no-store' });
      if (!vkeyResponse.ok) throw new Error('Faltan los artefactos de verificación Groth16 en public/zk/support-costs/.');
      const verifiedLocally = await snark.groth16.verify(await vkeyResponse.json(), publicSignals, generatedProof);
      if (!verifiedLocally) throw new Error('La verificación local de la prueba falló.');
      const commitment = toHex(BigInt(commitmentField), { size: 32 });
      setProof({ data: generatedProof, commitment, budget: budgetWei, maxShareBps });

      setMessage('Firma la atestación EIP-712 como auditor. La firma solo vincula la prueba, este hito y su límite.');
      const signature = await walletClient.signTypedData({
        account: address,
        domain: { name: 'ProofOfAidEscrow', version: '1', chainId: chain.id, verifyingContract: escrowAddress },
        types: typedData,
        primaryType: 'SupportCostAttestation',
        message: { projectId: BigInt(projectId), milestoneId, commitment, budget: budgetWei, maxShareBps },
      });
      const p = generatedProof;
      const args = [BigInt(projectId), milestoneId, commitment,
        {
          a: [BigInt(p.pi_a[0]), BigInt(p.pi_a[1])] as const,
          b: [[BigInt(p.pi_b[0][1]), BigInt(p.pi_b[0][0])], [BigInt(p.pi_b[1][1]), BigInt(p.pi_b[1][0])]] as const,
          c: [BigInt(p.pi_c[0]), BigInt(p.pi_c[1])] as const,
        },
        address as Address, signature as Hex] as const;
      const request = { account: address, address: escrowAddress, abi: escrowAbi, functionName: 'submitSupportCostProof' as const, args };
      const { request: simulated } = await publicClient.simulateContract({ ...request, chain });
      const txHash = await walletClient.writeContract({ ...simulated, chain });
      setMessage(`Prueba enviada · ${txHash}`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== 'success') throw new Error('La blockchain rechazó el registro de la prueba.');
      setMessage('Prueba y atestación registradas. Los importes siguen en este navegador.');
      setAmounts(['', '', '', '', '', '', '', '']); setProof(undefined); onSubmitted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo generar o registrar la prueba.');
    } finally { setBusy(false); }
  }

  return <div className="support-cost-proof">
    <p>Introduce hasta ocho costes de apoyo en mAID. Se prueban localmente con privacidad: solo se registra un compromiso, la prueba y el límite agregado. El auditor debe revisar las fuentes de forma independiente antes de firmar.</p>
    <div className="form-grid">{amounts.map((amount, index) => <label key={index}>Coste {index + 1}<input type="number" min="0" step="0.000000000000000001" value={amount} onChange={(event) => setAmounts((items) => items.map((item, i) => i === index ? event.target.value : item))} placeholder="0.00 mAID" /></label>)}</div>
    <button type="button" className="button button-outline" disabled={busy || !address} onClick={() => void generateAndSubmit()}>{busy ? 'Generando y enviando…' : proof ? 'Generar otra prueba' : 'Generar prueba y firmar como auditor'}</button>
    <p className="privacy-reminder">No se guardan los importes, la sal ni el testigo. No introduzcas datos personales, nombres de proveedores ni descripciones de casos.</p>
    {message && <div className="donate-status" role="status">{message}</div>}{error && <div className="form-error" role="alert">{error}</div>}
  </div>;
}
