import { useEffect, useMemo, useState } from 'react';
import type { SkillItem, InstalledItem, DiffEntry } from '../types';
import { api } from '../api';
import { renderMarkdown } from '../markdown';
import { navigate } from '../router';
import AgentModal from './AgentModal';
import DiffPanel from './DiffPanel';

export default function SkillsView({ onCopy, onToast }: { onCopy: (t: string) => void; onToast: (m: string, e?: boolean) => void }) {
  const [items, setItems] = useState<SkillItem[]>([]);
  const [installed, setInstalled] = useState<InstalledItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [repo, setRepo] = useState('all');
  const [filter, setFilter] = useState<'all' | 'installed'>('all');
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [agentModal, setAgentModal] = useState<SkillItem | null>(null);
  const [diffMap, setDiffMap] = useState<Map<string, DiffEntry[]>>(new Map());
  const [busy, setBusy] = useState('');

  const loadAll = () =>
    Promise.all([api.skillItems(), api.installed()])
      .then(([r, inst]) => { setItems(r.items); setInstalled(inst); })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  useEffect(() => { loadAll(); }, []);

  const installedBySkill = useMemo(() => {
    const m = new Map<string, InstalledItem[]>();
    for (const i of installed) {
      if (!m.has(i.name)) m.set(i.name, []);
      m.get(i.name)!.push(i);
    }
    return m;
  }, [installed]);

  const repos = useMemo(() => [...new Set(items.map((i) => i.repo))].sort(), [items]);

  const filtered = useMemo(
    () =>
      items.filter((i) => {
        if (filter === 'installed' && !installedBySkill.has(i.name)) return false;
        if (repo !== 'all' && i.repo !== repo) return false;
        if (query) {
          const hay = `${i.name} ${i.description} ${i.repo} ${i.path}`.toLowerCase();
          if (!hay.includes(query.toLowerCase())) return false;
        }
        return true;
      }),
    [items, query, repo, filter, installedBySkill]
  );

  const toggle = async (i: SkillItem) => {
    const key = `${i.repo_id}|${i.path}`;
    if (openPath === key) { setOpenPath(null); setContent(null); return; }
    setOpenPath(key);
    setContent(null);
    setContentLoading(true);
    try {
      const r = await api.skillContent(i.repo_id, i.path);
      setContent(r.content);
    } catch (e) {
      setContent(`⚠ 加载失败: ${(e as Error).message}`);
    } finally {
      setContentLoading(false);
    }
  };

  const refreshInstalled = async () => {
    try { setInstalled(await api.installed()); } catch { /* ignore */ }
  };
  const doDiff = async (i: SkillItem, agent: string) => {
    const key = `${agent}:${i.name}`;
    setBusy(key);
    try {
      const r = await api.diffItem(i.repo_id, i.path, agent);
      setDiffMap(new Map(diffMap).set(key, r.diff ?? []));
    } catch (e) {
      onToast((e as Error).message, true);
    } finally {
      setBusy('');
    }
  };
  const doUpdate = async (i: SkillItem, agent: string) => {
    setBusy(`${agent}:${i.name}`);
    try {
      const r = await api.installItem(i.repo_id, i.path, agent, true);
      onToast(`已更新 ${i.name} → ${agent}`);
      await refreshInstalled();
    } catch (e) {
      onToast((e as Error).message, true);
    } finally {
      setBusy('');
    }
  };
  const doUninstall = async (agent: string, name: string) => {
    setBusy(`${agent}:${name}`);
    try {
      const r = await api.uninstallItem(agent, name);
      if (!r.removed) { onToast(`${name} 未安装在 ${agent}`, true); return; }
      onToast(`已卸载 ${name} ← ${agent}`);
      await refreshInstalled();
    } catch (e) {
      onToast((e as Error).message, true);
    } finally {
      setBusy('');
    }
  };

  return (
    <div>
      <div className="page-head">
        <h2 className="page-title">Skills</h2>
        <p className="page-desc">
          已 clone 仓库内的 <b style={{ color: 'var(--acid)' }}>skill 级</b>条目（SKILL.md）。
          可<b>安装到本地各 agent</b>（Claude Code / Codex / Cursor / Gemini CLI…），并查看源与已安装的 <b>diff</b>。
        </p>
        <div className="stat-row" style={{ marginTop: 20 }}>
          <div className="stat"><div className="num acid">{items.length}</div><div className="lbl">已扫描 Skills</div></div>
          <div className="stat"><div className="num">{repos.length}</div><div className="lbl">来源仓库</div></div>
          <div className="stat"><div className="num">{installed.length}</div><div className="lbl">已安装（所有 agent）</div></div>
        </div>
      </div>

      <div className="toolbar">
        <div className="search">
          <span className="icon">⌕</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索 skill 名 / 描述…" autoComplete="off" />
        </div>
        <div className="filters">
          <span className={`chip${filter === 'all' ? ' on' : ''}`} onClick={() => setFilter('all')}>全部<span className="cnt">{items.length}</span></span>
          <span className={`chip${filter === 'installed' ? ' on' : ''}`} onClick={() => setFilter('installed')}>已安装<span className="cnt">{installedBySkill.size}</span></span>
          <span className={`chip${repo === 'all' ? ' on' : ''}`} onClick={() => setRepo('all')}>全部仓库</span>
          {repos.map((r) => (
            <span key={r} className={`chip${repo === r ? ' on' : ''}`} onClick={() => setRepo(r)}>
              {r}<span className="cnt">{items.filter((i) => i.repo === r).length}</span>
            </span>
          ))}
        </div>
      </div>

      {loading && <div className="empty"><div className="big">扫描中…</div>正在读取已 clone 仓库的 SKILL.md</div>}
      {error && <div className="empty"><div className="big">⚠ ERROR</div>{error}</div>}
      {!loading && !error && items.length === 0 && (
        <div className="empty"><div className="big">∅ 暂无数据</div>先到排行榜 clone 仓库到本地。</div>
      )}

      {!loading && filtered.length > 0 && (
        <section className="board">
          <div className="board-head" style={{ gridTemplateColumns: 'minmax(0,1fr) 150px 130px 70px', paddingRight: 18 }}>
            <div>SKILL</div><div>来源仓库</div><div>已安装</div><div style={{ textAlign: 'right' }}>操作</div>
          </div>
          {filtered.map((i, idx) => {
            const key = `${i.repo_id}|${i.path}`;
            const open = openPath === key;
            const install = `npx skills add https://github.com/${i.repo} --skill ${i.name}`;
            const mine = installedBySkill.get(i.name) ?? [];
            return (
              <div key={key}>
                <div className="skill-item" style={{ gridTemplateColumns: 'minmax(0,1fr) 150px 130px 70px', animationDelay: `${Math.min(idx * 18, 400)}ms` }}>
                  <div className="skill-main" onClick={() => toggle(i)}>
                    <div className="skill-name">{i.name}</div>
                    <div className="skill-desc">{i.description || '（无描述）'}</div>
                    <div className="skill-meta">
                      <span className="badge official">skill</span>
                      <span className="skill-path">{i.path}</span>
                    </div>
                  </div>
                  <div className="skill-repo" onClick={(e) => { e.stopPropagation(); navigate(`/skill/${i.repo_id}`); }} title="查看仓库详情">
                    <span className="badge">{i.repo}</span>
                  </div>
                  <div className="skill-installed">
                    {mine.length === 0 ? <span className="dim">—</span> : mine.map((m) => (
                      <span key={m.agent} className="clone-tag" title={m.dir}>{m.agent}</span>
                    ))}
                  </div>
                  <div className="skill-chevron" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="op clone" title={`安装到 agent (${i.name})`} onClick={(e) => { e.stopPropagation(); setAgentModal(i); }}>⤓</button>
                    <span style={{ cursor: 'pointer', color: 'var(--dim2)' }} onClick={() => toggle(i)}>{open ? '▴' : '▾'}</span>
                  </div>
                </div>
                {open && (
                  <div className="skill-detail">
                    <div className="cmd skill-install">
                      <span className="prompt">$</span>
                      <code>{install}</code>
                      <button className="btn ghost" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => onCopy(install)}>COPY</button>
                      <button className="btn" style={{ padding: '4px 12px', fontSize: 11 }} onClick={(e) => { e.stopPropagation(); setAgentModal(i); }}>⤓ 安装到 agent</button>
                    </div>

                    {mine.length > 0 && (
                      <div className="installed-ops">
                        <span className="installed-label">已安装：</span>
                        {mine.map((m) => (
                          <span className="installed-agent" key={m.agent}>
                            <b>{m.agent}</b>
                            <button className="op" title="查看 diff" disabled={busy === `${m.agent}:${i.name}`} onClick={() => doDiff(i, m.agent)}>⧉ diff</button>
                            <button className="op clone" title="更新" disabled={busy === `${m.agent}:${i.name}`} onClick={() => doUpdate(i, m.agent)}>⟳</button>
                            <button className="op del" title="卸载" disabled={busy === `${m.agent}:${i.name}`} onClick={() => doUninstall(m.agent, i.name)}>✕</button>
                          </span>
                        ))}
                      </div>
                    )}
                    {diffMap.get(`${mine[0]?.agent}:${i.name}`) && mine[0] && (
                      <DiffPanel diff={diffMap.get(`${mine[0]?.agent}:${i.name}`)!} />
                    )}

                    <div className="skill-readme">
                      {contentLoading ? (
                        <div className="readme-hint">加载中…</div>
                      ) : content === null ? (
                        <div className="readme-hint">点击上方安装或查看 SKILL.md 内容</div>
                      ) : (
                        <div className="readme" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {agentModal && (
        <AgentModal
          skill={agentModal}
          onDone={(m) => { onToast(m); refreshInstalled(); }}
          onClose={() => setAgentModal(null)}
        />
      )}
    </div>
  );
}
