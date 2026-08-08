import { useEffect, useState } from 'react';
import type { AgentInfo, Skill, InstallAllResult } from '../types';
import { api } from '../api';
import { Modal } from './Modal';

/** 一键安装：仓库全部 skills → 选定的 agents */
export default function InstallAllModal({
  skill, onClose, onToast,
}: {
  skill: Skill;
  onClose: () => void;
  onToast: (m: string, e?: boolean) => void;
}) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [installing, setInstalling] = useState(false);
  const [result, setResult] = useState<InstallAllResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.agents().then((r) => {
      setAgents(r.agents);
      setSelected(new Set(r.agents.filter((a) => a.installed).map((a) => a.id)));
    }).catch((e) => setError((e as Error).message));
  }, []);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  const toggleAll = () =>
    setSelected((prev) =>
      prev.size === agents.filter((a) => a.installed).length
        ? new Set()
        : new Set(agents.filter((a) => a.installed).map((a) => a.id))
    );

  const submit = async () => {
    if (selected.size === 0) { setError('请至少选择一个 agent'); return; }
    setInstalling(true);
    setError('');
    try {
      const r = await api.installAll(skill.id, [...selected]);
      setResult(r);
      onToast(`安装完成：${r.ok}/${r.total} 成功`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <Modal title={`⤓ 安装全部 · ${skill.full_name}`} onClose={onClose}>
      {!result ? (
        <>
          <p className="hint" style={{ marginBottom: 14 }}>
            将仓库内全部 skills（含 SKILL.md 及其引用文件）安装到选定的 agent。
            <code> {skill.desc || ''}</code>
          </p>
          <div className="field">
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>选择 agents（{selected.size} 个）</span>
              <span className="btn ghost" style={{ padding: '2px 10px', fontSize: 11 }} onClick={toggleAll}>全选/清空</span>
            </label>
            <div className="tag-pick">
              {agents.map((a) => (
                <span
                  key={a.id}
                  className={`chip${selected.has(a.id) ? ' on' : ''}${a.installed ? '' : ' dim'}`}
                  onClick={() => toggle(a.id)}
                  title={a.installed ? a.dir : `未安装 CLI: ${a.dir}`}
                >
                  {a.name}{!a.installed && ' (未装 CLI)'}
                </span>
              ))}
            </div>
          </div>
          {error && <div className="err">⚠ {error}</div>}
          <div className="modal-actions">
            <button className="btn ghost" onClick={onClose}>取消</button>
            <button className="btn primary" onClick={submit} disabled={installing}>
              {installing ? '安装中…' : `⤓ 安装到 ${selected.size} 个 agent`}
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
