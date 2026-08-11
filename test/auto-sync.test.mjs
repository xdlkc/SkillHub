import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createAutoSyncController } from '../server/auto-sync.mjs';

process.removeAllListeners('warning');

function createDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE app_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  return db;
}

function createFakeScheduler() {
  const tasks = [];

  return {
    tasks,
    schedule(callback, delay) {
      const task = { callback, delay, cancelled: false };
      tasks.push(task);
      return task;
    },
    cancel(task) {
      task.cancelled = true;
    },
  };
}

test('defaults to disabled when neither SQLite nor the environment provides a setting', () => {
  const db = createDb();
  const controller = createAutoSyncController({
    db,
    envValue: undefined,
    exportNow: () => true,
    pushNow: async () => {},
  });

  assert.deepEqual(controller.getState(), {
    enabled: false,
    locked: false,
    source: 'default',
  });
});

test('setEnabled persists enabled and disabled values in SQLite', () => {
  const db = createDb();
  const controller = createAutoSyncController({
    db,
    envValue: undefined,
    exportNow: () => true,
    pushNow: async () => {},
  });
  const readValue = () => db.prepare(
    'SELECT value FROM app_settings WHERE key = ?',
  ).get('metadata_auto_sync')?.value;

  assert.deepEqual(controller.setEnabled(true), {
    enabled: true,
    locked: false,
    source: 'database',
  });
  assert.equal(readValue(), '1');

  assert.deepEqual(controller.setEnabled(false), {
    enabled: false,
    locked: false,
    source: 'database',
  });
  assert.equal(readValue(), '0');
});

test('AUTO_SYNC on and off lock the effective setting and reject writes', () => {
  for (const [envValue, enabled] of [['on', true], ['off', false]]) {
    const db = createDb();
    const controller = createAutoSyncController({
      db,
      envValue,
      exportNow: () => true,
      pushNow: async () => {},
    });

    assert.deepEqual(controller.getState(), {
      enabled,
      locked: true,
      source: 'environment',
    });
    assert.throws(
      () => controller.setEnabled(!enabled),
      (error) => error instanceof Error && error.code === 'AUTO_SYNC_LOCKED',
    );
  }
});

test('an unknown AUTO_SYNC value falls back to SQLite and then the default', () => {
  const db = createDb();
  db.prepare('INSERT INTO app_settings(key, value) VALUES (?, ?)')
    .run('metadata_auto_sync', '1');
  const controller = createAutoSyncController({
    db,
    envValue: 'yes',
    exportNow: () => true,
    pushNow: async () => {},
  });

  assert.deepEqual(controller.getState(), {
    enabled: true,
    locked: false,
    source: 'database',
  });

  db.prepare('DELETE FROM app_settings WHERE key = ?').run('metadata_auto_sync');
  assert.deepEqual(controller.getState(), {
    enabled: false,
    locked: false,
    source: 'default',
  });
});

test('markDirty is inert while disabled and debounces one export followed by one push', async () => {
  const db = createDb();
  const scheduler = createFakeScheduler();
  const calls = [];
  const controller = createAutoSyncController({
    db,
    envValue: undefined,
    exportNow: () => {
      calls.push('export');
      return true;
    },
    pushNow: async () => {
      calls.push('push');
    },
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });

  controller.markDirty();
  assert.equal(scheduler.tasks.length, 0);

  controller.setEnabled(true);
  controller.markDirty();
  controller.markDirty();

  assert.equal(scheduler.tasks.length, 2);
  assert.equal(scheduler.tasks[0].cancelled, true);
  assert.equal(scheduler.tasks[1].delay, 2500);

  await scheduler.tasks[1].callback();
  assert.deepEqual(calls, ['export', 'push']);
});

test('disabling pending work cancels it and re-enabling does not replay it', async () => {
  const db = createDb();
  const scheduler = createFakeScheduler();
  const calls = [];
  const controller = createAutoSyncController({
    db,
    envValue: undefined,
    exportNow: () => {
      calls.push('export');
      return true;
    },
    pushNow: async () => {
      calls.push('push');
    },
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });

  controller.setEnabled(true);
  controller.markDirty();
  const pendingTask = scheduler.tasks[0];

  controller.setEnabled(false);
  assert.equal(pendingTask.cancelled, true);

  controller.setEnabled(true);
  assert.equal(scheduler.tasks.length, 1);
  await pendingTask.callback();
  assert.deepEqual(calls, []);
});
