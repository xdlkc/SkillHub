import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import {
  AgentPreferenceError,
  enabledInstalledAgentIds,
  getAgentsWithPreferences,
  updateAgentPreferences,
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
  db.prepare('INSERT INTO agent_prefs (agent, enabled) VALUES (?, ?)').run('cursor', 0);

  expect(enabledInstalledAgentIds(db, agents)).toEqual(['claude-code']);
});

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
