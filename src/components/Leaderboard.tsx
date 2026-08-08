import type { Skill } from '../types';
import SkillRow from './SkillRow';

export default function Leaderboard({
  skills, onOpen, onTag, onEdit, onDelete, onClone, onRemoveClone, onPull, onCopy,
}: {
  skills: Skill[];
  onOpen: (s: Skill) => void;
  onTag: (s: Skill) => void;
  onEdit: (s: Skill) => void;
  onDelete: (s: Skill) => void;
  onClone: (s: Skill) => void;
  onRemoveClone: (s: Skill) => void;
  onPull: (s: Skill) => void;
  onCopy: (t: string) => void;
}) {
  const maxStars = Math.max(...skills.map((s) => s.stars), 1);
  return (
    <section className="board">
      <div className="board-head">
        <div>#</div>
        <div>仓库</div>
        <div className="c-lang">语言</div>
        <div className="c-tags">类型</div>
        <div style={{ textAlign: 'right' }}>STARS</div>
        <div style={{ textAlign: 'right' }}>操作</div>
      </div>
      {skills.length === 0 ? (
        <div className="empty"><div className="big">∅ NO MATCH</div>没有匹配的仓库，换个关键词试试</div>
      ) : (
        skills.map((s, i) => (
          <SkillRow
            key={s.id}
            skill={s}
            rank={i}
            maxStars={maxStars}
            onOpen={onOpen}
            onTag={onTag}
            onEdit={onEdit}
            onDelete={onDelete}
            onClone={onClone}
            onRemoveClone={onRemoveClone}
            onPull={onPull}
            onCopy={onCopy}
          />
        ))
      )}
    </section>
  );
}
