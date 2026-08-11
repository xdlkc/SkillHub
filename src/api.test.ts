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

    const result = await api.setAgentsEnabled(['codex', 'claude-code'], false);

    expect(result).toEqual({ agents: ['codex', 'claude-code'], enabled: false, updated: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/agents', {
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
      body: JSON.stringify({ agents: ['codex', 'claude-code'], enabled: false }),
    });
  });

  it('rejects with the server error for a non-OK response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Could not update agents' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.setAgentsEnabled(['codex'], true)).rejects.toThrow('Could not update agents');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
