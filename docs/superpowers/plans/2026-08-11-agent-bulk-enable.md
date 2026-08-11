# Agents Bulk Enable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add checkbox-based bulk enable/disable operations to the Agents page while making Claude Code and Codex the only Agents enabled by default.

**Architecture:** Put Agent preference resolution, request validation, and transactional writes in a focused backend module used by both the list and installation paths. Expose one atomic bulk API while retaining the single-Agent API. Keep React selection/state transforms in pure tested helpers, then connect them to the existing Agents page and API client.

**Tech Stack:** Node.js 22 (`node:http`, `node:sqlite`), SQLite, React 18, TypeScript, Vite, Vitest, Testing Library, jsdom.

---

## File map

- Create `server/agent-prefs.mjs`: resolve saved/default Agent preferences, validate bulk payloads, and write preferences transactionally.
- Create `server/agent-prefs.test.mjs`: unit-test default resolution, installation targeting, validation, deduplication, and atomic writes.
- Create `server/agent-api.test.mjs`: exercise the real Agents HTTP routes against an isolated copied server and temporary database.
- Modify `server/index.mjs`: use the preference module for list/install defaults and expose the atomic bulk endpoint.
- Create `src/components/agentSelection.ts`: pure selection and enabled-state transforms for the Agents UI.
- Create `src/components/agentSelection.test.ts`: unit-test selection, clearing, disabled conditions, and response merging.
- Create `src/api.test.ts`: verify the bulk API request contract.
- Modify `src/api.ts`: add the typed bulk preference client.
- Create `src/components/AgentsView.test.tsx`: verify filtered selection and a bulk disable interaction.
- Modify `src/components/AgentsView.tsx`: add selection controls and bulk actions while retaining single-Agent controls.
- Modify `src/styles.css`: style selected cards, checkboxes, and the responsive bulk action bar.
- Modify `src/components/DocsView.tsx`: document the single and bulk Agent preference APIs.
- Modify `package.json` and `package-lock.json`: add the test runner and UI test dependencies.

### Task 1: Establish the test runner

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install the test dependencies**

Run:

```bash
npm install --save-dev vitest jsdom @testing-library/react @testing-library/user-event
```

Expected: exit code 0; `package.json` and `package-lock.json` list the four new development dependencies.

- [ ] **Step 2: Add the permanent test script**

Add this entry under `scripts` in `package.json`:

```json
"test": "vitest run"
```

- [ ] **Step 3: Verify the empty test suite can start**

Run:

```bash
npm test -- --passWithNoTests
```

Expected: exit code 0 with “No test files found” and no configuration errors.

- [ ] **Step 4: Commit the test harness**

```bash
git add package.json package-lock.json
git commit -m "test: add Vitest harness"
```

### Task 2: Resolve Agent defaults in one backend module

**Files:**
- Create: `server/agent-prefs.test.mjs`
- Create: `server/agent-prefs.mjs`

- [ ] **Step 1: Write failing tests for defaults and installation targeting**

Create `server/agent-prefs.test.mjs`:

```js
import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import {
  enabledInstalledAgentIds,
  getAgentsWithPreferences,
} from './agent-prefs.mjs';

const databases = [];

function createDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE agent_prefs (
      agent TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 1
    );
  `);
  databases.push(db);
  return db;
}

const agents = [
  { id: 'claude-code', name: 'Claude Code', installed: true },
  { id: 'codex', name: 'Codex', installed: false },
  { id: 'cursor', name: 'Cursor', installed: true },
];

afterEach(() => {
  while (databases.length) databases.pop().close();
});

describe('getAgentsWithPreferences', () => {
  it('enables only Claude Code and Codex when no preference is saved', () => {
    const result = getAgentsWithPreferences(createDb(), agents);

    expect(result.map(({ id, enabled }) => ({ id, enabled }))).toEqual([
      { id: 'claude-code', enabled: true },
      { id: 'codex', enabled: true },
      { id: 'cursor', enabled: false },
    ]);
  });

  it('lets saved preferences override the defaults', () => {
    const db = createDb();
    db.prepare('INSERT INTO agent_prefs (agent, enabled) VALUES (?, ?)').run('claude-code', 0);
    db.prepare('INSERT INTO agent_prefs (agent, enabled) VALUES (?, ?)').run('cursor', 1);

    const result = getAgentsWithPreferences(db, agents);

    expect(result.map(({ id, enabled }) => ({ id, enabled }))).toEqual([
      { id: 'claude-code', enabled: false },
      { id: 'codex', enabled: true },
      { id: 'cursor', enabled: true },
    ]);
  });
});

