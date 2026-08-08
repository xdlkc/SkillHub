/**
 * sync.mjs —— 列表数据同步（git 友好载体：data/skills.json）
 *
 *   npm run export          db → skills.json（修改列表后执行，然后 git push）
 *   npm run import          skills.json → db（新电脑/对端 git pull 后执行，upsert 不删本地）
 *   npm run import -- --prune  以 json 为准，删除 db 中 json 没有的条目
 *
 * skills.json 只含共享元数据（full_name/stars/desc/lang/url/tags），
 * 不含本地状态（cloned/clone_path/created_at 等），避免跨机冲突。
 */
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

process.removeAllListeners('warning');

const DB_PATH = path.join(import.meta.dirname, '..', 'data', 'skills.db');
const JSON_PATH = path.join(import.meta.dirname, '..', 'data', 'skills.json');
const VERSION = 1;

function openDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
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
  `);
  return db;
}

function parseTags(s) {
  try { const a = JSON.parse(s); return Array.isArray(a) ? a : []; } catch { return []; }
}

function exportJson(db) {
  const rows = db.prepare('SELECT full_name, stars, desc, lang, url, tags, cloned FROM skills ORDER BY stars DESC').all();
  const skills = rows.map((r) => ({
    full_name: r.full_name,
    stars: r.stars,
    desc: r.desc,
    lang: r.lang,
    url: r.url,
    tags: parseTags(r.tags),
    cloned: !!r.cloned,
  }));
  const payload = { version: VERSION, exported_at: new Date().toISOString(), skills };
  fs.writeFileSync(JSON_PATH, JSON.stringify(payload, null, 2) + '\n');
  return skills.length;
}

function importJson(db, { prune = false } = {}) {
  if (!fs.existsSync(JSON_PATH)) {
    console.error(`未找到 ${JSON_PATH}，请先 npm run export 或 clone 项目`);
    process.exit(1);
  }
  const payload = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  if (payload.version !== VERSION) {
    console.error(`版本不匹配：json=${payload.version}，期望=${VERSION}`);
    process.exit(1);
  }
  const skills = payload.skills ?? [];
  const existing = new Set(db.prepare('SELECT full_name FROM skills').all().map((r) => r.full_name));
  const upsert = db.prepare(
    `INSERT INTO skills (full_name, stars, desc, lang, url, tags, cloned, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(full_name) DO UPDATE SET
       stars = excluded.stars, desc = excluded.desc, lang = excluded.lang,
       url = excluded.url, tags = excluded.tags, updated_at = datetime('now')`
  );
  const setClone = db.prepare(
    "UPDATE skills SET cloned = ?, clone_path = COALESCE(NULLIF(clone_path,''), ?), updated_at = datetime('now') WHERE full_name = ?"
  );
  let added = 0, updated = 0, clonedMarked = 0;
  const names = new Set();
  for (const s of skills) {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s.full_name || '')) continue;
    names.add(s.full_name);
    if (existing.has(s.full_name)) updated++; else added++;
    upsert.run(
      s.full_name,
      Number(s.stars) || 0,
      String(s.desc || ''),
      String(s.lang || ''),
      String(s.url || `https://github.com/${s.full_name}`),
      JSON.stringify(Array.isArray(s.tags) ? s.tags : []),
      s.cloned ? 1 : 0
    );
    if (s.cloned) {
      // 同步 clone 标记 + 约定路径（~/Code/skills-registry/{owner}-{repo}）
      const dir = path.join(
        process.env.SKILLS_REGISTRY || path.join(os.homedir(), 'Code', 'skills-registry'),
        s.full_name.replace('/', '-')
      );
      setClone.run(1, dir, s.full_name);
      clonedMarked++;
    }
  }
  if (prune) {
    const before = db.prepare('SELECT COUNT(*) n FROM skills').get().n;
    if (names.size > 0) {
      const placeholders = [...names].map(() => '?').join(',');
      db.prepare(`DELETE FROM skills WHERE full_name NOT IN (${placeholders})`).run(...names);
    }
    const after = db.prepare('SELECT COUNT(*) n FROM skills').get().n;
    console.log(`prune: ${before - after} 条已删除`);
  }
  const total = db.prepare('SELECT COUNT(*) n FROM skills').get().n;
  console.log(`import 完成：新增 ${added}、更新 ${updated}，标记 clone ${clonedMarked} 个 → db 共 ${total} 条`);
  console.log('提示: 已标记 clone 的仓库如需拉取文件，执行 npm run clone-all 批量克隆');
  return { total };
}

const cmd = process.argv[2] || '';
const prune = process.argv.includes('--prune');

if (cmd === 'export') {
  const db = openDb();
  const n = exportJson(db);
  console.log(`export 完成：${n} 条 → data/skills.json`);
  console.log('接下来: git add data/skills.json && git commit -m "sync" && git push');
} else if (cmd === 'import') {
  const db = openDb();
  importJson(db, { prune });
} else {
  console.log('用法: npm run export | npm run import [-- --prune]');
}
