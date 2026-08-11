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
const vibeHome = process.env.VIBE_HOME || path.join(home, '.vibe');
const hermesHome = process.env.HERMES_HOME || path.join(home, '.hermes');
const autohandHome = process.env.AUTOHAND_HOME || path.join(home, '.autohand');
const grokHome = process.env.GROK_HOME || path.join(home, '.grok');

function openclawSkillsDir() {
  for (const d of ['.openclaw', '.clawdbot', '.moltbot']) {
    if (fs.existsSync(path.join(home, d))) return path.join(home, d, 'skills');
  }
  return path.join(home, '.openclaw', 'skills');
}

/** 支持的 agents（id / 显示名 / 全局 skills 目录 / 安装探测路径） */
export const AGENTS = [
  { id: 'adal', name: 'AdaL', dir: path.join(home, '.adal', 'skills'), detect: path.join(home, '.adal') },
  { id: 'aider-desk', name: 'AiderDesk', dir: path.join(home, '.aider-desk', 'skills'), detect: path.join(home, '.aider-desk') },
  { id: 'amp', name: 'Amp', dir: path.join(configHome, 'agents', 'skills'), detect: path.join(configHome, 'amp') },
  { id: 'antigravity', name: 'Antigravity', dir: path.join(home, '.gemini', 'antigravity', 'skills'), detect: path.join(home, '.gemini', 'antigravity') },
  { id: 'antigravity-cli', name: 'Antigravity CLI', dir: path.join(home, '.gemini', 'antigravity-cli', 'skills'), detect: path.join(home, '.gemini', 'antigravity-cli') },
  { id: 'astrbot', name: 'AstrBot', dir: path.join(home, '.astrbot', 'data', 'skills'), detect: path.join(home, '.astrbot') },
  { id: 'augment', name: 'Augment', dir: path.join(home, '.augment', 'skills'), detect: path.join(home, '.augment') },
  { id: 'autohand-code', name: 'Autohand Code CLI', dir: path.join(autohandHome, 'skills'), detect: autohandHome },
  { id: 'bob', name: 'IBM Bob', dir: path.join(home, '.bob', 'skills'), detect: path.join(home, '.bob') },
  { id: 'claude-code', name: 'Claude Code', dir: path.join(claudeHome, 'skills'), detect: claudeHome },
  { id: 'cline', name: 'Cline', dir: path.join(home, '.agents', 'skills'), detect: path.join(home, '.cline') },
  { id: 'codearts-agent', name: 'CodeArts Agent', dir: path.join(home, '.codeartsdoer', 'skills'), detect: path.join(home, '.codeartsdoer') },
  { id: 'codebuddy', name: 'CodeBuddy', dir: path.join(home, '.codebuddy', 'skills'), detect: path.join(home, '.codebuddy') },
  { id: 'codemaker', name: 'Codemaker', dir: path.join(home, '.codemaker', 'skills'), detect: path.join(home, '.codemaker') },
  { id: 'codestudio', name: 'Code Studio', dir: path.join(home, '.codestudio', 'skills'), detect: path.join(home, '.codestudio') },
  { id: 'codex', name: 'Codex', dir: path.join(codexHome, 'skills'), detect: [codexHome, '/etc/codex'] },
  { id: 'command-code', name: 'Command Code', dir: path.join(home, '.commandcode', 'skills'), detect: path.join(home, '.commandcode') },
  { id: 'continue', name: 'Continue', dir: path.join(home, '.continue', 'skills'), detect: path.join(home, '.continue') },
  { id: 'cortex', name: 'Cortex Code', dir: path.join(home, '.snowflake', 'cortex', 'skills'), detect: path.join(home, '.snowflake', 'cortex') },
  { id: 'crush', name: 'Crush', dir: path.join(configHome, 'crush', 'skills'), detect: path.join(configHome, 'crush') },
  { id: 'cursor', name: 'Cursor', dir: path.join(home, '.cursor', 'skills'), detect: path.join(home, '.cursor') },
  { id: 'deepagents', name: 'Deep Agents', dir: path.join(home, '.deepagents', 'agent', 'skills'), detect: path.join(home, '.deepagents') },
  { id: 'devin', name: 'Devin for Terminal', dir: path.join(configHome, 'devin', 'skills'), detect: path.join(configHome, 'devin') },
  { id: 'dexto', name: 'Dexto', dir: path.join(home, '.agents', 'skills'), detect: path.join(home, '.dexto') },
  { id: 'droid', name: 'Droid', dir: path.join(home, '.factory', 'skills'), detect: path.join(home, '.factory') },
  { id: 'firebender', name: 'Firebender', dir: path.join(home, '.firebender', 'skills'), detect: path.join(home, '.firebender') },
  { id: 'forgecode', name: 'ForgeCode', dir: path.join(home, '.forge', 'skills'), detect: path.join(home, '.forge') },
  { id: 'gemini-cli', name: 'Gemini CLI', dir: path.join(home, '.gemini', 'skills'), detect: path.join(home, '.gemini') },
  { id: 'github-copilot', name: 'GitHub Copilot', dir: path.join(home, '.copilot', 'skills'), detect: path.join(home, '.copilot') },
  { id: 'goose', name: 'Goose', dir: path.join(configHome, 'goose', 'skills'), detect: path.join(configHome, 'goose') },
  { id: 'grok', name: 'Grok Build', dir: path.join(grokHome, 'skills'), detect: grokHome },
  { id: 'hermes-agent', name: 'Hermes Agent', dir: path.join(hermesHome, 'skills'), detect: hermesHome },
  { id: 'iflow-cli', name: 'iFlow CLI', dir: path.join(home, '.iflow', 'skills'), detect: path.join(home, '.iflow') },
  { id: 'inference-sh', name: 'inference.sh', dir: path.join(home, '.inferencesh', 'skills'), detect: path.join(home, '.inferencesh') },
  { id: 'jazz', name: 'Jazz', dir: path.join(home, '.jazz', 'skills'), detect: path.join(home, '.jazz') },
  { id: 'junie', name: 'Junie', dir: path.join(home, '.junie', 'skills'), detect: path.join(home, '.junie') },
  { id: 'kilocode', name: 'Kilo Code', dir: path.join(home, '.kilocode', 'skills'), detect: path.join(home, '.kilocode') },
  { id: 'kimchi', name: 'Kimchi', dir: path.join(configHome, 'kimchi', 'harness', 'skills'), detect: path.join(configHome, 'kimchi') },
  { id: 'kimi-code-cli', name: 'Kimi Code CLI', dir: path.join(home, '.agents', 'skills'), detect: [path.join(home, '.kimi-code'), path.join(home, '.kimi')] },
  { id: 'kiro-cli', name: 'Kiro CLI', dir: path.join(home, '.kiro', 'skills'), detect: path.join(home, '.kiro') },
  { id: 'kode', name: 'Kode', dir: path.join(home, '.kode', 'skills'), detect: path.join(home, '.kode') },
  { id: 'lingma', name: 'Lingma', dir: path.join(home, '.lingma', 'skills'), detect: path.join(home, '.lingma') },
  { id: 'loaf', name: 'Loaf', dir: path.join(home, '.agents', 'skills'), detect: path.join(home, '.loaf') },
  { id: 'mcpjam', name: 'MCPJam', dir: path.join(home, '.mcpjam', 'skills'), detect: path.join(home, '.mcpjam') },
  { id: 'minimax-code', name: 'MiniMax Code', dir: path.join(home, '.minimax', 'skills'), detect: [path.join(home, '.minimax'), '/Applications/MiniMax Code.app'] },
  { id: 'mistral-vibe', name: 'Mistral Vibe', dir: path.join(vibeHome, 'skills'), detect: vibeHome },
  { id: 'moxby', name: 'Moxby', dir: path.join(home, '.moxby', 'skills'), detect: path.join(home, '.moxby') },
  { id: 'mux', name: 'Mux', dir: path.join(home, '.mux', 'skills'), detect: path.join(home, '.mux') },
  { id: 'neovate', name: 'Neovate', dir: path.join(home, '.neovate', 'skills'), detect: path.join(home, '.neovate') },
  { id: 'ona', name: 'Ona', dir: path.join(home, '.ona', 'skills'), detect: path.join(home, '.ona') },
  { id: 'opencode', name: 'OpenCode', dir: path.join(configHome, 'opencode', 'skills'), detect: path.join(configHome, 'opencode') },
  { id: 'openclaw', name: 'OpenClaw', dir: openclawSkillsDir(), detect: [path.join(home, '.openclaw'), path.join(home, '.clawdbot'), path.join(home, '.moltbot')] },
  { id: 'openhands', name: 'OpenHands', dir: path.join(home, '.openhands', 'skills'), detect: path.join(home, '.openhands') },
  { id: 'pi', name: 'Pi', dir: path.join(home, '.pi', 'agent', 'skills'), detect: path.join(home, '.pi', 'agent') },
  { id: 'pochi', name: 'Pochi', dir: path.join(home, '.pochi', 'skills'), detect: path.join(home, '.pochi') },
  { id: 'qoder', name: 'Qoder', dir: path.join(home, '.qoder', 'skills'), detect: path.join(home, '.qoder') },
  { id: 'qoder-cn', name: 'Qoder CN', dir: path.join(home, '.qoder-cn', 'skills'), detect: path.join(home, '.qoder-cn') },
  { id: 'qwen-code', name: 'Qwen Code', dir: path.join(home, '.qwen', 'skills'), detect: path.join(home, '.qwen') },
  { id: 'reasonix', name: 'Reasonix', dir: path.join(home, '.reasonix', 'skills'), detect: path.join(home, '.reasonix') },
  { id: 'replit', name: 'Replit', dir: path.join(configHome, 'agents', 'skills'), detect: path.join(process.cwd(), '.replit') },
  { id: 'roo', name: 'Roo Code', dir: path.join(home, '.roo', 'skills'), detect: path.join(home, '.roo') },
  { id: 'rovodev', name: 'Rovo Dev', dir: path.join(home, '.rovodev', 'skills'), detect: path.join(home, '.rovodev') },
  { id: 'tabnine-cli', name: 'Tabnine CLI', dir: path.join(home, '.tabnine', 'agent', 'skills'), detect: path.join(home, '.tabnine') },
  { id: 'terramind', name: 'Terramind', dir: path.join(home, '.terramind', 'skills'), detect: path.join(home, '.terramind') },
  { id: 'tinycloud', name: 'Tinycloud', dir: path.join(home, '.tinycloud', 'skills'), detect: path.join(home, '.tinycloud') },
  { id: 'trae', name: 'Trae', dir: path.join(home, '.trae', 'skills'), detect: path.join(home, '.trae') },
  { id: 'trae-cn', name: 'Trae CN', dir: path.join(home, '.trae-cn', 'skills'), detect: path.join(home, '.trae-cn') },
  { id: 'warp', name: 'Warp', dir: path.join(home, '.agents', 'skills'), detect: path.join(home, '.warp') },
  { id: 'windsurf', name: 'Windsurf', dir: path.join(home, '.codeium', 'windsurf', 'skills'), detect: path.join(home, '.codeium', 'windsurf') },
  { id: 'zcode', name: 'ZCode', dir: path.join(home, '.zcode', 'skills'), detect: [path.join(home, '.zcode'), '/Applications/ZCode.app'] },
  { id: 'zed', name: 'Zed', dir: path.join(home, '.agents', 'skills'), detect: path.join(configHome, 'zed') },
  { id: 'zencoder', name: 'Zencoder', dir: path.join(home, '.zencoder', 'skills'), detect: path.join(home, '.zencoder') },
  { id: 'zenflow', name: 'Zenflow', dir: path.join(home, '.zencoder', 'skills'), detect: path.join(home, '.zencoder') },
];

