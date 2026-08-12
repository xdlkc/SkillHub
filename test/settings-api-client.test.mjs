import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { api } from '../src/api.ts';

const settings = {
  metadata_auto_sync: {
    enabled: true,
    locked: false,
    source: 'database',
  },
};

test('npm test enables TypeScript stripping for the declared Node baseline', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );

  assert.match(packageJson.scripts.test, /node --experimental-strip-types --test/);
});

test('settings fetches and returns the settings envelope', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls = [];
  globalThis.fetch = async (...args) => {
    calls.push(args);
    return new Response(JSON.stringify(settings), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  assert.deepEqual(await api.settings(), settings);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/api/settings');
  assert.equal(calls[0][1].method, undefined);
});

test('setMetadataAutoSync patches and returns the settings envelope', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls = [];
  globalThis.fetch = async (...args) => {
    calls.push(args);
    return new Response(JSON.stringify(settings), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  assert.deepEqual(await api.setMetadataAutoSync(true), settings);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/api/settings/metadata-auto-sync');
  assert.equal(calls[0][1].method, 'PATCH');
  assert.deepEqual(calls[0][1].headers, { 'Content-Type': 'application/json' });
  assert.equal(calls[0][1].body, JSON.stringify({ enabled: true }));
});
