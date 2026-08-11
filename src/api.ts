import type { Skill, Stats, CloneState, SkillItem, AgentInfo, InstalledItem, DiffEntry, InstallAllResult } from './types';

export interface ReadmeData {
  cloned: boolean;
  path: string;
  content: string;
  truncated: boolean;
  total_chars?: number;
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (body as { error?: string }).error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body as T;
}

export const api = {
  list: () => req<{ skills: Skill[] }>('/api/skills').then((r) => r.skills),
  stats: () => req<Stats>('/api/stats'),
  skillItems: () => req<{ items: SkillItem[]; repos: number }>('/api/skill-items'),
  skillContent: (repo: number, path: string) =>
    req<{ content: string; total_chars: number; truncated: boolean; path: string }>(
      `/api/skill-items/content?repo=${repo}&path=${encodeURIComponent(path)}`
    ),
  create: (data: Partial<Skill>) =>
    req<{ skill: Skill }>('/api/skills', { method: 'POST', body: JSON.stringify(data) }).then((r) => r.skill),
  update: (id: number, data: Partial<Skill>) =>
    req<{ skill: Skill }>(`/api/skills/${id}`, { method: 'PATCH', body: JSON.stringify(data) }).then((r) => r.skill),
  remove: (id: number) => req<{ ok: true }>(`/api/skills/${id}`, { method: 'DELETE' }),
  clone: (id: number) => req<CloneState>(`/api/skills/${id}/clone`, { method: 'POST' }),
  pull: (id: number) =>
    req<{ ok: boolean; dir: string; before: string; after: string; changed: boolean; last_commit: string; output: string }>(
      `/api/skills/${id}/pull`,
      { method: 'POST' }
    ),
  cloneState: (id: number) => req<CloneState>(`/api/skills/${id}/clone`),
  cloneRemove: (id: number) => req<{ ok: true }>(`/api/skills/${id}/clone/remove`, { method: 'POST' }),
  fetchReadme: (id: number) => req<ReadmeData>(`/api/skills/${id}/readme`),
  agents: () => req<{ agents: AgentInfo[]; home: string }>('/api/agents'),
  setAgentEnabled: (id: string, enabled: boolean) =>
    req<{ agent: string; enabled: boolean }>(`/api/agents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    }),
  setAgentsEnabled: (agents: string[], enabled: boolean) =>
    req<{ agents: string[]; enabled: boolean; updated: number }>('/api/agents', {
      method: 'PATCH',
      body: JSON.stringify({ agents, enabled }),
    }),
  repoItems: (repo_id: number) =>
    req<{ items: SkillItem[] }>(`/api/repos/${repo_id}/items`).then((r) => r.items),
  importRepo: (repo: string) =>
    req<{ skill: Skill; imported: boolean; cloned: boolean; clone_error?: string }>('/api/repos/import', {
      method: 'POST',
      body: JSON.stringify({ repo }),
    }),
  installAll: (repo_id: number, agents: string[], skills?: string[], prefix?: boolean, sep?: ':' | '-') =>
    req<InstallAllResult>(`/api/repos/${repo_id}/install-all`, {
      method: 'POST',
      body: JSON.stringify({ agents, skills, prefix, sep }),
    }),
  cloneAll: () =>
    req<{ total: number; ok: number; skipped: number; failed: { full_name: string; error: string }[] }>('/api/clone-all', {
      method: 'POST',
    }),
  installed: (agent?: string) =>
    req<{ items: InstalledItem[] }>(`/api/installed${agent ? `?agent=${agent}` : ''}`).then((r) => r.items),
  installItem: (repo_id: number, path: string, agent: string, update = false, prefix = false) =>
    req<{ name: string; target: string; existed: boolean; changed: boolean; diff: DiffEntry[] | null }>(
      `/api/skills/items/${update ? 'update' : 'install'}`,
      { method: 'POST', body: JSON.stringify({ repo_id, path, agent, prefix }) }
    ),
  uninstallItem: (agent: string, name: string) =>
    req<{ removed: boolean; target: string }>('/api/skills/items/uninstall', {
      method: 'POST',
      body: JSON.stringify({ agent, name }),
    }),
  diffItem: (repo_id: number, path: string, agent: string) =>
    req<{ installed: boolean; diff: DiffEntry[] | null }>('/api/skills/items/diff', {
      method: 'POST',
      body: JSON.stringify({ repo_id, path, agent }),
    }),
  rescan: () => req<{ ok: boolean; updated: number; registry: string }>('/api/rescan', { method: 'POST' }),
  fetchGithub: (repo: string) => req<{ full_name: string; stars: number; desc: string; lang: string; url: string }>(`/api/fetch?repo=${encodeURIComponent(repo)}`),
};

export const fmt = (n: number): string =>
  n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n);
