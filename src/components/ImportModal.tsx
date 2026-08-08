import { useState } from 'react';
import type { Skill } from '../types';
import { api } from '../api';
import { Modal } from './Modal';
import { navigate } from '../router';

/** 一键导入：GitHub 拉取 → 入库 → clone 到 registry */
export default function ImportModal({ onClose, onToast }: { onClose: () => void; onToast: (m: string, e?: boolean) => void }) {
  const [repo, setRepo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ skill: Skill; imported: boolean; cloned: boolean; clone_error?: string } | null>(null);

  const submit = async () => {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo.trim())) {
      setError('仓库名必须是 owner/repo 格式');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const r = await api.importRepo(repo.trim());
      setResult(r);
      onToast(r.imported ? `已导入 ${r.skill.full_name}` : `${r.skill.full_name} 已在库中`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="⚡ 一键导入仓库" onClose={onClose}>
      <div className="field">
        <label>GitHub 仓库</label>
        <div className="fetch-bar">
          <input
            value={repo}
            onChange={(e) => { setRepo(e.target.value); setResult(null); }}
            placeholder="owner/repo，如 anthropics/skills"
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            autoFocus
          />
          <button className="btn primary" onClick={submit} disabled={loading}>{loading ? '导入中…' : '导入 + 克隆'}</button>
        </div>
        <div className="hint">自动从 GitHub 拉取元数据并 <code>git clone</code> 到本地 registry</div>
      </div>

      {error && <div className="err">⚠ {error}</div>}

      {result && (
        <div className="import-result">
          <div className="import-line">
            <span className={`import-dot ${result.cloned ? 'ok' : 'warn'}`} /> 数据库记录：{result.imported ? '新导入' : '已存在'}
          </div>
          <div className="import-line">
            <span className={`import-dot ${result.cloned ? 'ok' : 'warn'}`} /> 本地 clone：{result.cloned ? '✓ 已克隆' : `失败（${result.clone_error ?? ''}）`}
          </div>
          <div className="import-line"><span className="import-dot ok" /> ⭐ {result.skill.stars} · {result.skill.lang || '—'}</div>
          <div className="modal-actions">
            <button className="btn ghost" onClick={onClose}>关闭</button>
            <button className="btn primary" onClick={() => navigate(`/skill/${result.skill.id}`)}>查看仓库 →</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
