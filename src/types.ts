export interface Skill {
  id: number;
  full_name: string;
  stars: number;
  desc: string;
  lang: string;
  url: string;
  tags: string[];
  cloned: boolean;
  clone_path: string;
  created_at: string;
  updated_at: string;
}

export interface Stats {
  total: number;
  total_stars: number;
  official: number;
  zh: number;
  cloned: number;
  registry: string;
}

export interface SkillItem {
  name: string;
  description: string;
  repo: string;
  repo_id: number;
  path: string;
}

export interface AgentInfo {
  id: string;
  name: string;
  dir: string;
  installed: boolean;
}

export interface InstalledItem {
  agent: string;
  name: string;
  dir: string;
  description: string;
  repo_id: number | null;
  path: string | null;
  repo: string | null;
}

export interface InstallAllResult {
  repo: string;
  skills: string[];
  agents: string[];
  total: number;
  ok: number;
  failed: { skill: string; agent: string; error: string }[];
}

export interface DiffEntry {
  path: string;
  status: 'same' | 'added' | 'modified' | 'deleted';
  diff?: string;
}

export interface CloneState {
  cloned: boolean;
  exists?: boolean;
  dir?: string;
  last_commit?: string;
  status?: string;
}

export const TAG_META: Record<string, { label: string; cls: string }> = {
  official: { label: '官方', cls: 'official' },
  collection: { label: '合集', cls: 'collection' },
  tool: { label: '工具/框架', cls: '' },
  design: { label: '设计', cls: 'design' },
  research: { label: '研究/学术', cls: '' },
  security: { label: '安全', cls: 'security' },
  domain: { label: '垂直', cls: '' },
  zh: { label: '中文', cls: 'zh' },
};
