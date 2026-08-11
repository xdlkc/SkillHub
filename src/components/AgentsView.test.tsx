// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AgentsView from './AgentsView';

const apiMock = vi.hoisted(() => ({
  agents: vi.fn(),
  installed: vi.fn(),
  setAgentsEnabled: vi.fn(),
  installItem: vi.fn(),
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

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
    expect(screen.getByRole('checkbox', { name: '选择 Claude Code' }).closest('.agent-card')?.className).toContain('disabled');
  });

  it('expands a card through a semantic button with an accessible state', async () => {
    const user = userEvent.setup();
    render(<AgentsView onToast={vi.fn()} />);
    await screen.findByText('Claude Code');

    const summary = screen.getByRole('button', { name: '查看 Claude Code 的 skills' });
    expect(summary.getAttribute('aria-expanded')).toBe('false');
    const controls = summary.getAttribute('aria-controls');

    await user.click(summary);

    expect(summary.getAttribute('aria-expanded')).toBe('true');
    expect(controls).not.toBeNull();
    expect(document.getElementById(controls!)).not.toBeNull();
  });

  it('does not expand a card when its checkbox is toggled', async () => {
    const user = userEvent.setup();
    render(<AgentsView onToast={vi.fn()} />);
    await screen.findByText('Claude Code');

    await user.click(screen.getByRole('checkbox', { name: '选择 Claude Code' }));

    expect(screen.getByRole('button', { name: '查看 Claude Code 的 skills' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('preserves selection and agent state when a bulk preference update fails', async () => {
    const user = userEvent.setup();
    const onToast = vi.fn();
    apiMock.setAgentsEnabled.mockRejectedValueOnce(new Error('network failed'));
    render(<AgentsView onToast={onToast} />);
    await screen.findByText('Claude Code');

    const checkbox = screen.getByRole('checkbox', { name: '选择 Claude Code' }) as HTMLInputElement;
    await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: '批量禁用 (1)' }));

    await waitFor(() => expect(onToast).toHaveBeenCalledWith('network failed', true));
    expect(checkbox.checked).toBe(true);
    expect(checkbox.closest('.agent-card')?.className).not.toContain('disabled');
  });

  it('keeps preference controls disabled when a generic action starts during a pending bulk update', async () => {
    const user = userEvent.setup();
    const onToast = vi.fn();
    const bulk = deferred<{ agents: string[]; enabled: boolean; updated: number }>();
    const update = deferred<{ name: string; target: string; existed: boolean; changed: boolean; diff: null }>();
    apiMock.installed.mockResolvedValueOnce([
      { agent: 'claude-code', name: 'sample', description: 'sample skill', repo_id: 1, path: 'sample' },
    ]);
    apiMock.setAgentsEnabled.mockReturnValueOnce(bulk.promise);
    apiMock.installItem.mockReturnValueOnce(update.promise);
    render(<AgentsView onToast={onToast} />);
    await screen.findByText('Claude Code');

    await user.click(screen.getByRole('checkbox', { name: '选择 Claude Code' }));
    await user.click(screen.getByRole('button', { name: '批量禁用 (1)' }));
    await user.click(screen.getByRole('button', { name: '查看 Claude Code 的 skills' }));
    await user.click(screen.getByRole('button', { name: '⟳ 全部更新' }));

    const checkbox = screen.getByRole('checkbox', { name: '选择 Claude Code' }) as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);
    expect((screen.getByRole('button', { name: '禁用中…' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByRole('button', { name: '◎ 禁用' }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true);

    update.resolve({ name: 'sample', target: '/claude/sample', existed: true, changed: true, diff: null });
    await waitFor(() => expect(onToast).toHaveBeenCalledWith('全部更新完成：1/1 成功'));
    expect(checkbox.disabled).toBe(true);

    bulk.resolve({ agents: ['claude-code'], enabled: false, updated: 1 });
    await waitFor(() => expect(checkbox.disabled).toBe(false));
  });
});
