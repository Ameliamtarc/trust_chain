'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { decodeEventLog, isAddress, keccak256, parseEther, toBytes, type Address, type Hex } from 'viem';
import { useWallet } from '@/app/providers';
import { registerProject, listProjects } from '@/lib/api/client';
import { chain, escrowAddress } from '@/lib/chain/config';
import { escrowAbi } from '@/lib/chain/escrow-abi';
import { registrationMessage, type ProjectMetadata } from '@/lib/chain/project-registration';

type DraftMilestone = { title: string; description: string; budget: string; role: 'safeguardingVerifier' | 'auditor'; maxSupportCostBps: string };
type Recovery = { metadata: ProjectMetadata; transactionHash: Hex; projectId: bigint; organizer: Address };
const roleIds = {
  safeguardingVerifier: keccak256(toBytes('SAFEGUARDING_VERIFIER_ROLE')),
  auditor: keccak256(toBytes('AUDITOR_ROLE')),
} as const;
const defaultMilestones: DraftMilestone[] = [
  { title: 'Preparación de salvaguarda', description: 'Política y formación organizativa revisadas.', budget: '1000', role: 'safeguardingVerifier', maxSupportCostBps: '0' },
  { title: 'Capacidad de respuesta segura', description: 'Procesos organizativos revisados, sin datos de casos.', budget: '1500', role: 'safeguardingVerifier', maxSupportCostBps: '0' },
  { title: 'Prevención y apoyo', description: 'Actividades verificadas de forma agregada.', budget: '2500', role: 'safeguardingVerifier', maxSupportCostBps: '0' },
  { title: 'Revisión independiente', description: 'Revisión programática y financiera del programa.', budget: '500', role: 'auditor', maxSupportCostBps: '1000' },
];

