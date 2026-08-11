// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AgentsView from './AgentsView';

const apiMock = vi.hoisted(() => ({
  agents: vi.fn(),
  installed: vi.fn(),
  setAgentsEnabled: vi.fn(),
}));

vi.mock('../api', () => ({ api: apiMock }));

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.agents.mockResolvedValue({
    home: '/tmp/home',
    agents: [
      { id: 'claude-code', name: 'Claude Code', dir: '/claude', installed: true, enabled: true },
      { id: 'codex', name: 'Codex', dir: '/codex', installed: true, enabled: true },
      { id: 'cursor', name: 'Cursor', dir: '/cursor', installed: false, enabled: false },
    ],
  });
  apiMock.installed.mockResolvedValue([]);
  apiMock.setAgentsEnabled.mockResolvedValue({
    agents: ['claude-code'],
    enabled: false,
    updated: 1,
  });
});

afterEach(() => cleanup());

describe('AgentsView bulk preferences', () => {
  it('selects only the Agents in the current search result', async () => {
    const user = userEvent.setup();
    render(<AgentsView onToast={vi.fn()} />);
    await screen.findByText('Claude Code');

    await user.type(screen.getByPlaceholderText('搜索 agent 名称 / id / 目录…'), 'Claude');
    await user.click(screen.getByRole('button', { name: '选择当前结果' }));

    expect((screen.getByRole('checkbox', { name: '选择 Claude Code' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByRole('checkbox', { name: '选择 Codex' })).toBeNull();
  });

  it('disables one selected Agent through the bulk endpoint', async () => {
    const user = userEvent.setup();
    const onToast = vi.fn();
    render(<AgentsView onToast={onToast} />);
    await screen.findByText('Claude Code');

    await user.click(screen.getByRole('checkbox', { name: '选择 Claude Code' }));
    await user.click(screen.getByRole('button', { name: '批量禁用 (1)' }));

    expect(apiMock.setAgentsEnabled).toHaveBeenCalledWith(['claude-code'], false);
    await waitFor(() => expect(onToast).toHaveBeenCalledWith('已禁用 1 个 agent'));
  });
});
