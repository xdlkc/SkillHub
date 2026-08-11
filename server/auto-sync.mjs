const SETTING_KEY = 'metadata_auto_sync';

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
    if (envValue === 'on' || envValue === 'off') {
      return {
        enabled: envValue === 'on',
        locked: true,
        source: 'environment',
      };
    }

    const row = db.prepare(
      'SELECT value FROM app_settings WHERE key = ?',
    ).get(SETTING_KEY);

    if (row) {
      return {
        enabled: row.value === '1',
        locked: false,
        source: 'database',
      };
    }

    return {
      enabled: false,
      locked: false,
      source: 'default',
    };
  }

  function cancelPending() {
    if (timer !== null) {
      cancel(timer);
      timer = null;
    }
    dirty = false;
  }

  function setEnabled(enabled) {
    if (getState().locked) {
      const error = new Error(
        '自动同步由 AUTO_SYNC 环境变量锁定，请修改环境变量并重启服务。',
      );
      error.code = 'AUTO_SYNC_LOCKED';
      throw error;
    }

    db.prepare(`
      INSERT INTO app_settings(key, value) VALUES (?, ?)
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
