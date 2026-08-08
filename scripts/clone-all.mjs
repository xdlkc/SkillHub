/**
 * clone-all.mjs —— 按同步的 clone 标记批量拉取缺失仓库
 * 用法: npm run clone-all（新电脑 import 后执行；已有目录自动跳过）
 */
import { DatabaseSync } from 'node:sqlite';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

process.removeAllListeners('warning');
const exec = promisify(execFile);

const DB_PATH = path.join(import.meta.dirname, '..', 'data', 'skills.db');
const REGISTRY = process.env.SKILLS_REGISTRY || path.join(os.homedir(), 'Code', 'skills-registry');
const FULLNAME_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const cloneDirFor = (fullName) => path.join(REGISTRY, fullName.replace('/', '-'));

fs.mkdirSync(REGISTRY, { recursive: true });
const db = new DatabaseSync(DB_PATH);

const rows = db.prepare("SELECT id, full_name, clone_path FROM skills WHERE cloned = 1").all();
let ok = 0, skipped = 0;
const failed = [];
console.log(`[clone-all] 待处理 ${rows.length} 个已标记仓库 → ${REGISTRY}\n`);

for (const row of rows) {
  const dir = row.clone_path || cloneDirFor(row.full_name);
  if (!FULLNAME_RE.test(row.full_name)) { failed.push({ full_name: row.full_name, error: '非法仓库名' }); continue; }
  if (fs.existsSync(dir) && fs.existsSync(path.join(dir, '.git'))) {
    skipped++;
    console.log(`  · 已存在 ${row.full_name}（跳过）`);
    continue;
  }
  try {
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    await exec('git', ['clone', '--depth', '1', `https://github.com/${row.full_name}.git`, dir], {
      timeout: 180000, maxBuffer: 8 * 1024 * 1024,
    });
    db.prepare("UPDATE skills SET cloned = 1, clone_path = ?, updated_at = datetime('now') WHERE id = ?").run(dir, row.id);
    ok++;
    console.log(`  ✓ ${row.full_name}`);
  } catch (e) {
    failed.push({ full_name: row.full_name, error: e.message.split('\n')[0] });
    console.log(`  ✗ ${row.full_name}: ${e.message.split('\n')[0]}`);
  }
}

console.log(`\n[clone-all] 完成：新克隆 ${ok}，跳过 ${skipped}，失败 ${failed.length}`);
if (failed.length) {
  console.log('失败列表:');
  for (const f of failed) console.log(`  - ${f.full_name}: ${f.error}`);
}
process.exit(failed.length ? 1 : 0);