it('targets only installed and enabled Agents for implicit installation', () => {
  const db = createDb();
  db.prepare('INSERT INTO agent_prefs (agent, enabled) VALUES (?, ?)').run('cursor', 1);

  expect(enabledInstalledAgentIds(db, agents)).toEqual(['claude-code', 'cursor']);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
npm test -- server/agent-prefs.test.mjs
```

Expected: FAIL because `server/agent-prefs.mjs` does not exist.

- [ ] **Step 3: Implement default and saved preference resolution**

Create `server/agent-prefs.mjs`:

```js
export const DEFAULT_ENABLED_AGENT_IDS = new Set(['claude-code', 'codex']);

export function getAgentsWithPreferences(db, agents) {
  const preferences = new Map(
    db.prepare('SELECT agent, enabled FROM agent_prefs').all()
      .map((row) => [row.agent, Boolean(row.enabled)])
  );

  return agents.map((agent) => ({
    ...agent,
    enabled: preferences.has(agent.id)
      ? preferences.get(agent.id)
      : DEFAULT_ENABLED_AGENT_IDS.has(agent.id),
  }));
}

export function enabledInstalledAgentIds(db, agents) {
  return getAgentsWithPreferences(db, agents)
    .filter((agent) => agent.installed && agent.enabled)
    .map((agent) => agent.id);
}
```

- [ ] **Step 4: Run the tests and verify GREEN**

Run:

```bash
npm test -- server/agent-prefs.test.mjs
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit default preference resolution**

```bash
git add server/agent-prefs.mjs server/agent-prefs.test.mjs
git commit -m "feat: define default Agent preferences"
```

### Task 3: Validate and transactionally save batch preferences

**Files:**
- Modify: `server/agent-prefs.test.mjs`
- Modify: `server/agent-prefs.mjs`

- [ ] **Step 1: Add failing tests for batch updates and invalid requests**

Extend the import in `server/agent-prefs.test.mjs`:

```js
import {
  AgentPreferenceError,
  enabledInstalledAgentIds,
  getAgentsWithPreferences,
  updateAgentPreferences,
} from './agent-prefs.mjs';
```

Append these tests:

```js
describe('updateAgentPreferences', () => {
  it('deduplicates ids and writes every preference in one result', () => {
    const db = createDb();

    const result = updateAgentPreferences(
      db,
      { agents: ['cursor', 'cursor', 'codex'], enabled: false },
      agents
    );

    expect(result).toEqual({
      agents: ['cursor', 'codex'],
      enabled: false,
      updated: 2,
    });
    expect(
      db.prepare('SELECT agent, enabled FROM agent_prefs ORDER BY agent').all()
    ).toEqual([
      { agent: 'codex', enabled: 0 },
      { agent: 'cursor', enabled: 0 },
    ]);
  });

  it.each([
    [{ agents: [], enabled: true }, 400],
    [{ agents: ['cursor'], enabled: 'yes' }, 400],
    [{ agents: [42], enabled: true }, 400],
  ])('rejects malformed payload %#', (body, status) => {
    let caught;
    try {
      updateAgentPreferences(createDb(), body, agents);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AgentPreferenceError);
    expect(caught).toMatchObject({ status });
  });

  it('rejects unknown ids before writing any valid id', () => {
    const db = createDb();

    expect(() => updateAgentPreferences(
      db,
      { agents: ['cursor', 'missing-agent'], enabled: true },
      agents
    )).toThrowError(AgentPreferenceError);
    expect(db.prepare('SELECT * FROM agent_prefs').all()).toEqual([]);
  });

  it('rolls back earlier writes when a database write fails', () => {
    const db = createDb();
    db.exec(`
      CREATE TRIGGER fail_codex_preference
      BEFORE INSERT ON agent_prefs
      WHEN NEW.agent = 'codex'
      BEGIN
        SELECT RAISE(FAIL, 'forced write failure');
      END;
    `);

    expect(() => updateAgentPreferences(
      db,
      { agents: ['cursor', 'codex'], enabled: true },
      agents
    )).toThrow('forced write failure');
    expect(db.prepare('SELECT * FROM agent_prefs').all()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npm test -- server/agent-prefs.test.mjs
```

Expected: FAIL because `AgentPreferenceError` and `updateAgentPreferences` are not exported.

- [ ] **Step 3: Implement validation and transactional writes**

Append to `server/agent-prefs.mjs`:

```js
export class AgentPreferenceError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'AgentPreferenceError';
    this.status = status;
  }
}

function parseBulkPreferenceRequest(body, supportedAgents) {
  if (!Array.isArray(body.agents) || body.agents.length === 0) {
    throw new AgentPreferenceError(400, 'agents 必须是非空数组');
  }
  if (body.agents.some((id) => typeof id !== 'string' || id.length === 0)) {
    throw new AgentPreferenceError(400, 'agents 必须只包含 Agent ID');
  }
  if (typeof body.enabled !== 'boolean') {
    throw new AgentPreferenceError(400, 'enabled 必须是布尔值');
  }

  const agentIds = [...new Set(body.agents)];
  const supportedIds = new Set(supportedAgents.map((agent) => agent.id));
  const unknownIds = agentIds.filter((id) => !supportedIds.has(id));
  if (unknownIds.length > 0) {
    throw new AgentPreferenceError(404, `未知 agent: ${unknownIds.join(', ')}`);
  }

  return { agents: agentIds, enabled: body.enabled };
}

function writeAgentPreferences(db, agentIds, enabled) {
  const statement = db.prepare(
    `INSERT INTO agent_prefs (agent, enabled) VALUES (?, ?)
     ON CONFLICT(agent) DO UPDATE SET enabled = excluded.enabled`
  );

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const id of agentIds) statement.run(id, enabled ? 1 : 0);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}

export function updateAgentPreferences(db, body, supportedAgents) {
  const request = parseBulkPreferenceRequest(body, supportedAgents);
  writeAgentPreferences(db, request.agents, request.enabled);
  return {
    agents: request.agents,
    enabled: request.enabled,
    updated: request.agents.length,
  };
}
```

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```bash
npm test -- server/agent-prefs.test.mjs
```

Expected: 9 tests pass.

- [ ] **Step 5: Commit batch preference writes**

```bash
git add server/agent-prefs.mjs server/agent-prefs.test.mjs
git commit -m "feat: save Agent preferences in batches"
```

### Task 4: Wire the backend list, install fallback, and bulk endpoint

**Files:**
- Create: `server/agent-api.test.mjs`
- Modify: `server/index.mjs`

- [ ] **Step 1: Write failing HTTP regression tests in an isolated server copy**

Create `server/agent-api.test.mjs`:

```js
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

let child;
let tempRoot;
let baseUrl;
let serverErrors = '';

async function reservePort() {
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const address = probe.address();
  const port = address.port;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(serverErrors || 'server exited early');
    try {
      const response = await fetch(`${url}/api/agents`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`server did not start: ${serverErrors}`);
}

async function patchAgents(body) {
  const response = await fetch(`${baseUrl}/api/agents`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { response, body: await response.json() };
}

beforeAll(async () => {
  tempRoot = mkdtempSync(path.join(tmpdir(), 'skills-leaderboard-agent-api-'));
  cpSync(new URL('./', import.meta.url), path.join(tempRoot, 'server'), { recursive: true });
  mkdirSync(path.join(tempRoot, 'data'));
  const port = await reservePort();
  baseUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [path.join(tempRoot, 'server', 'index.mjs')], {
    cwd: tempRoot,
    env: {
      ...process.env,
      AGENTS_HOME: tempRoot,
      AUTO_SYNC: 'off',
      PORT: String(port),
      SKILLS_REGISTRY: path.join(tempRoot, 'registry'),
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.stderr.on('data', (chunk) => { serverErrors += chunk.toString(); });
  await waitForServer(baseUrl);
}, 10000);

afterAll(() => {
  if (child?.exitCode === null) child.kill('SIGTERM');
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
});

describe('Agents preference API', () => {
  it('returns only Claude Code and Codex enabled by default', async () => {
    const response = await fetch(`${baseUrl}/api/agents`);
    const body = await response.json();

    expect(body.agents.filter((agent) => agent.enabled).map((agent) => agent.id)).toEqual([
      'claude-code',
      'codex',
    ]);
  });

  it('updates multiple Agents in one request', async () => {
    const result = await patchAgents({ agents: ['cursor', 'gemini-cli'], enabled: true });

    expect(result.response.status).toBe(200);
    expect(result.body).toEqual({
      agents: ['cursor', 'gemini-cli'],
      enabled: true,
      updated: 2,
    });
    const list = await fetch(`${baseUrl}/api/agents`).then((response) => response.json());
    expect(list.agents.find((agent) => agent.id === 'cursor').enabled).toBe(true);
    expect(list.agents.find((agent) => agent.id === 'gemini-cli').enabled).toBe(true);
  });

  it('does not partially write a request containing an unknown Agent', async () => {
    await patchAgents({ agents: ['gemini-cli'], enabled: true });

    const result = await patchAgents({
      agents: ['gemini-cli', 'missing-agent'],
      enabled: false,
    });

    expect(result.response.status).toBe(404);
    const list = await fetch(`${baseUrl}/api/agents`).then((response) => response.json());
    expect(list.agents.find((agent) => agent.id === 'gemini-cli').enabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run the HTTP tests and verify RED**

Run:

```bash
npm test -- server/agent-api.test.mjs
```

Expected: FAIL because all unspecified Agents currently default to enabled and `PATCH /api/agents` returns 404.

- [ ] **Step 3: Import the preference boundary in `server/index.mjs`**

Add this import after the existing `./agents.mjs` import:

```js
import {
  AgentPreferenceError,
  enabledInstalledAgentIds,
  getAgentsWithPreferences,
  updateAgentPreferences,
} from './agent-prefs.mjs';
```

- [ ] **Step 4: Make implicit installs use effective enabled preferences**

Replace the current `disabled`-set fallback in the install-all route with:

```js
        if (Array.isArray(b.agents)) {
          requested = b.agents.map(String);
        } else {
          requested = enabledInstalledAgentIds(db, getAgents());
        }
```

- [ ] **Step 5: Replace the Agents list resolver and add the bulk route**

Replace the current Agents list block and insert the bulk route before the dynamic single-Agent route:

```js
    /* agents 列表（含本机安装探测与启用偏好） */
    if (method === 'GET' && p === '/api/agents') {
      const agents = getAgentsWithPreferences(db, getAgents());
      return send(res, 200, { agents, home: AGENTS_HOME });
    }

    /* 批量更新 agent 启用偏好 */
    if (method === 'PATCH' && p === '/api/agents') {
      const body = await readBody(req);
      try {
        const result = updateAgentPreferences(db, body, getAgents());
        return send(res, 200, result);
      } catch (error) {
        if (error instanceof AgentPreferenceError) {
          return send(res, error.status, { error: error.message });
        }
        throw error;
      }
    }
```

Keep the existing `PATCH /api/agents/:id` behavior unchanged so existing clients remain compatible.

- [ ] **Step 6: Run backend tests and verify GREEN**

Run:

```bash
npm test -- server/agent-prefs.test.mjs server/agent-api.test.mjs
```

Expected: 12 tests pass.

- [ ] **Step 7: Commit backend integration**

```bash
git add server/index.mjs server/agent-api.test.mjs
git commit -m "feat: expose bulk Agent preference API"
```

### Task 5: Add tested frontend state helpers and API client

**Files:**
- Create: `src/components/agentSelection.test.ts`
- Create: `src/components/agentSelection.ts`
- Create: `src/api.test.ts`
- Modify: `src/api.ts`

- [ ] **Step 1: Write failing selection and merge tests**

Create `src/components/agentSelection.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { AgentInfo } from '../types';
import {
  applyAgentEnabled,
  clearAgentSelection,
  isBulkActionDisabled,
  selectVisibleAgentIds,
  toggleAgentSelection,
} from './agentSelection';

const agents: AgentInfo[] = [
  { id: 'claude-code', name: 'Claude Code', dir: '/claude', installed: true, enabled: true },
  { id: 'codex', name: 'Codex', dir: '/codex', installed: true, enabled: true },
  { id: 'cursor', name: 'Cursor', dir: '/cursor', installed: false, enabled: false },
];

describe('Agent selection helpers', () => {
  it('adds all visible ids without dropping hidden selections', () => {
    const result = selectVisibleAgentIds(new Set(['cursor']), ['claude-code', 'codex']);
    expect([...result]).toEqual(['cursor', 'claude-code', 'codex']);
  });

  it('toggles one id and clears all ids', () => {
    const selected = toggleAgentSelection(new Set(['codex']), 'codex');
    expect([...selected]).toEqual([]);
    expect(clearAgentSelection().size).toBe(0);
  });

  it('disables bulk actions with no selection or while preferences are busy', () => {
    expect(isBulkActionDisabled(0, false)).toBe(true);
    expect(isBulkActionDisabled(2, true)).toBe(true);
    expect(isBulkActionDisabled(2, false)).toBe(false);
  });

  it('merges an enabled result into only the returned Agents', () => {
    expect(applyAgentEnabled(agents, ['cursor', 'codex'], false)).toEqual([
      agents[0],
      { ...agents[1], enabled: false },
      { ...agents[2], enabled: false },
    ]);
  });
});
```

- [ ] **Step 2: Run the helper tests and verify RED**

Run:

```bash
npm test -- src/components/agentSelection.test.ts
```

Expected: FAIL because `src/components/agentSelection.ts` does not exist.

- [ ] **Step 3: Implement the pure helpers**

Create `src/components/agentSelection.ts`:

```ts
import type { AgentInfo } from '../types';

export function selectVisibleAgentIds(current: Set<string>, visibleIds: string[]) {
  return new Set([...current, ...visibleIds]);
}

export function toggleAgentSelection(current: Set<string>, id: string) {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function clearAgentSelection() {
  return new Set<string>();
}

export function isBulkActionDisabled(selectedCount: number, preferenceBusy: boolean) {
  return selectedCount === 0 || preferenceBusy;
}

export function applyAgentEnabled(agents: AgentInfo[], ids: string[], enabled: boolean) {
  const changedIds = new Set(ids);
  return agents.map((agent) => changedIds.has(agent.id) ? { ...agent, enabled } : agent);
}
```

- [ ] **Step 4: Write a failing API contract test**

Create `src/api.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api.setAgentsEnabled', () => {
  it('sends one PATCH request for all selected Agents', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ agents: ['codex', 'claude-code'], enabled: false, updated: 2 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await api.setAgentsEnabled(['codex', 'claude-code'], false);

    expect(fetchMock).toHaveBeenCalledWith('/api/agents', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ agents: ['codex', 'claude-code'], enabled: false }),
    }));
  });
});
```

- [ ] **Step 5: Run the API test and verify RED**

Run:

```bash
npm test -- src/api.test.ts
```

Expected: FAIL because `api.setAgentsEnabled` is not defined.

- [ ] **Step 6: Add the typed bulk API method**

Add this method next to `setAgentEnabled` in `src/api.ts`:

```ts
  setAgentsEnabled: (agents: string[], enabled: boolean) =>
    req<{ agents: string[]; enabled: boolean; updated: number }>('/api/agents', {
      method: 'PATCH',
      body: JSON.stringify({ agents, enabled }),
    }),
