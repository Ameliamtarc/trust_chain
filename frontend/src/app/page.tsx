'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { listProjects, readChainProject } from '@/lib/api/client';

type Project = {
  id: string; name: string; organization: string; summary: string;
  focusAreas: string[]; milestones: Array<{ id: string; title: string; description: string }>;
  chainProjectId: string; demo: boolean;
};
type ChainProject = { status: string; target: string; totalDonated: string; milestones: Array<{ status: string }> };

const states: Record<string, string> = {
  funding: 'Buscando financiación', active: 'En curso', disputed: 'En revisión',
  overdue: 'Hito retrasado', failed: 'Finalizado', completed: 'Completado',
};
const milestoneStates: Record<string, string> = {
  locked: 'Pendiente', released: 'Tramo liberado a la ONG', evidence_submitted: 'Evidencias enviadas',
  verified: 'Verificado', disputed: 'En revisión', overdue: 'Retrasado',
};

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [chainProjects, setChainProjects] = useState<Record<string, ChainProject>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await listProjects();
        const items = response.projects as unknown as Project[];
        if (cancelled) return;
        setProjects(items);
        const snapshots = await Promise.all(items.filter((project) => project.chainProjectId).map(async (project) => {
          try {
            const result = await readChainProject(project.chainProjectId);
            return [project.id, result.project as ChainProject] as const;
          } catch { return [project.id, undefined] as const; }
        }));
        const available: Record<string, ChainProject> = {};
        for (const [projectId, snapshot] of snapshots) if (snapshot) available[projectId] = snapshot;
        if (!cancelled) setChainProjects(available);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Error cargando proyectos');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  return <>
    <section className="hero">
      <div className="hero-copy">
        <div className="eyebrow"><span className="eyebrow-dot" /> TRANSPARENCIA PARA PROTEGER</div>
        <h1>La ayuda llega.<br /><em>La confianza también.</em></h1>
        <p>Financiación verificable para programas de protección integral infantil. La blockchain muestra el recorrido de los fondos; los datos de niños y familias quedan fuera.</p>
        <div className="hero-actions"><a className="button button-orange" href="#projects">Explorar proyectos <span>↘</span></a><Link className="text-link" href="/organizer/projects/new">Soy una ONG <span>→</span></Link></div>
      </div>
      <div className="hero-art" aria-label="Ilustración abstracta de apoyo y protección">
        <div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="hero-sun" />
        <div className="hero-card"><span className="hero-card-label">ENFOQUE</span><strong>Protección<br />integral</strong><span className="hero-card-foot">ONG · COMUNIDAD · GARANTÍAS</span></div>
        <div className="hero-stat"><span className="stat-icon">✓</span><span><b>Verificable</b><small>Hito a hito</small></span></div>
        <div className="floating-leaf leaf-a" /><div className="floating-leaf leaf-b" />
      </div>
      <div className="hero-bottom"><span>01 / 03</span><span>AYUDA CON TRAZABILIDAD</span><span>ARBITRUM SEPOLIA · DEMO</span></div>
    </section>

    <section className="section projects-section" id="projects">
      <div className="section-heading"><div><div className="eyebrow">IMPACTO CON RESPONSABILIDAD</div><h2>Proyectos abiertos</h2></div><span className="section-note">Información de programa pública.<br />Fondos y estados, siempre en cadena.</span></div>
      {loading && <div className="notice">Cargando proyectos…</div>}
      {error && <div className="notice notice-error">{error}. Comprueba que el backend esté activo.</div>}
      {!loading && !error && projects.length === 0 && <div className="notice">Todavía no hay proyectos publicados.</div>}
      <div className="project-grid">
        {projects.map((project, index) => {
          const onChain = chainProjects[project.id];
          return <article className="project-card" key={project.id}>
            <div className={`project-image project-image-${index % 3}`}><span className="project-tag">PROTECCIÓN INTEGRAL</span><span className="project-number">0{index + 1}</span><div className="image-graphic"><i /><i /><i /></div></div>
            <div className="project-content">
              <div className="project-org">{project.organization}{project.demo && <span className="demo-chip">DEMO</span>}</div>
              <h3>{project.name}</h3><p>{project.summary}</p>
              <div className="project-progress">
                <div><span>Financiación</span><strong>{onChain ? `${formatToken(onChain.totalDonated)} / ${formatToken(onChain.target)} mAID` : 'Estado on-chain no disponible'}</strong></div>
                {onChain && <div className="progress-track"><span style={{ width: `${progress(onChain.totalDonated, onChain.target)}%` }} /></div>}
              </div>
              {onChain && <div className="project-status"><span className="status-dot" />{states[onChain.status] ?? onChain.status}<span className="status-divider">·</span>{onChain.milestones.filter((milestone) => milestone.status === 'verified').length}/{onChain.milestones.length} hitos verificados</div>}
              <div className="project-footer"><span>{project.milestones.length} hitos</span><Link href={`/projects/${project.id}`}>Ver proyecto <span>→</span></Link></div>
            </div>
          </article>;
        })}
      </div>
      <div className="safeguarding-note"><span className="shield">✳</span><div><strong>La protección de la infancia empieza por la privacidad.</strong><p>Proof of Aid no recibe denuncias ni gestiona casos. Nunca incluyas datos identificativos de niños o familias.</p></div><span className="note-arrow">↗</span></div>
    </section>
  </>;
}

function formatToken(raw: string) {
  const amount = Number(BigInt(raw) / 10n ** 16n) / 100;
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(amount);
}
function progress(donated: string, target: string) {
  if (BigInt(target) === 0n) return 0;
  const value = Number((BigInt(donated) * 10000n) / BigInt(target)) / 100;
  return Math.min(100, value);
}
