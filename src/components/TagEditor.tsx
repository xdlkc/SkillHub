import { useState } from 'react';
import { TAG_META } from '../types';
import { Modal } from './Modal';

const ALL_TAGS = Object.keys(TAG_META);

export default function TagEditor({
  repo, current, onSave, onClose,
}: {
  repo: string;
  current: string[];
  onSave: (tags: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [tags, setTags] = useState<string[]>(current);
  const [custom, setCustom] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggle = (t: string) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  const addCustom = () => {
    const t = custom.trim();
    if (!t) return;
    setTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setCustom('');
  };
  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      await onSave(tags);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  const customTags = tags.filter((t) => !ALL_TAGS.includes(t));

  return (
    <Modal title={`打标 · ${repo}`} onClose={onClose}>
      <div className="tag-pick">
        {ALL_TAGS.map((t) => (
          <span key={t} className={`chip${tags.includes(t) ? ' on' : ''}`} onClick={() => toggle(t)}>
            {TAG_META[t].label}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <input
          value={custom} onChange={(e) => setCustom(e.target.value)}
          placeholder="自定义标签…" style={{ flex: 1, background: 'var(--panel2)', border: '1px solid var(--line2)', borderRadius: 10, padding: '8px 12px', color: 'var(--ink)', fontFamily: 'var(--mono)', fontSize: 13, outline: 'none' }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
        />
        <button className="btn" onClick={addCustom}>添加</button>
      </div>
      {customTags.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {customTags.map((t) => (
            <span key={t} className="badge" onClick={() => toggle(t)} title="点击移除">{t} ✕</span>
          ))}
        </div>
      )}
      {error && <div className="err">⚠ {error}</div>}
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>取消</button>
        <button className="btn primary" onClick={submit} disabled={saving}>{saving ? '保存中…' : '保存标签'}</button>
      </div>
    </Modal>
  );
}