```

- [ ] **Step 7: Run the frontend logic tests and verify GREEN**

Run:

```bash
npm test -- src/components/agentSelection.test.ts src/api.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 8: Commit frontend behavior boundaries**

```bash
git add src/components/agentSelection.ts src/components/agentSelection.test.ts src/api.ts src/api.test.ts
git commit -m "feat: add Agent bulk selection helpers"
```

### Task 6: Build the checkbox and bulk-action UI

**Files:**
- Create: `src/components/AgentsView.test.tsx`
- Modify: `src/components/AgentsView.tsx`
- Modify: `src/styles.css`
- Modify: `src/components/DocsView.tsx`

- [ ] **Step 1: Write failing component interaction tests**

Create `src/components/AgentsView.test.tsx`:

```tsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AgentsView from './AgentsView';

const apiMock = vi.hoisted(() => ({
  agents: vi.fn(),
  installed: vi.fn(),
  setAgentsEnabled: vi.fn(),
}));

vi.mock('../api', () => ({ api: apiMock }));

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.agents.mockResolvedValue({
    home: '/tmp/home',
    agents: [
      { id: 'claude-code', name: 'Claude Code', dir: '/claude', installed: true, enabled: true },
      { id: 'codex', name: 'Codex', dir: '/codex', installed: true, enabled: true },
      { id: 'cursor', name: 'Cursor', dir: '/cursor', installed: false, enabled: false },
    ],
  });
  apiMock.installed.mockResolvedValue([]);
  apiMock.setAgentsEnabled.mockResolvedValue({
    agents: ['claude-code'],
    enabled: false,
    updated: 1,
  });
});

describe('AgentsView bulk preferences', () => {
  it('selects only the Agents in the current search result', async () => {
    const user = userEvent.setup();
    render(<AgentsView onToast={vi.fn()} />);
    await screen.findByText('Claude Code');

    await user.type(screen.getByPlaceholderText('搜索 agent 名称 / id / 目录…'), 'Claude');
    await user.click(screen.getByRole('button', { name: '选择当前结果' }));

    expect((screen.getByRole('checkbox', { name: '选择 Claude Code' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByRole('checkbox', { name: '选择 Codex' })).toBeNull();
  });

  it('disables one selected Agent through the bulk endpoint', async () => {
    const user = userEvent.setup();
    const onToast = vi.fn();
    render(<AgentsView onToast={onToast} />);
    await screen.findByText('Claude Code');

    await user.click(screen.getByRole('checkbox', { name: '选择 Claude Code' }));
    await user.click(screen.getByRole('button', { name: '批量禁用 (1)' }));

    expect(apiMock.setAgentsEnabled).toHaveBeenCalledWith(['claude-code'], false);
    await waitFor(() => expect(onToast).toHaveBeenCalledWith('已禁用 1 个 agent'));
  });
});
```

