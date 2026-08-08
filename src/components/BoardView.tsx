import { useState } from 'react';
import type { Skill } from '../types';
import Toolbar from './Toolbar';
import Leaderboard from './Leaderboard';
import { navigate } from '../router';

export interface BoardCallbacks {
  onTag: (s: Skill) => void;
  onEdit: (s: Skill) => void;
  onDelete: (s: Skill) => void;
  onClone: (s: Skill) => void;
  onRemoveClone: (s: Skill) => void;
  onPull: (s: Skill) => void;
  onCopy: (t: string) => void;
}

export default function BoardView({
  skills, initialType = 'all', title, desc, backTo, callbacks, onAdd, onRescan,
}: {
  skills: Skill[];
  initialType?: string;
  title?: string;
  desc?: string;
  backTo?: string;
  callbacks: BoardCallbacks;
  onAdd?: () => void;
  onRescan?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState(initialType);
  const [lang, setLang] = useState('');

  const filtered = skills
    .filter((s) => {
      if (type !== 'all' && !s.tags.includes(type)) return false;
      if (lang && s.lang !== lang) return false;
      if (query) {
        const hay = `${s.full_name} ${s.desc} ${s.tags.join(' ')} ${s.lang}`.toLowerCase();
        if (!hay.includes(query.toLowerCase())) return false;
      }
      return true;
    })
    .sort((a, b) => b.stars - a.stars);

  return (
    <>
      {(title || backTo) && (
        <div className="page-head">
          <div>
            {backTo && (
              <div className="crumbs" style={{ marginBottom: 14 }}>
                <a onClick={() => navigate(backTo)}>← 返回</a>
              </div>
            )}
            <h2 className="page-title">{title}</h2>
            {desc && <p className="page-desc">{desc}</p>}
          </div>
        </div>
      )}
      <Toolbar
        skills={skills}
        query={query} type={type} lang={lang}
        onQuery={setQuery} onType={setType} onLang={setLang}
        onAdd={onAdd ?? (() => navigate('/'))}
        onRescan={onRescan ?? (() => {})}
      />
      <Leaderboard
        skills={filtered}
        onOpen={(s) => navigate(`/skill/${s.id}`)}
        onTag={callbacks.onTag}
        onEdit={callbacks.onEdit}
        onDelete={callbacks.onDelete}
        onClone={callbacks.onClone}
        onRemoveClone={callbacks.onRemoveClone}
        onPull={callbacks.onPull}
        onCopy={callbacks.onCopy}
      />
    </>
  );
}
