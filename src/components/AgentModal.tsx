import { useEffect, useState } from 'react';
import type { AgentInfo, SkillItem } from '../types';
import { api } from '../api';
import { Modal } from './Modal';

export default function AgentModal({
  skill, onDone, onClose,
}: {
  skill: SkillItem;
  onDone: (msg: string) => void;
  onClose: () => void;
}) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [installedMap, setInstalledMap] = useState<Map<string, boolean>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.agents(), api.installed()])
      .then(([a, inst]) => {
        setAgents(a.agents);
        setInstalledMap(new Map(inst.map((i) => [`${i.agent}:${i.name}`, true])));
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  const act = async (agent: AgentInfo) => {
    setBusy(agent.id);
    setError('');
    const already = installedMap.get(`${agent.id}:${skill.name}`);
    try {
      const r = await api.installItem(skill.repo_id, skill.path, agent.id, already);
      setInstalledMap(new Map(installedMap).set(`${agent.id}:${skill.name}`, true));
      onDone(already ? `已更新 ${skill.name} → ${agent.name}` : `已安装 ${skill.name} → ${agent.name}`);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal title={`安装 · ${skill.name}`} onClose={onClose}>
      <p className="hint" style={{ marginBottom: 14 }}>
        选择要安装到的 agent（<code>npx skills</code> 目录约定，copy 模式）。
        源：<code>{skill.repo}</code> · {skill.path}
      </p>
      <div className="agent-list">
        {agents.map((a) => {
          const already = installedMap.get(`${a.id}:${skill.name}`);
          return (
            <div className={`agent-row${a.installed ? ' present' : ''}`} key={a.id} onClick={() => !busy && act(a)}>
              <div className="agent-name">
                {a.name}
                {!a.installed && <span className="badge">未安装 CLI</span>}
                {already && <span className="clone-tag">✓ 已安装</span>}
              </div>
              <div className="agent-dir">{a.dir}</div>
              <div className="agent-action">{busy === a.id ? '…' : already ? '⟳ 更新' : '⤓ 安装'}</div>
            </div>
          );
        })}
      </div>
      {error && <div className="err">⚠ {error}</div>}
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>关闭</button>
      </div>
    </Modal>
  );
}
