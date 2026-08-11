import { useEffect, useState } from 'react';
import type { AgentInfo, Skill, SkillItem, InstallAllResult } from '../types';
import { api } from '../api';
import { Modal } from './Modal';

type PrefixMode = 'none' | ':' | '-';

/** 批量安装：仓库内选定 skills → 选定 agents */
export default function InstallAllModal({
  skill, onClose, onToast,
}: {
  skill: Skill;
  onClose: () => void;
  onToast: (m: string, e?: boolean) => void;
}) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [items, setItems] = useState<SkillItem[] | null>(null);
  const [selAgents, setSelAgents] = useState<Set<string>>(new Set());
  const [selSkills, setSelSkills] = useState<Set<string>>(new Set());
  const [installing, setInstalling] = useState(false);
  const [prefixMode, setPrefixMode] = useState<PrefixMode>('-');
  const [result, setResult] = useState<InstallAllResult | null>(null);
  const [error, setError] = useState('');
  const owner = skill.full_name.split('/')[0].toLowerCase();

  useEffect(() => {
    let alive = true;
    setItems(null);
    setResult(null);
    setError('');
    api.agents()
      .then((r) => {
        if (!alive) return;
        const enabled = r.agents.filter((a) => a.enabled);
        setAgents(enabled);
        setSelAgents(new Set(enabled.filter((a) => a.installed).map((a) => a.id)));
      })
      .catch((e) => { if (alive) setError((e as Error).message); });
    api.repoItems(skill.id)
      .then((r) => {
        if (!alive) return;
        setItems(r);
        setSelSkills(new Set(r.map((item) => item.path)));
      })
      .catch((e) => {
        if (!alive) return;
        setItems([]);
        setSelSkills(new Set());
        setError((e as Error).message);
      });
    return () => { alive = false; };
  }, [skill.id]);

  const toggleAgent = (id: string) =>
    setSelAgents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const toggleSkill = (skillPath: string) =>
    setSelSkills((prev) => {
      const next = new Set(prev);
      if (next.has(skillPath)) next.delete(skillPath); else next.add(skillPath);
      return next;
    });
  const toggleAllAgents = () =>
    setSelAgents((prev) => prev.size === agents.length ? new Set() : new Set(agents.map((a) => a.id)));
  const toggleAllSkills = () =>
    setSelSkills((prev) => prev.size === (items?.length ?? 0) ? new Set() : new Set((items ?? []).map((i) => i.path)));

  const submit = async () => {
    if (selSkills.size === 0) { setError('请至少选择一个 skill'); return; }
    if (selAgents.size === 0) { setError('请至少选择一个 agent'); return; }
    setInstalling(true);
    setError('');
    try {
      const r = await api.installAll(
        skill.id,
        [...selAgents],
        [...selSkills],
        prefixMode !== 'none',
        prefixMode === 'none' ? undefined : prefixMode,
      );
      setResult(r);
      onToast(`安装完成：${r.ok}/${r.total} 成功`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setInstalling(false);
    }
  };

  const prefixHint = prefixMode === '-'
    ? '连字符前缀，所有 agent 通用（codex 用 $ 提及、Claude Code 用 / 均可匹配）'
    : prefixMode === ':'
      ? '冒号命名空间，Claude Code 插件风格；注意 codex 输入框不接受冒号（只能从 /skills 菜单选）'
      : '保持原名安装，无法区分来源仓库';

  return (
    <Modal title={`⤓ 安装 skills · ${skill.full_name}`} onClose={onClose}>
      {!result ? (
        <>
          <p className="hint" style={{ marginBottom: 14 }}>
            勾选要安装的 skills（含 SKILL.md 及其引用文件）与目标 agents，支持多选。
          </p>
          <div className="field">
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>选择 skills（{selSkills.size}/{items?.length ?? 0} 个）</span>
              <span className="btn ghost" style={{ padding: '2px 10px', fontSize: 11 }} onClick={toggleAllSkills}>全选/清空</span>
            </label>
            {items === null ? (
              <div className="readme-hint">扫描中…</div>
            ) : items.length === 0 ? (
              <div className="readme-hint">未扫描到 SKILL.md</div>
            ) : (
              <div className="tag-pick" style={{ maxHeight: 180, overflowY: 'auto' }}>
                {items.map((item) => (
                  <span
                    key={item.path}
                    className={`chip${selSkills.has(item.path) ? ' on' : ''}`}
                    onClick={() => toggleSkill(item.path)}
                    title={item.description || item.path}
                  >
                    {item.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="field">
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>选择 agents（{selAgents.size}/{agents.length} 个）</span>
              <span className="btn ghost" style={{ padding: '2px 10px', fontSize: 11 }} onClick={toggleAllAgents}>全选/清空</span>
            </label>
            <div className="tag-pick">
              {agents.map((a) => (
                <span
                  key={a.id}
                  className={`chip${selAgents.has(a.id) ? ' on' : ''}${a.installed ? '' : ' dim'}`}
                  onClick={() => toggleAgent(a.id)}
                  title={a.installed ? a.dir : `未安装 CLI: ${a.dir}`}
                >
                  {a.name}{!a.installed && ' (未装 CLI)'}
                </span>
              ))}
            </div>
          </div>
          <div className="field">
            <label>仓库前缀</label>
            <div className="tag-pick">
              <span className={`chip${prefixMode === '-' ? ' on' : ''}`} onClick={() => setPrefixMode('-')}>{owner}-skill</span>
              <span className={`chip${prefixMode === ':' ? ' on' : ''}`} onClick={() => setPrefixMode(':')}>{owner}:skill</span>
              <span className={`chip${prefixMode === 'none' ? ' on' : ''}`} onClick={() => setPrefixMode('none')}>无前缀</span>
            </div>
            <div className="hint" style={{ marginTop: 8 }}>{prefixHint}</div>
          </div>
          {error && <div className="err">⚠ {error}</div>}
          <div className="modal-actions">
            <button className="btn ghost" onClick={onClose}>取消</button>
            <button className="btn primary" onClick={submit} disabled={installing}>
              {installing ? '安装中…' : `⤓ 安装 ${selSkills.size} 个 skill → ${selAgents.size} 个 agent`}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="import-result">
            <div className="import-line"><span className="import-dot ok" /> 仓库：{result.repo}</div>
            <div className="import-line"><span className="import-dot ok" /> skills：{result.skills.length} 个 × agents：{result.agents.length} 个</div>
            <div className="import-line">
              <span className={`import-dot ${result.failed.length ? 'warn' : 'ok'}`} />
              成功 {result.ok} / {result.total}
            </div>
            {result.failed.length > 0 && (
              <div className="import-failed">
                <div style={{ marginBottom: 6, color: 'var(--red)', fontSize: 12 }}>失败 {result.failed.length} 项：</div>
                {result.failed.slice(0, 8).map((f, i) => (
                  <div key={i} className="import-fail-line">{f.agent} · {f.skill}: {f.error}</div>
                ))}
                {result.failed.length > 8 && <div style={{ color: 'var(--dim2)', fontSize: 11 }}>…还有 {result.failed.length - 8} 项</div>}
              </div>
            )}
          </div>
          <div className="modal-actions">
            <button className="btn ghost" onClick={onClose}>关闭</button>
          </div>
        </>
      )}
    </Modal>
  );
}
