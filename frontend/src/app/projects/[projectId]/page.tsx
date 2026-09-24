'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { listProjects, readChainProject } from '@/lib/api/client';
import { DonateForm } from '@/features/donations/donate-form';
import { DisputeActions } from '@/features/disputes/dispute-actions';
import { EvidenceWorkflow } from '@/features/evidence/evidence-workflow';

type Project = { id: string; name: string; organization: string; summary: string; focusAreas: string[]; milestones: Array<{ id: string; title: string; description: string }>; chainProjectId: string; demo?: boolean };
type ChainProject = { id: string; organizer: string; arbitrator: string; target: string; totalDonated: string; totalReleased: string; totalRefunded: string; currentMilestone: number; status: string; milestones: Array<{ id: number; budget: string; evidenceDeadline: string; status: string; evidenceHash: string; requiredRoles: string[] }> };

export default function ProjectPage() {
  const params = useParams<{ projectId: string }>();
  const [metadata, setMetadata] = useState<Project>();
  const [chainProject, setChainProject] = useState<ChainProject>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [snapshotVersion, setSnapshotVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await listProjects();
        const found = response.projects.find((item) => (item as Project).id === params.projectId) as Project | undefined;
        if (!found) throw new Error('No se encontró el proyecto');
        if (!cancelled) setMetadata(found);
        if (!found.chainProjectId) return;
        try {
          const result = await readChainProject(found.chainProjectId);
          if (!cancelled) setChainProject(result.project as ChainProject);
        } catch (cause) {
          if (!cancelled && !found.demo) throw cause;
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'No se pudo cargar el proyecto');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (params.projectId) void load();
    return () => { cancelled = true; };
  }, [params.projectId, snapshotVersion]);

  if (loading) return <section className="section detail-section"><div className="notice">Cargando ficha del proyecto…</div></section>;
  if (error || !metadata) return <section className="section detail-section"><Link className="back-link" href="/">← Volver a proyectos</Link><div className="notice notice-error">{error || 'No se encontró el proyecto'}</div></section>;

  return <section className="section detail-section">
    <Link className="back-link" href="/">← Volver a proyectos</Link>
    <div className="detail-hero"><div><div className="eyebrow"><span className="eyebrow-dot" /> PROYECTO · ARBITRUM SEPOLIA</div><h1>{metadata.name}</h1><p>{metadata.summary}</p><span className="detail-org">{metadata.organization}{metadata.demo && <span className="demo-chip"> DEMO</span>}</span></div>
      {chainProject ? <div className="detail-total"><span>OBJETIVO DEL PROYECTO</span><strong>{formatToken(chainProject.target)} <small>mAID</small></strong><div className="detail-raised">{formatToken(chainProject.totalDonated)} mAID financiados</div><div className="progress-track"><span style={{ width: `${progress(chainProject.totalDonated, chainProject.target)}%` }} /></div></div> : <div className="preview-panel"><span>PREVISUALIZACIÓN</span><strong>Programa de demostración</strong><p>La ficha y sus hitos son informativos. La financiación y las acciones de wallet estarán disponibles al desplegar los contratos.</p></div>}
    </div>
    {chainProject && <>
      <DonateForm projectId={chainProject.id} target={chainProject.target} donated={chainProject.totalDonated} projectStatus={chainProject.status} onDonated={() => setSnapshotVersion((version) => version + 1)} />
      <div className="detail-stats"><div><span>Estado</span><strong>{chainProject.status}</strong></div><div><span>Wallet organizadora</span><strong className="mono">{short(chainProject.organizer)}</strong></div><div><span>Wallet árbitro</span><strong className="mono">{short(chainProject.arbitrator)}</strong></div><div><span>Tramo liberado a la ONG</span><strong>{formatToken(chainProject.totalReleased)} mAID</strong></div></div>
      <EvidenceWorkflow project={chainProject} onAction={() => setSnapshotVersion((version) => version + 1)} />
      <DisputeActions projectId={chainProject.id} projectStatus={chainProject.status} onAction={() => setSnapshotVersion((version) => version + 1)} />
    </>}
    <div className="detail-heading"><div className="eyebrow">RECORRIDO DE LOS FONDOS</div><h2>Hitos y verificaciones</h2></div>
    <div className="detail-milestones">{metadata.milestones.map((milestone, index) => {
      const state = chainProject?.milestones[index];
      return <article className="detail-milestone" key={milestone.id}><div className="detail-step">0{index + 1}</div><div className="detail-milestone-copy"><span className="milestone-state">{state?.status ?? (metadata.demo ? 'Hito del programa' : 'Sin datos on-chain')}</span><h3>{milestone.title}</h3><p>{milestone.description}</p></div><div className="detail-budget"><span>{state ? 'TRAMO' : 'SEGUIMIENTO'}</span><strong>{state ? `${formatToken(state.budget)} mAID` : metadata.demo ? 'Pendiente de despliegue' : '—'}</strong></div></article>;
    })}</div>
    <div className="safeguarding-note"><span className="shield">✳</span><div><strong>La protección de la infancia empieza por la privacidad.</strong><p>La blockchain prueba movimientos y verificaciones; no acredita resultados individuales ni sustituye los protocolos de protección de la ONG.</p></div></div>
  </section>;
}
function formatToken(raw: string) { return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(Number(BigInt(raw) / 10n ** 16n) / 100); }
function progress(donated: string, target: string) { return BigInt(target) ? Math.min(100, Number(BigInt(donated) * 10000n / BigInt(target)) / 100) : 0; }
function short(address: string) { return `${address.slice(0, 7)}…${address.slice(-5)}`; }
