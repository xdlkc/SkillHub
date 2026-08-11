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