- [ ] **Step 2: Run the component tests and verify RED**

Run:

```bash
npm test -- src/components/AgentsView.test.tsx
```

Expected: FAIL because the selection controls and bulk buttons do not exist.

- [ ] **Step 3: Add selection state and bulk handlers to `AgentsView.tsx`**

Import the helpers:

```ts
import {
  applyAgentEnabled,
  clearAgentSelection,
  isBulkActionDisabled,
  selectVisibleAgentIds,
  toggleAgentSelection,
} from './agentSelection';
```

Add state next to the existing query/facet state:

```ts
  const [selected, setSelected] = useState<Set<string>>(new Set());
```

After `filteredAgents`, add the preference state and handlers:

```ts
  const preferenceBusy = busy === 'agents:bulk' || busy.endsWith(':enabled');
  const bulkDisabled = isBulkActionDisabled(selected.size, preferenceBusy);

  const selectCurrentResults = () =>
    setSelected((current) => selectVisibleAgentIds(current, filteredAgents.map((agent) => agent.id)));

  const doBulkEnabled = async (enabled: boolean) => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBusy('agents:bulk');
    try {
      const result = await api.setAgentsEnabled(ids, enabled);
      setAgents((current) => applyAgentEnabled(current, result.agents, result.enabled));
      onToast(`已${result.enabled ? '启用' : '禁用'} ${result.updated} 个 agent`);
    } catch (error) {
      onToast((error as Error).message, true);
    } finally {
      setBusy('');
    }
  };
```

