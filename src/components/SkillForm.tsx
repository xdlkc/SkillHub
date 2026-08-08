import { useState } from 'react';
import type { Skill } from '../types';
import { TAG_META } from '../types';
import { api } from '../api';
import { Modal } from './Modal';

const ALL_TAGS = Object.keys(TAG_META);

export default function SkillForm({
  initial, onSave, onClose,
}: {
  initial?: Skill | null;
  onSave: (data: Partial<Skill>) => Promise<void>;
  onClose: () => void;
}) {
  const [fullName, setFullName] = useState(initial?.full_name ?? '');
  const [desc, setDesc] = useState(initial?.desc ?? '');
  const [stars, setStars] = useState(String(initial?.stars ?? 0));
  const [lang, setLang] = useState(initial?.lang ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [fetchRepo, setFetchRepo] = useState(initial?.full_name ?? '');
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [customTag, setCustomTag] = useState('');

  const toggleTag = (t: string) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  const addCustom = () => {
    const t = customTag.trim();
    if (!t) return;
    setTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setCustomTag('');
  };

  const fetchMeta = async () => {
    const repo = fetchRepo.trim();
    if (!repo) return;
    setFetching(true);
    setError('');
    try {
      const m = await api.fetchGithub(repo);
      setFullName(m.full_name);
      setDesc(m.desc);
      setStars(String(m.stars));
      setLang(m.lang);
      setUrl(m.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFetching(false);
    }
  };

  const submit = async () => {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName.trim())) {
      setError('仓库名必须是 owner/repo 格式');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({
        full_name: fullName.trim(),
        desc,
        stars: Number(stars) || 0,
        lang,
        url,
        tags,
      });
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <Modal title={initial ? `编辑 · ${initial.full_name}` : '录入新 Skill'} onClose={onClose}>
      <div className="field">
        <label>从 GitHub 拉取（可选）</label>
        <div className="fetch-bar">
          <input value={fetchRepo} onChange={(e) => setFetchRepo(e.target.value)} placeholder="owner/repo，如 antfu/skills" />
          <button className="btn" onClick={fetchMeta} disabled={fetching}>{fetching ? '…' : '拉取'}</button>
        </div>
        <div className="hint">自动填充描述、Star 数、语言、链接</div>
      </div>

      <div className="field">
        <label>仓库名 *</label>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="owner/repo" />
      </div>
      <div className="field">
        <label>描述</label>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="一句话介绍这个 skill" />
      </div>
      <div className="field">
        <div className="row2">
          <div>
            <label>Stars</label>
            <input value={stars} onChange={(e) => setStars(e.target.value.replace(/\D/g, ''))} placeholder="0" />
          </div>
          <div>
            <label>语言</label>
            <input value={lang} onChange={(e) => setLang(e.target.value)} placeholder="TypeScript" />
          </div>
        </div>
      </div>
      <div className="field">
        <label>链接</label>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/owner/repo" />
      </div>
      <div className="field">
        <label>标签</label>
        <div className="tag-pick">
          {ALL_TAGS.map((t) => (
            <span key={t} className={`chip${tags.includes(t) ? ' on' : ''}`} onClick={() => toggleTag(t)}>
              {TAG_META[t].label}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input
            value={customTag} onChange={(e) => setCustomTag(e.target.value)}
            placeholder="自定义标签…" style={{ flex: 1, background: 'var(--panel2)', border: '1px solid var(--line2)', borderRadius: 10, padding: '8px 12px', color: 'var(--ink)', fontFamily: 'var(--mono)', fontSize: 13, outline: 'none' }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
          />
          <button className="btn" onClick={addCustom}>添加</button>
        </div>
        {tags.filter((t) => !ALL_TAGS.includes(t)).length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {tags.filter((t) => !ALL_TAGS.includes(t)).map((t) => (
              <span key={t} className="badge" onClick={() => toggleTag(t)} title="点击移除">{t} ✕</span>
            ))}
          </div>
        )}
      </div>
      {error && <div className="err">⚠ {error}</div>}
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>取消</button>
        <button className="btn primary" onClick={submit} disabled={saving}>{saving ? '保存中…' : initial ? '保存修改' : '录入'}</button>
      </div>
    </Modal>
  );
}
