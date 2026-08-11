# Metadata Auto-Sync Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a default-off, SQLite-persisted switch that controls only the existing `data/skills.json` export/commit/push flow, with environment-variable locking and an independent Settings page.

**Architecture:** Move effective-state resolution and debounce cancellation into a focused backend controller. `server/index.mjs` remains responsible for SQLite schema, HTTP routes, JSON export, and Git commands; React reads and changes the normalized setting through two API calls. The switch never scans or pushes cloned skill source repositories, and manual `npm run export` remains unchanged.

**Tech Stack:** Node.js 22 (`node:http`, `node:sqlite`, `node:test`), React 18, TypeScript, Vite, hand-written CSS.

---

## File map

- Create `server/auto-sync.mjs`: resolve environment/SQLite state, persist changes, debounce work, and cancel pending work when disabled.
- Modify `server/index.mjs`: create `app_settings`, wire the controller, expose settings APIs, and allow a test-only database path override.
- Create `test/auto-sync.test.mjs`: deterministic controller unit tests with an in-memory SQLite database and fake timer.
- Create `test/settings-api.test.mjs`: real HTTP tests against an isolated temporary SQLite database.
- Modify `package.json`: add the permanent Node test command.
- Modify `src/types.ts`: define the normalized settings response types.
- Modify `src/api.ts`: add settings GET/PATCH client methods.
- Modify `src/router.ts`: add the `settings` hash route, label, and active tab.
- Create `src/components/SettingsView.tsx`: render loading/error/locked states, confirmation, switch, and result handling.
- Modify `src/App.tsx`: add Settings navigation and page composition.
- Modify `src/styles.css`: style the setting card and accessible switch.
- Modify `README.md`: document default-off behavior, UI control, override semantics, and scope.
- Modify `src/components/DocsView.tsx`: document the Settings page and APIs.

### Task 1: Build the testable auto-sync controller

**Files:**
- Create: `server/auto-sync.mjs`
- Create: `test/auto-sync.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add the Node test command**

Add this script to `package.json`:

```json
"test": "node --test test/*.test.mjs"
```

- [ ] **Step 2: Write the failing controller tests**

Create `test/auto-sync.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createAutoSyncController } from '../server/auto-sync.mjs';

function createDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}

function createHarness({ envValue } = {}) {
  const db = createDb();
  let pending = null;
  let cancelled = 0;
  let exports = 0;
  let pushes = 0;
  const controller = createAutoSyncController({
    db,
    envValue,
    exportNow: () => { exports += 1; return true; },
    pushNow: async () => { pushes += 1; },
    schedule: (fn) => { pending = fn; return fn; },
    cancel: () => { cancelled += 1; pending = null; },
  });
  return {
    db,
    controller,
    cancelled: () => cancelled,
    exports: () => exports,
    pushes: () => pushes,
    runPending: async () => {
      const fn = pending;
      pending = null;
      if (fn) await fn();
    },
  };
}

test('defaults to disabled when neither SQLite nor AUTO_SYNC selects a value', () => {
  const { controller } = createHarness();
  assert.deepEqual(controller.getState(), {
    enabled: false,
    locked: false,
    source: 'default',
  });
});

test('persists enabled and disabled values in SQLite', () => {
  const { controller, db } = createHarness();
  assert.deepEqual(controller.setEnabled(true), {
    enabled: true,
    locked: false,
    source: 'database',
  });
  assert.equal(db.prepare("SELECT value FROM app_settings WHERE key = 'metadata_auto_sync'").get().value, '1');
  assert.equal(controller.setEnabled(false).enabled, false);
  assert.equal(db.prepare("SELECT value FROM app_settings WHERE key = 'metadata_auto_sync'").get().value, '0');
});

test('AUTO_SYNC on and off override SQLite and lock writes', () => {
  for (const [envValue, expected] of [['on', true], ['off', false]]) {
    const { controller } = createHarness({ envValue });
    assert.deepEqual(controller.getState(), {
      enabled: expected,
      locked: true,
      source: 'environment',
    });
    assert.throws(
      () => controller.setEnabled(!expected),
      (error) => error.code === 'AUTO_SYNC_LOCKED'
    );
  }
});

