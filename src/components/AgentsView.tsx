import { useEffect, useMemo, useState } from 'react';
import type { AgentInfo, InstalledItem, DiffEntry } from '../types';
import { api } from '../api';
import DiffPanel from './DiffPanel';
import { navigate } from '../router';
import {
  applyAgentEnabled,
  clearAgentSelection,
  isBulkActionDisabled,
  selectVisibleAgentIds,
  toggleAgentSelection,
} from './agentSelection';

export default function AgentsView({ onToast }: { onToast: (m: string, e?: boolean) => void }) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [installed, setInstalled] = useState<InstalledItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [diffMap, setDiffMap] = useState<Map<string, DiffEntry[]>>(new Map());
  const [busy, setBusy] = useState('');
  const [q, setQ] = useState('');
  const [facet, setFacet] = useState<'all' | 'present' | 'absent' | 'disabled' | 'has-skills'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const loadAll = () =>
    Promise.all([api.agents(), api.installed()])
      .then(([a, inst]) => { setAgents(a.agents); setInstalled(inst); })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  useEffect(() => { loadAll(); }, []);

  const byAgent = useMemo(() => {
    const m = new Map<string, InstalledItem[]>();
    for (const i of installed) {
      if (!m.has(i.agent)) m.set(i.agent, []);
      m.get(i.agent)!.push(i);
    }
    return m;
  }, [installed]);

  const sortedAgents = useMemo(
    () =>
      [...agents].sort((a, b) => {
        const ia = byAgent.has(a.id) ? 1 : 0;
        const ib = byAgent.has(b.id) ? 1 : 0;
        return ib - ia || a.name.localeCompare(b.name);
      }),
    [agents, byAgent]
  );

  const filteredAgents = useMemo(() => {
    const query = q.trim().toLowerCase();
    return sortedAgents.filter((a) => {
      if (query && !`${a.name}\n${a.id}\n${a.dir}`.toLowerCase().includes(query)) return false;
      if (facet === 'present') return a.installed;
      if (facet === 'absent') return !a.installed;
      if (facet === 'disabled') return !a.enabled;
      if (facet === 'has-skills') return (byAgent.get(a.id)?.length ?? 0) > 0;
      return true;
    });
  }, [sortedAgents, q, facet, byAgent]);

  const preferenceBusy = busy === 'agents:bulk' || busy.endsWith(':enabled');
  const bulkDisabled = isBulkActionDisabled(selected.size, preferenceBusy);

  const selectCurrentResults = () =>
    setSelected((current) => selectVisibleAgentIds(current, filteredAgents.map((agent) => agent.id)));

  const doBulkEnabled = async (enabled: boolean) => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBusy('agents:bulk');
    try {
      const result = await api.setAgentsEnabled(ids, enabled);
      setAgents((current) => applyAgentEnabled(current, result.agents, result.enabled));
      onToast(`已${result.enabled ? '启用' : '禁用'} ${result.updated} 个 agent`);
    } catch (error) {
      onToast((error as Error).message, true);
    } finally {
      setBusy('');
    }
  };

  const toggleAgent = (id: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const toggleEnabled = async (agent: AgentInfo) => {
    const key = `${agent.id}:enabled`;
    setBusy(key);
    try {
      const result = await api.setAgentEnabled(agent.id, !agent.enabled);
      setAgents((prev) => prev.map((a) => a.id === agent.id ? { ...a, enabled: result.enabled } : a));
      onToast(result.enabled ? `已启用 ${agent.name}` : `已禁用 ${agent.name}（不再出现在安装列表）`);
    } catch (e) {
      onToast((e as Error).message, true);
    } finally {
      setBusy('');
    }
  };

  const doDiff = async (it: InstalledItem) => {
    if (!it.repo_id || !it.path) { onToast('该 skill 无来源记录，无法 diff', true); return; }
    const key = `${it.agent}:${it.name}`;
    setBusy(key);
    try {
      const r = await api.diffItem(it.repo_id, it.path, it.agent);
      setDiffMap(new Map(diffMap).set(key, r.diff ?? []));
    } catch (e) {
      onToast((e as Error).message, true);
    } finally {
      setBusy('');
    }
  };
  const doUpdate = async (it: InstalledItem) => {
    if (!it.repo_id || !it.path) { onToast('该 skill 无来源记录，无法更新', true); return; }
    const key = `${it.agent}:${it.name}`;
    setBusy(key);
    try {
      await api.installItem(it.repo_id, it.path, it.agent, true);
      onToast(`已更新 ${it.name} → ${it.agent}`);
    } catch (e) {
      onToast((e as Error).message, true);
    } finally {
      setBusy('');
    }
  };
  const doUninstall = async (it: InstalledItem) => {
    const key = `${it.agent}:${it.name}`;
    setBusy(key);
    try {
      const r = await api.uninstallItem(it.agent, it.name);
      if (!r.removed) { onToast(`${it.name} 未安装在 ${it.agent}`, true); return; }
      setInstalled((prev) => prev.filter((x) => !(x.agent === it.agent && x.name === it.name)));
      onToast(`已卸载 ${it.name} ← ${it.agent}`);
    } catch (e) {
      onToast((e as Error).message, true);
    } finally {
      setBusy('');
    }
  };
  const doUpdateAll = async (agentId: string) => {
    const list = byAgent.get(agentId) ?? [];
    const updatable = list.filter((i) => i.repo_id && i.path);
    if (updatable.length === 0) { onToast(`${agentId} 无来源可更新的 skills`, true); return; }
    setBusy(`${agentId}:all`);
    let ok = 0;
    const failed: string[] = [];
    for (const it of updatable) {
      try {
        await api.installItem(it.repo_id!, it.path!, agentId, true);
        ok++;
      } catch {
        failed.push(it.name);
      }
    }
    setBusy('');
    onToast(`全部更新完成：${ok}/${updatable.length} 成功${failed.length ? `，失败: ${failed.slice(0, 3).join(', ')}` : ''}${failed.length > 3 ? '…' : ''}`);
  };

  const totalInstalled = installed.length;
  const presentAgents = agents.filter((a) => a.installed);
  const facetCounts = {
    all: agents.length,
    present: presentAgents.length,
    absent: agents.filter((a) => !a.installed).length,
    'has-skills': agents.filter((a) => (byAgent.get(a.id)?.length ?? 0) > 0).length,
    disabled: agents.filter((a) => !a.enabled).length,
  };

  if (loading) return <div className="empty"><div className="big">加载中…</div></div>;
  if (error) return <div className="empty"><div className="big">⚠ ERROR</div>{error}</div>;

  return (
    <div>
      <div className="page-head">
        <h2 className="page-title">Agents · 管理</h2>
        <p className="page-desc">
          管理每个本地 agent 已安装的 skills：查看来源、<b>更新</b>、<b>卸载</b>、<b>diff</b>。
          共 {agents.length} 个 agent，本机已装 {presentAgents.length} 个，已安装 skills {totalInstalled} 个。
        </p>
      </div>

      <div className="toolbar" style={{ marginBottom: 18 }}>
        <div className="search">
          <span className="icon">⌕</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索 agent 名称 / id / 目录…"
          />
        </div>
        <div className="filters">
          {([
            ['all', '全部'],
            ['present', '已装 CLI'],
            ['absent', '未装 CLI'],
            ['has-skills', '有 skills'],
            ['disabled', '已禁用'],
          ] as const).map(([value, label]) => (
            <span key={value} className={`chip${facet === value ? ' on' : ''}`} onClick={() => setFacet(value)}>
              {label}<span className="cnt">{facetCounts[value]}</span>
            </span>
          ))}
        </div>
        <div className="agent-bulk-actions">
          <span className="agent-selection-count">已选 {selected.size} 个</span>
          <button className="btn ghost" onClick={selectCurrentResults} disabled={preferenceBusy || filteredAgents.length === 0}>
            选择当前结果
          </button>
          <button className="btn ghost" onClick={() => setSelected(clearAgentSelection())} disabled={preferenceBusy || selected.size === 0}>
            清空选择
          </button>
          <button className="btn primary" onClick={() => doBulkEnabled(true)} disabled={bulkDisabled}>
            批量启用 ({selected.size})
          </button>
          <button className="btn danger" onClick={() => doBulkEnabled(false)} disabled={bulkDisabled}>
            批量禁用 ({selected.size})
          </button>
        </div>
      </div>

      <div className="agent-grid">
        {filteredAgents.length === 0 ? (
          <div className="empty"><div className="big">∅ 无匹配</div>换个关键词或筛选条件试试</div>
        ) : filteredAgents.map((a) => {
          const list = byAgent.get(a.id) ?? [];
          const open = expanded.has(a.id);
          return (
            <div className={`agent-card${a.installed ? '' : ' absent'}${selected.has(a.id) ? ' selected' : ''}`} key={a.id} style={{ opacity: a.enabled ? undefined : 0.45 }}>
              <div className="agent-card-head" onClick={() => toggleAgent(a.id)}>
                <input
                  className="agent-select"
                  type="checkbox"
                  aria-label={`选择 ${a.name}`}
                  checked={selected.has(a.id)}
                  disabled={preferenceBusy}
                  onClick={(event) => event.stopPropagation()}
                  onChange={() => setSelected((current) => toggleAgentSelection(current, a.id))}
                />
                <div className="agent-card-name">
                  {a.name}
                  {!a.enabled && (
                    <span className="badge" style={{ color: 'var(--red)', borderColor: 'rgba(255,107,107,0.4)' }}>已禁用</span>
                  )}
                  {a.installed ? (
                    <span className="clone-tag">✓ {list.length} skills</span>
                  ) : (
                    <span className="badge">未安装 CLI</span>
                  )}
                </div>
                <div className="agent-card-dir">{a.dir}</div>
                <div className="agent-card-ops" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="btn ghost"
                    style={{ padding: '4px 10px', fontSize: 11 }}
                    title={a.enabled ? '禁用后不再出现在安装列表' : '重新启用该 agent'}
                    disabled={preferenceBusy}
                    onClick={() => toggleEnabled(a)}
                  >
                    {a.enabled ? '◎ 禁用' : '● 启用'}
                  </button>
                  {a.installed && list.length > 0 && (
                    <button
                      className="btn" style={{ padding: '4px 10px', fontSize: 11 }}
                      disabled={busy === `${a.id}:all`}
                      onClick={() => doUpdateAll(a.id)}
                    >
                      {busy === `${a.id}:all` ? '更新中…' : '⟳ 全部更新'}
                    </button>
                  )}
                  <span className="agent-chevron">{open ? '▴' : '▾'}</span>
                </div>
              </div>
              {open && a.installed && (
                <div className="agent-card-body">
                  {list.length === 0 ? (
                    <div className="empty" style={{ padding: '20px' }}>该 agent 尚未安装任何 skill</div>
                  ) : (
                    list.map((it) => {
                      const dkey = `${it.agent}:${it.name}`;
                      const diff = diffMap.get(dkey);
                      const hasSrc = !!it.repo_id && !!it.path;
                      return (
                        <div key={dkey}>
                          <div className="inst-row">
                            <div className="inst-name">
                              {it.name}
                              {it.repo && (
                                <span className="badge" style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); navigate(`/skill/${it.repo_id}`); }} title="来源仓库">
                                  {it.repo}
                                </span>
                              )}
                              {!hasSrc && <span className="badge" title="早期安装，无来源记录">无来源</span>}
                            </div>
                            <div className="inst-desc">{it.description || ''}</div>
                            <div className="inst-ops">
                              <button className="op" title="查看 diff" disabled={busy === dkey || !hasSrc} onClick={() => doDiff(it)}>⧉</button>
                              <button className="op clone" title="更新" disabled={busy === dkey || !hasSrc} onClick={() => doUpdate(it)}>⟳</button>
                              <button className="op del" title="卸载" disabled={busy === dkey} onClick={() => doUninstall(it)}>✕</button>
                            </div>
                          </div>
                          {diff && <div style={{ margin: '4px 0 12px' }}><DiffPanel diff={diff} /></div>}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
              {open && !a.installed && (
                <div className="agent-card-body">
                  <div className="empty" style={{ padding: '20px' }}>未检测到该 agent 的 CLI（{a.dir}）</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
