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
