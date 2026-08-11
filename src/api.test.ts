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

    await api.setAgentsEnabled(['codex', 'claude-code'], false);

    expect(fetchMock).toHaveBeenCalledWith('/api/agents', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ agents: ['codex', 'claude-code'], enabled: false }),
    }));
  });
});