const detected = (d) => (Array.isArray(d) ? d : [d]).some((p) => fs.existsSync(p));

export function getAgents() {
  return AGENTS
    .map((a) => ({ id: a.id, name: a.name, dir: a.dir, installed: detected(a.detect) }))
    .sort((a, b) => Number(b.installed) - Number(a.installed) || a.name.localeCompare(b.name));
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
      .replace(/[^a-z0-9._:]+/g, '-')
      .replace(/^[.\-:]+|[.\-:]+$/g, '')
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
function rewriteSkillName(skillDir, name) {
  try {
    const file = ['SKILL.md', 'skill.md'].map((f) => path.join(skillDir, f)).find((f) => fs.existsSync(f));
    if (!file) return;
    const content = fs.readFileSync(file, 'utf8');
    const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return;
    const eol = match[0].includes('\r\n') ? '\r\n' : '\n';
    const frontmatter = /^name:\s*.*$/m.test(match[1])
      ? match[1].replace(/^name:\s*.*$/m, `name: ${name}`)
      : `name: ${name}${eol}${match[1]}`;
    fs.writeFileSync(file, content.replace(match[0], match[0].replace(match[1], frontmatter)));
  } catch { /* 保留原文件 */ }
}

export async function installSkill(sourceDir, agentId, nameOverride) {
  const agent = findAgent(agentId);
  if (!fs.existsSync(sourceDir)) throw new Error(`源目录不存在: ${sourceDir}`);
  const name = sanitizeName(nameOverride || path.basename(sourceDir));
  const target = path.join(agent.dir, name);
  if (!isPathSafe(agent.dir, target)) throw new Error('路径不安全');
  const existed = fs.existsSync(target);
  const diff = existed ? await diffDirs(sourceDir, target) : null;
  fs.mkdirSync(agent.dir, { recursive: true });
  fs.cpSync(sourceDir, target, {
    recursive: true,
    force: true,
    filter: (source) => !['.git', 'node_modules'].includes(path.basename(source)),
  });
  if (nameOverride) rewriteSkillName(target, name);
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
