import type { Skill } from '../types';
import { TAG_META } from '../types';
import { fmt } from '../api';

export default function SkillRow({
  skill, rank, maxStars, onOpen, onTag, onEdit, onDelete, onClone, onRemoveClone, onPull, onCopy,
}: {
  skill: Skill;
  rank: number;
  maxStars: number;
  onOpen: (s: Skill) => void;
  onTag: (s: Skill) => void;
  onEdit: (s: Skill) => void;
  onDelete: (s: Skill) => void;
  onClone: (s: Skill) => void;
  onRemoveClone: (s: Skill) => void;
  onPull: (s: Skill) => void;
  onCopy: (t: string) => void;
}) {
  const [owner, repo] = skill.full_name.split('/');
  const rankCls = ['top1', 'top2', 'top3'][rank] || '';
  const starsPct = maxStars ? (skill.stars / maxStars) * 100 : 0;
  const knownTags = skill.tags.filter((t) => TAG_META[t]);
  const customTags = skill.tags.filter((t) => !TAG_META[t]);

  return (
    <div
      className="row"
      style={{ animationDelay: `${Math.min(rank * 28, 500)}ms` }}
      onClick={() => onOpen(skill)}
      title="点击查看详情，双击复制安装命令"
      onDoubleClick={(e) => { e.stopPropagation(); onCopy(`npx skills add ${skill.full_name}`); }}
    >
      <div className={`rank ${rankCls}`}>{rank < 9 ? '0' : ''}{rank + 1}</div>
      <div className="repo">
        <div className="name">
          <a href={skill.url || `https://github.com/${skill.full_name}`} target="_blank" rel="noreferrer">{repo}</a>
          <span className="owner">/{owner}</span>
          {skill.cloned && <span className="clone-tag" title={skill.clone_path}>✓ clone</span>}
        </div>
        <div className="desc">{skill.desc || '（无简介）'}</div>
      </div>
      <div className="lang">{skill.lang || <span className="none">—</span>}</div>
      <div className="tags">
        {knownTags.map((t) => (
          <span key={t} className={`badge ${TAG_META[t].cls}`} onClick={() => onTag(skill)} title="点击编辑标签">
            {TAG_META[t].label}
          </span>
        ))}
        {customTags.slice(0, 2).map((t) => (
          <span key={t} className="badge" onClick={() => onTag(skill)} title="点击编辑标签">{t}</span>
        ))}
        {skill.tags.length === 0 && <span className="badge" onClick={() => onTag(skill)} title="点击打标">+ 打标</span>}
      </div>
      <div className="stars-col">
        <div className="stars-num">★ {fmt(skill.stars)}</div>
        <div className="stars-track">
          <div className="stars-fill" style={{ width: `${starsPct}%` }} />
        </div>
      </div>
      <div className="ops" onClick={(e) => e.stopPropagation()}>
        {skill.cloned ? (
          <>
            <button className="op clone" title="更新本地代码 (git pull)" onClick={() => onPull(skill)}>⟳</button>
            <button className="op" title="移除本地 clone" onClick={() => onRemoveClone(skill)}>✕</button>
          </>
        ) : (
          <button className="op clone" title={`clone 到本地 (${skill.full_name})`} onClick={() => onClone(skill)}>⧉</button>
        )}
        <button className="op hide-sm" title="编辑标签" onClick={() => onTag(skill)}>⌘</button>
        <button className="op" title="编辑" onClick={() => onEdit(skill)}>✎</button>
        <button className="op del" title="删除" onClick={() => onDelete(skill)}>⌫</button>
      </div>
    </div>
  );
}