- [ ] **Step 4: Render the bulk action bar**

Add this block inside the existing toolbar after the filters:

```tsx
        <div className="agent-bulk-actions">
          <span className="agent-selection-count">已选 {selected.size} 个</span>
          <button className="btn ghost" onClick={selectCurrentResults} disabled={preferenceBusy || filteredAgents.length === 0}>
            选择当前结果
          </button>
          <button className="btn ghost" onClick={() => setSelected(clearAgentSelection())} disabled={preferenceBusy || selected.size === 0}>
            清空选择
          </button>
          <button className="btn primary" onClick={() => doBulkEnabled(true)} disabled={bulkDisabled}>
            批量启用 ({selected.size})
          </button>
          <button className="btn danger" onClick={() => doBulkEnabled(false)} disabled={bulkDisabled}>
            批量禁用 ({selected.size})
          </button>
        </div>
```

- [ ] **Step 5: Render card selection without changing expansion behavior**

Add the selected class to each card:

```tsx
<div
  className={`agent-card${a.installed ? '' : ' absent'}${selected.has(a.id) ? ' selected' : ''}`}
  key={a.id}
  style={{ opacity: a.enabled ? undefined : 0.45 }}
>
```

Insert this checkbox as the first child of `.agent-card-head`:

```tsx
<input
  className="agent-select"
  type="checkbox"
  aria-label={`选择 ${a.name}`}
  checked={selected.has(a.id)}
  disabled={preferenceBusy}
  onClick={(event) => event.stopPropagation()}
  onChange={() => setSelected((current) => toggleAgentSelection(current, a.id))}
/>
```