test('unknown AUTO_SYNC values fall back to the database/default policy', () => {
  const { controller } = createHarness({ envValue: 'yes' });
  assert.equal(controller.getState().source, 'default');
  assert.equal(controller.getState().enabled, false);
});

test('only schedules export and push after the setting is enabled', async () => {
  const h = createHarness();
  h.controller.markDirty();
  await h.runPending();
  assert.equal(h.exports(), 0);
  assert.equal(h.pushes(), 0);

  h.controller.setEnabled(true);
  h.controller.markDirty();
  await h.runPending();
  assert.equal(h.exports(), 1);
  assert.equal(h.pushes(), 1);
});

test('disabling cancels pending debounce work and drops the dirty flag', async () => {
  const h = createHarness();
  h.controller.setEnabled(true);
  h.controller.markDirty();
  h.controller.setEnabled(false);
  assert.equal(h.cancelled(), 1);
  await h.runPending();
  assert.equal(h.exports(), 0);
  assert.equal(h.pushes(), 0);

  h.controller.setEnabled(true);
  await h.runPending();
  assert.equal(h.exports(), 0, 're-enabling must not restore cancelled work');
});
```

- [ ] **Step 3: Run the test to verify RED**

Run: `node --test --test-name-pattern='defaults to disabled' test/auto-sync.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `server/auto-sync.mjs`.

- [ ] **Step 4: Implement the minimal controller**

Create `server/auto-sync.mjs`:

```js
const SETTING_KEY = 'metadata_auto_sync';

function environmentState(value) {
  if (value === 'on') return { enabled: true, locked: true, source: 'environment' };
  if (value === 'off') return { enabled: false, locked: true, source: 'environment' };
  return null;
}

function lockedError() {
  const error = new Error('AUTO_SYNC 环境变量已锁定该设置，请修改环境变量后重启服务');
  error.code = 'AUTO_SYNC_LOCKED';
  return error;
}

export function createAutoSyncController({
  db,
  envValue,
  exportNow,
  pushNow,
  delay = 2500,
  schedule = setTimeout,
  cancel = clearTimeout,
}) {
  let timer = null;
  let dirty = false;

  function getState() {
    const forced = environmentState(envValue);
    if (forced) return forced;
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(SETTING_KEY);
    if (!row) return { enabled: false, locked: false, source: 'default' };
    return { enabled: row.value === '1', locked: false, source: 'database' };
  }

  function cancelPending() {
    if (timer !== null) cancel(timer);
    timer = null;
    dirty = false;
  }

  function setEnabled(enabled) {
    if (environmentState(envValue)) throw lockedError();
    db.prepare(`
      INSERT INTO app_settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(SETTING_KEY, enabled ? '1' : '0');
    if (!enabled) cancelPending();
    return getState();
  }

  function markDirty() {
    if (!getState().enabled) return;
    dirty = true;
    if (timer !== null) cancel(timer);
    timer = schedule(async () => {
      timer = null;
      if (!dirty) return;
      if (!getState().enabled) {
        dirty = false;
        return;
      }
      dirty = false;
      if (!exportNow()) return;
      await pushNow();
    }, delay);
  }

  return { getState, setEnabled, markDirty, cancelPending };
}
```

- [ ] **Step 5: Run the controller suite to verify GREEN**

Run: `node --test test/auto-sync.test.mjs`

Expected: 6 tests pass; no export or push is called in default-off and cancellation cases.

- [ ] **Step 6: Commit the controller**

```bash
git add package.json server/auto-sync.mjs test/auto-sync.test.mjs
git commit -m "feat: add persisted auto-sync controller"
```

### Task 2: Wire SQLite, HTTP APIs, and the existing Git flow

**Files:**
- Modify: `server/index.mjs:17-135`
- Modify: `server/index.mjs:285-310`
- Create: `test/settings-api.test.mjs`

- [ ] **Step 1: Write the failing HTTP integration tests**

Create `test/settings-api.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

