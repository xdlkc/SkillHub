/**
 * agents.mjs —— 本地 agent 的 skills 安装管理
 * 目录约定参考 vercel-labs/skills (npx skills) 的 src/agents.ts
 * AGENTS_HOME 环境变量可覆盖 home 基准（测试用），默认 os.homedir()
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const exec = promisify(execFile);

export const AGENTS_HOME = process.env.AGENTS_HOME || os.homedir();
const configHome = path.join(AGENTS_HOME, '.config');
const codexHome = process.env.CODEX_HOME || path.join(AGENTS_HOME, '.codex');
const claudeHome = process.env.CLAUDE_CONFIG_DIR || path.join(AGENTS_HOME, '.claude');
const home = AGENTS_HOME;

function openclawSkillsDir() {
  for (const d of ['.openclaw', '.clawdbot', '.moltbot']) {
    if (fs.existsSync(path.join(home, d))) return path.join(home, d, 'skills');
  }
  return path.join(home, '.openclaw', 'skills');
}

/** 支持的 agents（id / 显示名 / 全局 skills 目录 / 安装探测路径） */
export const AGENTS = [
  { id: 'claude-code', name: 'Claude Code', dir: path.join(claudeHome, 'skills'), detect: claudeHome },
  { id: 'codex', name: 'Codex', dir: path.join(codexHome, 'skills'), detect: codexHome },
  { id: 'cursor', name: 'Cursor', dir: path.join(home, '.cursor', 'skills'), detect: path.join(home, '.cursor') },
  { id: 'gemini-cli', name: 'Gemini CLI', dir: path.join(home, '.gemini', 'skills'), detect: path.join(home, '.gemini') },
  { id: 'opencode', name: 'OpenCode', dir: path.join(configHome, 'opencode', 'skills'), detect: path.join(configHome, 'opencode') },
  { id: 'openclaw', name: 'OpenClaw', dir: openclawSkillsDir(), detect: path.join(home, '.openclaw') },
  { id: 'cline', name: 'Cline', dir: path.join(home, '.agents', 'skills'), detect: path.join(home, '.cline') },
  { id: 'amp', name: 'Amp', dir: path.join(configHome, 'agents', 'skills'), detect: path.join(configHome, 'amp') },
  { id: 'github-copilot', name: 'GitHub Copilot', dir: path.join(home, '.copilot', 'skills'), detect: path.join(home, '.copilot') },
  { id: 'goose', name: 'Goose', dir: path.join(configHome, 'goose', 'skills'), detect: path.join(configHome, 'goose') },
  { id: 'kilocode', name: 'Kilo Code', dir: path.join(home, '.kilocode', 'skills'), detect: path.join(home, '.kilocode') },
  { id: 'kiro-cli', name: 'Kiro CLI', dir: path.join(home, '.kiro', 'skills'), detect: path.join(home, '.kiro') },
  { id: 'roo', name: 'Roo', dir: path.join(home, '.roo', 'skills'), detect: path.join(home, '.roo') },
  { id: 'trae', name: 'Trae', dir: path.join(home, '.trae', 'skills'), detect: path.join(home, '.trae') },
  { id: 'antigravity', name: 'Antigravity', dir: path.join(home, '.gemini', 'antigravity', 'skills'), detect: path.join(home, '.gemini', 'antigravity') },
];

export function getAgents() {
  return AGENTS.map((a) => ({ id: a.id, name: a.name, dir: a.dir, installed: fs.existsSync(a.detect) }));
}

export function findAgent(id) {
  const a = AGENTS.find((x) => x.id === id);
  if (!a) throw new Error(`未知 agent: ${id}`);
  return a;
}

/** 参考 npx skills 的 sanitizeName：防路径穿越 + kebab-case */
export function sanitizeName(name) {
  return (
    String(name)
      .toLowerCase()
      .replace(/[^a-z0-9._]+/g, '-')
      .replace(/^[.\-]+|[.\-]+$/g, '')
      .substring(0, 255) || 'unnamed-skill'
  );
}

function isPathSafe(base, target) {
  const b = path.normalize(path.resolve(base));
  const t = path.normalize(path.resolve(target));
  return t === b || t.startsWith(b + path.sep);
}