In the existing single-Agent enable/disable button, replace its `disabled` expression with:

```tsx
disabled={preferenceBusy}
```

- [ ] **Step 6: Add responsive styles**

Add to the Agents section of `src/styles.css`:

```css
.agent-card.selected { border-color: rgba(215, 255, 62, 0.55); box-shadow: 0 0 0 1px rgba(215, 255, 62, 0.12); }
.agent-card-head { grid-template-columns: 20px minmax(0,1fr) 150px auto; }
.agent-select { width: 15px; height: 15px; margin: 0; accent-color: var(--acid); cursor: pointer; }
.agent-select:disabled { cursor: not-allowed; }
.agent-bulk-actions {
  width: 100%; display: flex; align-items: center; justify-content: flex-end; gap: 8px;
  border-top: 1px solid var(--line); padding-top: 12px; flex-wrap: wrap;
}
.agent-selection-count { margin-right: auto; color: var(--dim); font-size: 12px; }

@media (max-width: 720px) {
  .agent-card-head { grid-template-columns: 20px minmax(0,1fr) auto; }
  .agent-card-dir { display: none; }
  .agent-bulk-actions .btn { flex: 1 1 calc(50% - 8px); }
  .agent-selection-count { flex-basis: 100%; }
}
```

Remove the old `.agent-card-head` declaration before adding the replacement so the grid definition has one source of truth.

