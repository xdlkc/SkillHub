/**
 * SKILLS·INDEX 后端 —— 零 npm 依赖
 * node:http + node:sqlite (Node 22.13+) + git clone
 *
 * API:
 *   GET    /api/skills                    列表（全量）
 *   POST   /api/skills                    录入
 *   PATCH  /api/skills/:id                更新（打标/改字段）
 *   DELETE /api/skills/:id                删除
 *   GET    /api/skills/:id/clone          查询本地 clone 状态
 *   POST   /api/skills/:id/clone          clone 到 registry
 *   POST   /api/skills/:id/clone/remove   删除本地 clone
 *   POST   /api/rescan                    扫描 registry 同步状态
 *   GET    /api/fetch?repo=owner/repo     从 GitHub 拉取元数据（gh api）
 *   GET    /api/stats                     汇总统计
 */
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  AGENTS_HOME, getAgents, findAgent, listAllInstalled, listInstalled, installSkill, uninstallSkill, diffDirs,
  agentSkillDir, sanitizeName,
} from './agents.mjs';
import { createAutoSyncController } from './auto-sync.mjs';

// Node 22 下 node:sqlite 会打印 ExperimentalWarning，屏蔽噪音
process.removeAllListeners('warning');

const PORT = process.env.PORT || 8787;
const REGISTRY = process.env.SKILLS_REGISTRY || path.join(os.homedir(), 'Code', 'skills-registry');
const DB_PATH = process.env.SKILLS_DB_PATH || path.join(import.meta.dirname, '..', 'data', 'skills.db');
const PROJECT_ROOT = path.join(import.meta.dirname, '..');
const JSON_PATH = path.join(PROJECT_ROOT, 'data', 'skills.json');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(REGISTRY, { recursive: true });

/* =============== 自动同步：操作 → export skills.json → git push =============== */
const GIT_NAME = process.env.SYNC_GIT_NAME || 'SKILLS-INDEX Bot';
const GIT_EMAIL = process.env.SYNC_GIT_EMAIL || 'skills-bot@users.noreply.github.com';

function exportJsonNow() {
  try {
    const rows = db.prepare('SELECT full_name, stars, desc, lang, url, tags, cloned FROM skills ORDER BY stars DESC').all();
    const skills = rows.map((r) => ({
      full_name: r.full_name,
      stars: r.stars,
      desc: r.desc,
      lang: r.lang,
      url: r.url,
      tags: safeTags(r.tags),
      cloned: !!r.cloned,
    }));
    const payload = { version: 1, exported_at: new Date().toISOString(), skills };
    fs.writeFileSync(JSON_PATH, JSON.stringify(payload, null, 2) + '\n');
    return true;
  } catch (e) {
    console.error('[auto-sync] export 失败:', e.message);
    return false;
  }
}

async function pushJsonNow() {
  try {
    // 有变更才提交
    const { stdout: diff } = await exec('git', ['-C', PROJECT_ROOT, 'status', '--porcelain', '--', 'data/skills.json']);
    if (!diff.trim()) return { pushed: false, reason: 'no-change' };
    await exec('git', ['-C', PROJECT_ROOT, 'add', 'data/skills.json']);
    await exec('git', ['-C', PROJECT_ROOT, '-c', `user.name=${GIT_NAME}`, '-c', `user.email=${GIT_EMAIL}`, 'commit', '-m', 'auto-sync: 列表更新（后端自动同步）']);
    const { stdout: pushOut } = await exec('git', ['-C', PROJECT_ROOT, 'push'], { timeout: 60000 });
    console.log('[auto-sync] 已推送远端:', pushOut.trim().split('\n').slice(-1)[0]);
    return { pushed: true };
  } catch (e) {
    console.error('[auto-sync] push 失败（稍后操作会重试）:', e.message.split('\n')[0]);
    return { pushed: false, reason: e.message.split('\n')[0] };
  }
}

