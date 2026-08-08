/**
 * seed —— 导入初始 115 条 skill 数据（幂等，INSERT OR IGNORE + 补标签）
 * 用法: npm run seed
 */
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

process.removeAllListeners('warning');

const DB_PATH = path.join(import.meta.dirname, '..', 'data', 'skills.db');
const SEED_PATH = path.join(import.meta.dirname, '..', 'data', 'skills-seed.json');
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

/* 与前端一致的标签计算逻辑 */
const officialOwners = new Set(["anthropics","openai","google","huggingface","github","android","microsoft","NVIDIA","MiniMax-AI","vercel-labs","VoltAgent","browser-act","google-labs-code","larksuite","agentskills","trailofbits"]);
const cjk = /[\u4e00-\u9fa5]/;
function computeTags(r) {
  const d = (r.desc || "").toLowerCase();
  const t = [];
  if (officialOwners.has(r.full_name.split("/")[0])) t.push("official");
  if (/collection|curated|awesome|集合|合集|library|catalog|目录/i.test(d) || /^awesome/i.test(r.full_name)) t.push("collection");
  if (/security|cybersecurity|reverse|penetration|vulnerab/i.test(d)) t.push("security");
  if (/research|academic|scientific|science|paper|科研|学术|nature/i.test(d)) t.push("research");
  if (/design|ppt|slide|illustration|ui|canvas|设计|幻灯片/i.test(d)) t.push("design");
  if (/tool|manager|scanner|loader|cli|package|registry|installer|framework/i.test(d)) t.push("tool");
  if (/notebooklm|obsidian|n8n|gsap|cad|browser|seo|marketing|game|memory/i.test(d)) t.push("domain");
  if (cjk.test(r.desc || "")) t.push("zh");
  return t.length ? t : ["tool"];
}

const list = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
const insertStmt = db.prepare(
  `INSERT OR IGNORE INTO skills (full_name, stars, desc, lang, url, tags)
   VALUES (?, ?, ?, ?, ?, ?)`
);
let inserted = 0, tagged = 0;
for (const r of list) {
  const tags = JSON.stringify(computeTags(r));
  const info = insertStmt.run(r.full_name, r.stars || 0, r.desc || '', r.lang || '', r.url || `https://github.com/${r.full_name}`, tags);
  inserted += info.changes;
  const up = db.prepare("UPDATE skills SET tags = ?, updated_at = datetime('now') WHERE full_name = ? AND (tags = '[]' OR tags = '')").run(tags, r.full_name);
  tagged += up.changes;
}
const total = db.prepare('SELECT COUNT(*) n FROM skills').get().n;
const withTags = db.prepare("SELECT COUNT(*) n FROM skills WHERE tags != '[]'").get().n;
console.log(`seed 完成: 新增 ${inserted} 条，补标签 ${tagged} 条，当前共 ${total} 条（带标签 ${withTags}）`);