export function CreateProjectForm() {
  const router = useRouter();
  const { address, chainId, walletClient, publicClient, switchToSepolia } = useWallet();
  const isConnected = Boolean(address);
  const [id, setId] = useState('programa-proteccion-integral');
  const [name, setName] = useState('Programa de protección integral infantil');
  const [organization, setOrganization] = useState('');
  const [summary, setSummary] = useState('Programa de prevención, respuesta segura y apoyo a la recuperación.');
  const [focusAreas, setFocusAreas] = useState('Prevención,Preparación de respuesta segura,Fortalecimiento organizativo');
  const [arbitrator, setArbitrator] = useState('');
  const [milestones, setMilestones] = useState<DraftMilestone[]>(defaultMilestones);
  const [phase, setPhase] = useState<'idle' | 'creating' | 'confirming' | 'signing' | 'registering' | 'pending' | 'done'>('idle');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [recovery, setRecovery] = useState<Recovery | null>(null);

  function updateMilestone(index: number, key: keyof DraftMilestone, value: string) {
    setMilestones((current) => current.map((milestone, i) => i === index ? { ...milestone, [key]: value } : milestone));
  }
  function addMilestone() {
    if (milestones.length >= 8) return;
    setMilestones((current) => [...current, { title: '', description: '', budget: '', role: 'safeguardingVerifier', maxSupportCostBps: '0' }]);
  }
  function removeMilestone(index: number) {
    setMilestones((current) => current.length > 1 ? current.filter((_, i) => i !== index) : current);
  }

  function buildMetadata(): ProjectMetadata {
    return {
      id: id.trim(), name: name.trim(), organization: organization.trim(), summary: summary.trim(),
      focusAreas: focusAreas.split(',').map((area) => area.trim()).filter(Boolean),
      milestones: milestones.map((milestone, index) => ({
        id: `milestone-${index + 1}`,
        title: milestone.title.trim(),
        description: milestone.description.trim(),
      })),
    };
  }

  async function finishRegistration(pending: Recovery) {
    if (!walletClient || !address) throw new Error('Conecta la wallet que creó el proyecto para firmar su ficha.');
    if (address.toLowerCase() !== pending.organizer.toLowerCase()) throw new Error('Conecta la misma wallet organizadora que creó el proyecto.');
    setPhase('signing');
    setStatus('Firma los metadatos públicos con la wallet organizadora.');
    const message = registrationMessage(pending.metadata, pending.projectId, pending.transactionHash);
    const signature = await walletClient.signMessage({ account: address, message });
    setPhase('registering');
    setStatus('Verificando la firma y registrando la ficha…');
    try {
      await registerProject(pending.metadata as unknown as Record<string, unknown>, pending.transactionHash, signature);
    } catch (cause) {
      const projects = await listProjects().catch(() => ({ projects: [] }));
      const alreadyRegistered = projects.projects.some((project) => {
        const item = project as { id?: string; chainProjectId?: string };
        return item.id === pending.metadata.id && item.chainProjectId === pending.projectId.toString();
      });
      if (!alreadyRegistered) throw cause;
    }
    setPhase('done');
    setStatus('Proyecto creado y ficha pública vinculada.');
    setRecovery(null);
    router.push(`/projects/${pending.metadata.id}`);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let transactionConfirmed = false;
    setError('');
    setStatus('');
    try {
      if (!isConnected || !address || !walletClient) throw new Error('Conecta la wallet de la ONG para continuar.');
      if (chainId !== chain.id) {
        setStatus('Cambia la wallet a Arbitrum Sepolia para continuar.');
        await switchToSepolia();
        throw new Error('La wallet ya está cambiando de red. Vuelve a pulsar crear cuando indique Arbitrum Sepolia.');
      }
      if (!isAddress(escrowAddress) || escrowAddress === '0x0000000000000000000000000000000000000000') {
        throw new Error('Falta configurar NEXT_PUBLIC_ESCROW_ADDRESS con el contrato desplegado.');
      }
      if (!publicClient) throw new Error('No se pudo conectar al RPC de Arbitrum Sepolia.');
      const metadata = buildMetadata();
      if (!/^[a-z0-9-]{1,80}$/.test(metadata.id)) throw new Error('El identificador solo puede contener minúsculas, números y guiones.');
      const existingProjects = await listProjects();
      if (existingProjects.projects.some((project) => (project as { id?: string }).id === metadata.id)) throw new Error('Ese identificador ya está en uso. Elige otro antes de crear la transacción.');
      if (!metadata.organization || metadata.focusAreas.length === 0) throw new Error('Completa la organización y al menos un área de trabajo.');
      if (milestones.some((item) => !item.title.trim() || !item.description.trim() || !Number.isFinite(Number(item.budget)) || Number(item.budget) <= 0 || !/^\d+$/.test(item.maxSupportCostBps) || Number(item.maxSupportCostBps) > 10000)) {
        throw new Error('Cada hito debe tener presupuesto válido y un límite de costes de apoyo entre 0 y 10.000 puntos básicos.');
      }
      if (!isAddress(arbitrator)) throw new Error('Indica la wallet del árbitro asignado.');
      const budgets = milestones.map((item) => parseEther(item.budget.trim()));
      const requiredRoles = milestones.map((item) => [roleIds[item.role]]);
      const requiredCounts = milestones.map(() => [1]);
      const supportCostCaps = milestones.map((item) => Number(item.maxSupportCostBps));

      setPhase('creating');
      setStatus('Confirma la creación del proyecto en tu wallet…');
      const transactionHash = await walletClient.writeContract({
        account: address,
        chain,
        address: escrowAddress,
        abi: escrowAbi,
        functionName: 'createProject',
        args: [{
          arbitrator: arbitrator as Address,
          budgets,
          requiredRoles,
          requiredCounts,
          maxSupportCostBps: supportCostCaps,
          evidencePeriod: 7n * 24n * 60n * 60n,
          refundDelay: 3n * 24n * 60n * 60n,
        }],
      });
      setPhase('confirming');
      setStatus(`Esperando confirmación de ${transactionHash.slice(0, 10)}…`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
      if (receipt.status !== 'success') throw new Error('La blockchain rechazó la creación del proyecto.');
      transactionConfirmed = true;
      const createdEvent = receipt.logs.find((log) => {
        if (log.address.toLowerCase() !== escrowAddress.toLowerCase()) return false;
        try { return decodeEventLog({ abi: escrowAbi, data: log.data, topics: log.topics }).eventName === 'ProjectCreated'; }
        catch { return false; }
      });
      if (!createdEvent) throw new Error(`La transacción se confirmó, pero no se encontró ProjectCreated. Hash: ${transactionHash}`);
      const decoded = decodeEventLog({ abi: escrowAbi, data: createdEvent.data, topics: createdEvent.topics });
      if (decoded.args.organizer.toLowerCase() !== address.toLowerCase()) throw new Error(`El evento de creación no corresponde a la wallet conectada. Hash: ${transactionHash}`);
      const pending = { metadata, transactionHash, projectId: decoded.args.projectId, organizer: address };
      setRecovery(pending);
      await finishRegistration(pending);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo crear el proyecto.');
      setPhase(transactionConfirmed || recovery ? 'pending' : 'idle');
    }
  }

  const busy = ['creating', 'confirming', 'signing', 'registering'].includes(phase);
  return <div className="create-layout">
    <div className="create-intro">
      <div className="eyebrow"><span className="eyebrow-dot" /> ESPACIO DE LA ONG</div>
      <h1>Un proyecto claro.<br /><em>Un impacto trazable.</em></h1>
      <p>Define hitos de protección y sus presupuestos. La wallet registra las reglas en Arbitrum Sepolia; la ONG recibe cada tramo y gestiona sus pagos a proveedores por separado.</p>
      <div className="privacy-card"><span>✳</span><div><strong>Protección y privacidad</strong><p>Esta ficha es pública. No incluyas nombres, casos, derivaciones ni información identificativa de niños o familias.</p></div></div>
      <div className="flow-list"><div><b>01</b><span>Define el programa y los hitos</span></div><div><b>02</b><span>Firma la creación desde tu wallet</span></div><div><b>03</b><span>Vincula la ficha pública al proyecto</span></div></div>
    </div>
    <form className="form-card" onSubmit={onSubmit}>
      <div className="form-heading"><div><span className="eyebrow">NUEVO PROYECTO</span><h2>Ficha del programa</h2></div><span className="form-chain">ARB · SEPOLIA</span></div>
      <div className="form-grid">
        <label>Nombre del proyecto<input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Protección integral…" /></label>
        <label>Organización responsable<input required minLength={2} maxLength={120} value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="Nombre público de la ONG" /></label>
        <label className="full">Identificador público<input required pattern="[a-z0-9-]{1,80}" maxLength={80} value={id} onChange={(e) => setId(e.target.value)} /><small>Único y permanente, por ejemplo: proteccion-integral-2026</small></label>
        <label className="full">Resumen público<textarea required minLength={10} maxLength={600} rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} /></label>
        <label className="full">Áreas de trabajo <small>Separadas por comas</small><input required value={focusAreas} onChange={(e) => setFocusAreas(e.target.value)} /></label>
      </div>
      <div className="milestone-heading"><div><h3>Hitos y presupuestos</h3><p>Los tramos se envían a la wallet de la ONG según el contrato.</p></div><span>{milestones.length}/8</span></div>
      <div className="milestone-list">{milestones.map((milestone, index) => <fieldset className="milestone-editor" key={index}>
        <div className="milestone-top"><span className="milestone-index">0{index + 1}</span><input aria-label={`Título del hito ${index + 1}`} required maxLength={100} value={milestone.title} onChange={(e) => updateMilestone(index, 'title', e.target.value)} placeholder="Nombre del hito" />{milestones.length > 1 && <button type="button" className="remove-button" onClick={() => removeMilestone(index)} aria-label="Eliminar hito">×</button>}</div>
        <textarea required maxLength={300} rows={2} aria-label={`Descripción del hito ${index + 1}`} value={milestone.description} onChange={(e) => updateMilestone(index, 'description', e.target.value)} placeholder="Descripción pública, sin datos de casos" />
        <div className="milestone-meta"><label>Presupuesto<input type="number" required min="0.01" step="0.01" value={milestone.budget} onChange={(e) => updateMilestone(index, 'budget', e.target.value)} /><small>mAID</small></label><label>Quién verifica<select value={milestone.role} onChange={(e) => updateMilestone(index, 'role', e.target.value as DraftMilestone['role'])}><option value="safeguardingVerifier">Verificador de salvaguarda</option><option value="auditor">Auditoría</option></select></label></div>
        <label>Límite de costes de apoyo<input type="number" min="0" max="10000" step="1" value={milestone.maxSupportCostBps} onChange={(e) => updateMilestone(index, 'maxSupportCostBps', e.target.value)} /><small>puntos básicos · 1000 = 10%. 0 desactiva la prueba para este hito.</small></label>
      </fieldset>)}</div>
      {milestones.length < 8 && <button className="add-milestone" type="button" onClick={addMilestone}>＋ Añadir hito</button>}
      <label className="arbitrator-field">Wallet del árbitro<input required value={arbitrator} onChange={(e) => setArbitrator(e.target.value)} placeholder="0x…" /></label>
      <div className="transaction-note"><span>ⓘ</span><p>La creación requiere el rol de organizador y que el árbitro tenga rol asignado. La transacción consume gas de Arbitrum Sepolia. No envía donaciones ni paga proveedores.</p></div>
      {status && <div className="form-status" role="status">{status}</div>}
      {error && <div className="form-error" role="alert">{error}</div>}
      {phase === 'pending' && recovery && <button type="button" className="button button-outline full-width" onClick={() => void finishRegistration(recovery).catch((cause) => { setError(cause instanceof Error ? cause.message : 'No se pudo registrar la ficha.'); setPhase('pending'); })}>Reintentar firma y registro de ficha</button>}
      <button className="button button-dark full-width submit-project" disabled={busy || phase === 'done' || phase === 'pending'} type="submit">{busy ? status || 'Procesando…' : 'Crear proyecto en la blockchain'}<span>→</span></button>
      {recovery && phase === 'pending' && <p className="tx-hash">La transacción on-chain ya se confirmó: {recovery.transactionHash}</p>}
      <p className="form-footnote">Al continuar, firmarás la transacción y luego la metadata pública. Nunca se solicitan claves privadas.</p>
    </form>
  </div>;
}
