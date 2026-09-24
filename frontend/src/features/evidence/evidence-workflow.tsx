'use client';

import { useMemo, useState, type ChangeEvent } from 'react';
import { isAddress, keccak256, stringToBytes, type Hex } from 'viem';
import { useWallet } from '@/app/providers';
import { chain, escrowAddress } from '@/lib/chain/config';
import { escrowAbi } from '@/lib/chain/escrow-abi';

type Milestone = { id: number; status: string; evidenceHash: string; requiredRoles: readonly string[] };
type Project = { id: string; organizer: string; currentMilestone: number; status: string; milestones: Milestone[] };

const roleLabels = [
  ['SAFEGUARDING_VERIFIER_ROLE', 'Verificación de salvaguarda'],
  ['AUDITOR_ROLE', 'Auditoría'],
] as const;

export function EvidenceWorkflow({ project, onAction }: { project: Project; onAction: () => void }) {
  const { address, chainId, walletClient, publicClient, switchToSepolia } = useWallet();
  const [file, setFile] = useState<File>();
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const milestone = project.milestones[project.currentMilestone];
  const organizer = Boolean(address && address.toLowerCase() === project.organizer.toLowerCase());
  const knownRoles = useMemo(() => new Map(roleLabels.map(([role, label]) => [keccak256(stringToBytes(role)).toLowerCase(), label])), []);

  if (!milestone || project.status !== 'active') return null;
  const hash = milestone.evidenceHash;
  const hasEvidence = hash !== `0x${'0'.repeat(64)}`;

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0]);
    setAcknowledged(false);
    setError('');
    setMessage('');
  }

  async function send(action: 'submit' | 'confirm', role?: Hex) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (!address || !walletClient) throw new Error('Conecta la wallet que tiene el rol correspondiente.');
      if (chainId !== chain.id) {
        await switchToSepolia();
        throw new Error('La wallet está cambiando a Arbitrum Sepolia. Repite la acción cuando termine.');
      }
      if (!isAddress(escrowAddress) || escrowAddress === '0x0000000000000000000000000000000000000000') throw new Error('El contrato escrow todavía no está configurado.');
      const milestoneId = milestone.id;
      let hashToSubmit: Hex | undefined;
      if (action === 'submit') {
        if (!organizer) throw new Error('Solo la wallet organizadora puede registrar evidencias.');
        if (!file || !acknowledged) throw new Error('Selecciona el archivo y confirma que está anonimizado y aprobado.');
        if (file.size > 10 * 1024 * 1024) throw new Error('El archivo supera el límite de 10 MB.');
        hashToSubmit = keccak256(new Uint8Array(await file.arrayBuffer()));
      } else if (!role) {
        throw new Error('No se encontró el rol requerido por este hito.');
      }

      const request = action === 'submit'
        ? { account: address, address: escrowAddress, abi: escrowAbi, functionName: 'submitMilestoneEvidence' as const, args: [BigInt(project.id), milestoneId, hashToSubmit!] as const }
        : { account: address, address: escrowAddress, abi: escrowAbi, functionName: 'confirmMilestone' as const, args: [BigInt(project.id), milestoneId, role!] as const };
      const { request: simulatedRequest } = await publicClient.simulateContract({ ...request, chain });
      const txHash = await walletClient.writeContract({ ...simulatedRequest, chain });
      setMessage(`Transacción enviada · ${txHash}`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== 'success') throw new Error('La blockchain rechazó la transacción.');
      setMessage(action === 'submit'
        ? `Hash de evidencia confirmado: ${hashToSubmit}. El archivo se quedó en este dispositivo.`
        : 'Verificación registrada en la blockchain.');
      setFile(undefined);
      setAcknowledged(false);
      onAction();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo completar la acción.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="evidence-workflow" aria-labelledby="evidence-workflow-title">
    <div className="eyebrow">HITO ACTUAL · {milestone.id + 1}</div>
    <h3 id="evidence-workflow-title">Evidencia y verificación</h3>
    {hasEvidence ? <div className="evidence-hash"><span>Hash público en cadena</span><code>{hash}</code></div> : organizer ? <div className="evidence-submit">
      <p>Selecciona un documento organizativo ya revisado y anonimizado. El navegador calcula el hash localmente: no sube el archivo al servidor ni incluye su contenido en la transacción.</p>
      <label className="evidence-file">Documento de programa o finanzas<input type="file" accept=".pdf,.txt,.csv,.json" onChange={selectFile} /></label>
      {file && <span className="evidence-file-name">{file.name} · {(file.size / 1024).toFixed(0)} KB</span>}
      <label className="evidence-ack"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />Confirmo que el documento está aprobado y no contiene datos personales, casos, relatos ni información que identifique a menores o familias.</label>
      <button className="button button-dark" type="button" disabled={busy || !file || !acknowledged} onClick={() => void send('submit')}>{busy ? 'Procesando…' : 'Registrar hash del documento'}</button>
    </div> : <p>La ONG organizadora aún no ha registrado evidencia para este hito.</p>}
    {hasEvidence && <div className="verifier-actions"><p>Confirma solo después de revisar la documentación mediante el canal seguro acordado con la ONG. La app registra el hash y tu rol, pero no entrega ese archivo al verificador.</p>
      {milestone.requiredRoles.map((role) => <button className="button button-outline" type="button" key={role} disabled={busy || !address} onClick={() => void send('confirm', role as Hex)}>
        Confirmar como {knownRoles.get(role.toLowerCase()) ?? `rol ${role.slice(0, 10)}…`}
      </button>)}
    </div>}
    <p className="privacy-reminder">No subas denuncias, expedientes, derivaciones, imágenes ni datos de niños o familias. El hash prueba que existe un archivo concreto, no acredita por sí solo su contenido.</p>
    {message && <div className="donate-status" role="status">{message}</div>}
    {error && <div className="form-error" role="alert">{error}</div>}
  </section>;
}
