const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, '');

export async function listProjects() {
  const response = await fetch(`${apiBase}/api/v1/projects`, { cache: 'no-store' });
  if (!response.ok) throw new Error('No se pudo cargar el catálogo de proyectos');
  return response.json() as Promise<{ projects: Array<Record<string, unknown>> }>;
}

export async function readChainProject(projectId: string) {
  const response = await fetch(`${apiBase}/api/v1/chain/projects/${encodeURIComponent(projectId)}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(response.status === 404 ? 'Proyecto aún no disponible en la red' : 'No se pudo consultar la blockchain');
  return response.json() as Promise<{ project: Record<string, unknown> }>;
}

export async function registerProject(metadata: Record<string, unknown>, transactionHash: `0x${string}`, signature: `0x${string}`) {
  const response = await fetch(`${apiBase}/api/v1/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...metadata, transactionHash, signature }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(result.error ?? 'La transacción se confirmó, pero no se pudo registrar la ficha');
  }
  return response.json();
}