const exec = promisify(execFile);
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS skills (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name  TEXT NOT NULL UNIQUE,
    stars      INTEGER NOT NULL DEFAULT 0,
    desc       TEXT NOT NULL DEFAULT '',
    lang       TEXT NOT NULL DEFAULT '',
    url        TEXT NOT NULL DEFAULT '',
    tags       TEXT NOT NULL DEFAULT '[]',
    cloned     INTEGER NOT NULL DEFAULT 0,
    clone_path TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS installed_items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    agent        TEXT NOT NULL,
    name         TEXT NOT NULL,
    repo_id      INTEGER NOT NULL,
    path         TEXT NOT NULL,
    installed_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(agent, name)
  );
  CREATE TABLE IF NOT EXISTS agent_prefs (
    agent   TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

const autoSync = createAutoSyncController({
  db,
  envValue: process.env.AUTO_SYNC,
  exportNow: exportJsonNow,
  pushNow: pushJsonNow,
});

function markDirty() {
  autoSync.markDirty();
}

const FULLNAME_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/* ---------------- helpers ---------------- */
function rowToSkill(r) {
  return {
    id: r.id,
    full_name: r.full_name,
    stars: r.stars,
    desc: r.desc,
    lang: r.lang,
    url: r.url,
    tags: safeTags(r.tags),
    cloned: !!r.cloned,
    clone_path: r.clone_path,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}
function safeTags(s) {
  try { const a = JSON.parse(s); return Array.isArray(a) ? a : []; }
  catch { return []; }
}
function cloneDirFor(fullName) {
  const [o, r] = fullName.split('/');
  return path.join(REGISTRY, `${o}-${r}`);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e6) { reject(new Error('body too large')); req.destroy(); }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(new Error('invalid JSON')); }
    });
    req.on('error', reject);
  });
}
function send(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(obj));
}

/* ---------------- github fetch ---------------- */
async function fetchGithub(repo) {
  if (!FULLNAME_RE.test(repo)) throw new Error('invalid repo name');
  const { stdout } = await exec('gh', ['api', `repos/${repo}`], { timeout: 20000 });
  const j = JSON.parse(stdout);
  return {
    full_name: j.full_name,
    stars: j.stargazers_count ?? 0,
    desc: j.description ?? '',
    lang: j.language ?? '',
    url: j.html_url ?? `https://github.com/${repo}`,
  };
}

/* ---------------- clone ---------------- */
async function checkCloneState(dir) {
  const gitDir = path.join(dir, '.git');
  if (!fs.existsSync(gitDir)) return null;
  try {
    const { stdout } = await exec('git', ['-C', dir, 'log', '-1', '--format=%ci'], { timeout: 10000 });
    return { exists: true, dir, last_commit: stdout.trim() };
  } catch {
    return { exists: true, dir, last_commit: '' };
  }
}
async function doClone(fullName, dir) {
  if (!FULLNAME_RE.test(fullName)) throw new Error('invalid repo name');
  fs.mkdirSync(dir, { recursive: true });
  const existing = await checkCloneState(dir);
  if (existing) return { status: 'already', dir, ...existing };
  await exec('git', ['clone', '--depth', '1', `https://github.com/${fullName}.git`, dir], {
    timeout: 180000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return { status: 'cloned', dir, ...(await checkCloneState(dir)) };
}

/* ---------------- skill 级扫描（SKILL.md） ---------------- */
const SKILLS_CACHE_TTL = 30000;
let skillsCache = { data: [], ts: 0 };

function parseFrontmatter(content) {
  const m = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (kv) fm[kv[1].trim()] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return fm;
}

function walkFiles(dir, acc, depth) {
  if (depth > 5) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name === '.git' || e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, acc, depth + 1);
    else if (/^SKILL\.md$/i.test(e.name)) acc.push(p);
  }
}