/** 递归列出目录内相对路径 */
function listFiles(dir, base = dir, acc = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(p, base, acc);
    else acc.push(path.relative(base, p));
  }
  return acc;
}

function readFileSafe(p) {
  try { return fs.readFileSync(p); } catch { return null; }
}

/**
 * 对比源 skill 目录与目标目录（文件级 + 每文件 unified diff 摘要）
 * 返回 [{ path, status: same|added|modified|deleted, diff? }]
 */
export async function diffDirs(srcDir, dstDir) {
  const srcFiles = new Set(listFiles(srcDir));
  const dstFiles = new Set(listFiles(dstDir));
  const all = new Set([...srcFiles, ...dstFiles]);
  const result = [];
  for (const f of [...all].sort()) {
    const sp = path.join(srcDir, f);
    const dp = path.join(dstDir, f);
    if (!dstFiles.has(f)) {
      result.push({ path: f, status: 'added' });
    } else if (!srcFiles.has(f)) {
      result.push({ path: f, status: 'deleted' });
    } else {
      const a = readFileSafe(sp);
      const b = readFileSafe(dp);
      if (a && b && a.equals(b)) {
        result.push({ path: f, status: 'same' });
      } else {
        let diff = '';
        try {
          const r = await exec('diff', ['-u', '--label', 'source', '--label', 'installed', sp, dp], { timeout: 10000, maxBuffer: 4 * 1024 * 1024 });
          diff = r.stdout;
        } catch {
          // diff 返回非零（有差异）也正常
          diff = '';
        }
        result.push({ path: f, status: 'modified', diff: diff.slice(0, 4000) });
      }
    }
  }
  return result;
}

/**
 * 安装（copy 模式）：
 * @param sourceDir 源 skill 目录（含 SKILL.md）
 * @param agentId   目标 agent
 * @returns { name, target, existed, changed, diff }
 */
export async function installSkill(sourceDir, agentId) {
  const agent = findAgent(agentId);
  if (!fs.existsSync(sourceDir)) throw new Error(`源目录不存在: ${sourceDir}`);
  const name = sanitizeName(path.basename(sourceDir));
  const target = path.join(agent.dir, name);
  if (!isPathSafe(agent.dir, target)) throw new Error('路径不安全');
  const existed = fs.existsSync(target);
  const diff = existed ? await diffDirs(sourceDir, target) : null;
  fs.mkdirSync(agent.dir, { recursive: true });
  fs.cpSync(sourceDir, target, { recursive: true, force: true });
  return { name, target, existed, changed: existed ? diff.some((d) => d.status !== 'same') : true, diff };
}

export function uninstallSkill(agentId, name) {
  const agent = findAgent(agentId);
  const safeName = sanitizeName(name);
  const target = path.join(agent.dir, safeName);
  if (!isPathSafe(agent.dir, target)) throw new Error('路径不安全');
  if (!fs.existsSync(target)) return { removed: false, target };
  fs.rmSync(target, { recursive: true, force: true });
  return { removed: true, target };
}

/** 扫描某 agent 已安装的 skills */
export function listInstalled(agentId) {
  const agent = findAgent(agentId);
  const dir = agent.dir;
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillDir = path.join(dir, entry.name);
    const skillMd = path.join(skillDir, 'SKILL.md');
    if (!fs.existsSync(skillMd)) continue;
    let description = '';
    try {
      const content = fs.readFileSync(skillMd, 'utf8').slice(0, 1500);
      const m = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
      if (m) {
        const dm = m[1].match(/^description:\s*(.*)$/m);
        if (dm) description = dm[1].trim().replace(/^["']|["']$/g, '');
      }
    } catch { /* ignore */ }
    out.push({ agent: agentId, name: entry.name, dir: skillDir, description });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function listAllInstalled() {
  const out = [];
  for (const a of AGENTS) {
    if (!fs.existsSync(a.dir)) continue;
    for (const item of listInstalled(a.id)) out.push(item);
  }
  return out;
}

export function agentSkillDir(agentId, name) {
  const agent = findAgent(agentId);
  return path.join(agent.dir, sanitizeName(name));
}
