// diff 文件级状态全覆盖验证：added / modified / deleted（fake home :8788）
const BASE = 'http://localhost:8788';
const fs = await import('node:fs');
const srcDir = '/Users/lkc/Code/skills-registry/antfu-skills/skills/antfu';
const SKILL = srcDir + '/SKILL.md';
const EXTRA = srcDir + '/EXTRA.md';

async function call(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return res.json();
}
const results = [];
const check = (n, c) => { results.push([n, c]); console.log((c ? 'PASS' : 'FAIL') + ' | ' + n); };

// 清理残留 + 安装 antfu 到 claude-code
await call('/api/skills/items/uninstall', { agent: 'claude-code', name: 'antfu' });
const ins = await call('/api/skills/items/install', { repo_id: 95, path: 'skills/antfu/SKILL.md', agent: 'claude-code' });
check('安装 antfu 成功', ins.name === 'antfu' && ins.existed === false);

// 1) 源新增文件 → diff added
const origExtra = fs.existsSync(EXTRA) ? fs.readFileSync(EXTRA, 'utf8') : null;
fs.writeFileSync(EXTRA, '# extra\n');
let d = await call('/api/skills/items/diff', { repo_id: 95, path: 'skills/antfu/SKILL.md', agent: 'claude-code' });
check('新增文件 → added', d.diff.some((x) => x.path === 'EXTRA.md' && x.status === 'added'));

// 2) update 同步 → 全 same + 文件到达安装目录
await call('/api/skills/items/update', { repo_id: 95, path: 'skills/antfu/SKILL.md', agent: 'claude-code' });
d = await call('/api/skills/items/diff', { repo_id: 95, path: 'skills/antfu/SKILL.md', agent: 'claude-code' });
check('update 后 diff 全 same', d.diff.every((x) => x.status === 'same'));
check('新增文件已同步到安装目录', fs.existsSync('/tmp/fake-home/.claude/skills/antfu/EXTRA.md'));

// 3) 修改源 SKILL.md → diff modified
const origSkill = fs.readFileSync(SKILL, 'utf8');
fs.writeFileSync(SKILL, origSkill + '\n<!-- diff-test -->\n');
d = await call('/api/skills/items/diff', { repo_id: 95, path: 'skills/antfu/SKILL.md', agent: 'claude-code' });
check('修改文件 → modified', d.diff.some((x) => x.path === 'SKILL.md' && x.status === 'modified'));

// 4) 删除源文件 → diff deleted
fs.rmSync(EXTRA, { force: true });
d = await call('/api/skills/items/diff', { repo_id: 95, path: 'skills/antfu/SKILL.md', agent: 'claude-code' });
check('删除文件 → deleted', d.diff.some((x) => x.path === 'EXTRA.md' && x.status === 'deleted'));

// 还原源文件 + 清理
fs.writeFileSync(SKILL, origSkill);
if (origExtra === null) fs.rmSync(EXTRA, { force: true }); else fs.writeFileSync(EXTRA, origExtra);
await call('/api/skills/items/uninstall', { agent: 'claude-code', name: 'antfu' });
check('源文件已还原', !fs.existsSync(EXTRA) && fs.readFileSync(SKILL, 'utf8') === origSkill);
check('安装目录已清理', !fs.existsSync('/tmp/fake-home/.claude/skills/antfu'));

const failed = results.filter(([, c]) => !c).length;
console.log('\n共 ' + results.length + ' 项，失败 ' + failed + ' 项');
process.exit(failed ? 1 : 0);
