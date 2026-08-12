import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const SOURCE_PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_SERVER_DIR = path.join(SOURCE_PROJECT_ROOT, 'server');

async function findFreePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const address = probe.address();
  await new Promise((resolve, reject) => {
    probe.close((error) => error ? reject(error) : resolve());
  });
  return address.port;
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolve) => {
    let timer;
    const done = () => {
      clearTimeout(timer);
      resolve(true);
    };
    child.once('exit', done);
    timer = setTimeout(() => {
      child.off('exit', done);
      resolve(false);
    }, timeoutMs);
    timer.unref();
  });
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  let exited = waitForExit(child, 3000);
  child.kill('SIGTERM');
  if (await exited) return;
  exited = waitForExit(child, 3000);
  child.kill('SIGKILL');
  await exited;
}

async function startServer({ projectRoot, dbPath, registryPath, autoSync }) {
  const port = await findFreePort();
  const env = {
    ...process.env,
    PORT: String(port),
    SKILLS_DB_PATH: dbPath,
    SKILLS_REGISTRY: registryPath,
  };
  delete env.AUTO_SYNC;
  if (autoSync !== undefined) env.AUTO_SYNC = autoSync;

  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: projectRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 10000;
  try {
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`server exited before becoming ready\n${output}`);
      }
      try {
        const response = await fetch(`${baseUrl}/api/stats`, {
          signal: AbortSignal.timeout(1000),
        });
        if (response.status === 200) return { child, baseUrl };
      } catch {
        // The process may still be binding its port.
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`server did not become ready\n${output}`);
  } catch (error) {
    await stopServer(child);
    throw error;
  }
}

async function createFixture(t, prefix) {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), prefix));
  const dbPath = path.join(projectRoot, 'data', 'skills.db');
  const registryPath = path.join(projectRoot, 'registry');
  let running;

  const fixture = {
    async start(autoSync) {
      running = await startServer({ projectRoot, dbPath, registryPath, autoSync });
      return running;
    },
    async stop() {
      if (!running) return;
      await stopServer(running.child);
      running = undefined;
    },
  };

  t.after(async () => {
    await fixture.stop();
    await rm(projectRoot, { recursive: true, force: true });
  });
  await cp(SOURCE_SERVER_DIR, path.join(projectRoot, 'server'), { recursive: true });
  return fixture;
}

async function request(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(5000),
    headers: options.body
      ? { 'Content-Type': 'application/json', ...options.headers }
      : options.headers,
  });
  return { status: response.status, body: await response.json() };
}

test('metadata auto-sync PATCH rejects JSON null with 400', async (t) => {
  const fixture = await createFixture(t, 'skills-settings-null-');
  const running = await fixture.start();
  const response = await request(running.baseUrl, '/api/settings/metadata-auto-sync', {
    method: 'PATCH',
    body: 'null',
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { error: 'enabled 必须是布尔值' });
});

test('metadata auto-sync PATCH rejects malformed JSON with 400', async (t) => {
  const fixture = await createFixture(t, 'skills-settings-malformed-');
  const running = await fixture.start();
  const response = await request(running.baseUrl, '/api/settings/metadata-auto-sync', {
    method: 'PATCH',
    body: '{',
  });

  assert.equal(response.status, 400);
});

test('metadata auto-sync defaults off, validates writes, and persists across restart', async (t) => {
  const fixture = await createFixture(t, 'skills-settings-api-');
  let running = await fixture.start();

  assert.deepEqual(await request(running.baseUrl, '/api/settings'), {
    status: 200,
    body: {
      metadata_auto_sync: {
        enabled: false,
        locked: false,
        source: 'default',
      },
    },
  });

  assert.deepEqual(await request(running.baseUrl, '/api/settings/metadata-auto-sync', {
    method: 'PATCH',
    body: JSON.stringify({ enabled: 'true' }),
  }), {
    status: 400,
    body: { error: 'enabled 必须是布尔值' },
  });

  assert.deepEqual(await request(running.baseUrl, '/api/settings/metadata-auto-sync', {
    method: 'PATCH',
    body: JSON.stringify({ enabled: true }),
  }), {
    status: 200,
    body: {
      metadata_auto_sync: {
        enabled: true,
        locked: false,
        source: 'database',
      },
    },
  });

  await fixture.stop();
  running = await fixture.start();

  assert.deepEqual(await request(running.baseUrl, '/api/settings'), {
    status: 200,
    body: {
      metadata_auto_sync: {
        enabled: true,
        locked: false,
        source: 'database',
      },
    },
  });
});

for (const [autoSync, lockedEnabled] of [['on', true], ['off', false]]) {
  test(`AUTO_SYNC=${autoSync} locks the effective setting without overwriting SQLite`, async (t) => {
    const fixture = await createFixture(t, `skills-settings-${autoSync}-`);
    let running = await fixture.start();

    const databaseEnabled = !lockedEnabled;
    assert.equal((await request(running.baseUrl, '/api/settings/metadata-auto-sync', {
      method: 'PATCH',
      body: JSON.stringify({ enabled: databaseEnabled }),
    })).status, 200);
    await fixture.stop();

    running = await fixture.start(autoSync);
    assert.deepEqual(await request(running.baseUrl, '/api/settings'), {
      status: 200,
      body: {
        metadata_auto_sync: {
          enabled: lockedEnabled,
          locked: true,
          source: 'environment',
        },
      },
    });

    const lockedPatch = await request(running.baseUrl, '/api/settings/metadata-auto-sync', {
      method: 'PATCH',
      body: JSON.stringify({ enabled: lockedEnabled }),
    });
    assert.equal(lockedPatch.status, 409);
    assert.match(lockedPatch.body.error, /AUTO_SYNC/);
    await fixture.stop();

    running = await fixture.start();
    assert.deepEqual(await request(running.baseUrl, '/api/settings'), {
      status: 200,
      body: {
        metadata_auto_sync: {
          enabled: databaseEnabled,
          locked: false,
          source: 'database',
        },
      },
    });
  });
}
