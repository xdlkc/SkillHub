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
    const current = new Set(['cursor']);
    const result = selectVisibleAgentIds(current, ['claude-code', 'codex']);
    expect([...result]).toEqual(['cursor', 'claude-code', 'codex']);
    expect(result).not.toBe(current);
    expect([...current]).toEqual(['cursor']);
  });

  it('toggles one id and clears all ids', () => {
    const current = new Set(['codex']);
    const selected = toggleAgentSelection(current, 'codex');
    expect([...selected]).toEqual([]);
    expect(selected).not.toBe(current);
    expect([...current]).toEqual(['codex']);

    const added = toggleAgentSelection(current, 'cursor');
    expect([...added]).toEqual(['codex', 'cursor']);
    expect(added).not.toBe(current);
    expect(clearAgentSelection().size).toBe(0);
  });

  it('disables bulk actions with no selection or while preferences are busy', () => {
    expect(isBulkActionDisabled(0, false)).toBe(true);
    expect(isBulkActionDisabled(2, true)).toBe(true);
    expect(isBulkActionDisabled(2, false)).toBe(false);
  });

  it('merges an enabled result into only the returned Agents', () => {
    const result = applyAgentEnabled(agents, ['cursor', 'codex'], false);
    expect(result).toEqual([
      agents[0],
      { ...agents[1], enabled: false },
      { ...agents[2], enabled: false },
    ]);
    expect(result).not.toBe(agents);
    expect(result[0]).toBe(agents[0]);
    expect(result[1]).not.toBe(agents[1]);
    expect(result[2]).not.toBe(agents[2]);
    expect(agents[1].enabled).toBe(true);
    expect(agents[2].enabled).toBe(false);
  });
});
