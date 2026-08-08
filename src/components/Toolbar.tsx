import type { Skill } from '../types';
import { TAG_META } from '../types';

export default function Toolbar({
  skills, query, type, lang, onQuery, onType, onLang, onAdd, onRescan,
}: {
  skills: Skill[];
  query: string;
  type: string;
  lang: string;
  onQuery: (q: string) => void;
  onType: (t: string) => void;
  onLang: (l: string) => void;
  onAdd: () => void;
  onRescan: () => void;
}) {
  const countTag = (t: string) => skills.filter((s) => s.tags.includes(t)).length;
  const tags = ['all', ...Object.keys(TAG_META).filter((t) => countTag(t) > 0)];
  const langs = [...new Set(skills.map((s) => s.lang).filter(Boolean))].sort();

  return (
    <div className="toolbar">
      <div className="search">
        <span className="icon">⌕</span>
        <input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="搜索仓库名 / 描述 / 作者…" autoComplete="off" />
      </div>
      <div className="filters">
        {tags.map((t) => (
          <span key={t} className={`chip${type === t ? ' on' : ''}`} onClick={() => onType(t)}>
            {t === 'all' ? '全部' : TAG_META[t].label}
            <span className="cnt">{t === 'all' ? skills.length : countTag(t)}</span>
          </span>
        ))}
        <select value={lang} onChange={(e) => onLang(e.target.value)} title="按语言过滤">
          <option value="">全部语言</option>
          {langs.map((l) => <option key={l}>{l}</option>)}
        </select>
      </div>
      <button className="btn ghost" onClick={onRescan} title="扫描本地 registry 同步 clone 状态">⟳ 扫描</button>
      <button className="btn primary" onClick={onAdd}>+ 录入</button>
    </div>
  );
}
