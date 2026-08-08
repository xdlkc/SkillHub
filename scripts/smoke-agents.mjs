// 后端安装流程冒烟测试（fake home 后端 :8788）
const BASE = 'http://localhost:8788';
async function call(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  return { status: res.status, body: await res.json() };
}

const results = [];
const check = (n, c) => { results.push([n, c]); console.log((c ? 'PASS' : 'FAIL') + ' | ' + n); };

// agents 探测
const ag = await call('/api/agents');
check('agents 接口返回', ag.status === 200 && ag.body.agents.length >= 10);
check('fake home 无已安装 agent', ag.body.agents.every((a) => !a.installed));

// install
const ins = await call('/api/skills/items/install', { method: 'POST', body: JSON.stringify({ repo_id: 5, path: 'skills/frontend-design/SKILL.md', agent: 'claude-code' }) });
check('install 成功', ins.status === 200 && ins.body.name === 'frontend-design');
check('install 目标路径在 fake home', ins.body.target.includes('/tmp/fake-home/.claude/skills/frontend-design'));
check('install 标记为新增', ins.body.changed === true && ins.body.existed === false);

// installed 列表
const list = await call('/api/installed');
check('installed 列表含 frontend-design', list.body.items.some((i) => i.name === 'frontend-design' && i.agent === 'claude-code'));

// 再次 install（已存在 → 覆盖 + diff 全 same）
const re = await call('/api/skills/items/install', { method: 'POST', body: JSON.stringify({ repo_id: 5, path: 'skills/frontend-design/SKILL.md', agent: 'claude-code' }) });
check('重复 install 标记 existed', re.body.existed === true);
check('重复 install diff 全 same', re.body.diff.every((d) => d.status === 'same'));

// diff（未修改 → same）
const df = await call('/api/skills/items/diff', { method: 'POST', body: JSON.stringify({ repo_id: 5, path: 'skills/frontend-design/SKILL.md', agent: 'claude-code' }) });
check('diff 返回 installed', df.body.installed === true);
check('diff 无差异', df.body.diff.every((d) => d.status === 'same'));

// 修改源文件 → diff 显示 modified
const fs = await import('node:fs');
const src = '/Users/lkc/Code/skills-registry/anthropics-skills/skills/frontend-design/SKILL.md';
const orig = fs.readFileSync(src, 'utf8');
fs.writeFileSync(src, orig + '\n\n<!-- smoke-test-edit -->\n');
const df2 = await call('/api/skills/items/diff', { method: 'POST', body: JSON.stringify({ repo_id: 5, path: 'skills/frontend-design/SKILL.md', agent: 'claude-code' }) });
check('diff 检测到修改', df2.body.diff.some((d) => d.status === 'modified'));

// update 覆盖
const up = await call('/api/skills/items/update', { method: 'POST', body: JSON.stringify({ repo_id: 5, path: 'skills/frontend-design/SKILL.md', agent: 'claude-code' }) });
check('update 成功', up.status === 200 && up.body.existed === true);
const instContent = fs.readFileSync('/tmp/fake-home/.claude/skills/frontend-design/SKILL.md', 'utf8');
check('update 已同步修改', instContent.includes('smoke-test-edit'));
// 还原源文件
fs.writeFileSync(src, orig);

// uninstall
const un = await call('/api/skills/items/uninstall', { method: 'POST', body: JSON.stringify({ agent: 'claude-code', name: 'frontend-design' }) });
check('uninstall 成功', un.status === 200 && un.body.removed === true);
const after = await call('/api/installed');
check('uninstall 后列表为空', !after.body.items.some((i) => i.name === 'frontend-design'));

// 安全校验：非法 agent
const bad = await call('/api/skills/items/install', { method: 'POST', body: JSON.stringify({ repo_id: 5, path: 'skills/frontend-design/SKILL.md', agent: '../evil' }) });
check('非法 agent 被拒绝', bad.status === 500);

const failed = results.filter(([, c]) => !c).length;
console.log('\n共 ' + results.length + ' 项，失败 ' + failed + ' 项');
process.exit(failed ? 1 : 0);
