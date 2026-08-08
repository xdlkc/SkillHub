// Skills 安装/更新/diff/卸载 UI 端到端测试（fake home :5174 → :8788）
import { chromium } from 'file:///Users/lkc/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';

const browser = await chromium.launch({ executablePath: '/Users/lkc/Library/Caches/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-mac-x64/chrome-headless-shell' });
const page = await browser.newPage();
const results = [];
const check = (n, c) => { results.push([n, c]); console.log((c ? 'PASS' : 'FAIL') + ' | ' + n); };
// 点击前注册 toast 捕获（toast 只显示 2.2s）
const expectToast = (re) => {
  const p = page.waitForFunction((r) => {
    const el = document.querySelector('.toast');
    return el && el.classList.contains('show') && new RegExp(r).test(el.textContent || '') ? el.textContent : null;
  }, re, { timeout: 15000 }).then((h) => h.jsonValue()).catch(() => null);
  return { p, assert: async (label) => check(label, (await p) !== null) };
};

try {
  // 清理残留：卸载所有已安装的 frontend-design
  const instAll = await fetch('http://localhost:8788/api/installed').then((r) => r.json());
  for (const it of instAll.items.filter((i) => i.name === 'frontend-design')) {
    await fetch('http://localhost:8788/api/skills/items/uninstall', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: it.agent, name: it.name }),
    });
  }

  await page.goto('http://localhost:5174/#/skills', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.skill-item', { timeout: 8000 });

  /* 安装 */
  const t1 = expectToast(/已安装 frontend-design → Claude Code/);
  await page.locator('.skill-item', { hasText: 'frontend-design' }).first().locator('.op.clone').click();
  await page.waitForSelector('.agent-row', { timeout: 6000 });
  check('AgentModal 列出 agents(>=10)', (await page.locator('.agent-row').count()) >= 10);
  await page.locator('.agent-row', { hasText: 'Claude Code' }).locator('.agent-name').click();
  await t1.assert('安装成功 toast');
  const tagEl = page.locator('.skill-item', { hasText: 'frontend-design' }).first().locator('.clone-tag');
  await tagEl.waitFor({ state: 'visible', timeout: 6000 });
  check('行内已安装徽章(claude-code)', ((await tagEl.textContent().catch(() => '')) ?? '').includes('claude-code'));

  /* 展开 + diff（应一致） */
  await page.waitForTimeout(600);
  const nameEl = page.locator('.skill-item', { hasText: 'frontend-design' }).first().locator('.skill-name');
  await nameEl.scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const items = document.querySelectorAll('.skill-item');
    for (const el of items) {
      if (el.textContent.includes('frontend-design')) {
        const name = el.querySelector('.skill-name');
        if (name) name.click();
        break;
      }
    }
  });
  await page.waitForTimeout(500);
  const diag = await page.evaluate(() => ({
    detail: document.querySelectorAll('.skill-detail').length,
    modal: document.querySelectorAll('.overlay').length,
    items: document.querySelectorAll('.skill-item').length,
  }));
  console.log('[diag] after eval click:', JSON.stringify(diag));
  await page.waitForSelector('.skill-detail', { state: 'attached', timeout: 6000 });
  await page.locator('.installed-agent .op[title="查看 diff"]').click({ force: true });
  await page.waitForSelector('.diff-panel', { timeout: 6000 });
  check('diff 显示完全一致', (await page.locator('.diff-summary').textContent()).includes('完全一致'));

  /* 改源 → diff 有差异 */
  const { execFileSync } = await import('node:child_process');
  const fs = await import('node:fs');
  const src = '/Users/lkc/Code/skills-registry/anthropics-skills/skills/frontend-design/SKILL.md';
  const orig = fs.readFileSync(src, 'utf8');
  fs.writeFileSync(src, orig + '\n\n<!-- ui-test-edit -->\n');
  await page.locator('.installed-agent .op[title="查看 diff"]').click({ force: true });
  await page.waitForFunction(() => !!document.querySelector('.diff-changed'), null, { timeout: 8000 });
  check('修改后 diff 显示有差异', true);

  /* 更新 */
  const t2 = expectToast(/已更新 frontend-design → claude-code/);
  await page.locator('.installed-agent .op.clone').click({ force: true });
  await t2.assert('更新成功 toast');
  check('本地文件已同步', fs.readFileSync('/tmp/fake-home/.claude/skills/frontend-design/SKILL.md', 'utf8').includes('ui-test-edit'));
  fs.writeFileSync(src, orig);

  /* 卸载 */
  const t3 = expectToast(/已卸载 frontend-design ← claude-code/);
  await page.locator('.installed-agent .op.del').click({ force: true });
  await t3.assert('卸载成功 toast');
  await page.waitForTimeout(500);
  check('卸载后徽章消失', (await page.locator('.skill-item', { hasText: 'frontend-design' }).first().locator('.clone-tag').count()) === 0);
  await page.screenshot({ path: '/tmp/ui-install-final.png' });
} catch (e) {
  console.log('ERROR:', e.message);
  results.push(['脚本异常', false]);
}
await browser.close();
const failed = results.filter(([, c]) => !c).length;
console.log('\n共 ' + results.length + ' 项，失败 ' + failed + ' 项');
process.exit(failed ? 1 : 0);