- [ ] **Step 7: Document the preference endpoints**

Add these rows to the API table in `src/components/DocsView.tsx`:

```tsx
<tr><td>PATCH</td><td><code>/api/agents/:id</code></td><td>启用或禁用单个 Agent</td></tr>
<tr><td>PATCH</td><td><code>/api/agents</code></td><td>原子地批量启用或禁用所选 Agents</td></tr>
```

- [ ] **Step 8: Run component tests and the production build**

Run:

```bash
npm test -- src/components/AgentsView.test.tsx
npm run build
```

Expected: 2 component tests pass; TypeScript and Vite build exit 0.

- [ ] **Step 9: Commit the Agents bulk UI**

```bash
git add src/components/AgentsView.tsx src/components/AgentsView.test.tsx src/styles.css src/components/DocsView.tsx
git commit -m "feat: add bulk actions to Agents list"
```

### Task 7: Verify the complete feature

**Files:**
- Verify all files changed in Tasks 1–6.

- [ ] **Step 1: Run the complete automated test suite**

Run:

```bash
npm test
```

Expected: all backend, API-client, helper, and component tests pass with 0 failures.

- [ ] **Step 2: Run the production build**

Run:

```bash
npm run build
```

Expected: `tsc` and Vite exit 0 and produce `dist/`.

- [ ] **Step 3: Check formatting and scope**

Run:

```bash
git diff --check
git status --short
```

Expected: `git diff --check` prints nothing. `git status --short` shows only intentional feature changes plus any pre-existing unrelated user files.

- [ ] **Step 4: Confirm requirement coverage**

Verify all of the following against the implementation and test output:

- Only Claude Code and Codex are enabled for Agents without saved preferences.
- Saved single-Agent preferences still override defaults.
- Selecting current filtered results preserves hidden selections.
- Empty selection cannot invoke a bulk action.
- One bulk request updates all selected Agents or none of them.
- Existing single-Agent enable/disable controls still work.
- Implicit install-all targets only installed, effectively enabled Agents.

- [ ] **Step 5: Commit any verification-only corrections**

If verification required an intentional correction, stage only its files and commit it with a message describing that correction. If no correction was needed, do not create an empty commit.
