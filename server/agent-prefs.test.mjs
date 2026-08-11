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
