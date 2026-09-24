import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config/env.js';

export interface PublicProject {
  id: string;
  name: string;
  organization: string;
  summary: string;
  focusAreas: readonly string[];
  milestones: readonly { id: string; title: string; description: string }[];
  chainProjectId: string;
  demo: boolean;
}

export interface NewProjectMetadata extends Omit<PublicProject, 'chainProjectId' | 'demo'> {}

// Public, fictional copy only. Financial state and milestone completion remain on-chain.
const demoProjectId = 'demo-child-protection-program';
const projects = new Map<string, PublicProject>([[demoProjectId, {
  id: demoProjectId,
  name: 'Programa piloto de protección integral infantil',
  organization: 'ONG de demostración (ficticia)',
  summary: 'Programa demostrativo de prevención, respuesta segura y apoyo a la recuperación frente al maltrato infantil.',
  focusAreas: [
    'Prevención y sensibilización comunitaria',
    'Preparación de procesos de respuesta segura',
    'Fortalecimiento de capacidades de la organización y sus colaboradores',
    'Revisión independiente del programa y del uso de fondos',
  ],
  milestones: [
    { id: 'milestone-1', title: 'Preparación de salvaguarda', description: 'Política, responsable designado y formación de personal revisados a nivel organizativo.' },
    { id: 'milestone-2', title: 'Capacidad de respuesta segura', description: 'Procesos y capacidad organizativa revisados; no se comparten casos ni derivaciones.' },
    { id: 'milestone-3', title: 'Prevención y apoyo', description: 'Actividades del programa acreditadas de forma agregada, sin datos de grupos pequeños.' },
    { id: 'milestone-4', title: 'Revisión independiente', description: 'Revisión programática y financiera, incluida la verificación del límite de costes de apoyo.' },
  ],
  chainProjectId: config.chainProjectIds[demoProjectId]?.toString() ?? '',
  demo: true,
}]]);

const registryDirectory = fileURLToPath(new URL('../../data/project-registry/', import.meta.url));
const registryFile = resolve(registryDirectory, 'projects.json');
let writeQueue: Promise<void> = Promise.resolve();

export async function initializeProjectCatalog(): Promise<void> {
  await mkdir(registryDirectory, { recursive: true, mode: 0o700 });
  let saved: unknown;
  try {
    saved = JSON.parse(await readFile(registryFile, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw new Error('Project metadata registry is unreadable');
  }
  if (!Array.isArray(saved)) throw new Error('Project metadata registry has invalid format');
  for (const value of saved) {
    if (!isStoredProject(value)) throw new Error('Project metadata registry contains an invalid record');
    if (projects.has(value.id) || [...projects.values()].some((project) => project.chainProjectId === value.chainProjectId)) {
      throw new Error('Project metadata registry contains a duplicate project or chain ID');
    }
    projects.set(value.id, value);
  }
}

function isStoredProject(value: unknown): value is PublicProject {
  if (!value || typeof value !== 'object') return false;
  const project = value as Record<string, unknown>;
  return typeof project.id === 'string' && /^[a-z0-9-]{1,80}$/.test(project.id) &&
    typeof project.name === 'string' && typeof project.organization === 'string' &&
    typeof project.summary === 'string' && Array.isArray(project.focusAreas) &&
    project.focusAreas.every((item) => typeof item === 'string') && Array.isArray(project.milestones) &&
    project.milestones.every((item) => !!item && typeof item === 'object' &&
      typeof (item as Record<string, unknown>).id === 'string' &&
      typeof (item as Record<string, unknown>).title === 'string' &&
      typeof (item as Record<string, unknown>).description === 'string') &&
    typeof project.chainProjectId === 'string' && /^[1-9][0-9]{0,77}$/.test(project.chainProjectId) &&
    project.demo === false;
}

export async function registerProject(metadata: NewProjectMetadata, chainProjectId: bigint): Promise<PublicProject> {
  let result: PublicProject | undefined;
  const operation = writeQueue.then(async () => {
    const id = metadata.id;
    if (projects.has(id)) throw new Error('Project slug already exists');
    if ([...projects.values()].some((project) => project.chainProjectId === chainProjectId.toString())) {
      throw new Error('On-chain project is already linked');
    }
    result = { ...metadata, chainProjectId: chainProjectId.toString(), demo: false };
    projects.set(id, result);
    try {
      const values = [...projects.values()].filter((project) => !project.demo);
      const temporaryFile = `${registryFile}.${process.pid}.tmp`;
      await writeFile(temporaryFile, `${JSON.stringify(values, null, 2)}\n`, { mode: 0o600 });
      await rename(temporaryFile, registryFile);
    } catch (error) {
      projects.delete(id);
      result = undefined;
      throw error;
    }
  });
  writeQueue = operation.catch(() => undefined);
  await operation;
  return result!;
}

export function listPublicProjects(): readonly PublicProject[] {
  return [...projects.values()];
}

export function findPublicProject(projectId: string): PublicProject | undefined {
  return projects.get(projectId);
}

export function findChainProjectId(projectId: string): bigint | undefined {
  const value = projects.get(projectId)?.chainProjectId;
  return value ? BigInt(value) : undefined;
}