function scanRepoItems(row) {
  const dir = row.clone_path || cloneDirFor(row.full_name);
  if (!fs.existsSync(dir)) return [];
  const files = [];
  walkFiles(dir, files, 0);
  const out = [];
  for (const f of files) {
    let content = '';
    try { content = fs.readFileSync(f, 'utf8').slice(0, 4000); } catch { continue; }
    const fm = parseFrontmatter(content);
    const rel = path.relative(dir, f).split(path.sep).join('/');
    const parts = rel.split('/');
    const name = fm.name || (parts.length >= 2 ? parts[parts.length - 2] : row.full_name.split('/')[1]);
    out.push({
      name,
      description: fm.description || '',
      repo: row.full_name,
      repo_id: row.id,
      path: rel,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function installedSkillName(row, name, prefix, sep) {
  const base = sanitizeName(name);
  const [ownerPart, repoPart] = row.full_name.split('/');
  const owner = sanitizeName(ownerPart);
  const repoName = sanitizeName(repoPart);
  if (!prefix || base === repoName || base.startsWith(`${owner}-`) || base.startsWith(`${owner}:`)) return base;
  return `${owner}${sep === '-' ? '-' : ':'}${base}`;
}

function scanSkillItems() {
  const rows = db.prepare('SELECT id, full_name, clone_path FROM skills WHERE cloned = 1').all();
  const out = [];
  for (const row of rows) out.push(...scanRepoItems(row));
  return out;
}

/* ---------------- router ---------------- */
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;
  const method = req.method;

  if (method === 'OPTIONS') return send(res, 204, {});

  try {
    if (method === 'GET' && p === '/api/settings') {
      return send(res, 200, { metadata_auto_sync: autoSync.getState() });
    }

    if (method === 'PATCH' && p === '/api/settings/metadata-auto-sync') {
      let b;
      try {
        b = await readBody(req);
      } catch (e) {
        return send(res, 400, { error: e.message });
      }
      if (b === null || typeof b !== 'object' || Array.isArray(b) || typeof b.enabled !== 'boolean') {
        return send(res, 400, { error: 'enabled 必须是布尔值' });
      }
      try {
        const state = autoSync.setEnabled(b.enabled);
        return send(res, 200, { metadata_auto_sync: state });
      } catch (e) {
        if (e.code === 'AUTO_SYNC_LOCKED') {
          return send(res, 409, { error: e.message });
        }
        throw e;
      }
    }

    /* 列表 */
    if (method === 'GET' && p === '/api/skills') {
      const rows = db.prepare('SELECT * FROM skills ORDER BY stars DESC').all();
      return send(res, 200, { skills: rows.map(rowToSkill) });
    }

    /* 录入 */
    if (method === 'POST' && p === '/api/skills') {
      const b = await readBody(req);
      const fullName = String(b.full_name || '').trim();
      if (!FULLNAME_RE.test(fullName)) return send(res, 400, { error: 'full_name 必须是 owner/repo 格式' });
      const exists = db.prepare('SELECT id FROM skills WHERE full_name = ?').get(fullName);
      if (exists) return send(res, 409, { error: `已存在（id=${exists.id}）` });
      const stmt = db.prepare(
        `INSERT INTO skills (full_name, stars, desc, lang, url, tags)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      const info = stmt.run(
        fullName,
        Number(b.stars) || 0,
        String(b.desc || ''),
        String(b.lang || ''),
        String(b.url || `https://github.com/${fullName}`),
        JSON.stringify(Array.isArray(b.tags) ? b.tags : [])
      );
      const row = db.prepare('SELECT * FROM skills WHERE id = ?').get(info.lastInsertRowid);
      markDirty();
      return send(res, 201, { skill: rowToSkill(row) });
    }

    /* 更新（打标等） */
    const patchMatch = p.match(/^\/api\/skills\/(\d+)$/);
    if (method === 'PATCH' && patchMatch) {
      const id = Number(patchMatch[1]);
      const b = await readBody(req);
      const cur = db.prepare('SELECT * FROM skills WHERE id = ?').get(id);
      if (!cur) return send(res, 404, { error: 'not found' });
      const upd = {
        stars: b.stars !== undefined ? Number(b.stars) : cur.stars,
        desc: b.desc !== undefined ? String(b.desc) : cur.desc,
        lang: b.lang !== undefined ? String(b.lang) : cur.lang,
        url: b.url !== undefined ? String(b.url) : cur.url,
        tags: b.tags !== undefined ? JSON.stringify(b.tags) : cur.tags,
      };
      if (b.full_name !== undefined && b.full_name !== cur.full_name) {
        if (!FULLNAME_RE.test(String(b.full_name))) return send(res, 400, { error: 'full_name 格式错误' });
        upd.full_name = String(b.full_name).trim();
        db.prepare('UPDATE skills SET full_name = ? WHERE id = ?').run(upd.full_name, id);
      }
      db.prepare(
        `UPDATE skills SET stars = ?, desc = ?, lang = ?, url = ?, tags = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(upd.stars, upd.desc, upd.lang, upd.url, upd.tags, id);
      const row = db.prepare('SELECT * FROM skills WHERE id = ?').get(id);
      markDirty();
      return send(res, 200, { skill: rowToSkill(row) });
    }

    /* 删除 */
    const delMatch = p.match(/^\/api\/skills\/(\d+)$/);
    if (method === 'DELETE' && delMatch) {
      const info = db.prepare('DELETE FROM skills WHERE id = ?').run(Number(delMatch[1]));
      if (info.changes === 0) return send(res, 404, { error: 'not found' });
      markDirty();
      return send(res, 200, { ok: true });
    }

    /* README / SKILL.md 预览（需已 clone） */
    const readmeMatch = p.match(/^\/api\/skills\/(\d+)\/readme$/);
    if (method === 'GET' && readmeMatch) {
      const row = db.prepare('SELECT * FROM skills WHERE id = ?').get(Number(readmeMatch[1]));
      if (!row) return send(res, 404, { error: 'not found' });
      const dir = row.clone_path || cloneDirFor(row.full_name);
      if (!row.cloned || !fs.existsSync(dir)) {
        return send(res, 200, { cloned: false, content: '', path: '' });
      }
      const candidates = ['README.md', 'SKILL.md', 'readme.md', 'README.MD'];
      let file = null;
      for (const c of candidates) if (fs.existsSync(path.join(dir, c))) { file = c; break; }
      if (!file) {
        // 兜底：扫描一级子目录找 README/SKILL
        try {
          for (const e of fs.readdirSync(dir)) {
            const sub = path.join(dir, e);
            if (!fs.statSync(sub).isDirectory()) continue;
            for (const c of candidates) if (fs.existsSync(path.join(sub, c))) { file = path.join(e, c); break; }
            if (file) break;
          }
        } catch { /* ignore */ }
      }
      if (!file) return send(res, 200, { cloned: true, content: '', path: '' });
      const full = path.join(dir, file);
      const MAX = 8000;
      const raw = fs.readFileSync(full, 'utf8');
      return send(res, 200, {
        cloned: true,
        path: file,
        content: raw.slice(0, MAX),
        truncated: raw.length > MAX,
        total_chars: raw.length,
      });
    }

    /* clone 状态查询 */
    const cstateMatch = p.match(/^\/api\/skills\/(\d+)\/clone$/);
    if (method === 'GET' && cstateMatch) {
      const row = db.prepare('SELECT * FROM skills WHERE id = ?').get(Number(cstateMatch[1]));
      if (!row) return send(res, 404, { error: 'not found' });
      const st = await checkCloneState(row.clone_path || cloneDirFor(row.full_name));
      return send(res, 200, { cloned: !!st, ...(st || { exists: false }) });
    }

    /* clone 执行 */
    if (method === 'POST' && cstateMatch) {
      const row = db.prepare('SELECT * FROM skills WHERE id = ?').get(Number(cstateMatch[1]));
      if (!row) return send(res, 404, { error: 'not found' });
      try {
        const dir = row.clone_path || cloneDirFor(row.full_name);
        const result = await doClone(row.full_name, dir);
        db.prepare(
          "UPDATE skills SET cloned = 1, clone_path = ?, updated_at = datetime('now') WHERE id = ?"
        ).run(dir, row.id);
        markDirty();
        return send(res, 200, { ...result, id: row.id });
      } catch (e) {
        return send(res, 500, { error: `clone 失败: ${e.message}` });
      }
    }

    /* pull 更新本地代码 */
    const pullMatch = p.match(/^\/api\/skills\/(\d+)\/pull$/);
    if (method === 'POST' && pullMatch) {
      const row = db.prepare('SELECT * FROM skills WHERE id = ?').get(Number(pullMatch[1]));
      if (!row) return send(res, 404, { error: 'not found' });
      const dir = row.clone_path || cloneDirFor(row.full_name);
      if (!row.cloned || !fs.existsSync(dir)) return send(res, 400, { error: '该仓库尚未 clone 到本地' });
      try {
        const before = (await exec('git', ['-C', dir, 'rev-parse', 'HEAD'], { timeout: 10000 })).stdout.trim();
        const r = await exec('git', ['-C', dir, 'pull', '--ff-only'], { timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
        const after = (await exec('git', ['-C', dir, 'rev-parse', 'HEAD'], { timeout: 10000 })).stdout.trim();
        const lastCommit = (await exec('git', ['-C', dir, 'log', '-1', '--format=%ci'], { timeout: 10000 })).stdout.trim();
        return send(res, 200, {
          ok: true,
          dir,
          before,
          after,
          changed: before !== after,
          last_commit: lastCommit,
          output: r.stdout.slice(-600),
        });
      } catch (e) {
        return send(res, 500, { error: `pull 失败: ${e.message.split('\n')[0]}` });
      }
    }

    /* clone 移除 */
    const cremoveMatch = p.match(/^\/api\/skills\/(\d+)\/clone\/remove$/);
    if (method === 'POST' && cremoveMatch) {
      const row = db.prepare('SELECT * FROM skills WHERE id = ?').get(Number(cremoveMatch[1]));
      if (!row) return send(res, 404, { error: 'not found' });
      const dir = row.clone_path || cloneDirFor(row.full_name);
      try {
        fs.rmSync(dir, { recursive: true, force: true });
        db.prepare("UPDATE skills SET cloned = 0, clone_path = '', updated_at = datetime('now') WHERE id = ?").run(row.id);
        markDirty();
        return send(res, 200, { ok: true });
      } catch (e) {
        return send(res, 500, { error: `删除失败: ${e.message}` });
      }
    }

    /* 扫描 registry 同步状态 */
    if (method === 'POST' && p === '/api/rescan') {
      let updated = 0;
      for (const entry of fs.readdirSync(REGISTRY)) {
        const dir = path.join(REGISTRY, entry);
        if (!fs.statSync(dir).isDirectory()) continue;
        if (!fs.existsSync(path.join(dir, '.git'))) continue;
        // 目录名约定 owner-repo → owner/repo
        const idx = entry.indexOf('-');
        if (idx <= 0) continue;
        const fullName = `${entry.slice(0, idx)}/${entry.slice(idx + 1)}`;
        const row = db.prepare('SELECT id FROM skills WHERE full_name = ?').get(fullName);
        if (row) {
          db.prepare("UPDATE skills SET cloned = 1, clone_path = ? WHERE id = ?").run(dir, row.id);
          updated++;
        }
      }
      if (updated > 0) markDirty();
      return send(res, 200, { ok: true, updated, registry: REGISTRY });
    }

    /* GitHub 元数据拉取（录入表单用） */
    if (method === 'GET' && p === '/api/fetch') {
      const repo = url.searchParams.get('repo') || '';
      try {
        const meta = await fetchGithub(repo);
        return send(res, 200, meta);
      } catch (e) {
        return send(res, 404, { error: `无法获取 ${repo}: ${e.message}` });
      }
    }

    /* skill 级列表（已 clone 仓库内的 SKILL.md） */
    if (method === 'GET' && p === '/api/skill-items') {
      if (Date.now() - skillsCache.ts > SKILLS_CACHE_TTL) {
        skillsCache = { data: scanSkillItems(), ts: Date.now() };
      }
      return send(res, 200, { items: skillsCache.data, repos: skillsCache.data.length, cached: Date.now() - skillsCache.ts < 1000 });
    }

    /* 单个仓库内的 skill 列表 */
    const repoItemsMatch = p.match(/^\/api\/repos\/(\d+)\/items$/);
    if (method === 'GET' && repoItemsMatch) {
      const row = db.prepare('SELECT * FROM skills WHERE id = ?').get(Number(repoItemsMatch[1]));
      if (!row) return send(res, 404, { error: 'not found' });
      const dir = row.clone_path || cloneDirFor(row.full_name);
      if (!row.cloned || !fs.existsSync(dir)) {
        return send(res, 400, { error: '该仓库尚未 clone 到本地，请先克隆' });
      }
      return send(res, 200, { items: scanRepoItems(row) });
    }

    /* skill 内容预览（校验路径在 clone 目录内） */
    if (method === 'GET' && p === '/api/skill-items/content') {
      const repoId = Number(url.searchParams.get('repo') || 0);
      const rel = url.searchParams.get('path') || '';
      const row = db.prepare('SELECT id, full_name, clone_path FROM skills WHERE id = ? AND cloned = 1').get(repoId);
      if (!row) return send(res, 404, { error: 'not found or not cloned' });
      const dir = row.clone_path || cloneDirFor(row.full_name);
      const abs = path.resolve(dir, rel);
      if (!abs.startsWith(dir + path.sep)) return send(res, 400, { error: 'invalid path' });
      if (!fs.existsSync(abs)) return send(res, 404, { error: 'file not found' });
      const content = fs.readFileSync(abs, 'utf8');
      return send(res, 200, { content: content.slice(0, 20000), total_chars: content.length, truncated: content.length > 20000, path: rel });
    }

    /* 一键导入：GitHub 拉取元数据 → 入库 → clone 到 registry */
    if (method === 'POST' && p === '/api/repos/import') {
      const b = await readBody(req);
      const repo = String(b.repo || '').trim();
      if (!FULLNAME_RE.test(repo)) return send(res, 400, { error: '仓库名必须是 owner/repo 格式' });
      try {
        const meta = await fetchGithub(repo);
        const exists = db.prepare('SELECT id FROM skills WHERE full_name = ?').get(meta.full_name);
        let row;
        if (exists) {
          row = db.prepare('SELECT * FROM skills WHERE id = ?').get(exists.id);
        } else {
          const info = db.prepare(
            'INSERT INTO skills (full_name, stars, desc, lang, url, tags) VALUES (?, ?, ?, ?, ?, ?)'
          ).run(meta.full_name, meta.stars, meta.desc, meta.lang, meta.url, JSON.stringify(['tool']));
          row = db.prepare('SELECT * FROM skills WHERE id = ?').get(info.lastInsertRowid);
        }
        let cloned = !!row.cloned;
        let clone = null;
        if (!cloned) {
          try {
            const dir = cloneDirFor(row.full_name);
            clone = await doClone(row.full_name, dir);
            db.prepare("UPDATE skills SET cloned = 1, clone_path = ?, updated_at = datetime('now') WHERE id = ?").run(dir, row.id);
            cloned = true;
            markDirty();
          } catch (e) {
            return send(res, 200, { skill: rowToSkill(row), imported: true, cloned: false, clone_error: e.message });
          }
        }
        const fresh = db.prepare('SELECT * FROM skills WHERE id = ?').get(row.id);
        return send(res, 200, { skill: rowToSkill(fresh), imported: !exists, cloned, clone });
      } catch (e) {
        return send(res, 404, { error: `导入失败: ${e.message}` });
      }
    }

    /* 安装仓库全部 skills 到全部（或选定）agents */
    if (method === 'POST') {
      const am = p.match(/^\/api\/repos\/(\d+)\/install-all$/);
      if (am) {
        const b = await readBody(req);
        const row = db.prepare('SELECT * FROM skills WHERE id = ?').get(Number(am[1]));
        if (!row) return send(res, 404, { error: 'not found' });
        if (!row.cloned || !fs.existsSync(row.clone_path || cloneDirFor(row.full_name))) {
          return send(res, 400, { error: '该仓库尚未 clone 到本地，请先克隆' });
        }
        let items = scanRepoItems(row);
        if (Array.isArray(b.skills) && b.skills.length > 0) {
          const selected = new Set(b.skills.map(String));
          items = items.filter((item) => selected.has(item.path));
          if (items.length === 0) return send(res, 400, { error: '选定的 skills 未在仓库中找到' });
        }
        if (items.length === 0) return send(res, 400, { error: '该仓库未扫描到 SKILL.md' });
        let requested;
        if (Array.isArray(b.agents)) {
          requested = b.agents.map(String);
        } else {
          const disabled = new Set(db.prepare('SELECT agent FROM agent_prefs WHERE enabled = 0').all().map((r) => r.agent));
          requested = getAgents().filter((a) => a.installed && !disabled.has(a.id)).map((a) => a.id);
        }
        const finalName = (base) => installedSkillName(row, base, b.prefix, b.sep);
        const results = [];
        let ok = 0;
        for (const agent of requested) {
          for (const item of items) {
            const sourceDir = path.join(row.clone_path || cloneDirFor(row.full_name), path.dirname(item.path));
            try {
              const r = await installSkill(sourceDir, agent, finalName(item.name));
              db.prepare(
                `INSERT INTO installed_items (agent, name, repo_id, path, installed_at)
                 VALUES (?, ?, ?, ?, datetime('now'))
                 ON CONFLICT(agent, name) DO UPDATE SET repo_id = excluded.repo_id, path = excluded.path, installed_at = datetime('now')`
              ).run(agent, r.name, row.id, item.path);
              results.push({ skill: r.name, agent, ok: true, target: r.target, changed: r.changed });
              ok++;
            } catch (e) {
              results.push({ skill: finalName(item.name), agent, ok: false, error: e.message });
            }
          }
        }
        return send(res, 200, {
          repo: row.full_name,
          skills: items.map((i) => finalName(i.name)),
          agents: requested,
          total: results.length,
          ok,
          failed: results.filter((r) => !r.ok),
          results,
        });
      }
    }

    /* 批量 clone：按同步的 clone 标记拉取缺失仓库 */
    if (method === 'POST' && p === '/api/clone-all') {
      const rows = db.prepare("SELECT id, full_name, clone_path FROM skills WHERE cloned = 1").all();
      let ok = 0, skipped = 0;
      const failed = [];
      const results = [];
      for (const row of rows) {
        const dir = row.clone_path || cloneDirFor(row.full_name);
        if (fs.existsSync(dir) && fs.existsSync(path.join(dir, '.git'))) {
          skipped++;
          results.push({ full_name: row.full_name, status: 'skipped' });
          continue;
        }
        try {
          await doClone(row.full_name, dir);
          db.prepare("UPDATE skills SET cloned = 1, clone_path = ?, updated_at = datetime('now') WHERE id = ?").run(dir, row.id);
          ok++;
          results.push({ full_name: row.full_name, status: 'cloned' });
        } catch (e) {
          failed.push({ full_name: row.full_name, error: e.message.split('\n')[0] });
          results.push({ full_name: row.full_name, status: 'failed', error: e.message.split('\n')[0] });
        }
      }
      return send(res, 200, { total: rows.length, ok, skipped, failed, results });
    }

    /* agents 列表（含本机安装探测） */
    if (method === 'GET' && p === '/api/agents') {
      const prefs = new Map(db.prepare('SELECT agent, enabled FROM agent_prefs').all().map((r) => [r.agent, !!r.enabled]));
      const agents = getAgents().map((agent) => ({
        ...agent,
        enabled: prefs.has(agent.id) ? prefs.get(agent.id) : true,
      }));
      return send(res, 200, { agents, home: AGENTS_HOME });
    }

    /* agent 启用偏好 */
    const agentPrefMatch = p.match(/^\/api\/agents\/([a-z0-9-]+)$/);
    if (method === 'PATCH' && agentPrefMatch) {
      const id = agentPrefMatch[1];
      try { findAgent(id); } catch { return send(res, 404, { error: '未知 agent' }); }
      const b = await readBody(req);
      if (typeof b.enabled !== 'boolean') return send(res, 400, { error: 'enabled 必须是布尔值' });
      db.prepare(
        `INSERT INTO agent_prefs (agent, enabled) VALUES (?, ?)
         ON CONFLICT(agent) DO UPDATE SET enabled = excluded.enabled`
      ).run(id, b.enabled ? 1 : 0);
      return send(res, 200, { agent: id, enabled: b.enabled });
    }

    /* 已安装 skills 列表（各 agent） */
    if (method === 'GET' && p === '/api/installed') {
      const agent = url.searchParams.get('agent') || '';
      const items = agent ? listInstalled(agent) : listAllInstalled();
      const srcRows = db.prepare('SELECT agent, name, repo_id, path FROM installed_items').all();
      const srcMap = new Map(srcRows.map((r) => [`${r.agent}:${r.name}`, { repo_id: r.repo_id, path: r.path }]));
      const enriched = items.map((it) => {
        const src = srcMap.get(`${it.agent}:${it.name}`);
        const repoRow = src ? db.prepare('SELECT full_name FROM skills WHERE id = ?').get(src.repo_id) : null;
        return {
          ...it,
          repo_id: src?.repo_id ?? null,
          path: src?.path ?? null,
          repo: repoRow?.full_name ?? null,
        };
      });
      return send(res, 200, { items: enriched });
    }

    /* 安装 / 更新 skill 到某 agent */
    if (method === 'POST' && (p === '/api/skills/items/install' || p === '/api/skills/items/update')) {
      const b = await readBody(req);
      const row = db.prepare('SELECT id, full_name, clone_path FROM skills WHERE id = ? AND cloned = 1').get(Number(b.repo_id || 0));
      if (!row) return send(res, 404, { error: '仓库不存在或未 clone' });
      const cloneRoot = row.clone_path || cloneDirFor(row.full_name);
      const rel = String(b.path || '').replace(/\\/g, '/');
      if (!rel || !rel.toLowerCase().endsWith('skill.md')) return send(res, 400, { error: 'path 必须是 SKILL.md 路径' });
      const sourceDir = path.resolve(cloneRoot, path.dirname(rel));
      if (!sourceDir.startsWith(cloneRoot + path.sep)) return send(res, 400, { error: 'invalid path' });
      if (!fs.existsSync(path.join(sourceDir, 'SKILL.md')) && !fs.existsSync(path.join(sourceDir, 'skill.md'))) {
        return send(res, 400, { error: `源目录缺少 SKILL.md: ${rel}` });
      }
      try {
        const agent = String(b.agent || '');
        const scanned = scanRepoItems(row).find((item) => item.path === rel);
        const baseName = sanitizeName(scanned ? scanned.name : path.basename(sourceDir));
        let nameOverride = baseName;
        if (p === '/api/skills/items/update') {
          const installed = db.prepare(
            'SELECT name FROM installed_items WHERE agent = ? AND repo_id = ? AND path = ? ORDER BY id DESC LIMIT 1'
          ).get(agent, row.id, rel);
          if (installed) nameOverride = installed.name;
        } else if (b.prefix) {
          nameOverride = installedSkillName(row, baseName, true, b.sep);
        }
        const result = await installSkill(sourceDir, agent, nameOverride);
        // 记录安装来源（用于后续追溯/更新/diff）
        db.prepare(
          `INSERT INTO installed_items (agent, name, repo_id, path, installed_at)
           VALUES (?, ?, ?, ?, datetime('now'))
           ON CONFLICT(agent, name) DO UPDATE SET repo_id = excluded.repo_id, path = excluded.path, installed_at = datetime('now')`
        ).run(agent, result.name, row.id, rel);
        return send(res, 200, { ...result, repo: row.full_name });
      } catch (e) {
        return send(res, 500, { error: e.message });
      }
    }

    /* 卸载已安装 skill */
    if (method === 'POST' && p === '/api/skills/items/uninstall') {
      const b = await readBody(req);
      try {
        const r = uninstallSkill(String(b.agent || ''), String(b.name || ''));
        db.prepare('DELETE FROM installed_items WHERE agent = ? AND name = ?').run(String(b.agent), String(b.name || ''));
        return send(res, 200, r);
      } catch (e) {
        return send(res, 500, { error: e.message });
      }
    }

    /* diff：源 skill vs 已安装 */
    if (method === 'POST' && p === '/api/skills/items/diff') {
      const b = await readBody(req);
      const row = db.prepare('SELECT id, full_name, clone_path FROM skills WHERE id = ? AND cloned = 1').get(Number(b.repo_id || 0));
      if (!row) return send(res, 404, { error: '仓库不存在或未 clone' });
      const cloneRoot = row.clone_path || cloneDirFor(row.full_name);
      const rel = String(b.path || '').replace(/\\/g, '/');
      const sourceDir = path.resolve(cloneRoot, path.dirname(rel));
      if (!sourceDir.startsWith(cloneRoot + path.sep)) return send(res, 400, { error: 'invalid path' });
      const agent = String(b.agent || '');
      const installed = db.prepare(
        'SELECT name FROM installed_items WHERE agent = ? AND repo_id = ? AND path = ? ORDER BY id DESC LIMIT 1'
      ).get(agent, row.id, rel);
      const target = agentSkillDir(agent, installed?.name || path.basename(sourceDir));
      if (!fs.existsSync(target)) return send(res, 200, { installed: false, diff: null });
      const diff = await diffDirs(sourceDir, target);
      return send(res, 200, { installed: true, diff });
    }

    /* 统计 */
    if (method === 'GET' && p === '/api/stats') {
      const total = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(stars),0) s FROM skills').get();
      const official = db.prepare("SELECT COUNT(*) n FROM skills WHERE tags LIKE '%official%'").get();
      const zh = db.prepare("SELECT COUNT(*) n FROM skills WHERE tags LIKE '%zh%'").get();
      const cloned = db.prepare('SELECT COUNT(*) n FROM skills WHERE cloned = 1').get();
      return send(res, 200, {
        total: total.n, total_stars: total.s,
        official: official.n, zh: zh.n, cloned: cloned.n,
        registry: REGISTRY,
      });
    }

    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  console.log(`[server] registry: ${REGISTRY}`);
  console.log(`[server] db: ${DB_PATH}`);
});