async function freePort() {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  probe.close();
  await once(probe, 'close');
  return port;
}

async function startServer({ dbPath, registry, autoSync }) {
  const port = await freePort();
  const env = {
    ...process.env,
    PORT: String(port),
    SKILLS_DB_PATH: dbPath,
    SKILLS_REGISTRY: registry,
  };
  delete env.AUTO_SYNC;
  if (autoSync !== undefined) env.AUTO_SYNC = autoSync;
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`server exited with ${child.exitCode}`);
    try {
      const response = await fetch(`${base}/api/settings`);
      if (response.ok) break;
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return {
    base,
    stop: async () => {
      if (child.exitCode !== null) return;
      child.kill('SIGTERM');
      await once(child, 'exit');
    },
  };
}

async function json(base, pathname, init) {
  const response = await fetch(`${base}${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  return { status: response.status, body: await response.json() };
}

test('settings API defaults off, validates input, and persists changes', async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-index-settings-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const dbPath = path.join(temp, 'skills.db');
  const registry = path.join(temp, 'registry');
  let server = await startServer({ dbPath, registry });
  t.after(async () => server.stop());

  assert.deepEqual(await json(server.base, '/api/settings'), {
    status: 200,
    body: { metadata_auto_sync: { enabled: false, locked: false, source: 'default' } },
  });
  assert.equal((await json(server.base, '/api/settings/metadata-auto-sync', {
    method: 'PATCH', body: JSON.stringify({ enabled: 'yes' }),
  })).status, 400);
  assert.deepEqual(await json(server.base, '/api/settings/metadata-auto-sync', {
    method: 'PATCH', body: JSON.stringify({ enabled: true }),
  }), {
    status: 200,
    body: { metadata_auto_sync: { enabled: true, locked: false, source: 'database' } },
  });

  await server.stop();
  server = await startServer({ dbPath, registry });
  assert.deepEqual((await json(server.base, '/api/settings')).body.metadata_auto_sync, {
    enabled: true, locked: false, source: 'database',
  });
});

test('AUTO_SYNC locks the API without overwriting SQLite', async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-index-settings-env-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const server = await startServer({
    dbPath: path.join(temp, 'skills.db'),
    registry: path.join(temp, 'registry'),
    autoSync: 'on',
  });
  t.after(() => server.stop());

  assert.deepEqual((await json(server.base, '/api/settings')).body.metadata_auto_sync, {
    enabled: true, locked: true, source: 'environment',
  });
  const result = await json(server.base, '/api/settings/metadata-auto-sync', {
    method: 'PATCH', body: JSON.stringify({ enabled: false }),
  });
  assert.equal(result.status, 409);
  assert.match(result.body.error, /AUTO_SYNC/);
});
```

- [ ] **Step 2: Run the API suite to verify RED**

Run: `node --test test/settings-api.test.mjs`

Expected: FAIL because `/api/settings` returns 404 and `SKILLS_DB_PATH` is not honored.

- [ ] **Step 3: Import the controller and make the database path isolatable**

In `server/index.mjs`, add:

```js
import { createAutoSyncController } from './auto-sync.mjs';
```

Replace the database path declaration with:

```js
const DB_PATH = process.env.SKILLS_DB_PATH || path.join(import.meta.dirname, '..', 'data', 'skills.db');
```

Remove `AUTO_SYNC`, `syncTimer`, `syncDirty`, and the old `markDirty()` implementation. Keep `exportJsonNow()` and `pushJsonNow()` unchanged.

- [ ] **Step 4: Add the settings table and instantiate the controller**

Append this table to the existing `db.exec(...)` schema block:

```sql
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

Immediately after the schema block, add:

```js
const autoSync = createAutoSyncController({
  db,
  envValue: process.env.AUTO_SYNC,
  exportNow: exportJsonNow,
  pushNow: pushJsonNow,
});

function markDirty() {
  autoSync.markDirty();
}
```

This preserves every existing `markDirty()` call site while changing the policy from a startup boolean to the current effective setting.

- [ ] **Step 5: Add the GET and PATCH routes**

Insert these routes near the start of the main `try` block in `server/index.mjs`:

```js
if (method === 'GET' && p === '/api/settings') {
  return send(res, 200, { metadata_auto_sync: autoSync.getState() });
}

if (method === 'PATCH' && p === '/api/settings/metadata-auto-sync') {
  const body = await readBody(req);
  if (typeof body.enabled !== 'boolean') {
    return send(res, 400, { error: 'enabled 必须是布尔值' });
  }
  try {
    const state = autoSync.setEnabled(body.enabled);
    return send(res, 200, { metadata_auto_sync: state });
  } catch (error) {
    if (error.code === 'AUTO_SYNC_LOCKED') return send(res, 409, { error: error.message });
    throw error;
  }
}
```

- [ ] **Step 6: Run backend tests to verify GREEN**

Run: `npm test`

Expected: all controller and API tests pass. The API tests use only temporary databases and do not call any skill mutation endpoint, so no Git command runs.

- [ ] **Step 7: Commit the backend wiring**

```bash
git add server/index.mjs test/settings-api.test.mjs
git commit -m "feat: expose metadata auto-sync settings API"
```

### Task 3: Add frontend types, API methods, and routing

**Files:**
- Modify: `src/types.ts`
- Modify: `src/api.ts`
- Modify: `src/router.ts`

- [ ] **Step 1: Define the normalized response types**

Add to `src/types.ts`:

```ts
export type SettingSource = 'default' | 'database' | 'environment';

export interface MetadataAutoSyncSetting {
  enabled: boolean;
  locked: boolean;
  source: SettingSource;
}

export interface AppSettings {
  metadata_auto_sync: MetadataAutoSyncSetting;
}
```

- [ ] **Step 2: Add typed API methods**

Add `AppSettings` to the type-only import in `src/api.ts`, then add these methods to `api`:

```ts
settings: () => req<AppSettings>('/api/settings'),
setMetadataAutoSync: (enabled: boolean) =>
  req<AppSettings>('/api/settings/metadata-auto-sync', {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  }),
```

- [ ] **Step 3: Add the Settings route**

In `src/router.ts`:

```ts
// Route union
| { name: 'settings' }

// parseHash switch
case 'settings': return { name: 'settings' };

// routeLabel switch
case 'settings': return '设置';

// activeTab
if (r.name === 'settings') return 'settings';
```

- [ ] **Step 4: Compile to catch type and route drift**

Run: `npm run build`

Expected: PASS. No page is visible yet; the next task composes it into `App.tsx`.

- [ ] **Step 5: Commit the client contract and route**

```bash
git add src/types.ts src/api.ts src/router.ts
git commit -m "feat: add settings client contract and route"
```

### Task 4: Build and compose the Settings page

**Files:**
- Create: `src/components/SettingsView.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Create the Settings page with explicit async states**

Create `src/components/SettingsView.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { MetadataAutoSyncSetting } from '../types';
import { ConfirmDialog } from './Modal';

export default function SettingsView({
  onToast,
}: {
  onToast: (message: string, error?: boolean) => void;
}) {
  const [setting, setSetting] = useState<MetadataAutoSyncSetting | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmEnable, setConfirmEnable] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setSetting((await api.settings()).metadata_auto_sync);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const update = async (enabled: boolean) => {
    setSaving(true);
    try {
      const next = (await api.setMetadataAutoSync(enabled)).metadata_auto_sync;
      setSetting(next);
      onToast(enabled
        ? '已开启列表元数据自动同步'
        : '已关闭列表元数据自动同步，待执行同步已取消');
    } catch (cause) {
      onToast((cause as Error).message, true);
    } finally {
      setSaving(false);
      setConfirmEnable(false);
    }
  };

  return (
    <div>
      <div className="page-head">
        <h2 className="page-title">设置</h2>
        <p className="page-desc">控制本机管理台行为。设置保存在本地 SQLite，不随列表同步。</p>
      </div>

      {error && !setting ? (
        <div className="settings-error">
          <div>加载设置失败：{error}</div>
          <button className="btn ghost" onClick={() => void load()}>重试</button>
        </div>
      ) : !setting ? (
        <div className="readme-hint">加载设置中…</div>
      ) : (
        <section className="settings-card">
          <div className="settings-copy">
            <div className="settings-title-row">
              <h3>列表元数据自动同步</h3>
              <span className={`badge ${setting.enabled ? 'ok' : ''}`}>
                {setting.enabled ? '已开启' : '已关闭'}
              </span>
            </div>
            <p>开启后，列表管理操作约 2.5 秒后自动导出、提交并推送 <code>data/skills.json</code>。</p>
            <p className="settings-scope">不会扫描、提交或推送 clone 下来的 skill 源码仓库；手动 <code>npm run export</code> 不受影响。</p>
            {setting.locked && (
              <p className="settings-lock">
                由 <code>AUTO_SYNC</code> 环境变量强制{setting.enabled ? '开启' : '关闭'}。修改环境变量并重启服务后才能在此切换。
              </p>
            )}
          </div>
          <button
            type="button"
            role="switch"
            aria-label="列表元数据自动同步"
            aria-checked={setting.enabled}
            className={`settings-switch${setting.enabled ? ' on' : ''}`}
            disabled={setting.locked || saving}
            onClick={() => {
              if (setting.enabled) void update(false);
              else setConfirmEnable(true);
            }}
          >
            <span />
          </button>
        </section>
      )}

      {confirmEnable && (
        <ConfirmDialog
          title="开启自动同步？"
          message="之后的列表管理操作会自动提交并推送 data/skills.json 到当前 Git 远端。该开关不处理 clone 下来的 skill 源码。"
          confirmText="确认开启"
          danger={false}
          onConfirm={() => void update(true)}
          onCancel={() => setConfirmEnable(false)}
        />
      )}
    </div>
  );
}
```

The component never optimistically changes `setting`; failures therefore leave the last confirmed server state visible.

- [ ] **Step 2: Compose the page and navigation**

In `src/App.tsx`, import the component:

```tsx
import SettingsView from './components/SettingsView';
```

Append this item to `TABS`:

```ts
{ key: 'settings', label: '设置', href: '/settings' },
```

Render the route beside the other top-level pages:

```tsx
{route.name === 'settings' && <SettingsView onToast={showToast} />}
```

- [ ] **Step 3: Add focused styles**

Append to `src/styles.css`:

```css
/* ---------- 设置 ---------- */
.settings-card {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 28px; align-items: center;
  background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
  padding: 22px 24px; margin-bottom: 40px;
}
.settings-copy h3 { font-family: var(--disp); font-size: 16px; margin: 0; color: var(--ink); }
.settings-title-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.settings-copy p { margin: 0 0 7px; color: var(--dim); font-size: 13px; line-height: 1.7; }
.settings-copy code { color: var(--acid); }
.settings-copy .settings-scope { color: var(--dim2); }
.settings-copy .settings-lock { color: var(--amber); margin-top: 12px; }
.settings-error {
  display: flex; justify-content: space-between; align-items: center; gap: 16px;
  background: rgba(255, 107, 107, 0.06); border: 1px solid rgba(255, 107, 107, 0.3);
  border-radius: var(--radius); padding: 18px 20px; color: var(--red); font-size: 13px;
}
.settings-switch {
  width: 48px; height: 26px; padding: 3px; flex-shrink: 0; border: 1px solid var(--line2);
  border-radius: 999px; background: var(--panel2); cursor: pointer; transition: 0.18s;
}
.settings-switch span {
  display: block; width: 18px; height: 18px; border-radius: 50%; background: var(--dim2);
  transform: translateX(0); transition: 0.18s;
}
.settings-switch.on { border-color: rgba(215, 255, 62, 0.55); background: rgba(215, 255, 62, 0.12); }
.settings-switch.on span { background: var(--acid); transform: translateX(20px); box-shadow: 0 0 10px rgba(215, 255, 62, 0.35); }
.settings-switch:disabled { opacity: 0.45; cursor: not-allowed; }
.settings-switch:focus-visible { outline: 2px solid var(--cyan); outline-offset: 3px; }
@media (max-width: 600px) {
  .settings-card { grid-template-columns: minmax(0, 1fr) auto; gap: 14px; padding: 18px; }
}
```

Add the success badge variant used by the setting status:

```css
.badge.ok { color: var(--acid); border-color: rgba(215, 255, 62, 0.35); }
```

- [ ] **Step 4: Compile the page**

Run: `npm run build`

Expected: TypeScript and Vite complete successfully; the generated bundle includes `#/settings`.

- [ ] **Step 5: Perform the first browser behavior check**

Run the app against an isolated database:

```bash
SETTINGS_TEST_DIR="$(mktemp -d)"
SKILLS_DB_PATH="$SETTINGS_TEST_DIR/skills.db" SKILLS_REGISTRY="$SETTINGS_TEST_DIR/registry" npm run dev:server
```

In a second terminal run `npm run dev`, then open `http://localhost:5173/#/settings` and verify:

- navigation highlights “设置”;
- the initial state is “已关闭”;
- clicking the switch opens confirmation and Cancel keeps it off;
- confirming turns it on and shows the success toast;
- switching it off is immediate and shows the cancellation toast;
- refreshing preserves the last database value.

Stop both development processes after the check. The temporary database may be removed after both processes exit.

- [ ] **Step 6: Commit the Settings page**

```bash
git add src/components/SettingsView.tsx src/App.tsx src/styles.css
git commit -m "feat: add metadata auto-sync settings page"
```

### Task 5: Document the default-off policy and API

**Files:**
- Modify: `README.md:14-57`
- Modify: `README.md:60-110`
- Modify: `src/components/DocsView.tsx:20-65`

- [ ] **Step 1: Replace the README auto-sync paragraph**

Replace the default-on paragraph with:

```markdown
> 页面内对列表的修改（录入/打标/删除/clone）即时写入本地 SQLite。**列表元数据自动同步默认关闭**；需要时在 `#/settings` 开启，之后每次管理操作约 2.5 秒后自动 `export → git commit → git push`，且只提交 `data/skills.json`。它不会扫描、提交或推送 clone 下来的 skill 源码仓库。也可用 `AUTO_SYNC=on` 强制开启或 `AUTO_SYNC=off` 强制关闭；环境变量生效时设置页只读。手动 `npm run export` + `git push` 始终可用。
```

Update the environment-variable line to:

```markdown
> 环境变量：`SKILLS_REGISTRY`（clone 目录，默认 `~/Code/skills-registry`）、`AGENTS_HOME`（agent 安装探测基准，测试用）、`AUTO_SYNC=on/off`（强制开启/关闭列表元数据自动同步；未设置时读取本地设置，初始默认关闭）、`PORT`（后端端口，默认 8787）
```

- [ ] **Step 2: Add Settings to the README navigation and API tables**

Add this navigation row:

```markdown
| **设置** | `#/settings` | 控制列表元数据自动同步；设置保存在本地 SQLite |
```

Add these API rows:

```markdown
| GET | `/api/settings` | 读取运行时设置及环境变量锁定状态 |
| PATCH | `/api/settings/metadata-auto-sync` | 更新列表元数据自动同步 `{enabled}` |
```

- [ ] **Step 3: Update the in-app Docs page**

Add this row to the page-navigation table in `src/components/DocsView.tsx`:

```tsx
<tr><td>设置</td><td><code>#/settings</code></td><td>列表元数据自动同步开关；默认关闭</td></tr>
```

Add these rows to the API table:

```tsx
<tr><td>GET</td><td><code>/api/settings</code></td><td>运行时设置及环境变量锁定状态</td></tr>
<tr><td>PATCH</td><td><code>/api/settings/metadata-auto-sync</code></td><td>开启/关闭列表元数据自动同步</td></tr>
```

Add this FAQ entry:

```tsx
<p><b>会自动同步 skill 源码吗？</b> 不会。设置页开关只控制 <code>data/skills.json</code> 的导出、提交和推送；clone 下来的源码仓库不在此流程中。</p>
```

- [ ] **Step 4: Verify documentation and build**

Run:

```bash
rg -n "默认自动同步远端|AUTO_SYNC.*默认开" README.md src/components/DocsView.tsx
npm run build
```

Expected: `rg` returns no stale default-on wording (exit code 1 is expected), and the build passes.

- [ ] **Step 5: Commit documentation**

```bash
git add README.md src/components/DocsView.tsx
git commit -m "docs: explain metadata auto-sync controls"
```

### Task 6: Verify safety, lock behavior, and final scope

**Files:**
- Review: `server/auto-sync.mjs`
- Review: `server/index.mjs`
- Review: `src/components/SettingsView.tsx`
- Review: `README.md`
- Review: `src/components/DocsView.tsx`

- [ ] **Step 1: Run the complete automated verification**

Run:

```bash
npm test
npm run build
git diff --check
```

Expected: all Node tests pass, TypeScript/Vite build passes, and `git diff --check` prints nothing.

- [ ] **Step 2: Verify the API lock in an isolated process**

Run the backend with an isolated database and forced-off setting:

```bash
SETTINGS_LOCK_DIR="$(mktemp -d)"
PORT=8877 SKILLS_DB_PATH="$SETTINGS_LOCK_DIR/skills.db" SKILLS_REGISTRY="$SETTINGS_LOCK_DIR/registry" AUTO_SYNC=off npm run dev:server
```

From another terminal:

```bash
curl -s http://127.0.0.1:8877/api/settings
curl -s -i -X PATCH http://127.0.0.1:8877/api/settings/metadata-auto-sync -H 'Content-Type: application/json' -d '{"enabled":true}'
```

Expected: GET reports `enabled:false`, `locked:true`, `source:"environment"`; PATCH returns HTTP 409 and mentions `AUTO_SYNC`. Stop the isolated backend after checking it.

- [ ] **Step 3: Audit that source repositories remain out of scope**

Run:

```bash
rg -n "pushJsonNow|git.*push|data/skills.json|SKILLS_REGISTRY" server/auto-sync.mjs server/index.mjs README.md
```

Expected: the controller only invokes the injected export/push callbacks; the existing Git staging command in `server/index.mjs` still scopes `status` and `add` to `data/skills.json`; no new Git command targets `SKILLS_REGISTRY`.

- [ ] **Step 4: Review the final diff against the approved design**

Run:

```bash
git status --short --branch
git diff origin/main...HEAD -- server/auto-sync.mjs server/index.mjs test package.json src README.md
```

Confirm all of the following before reporting completion:

- absent SQLite setting and absent/unknown `AUTO_SYNC` means disabled;
- `AUTO_SYNC=on/off` is authoritative and makes PATCH return 409;
- disabling clears both timer and dirty state, while enabling does not replay cancelled work;
- settings are local-only and excluded from `data/skills.json` export;
- only subsequent list management actions trigger automatic export/commit/push;
- the Settings page confirms enable, disables immediately, and does not optimistically lie on errors;
- manual sync scripts and clone/pull/install/diff behavior are unchanged.

- [ ] **Step 5: Commit any verification-only fixes, if the review required changes**

If Step 4 found a concrete defect, fix it with a failing regression test first, rerun Steps 1-4, then commit only those fixes:

```bash
git add server/auto-sync.mjs server/index.mjs test/auto-sync.test.mjs test/settings-api.test.mjs package.json src/types.ts src/api.ts src/router.ts src/components/SettingsView.tsx src/App.tsx src/styles.css README.md src/components/DocsView.tsx
git commit -m "fix: harden metadata auto-sync settings"
```

If no defect was found, do not create an empty commit.
