import type { Skill } from '../types';
import { fmt } from '../api';
import { navigate } from '../router';
import Leaderboard from './Leaderboard';

/** Packs：按作者/组织聚合（模拟 skills.sh /packs） */
export default function PacksView({ skills }: { skills: Skill[] }) {
  const byOwner = new Map<string, Skill[]>();
  for (const s of skills) {
    const o = s.full_name.split('/')[0];
    if (!byOwner.has(o)) byOwner.set(o, []);
    byOwner.get(o)!.push(s);
  }
  const packs = [...byOwner.entries()]
    .map(([owner, list]) => ({
      owner,
      count: list.length,
      stars: list.reduce((a, b) => a + b.stars, 0),
      top: [...list].sort((a, b) => b.stars - a.stars).slice(0, 5),
    }))
    .sort((a, b) => b.stars - a.stars);

  return (
    <div>
      <div className="page-head">
        <h2 className="page-title">Packs</h2>
        <p className="page-desc">
          按作者 / 组织聚合的 skill 仓库包 —— 一个组织维护的多个仓库视为一个 Pack，点击查看该 Pack 下的完整榜单。
        </p>
      </div>
      <div className="pack-grid">
        {packs.map((p) => (
          <div className="pack-card" key={p.owner} onClick={() => navigate(`/pack/${encodeURIComponent(p.owner)}`)}>
            <div className="pack-head">
              <span className="pack-owner">{p.owner}</span>
              <span className="pack-meta">{p.count} 仓库 · ★ {fmt(p.stars)}</span>
            </div>
            <div className="pack-repos">
              {p.top.map((s) => (
                <div className="pack-repo" key={s.id} onClick={(e) => { e.stopPropagation(); navigate(`/skill/${s.id}`); }}>
                  <span>{s.full_name.split('/')[1]}</span>
                  <span className="pack-repo-stars">★ {fmt(s.stars)}</span>
                </div>
              ))}
              {p.count > p.top.length && <div className="pack-more">+{p.count - p.top.length} 更多</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Pack 详情：某 owner 下全部仓库的榜单 */
export function PackView({
  owner, skills, callbacks,
}: {
  owner: string;
  skills: Skill[];
  callbacks: import('./BoardView').BoardCallbacks;
}) {
  const list = skills
    .filter((s) => s.full_name.split('/')[0] === owner)
    .sort((a, b) => b.stars - a.stars);
  const totalStars = list.reduce((a, b) => a + b.stars, 0);
  return (
    <div>
      <div className="page-head">
        <div className="crumbs" style={{ marginBottom: 14 }}>
          <a onClick={() => navigate('/packs')}>← Packs</a>
        </div>
        <h2 className="page-title">
          <span className="pack-owner" style={{ fontSize: 'inherit' }}>{owner}</span>
          <span className="page-desc" style={{ marginLeft: 14 }}>{list.length} 个仓库 · ★ {fmt(totalStars)}</span>
        </h2>
        <p className="page-desc">该组织 / 作者维护的全部 skill 仓库，按 Stars 排序。</p>
      </div>
      <Leaderboard
        skills={list}
        onOpen={(s) => navigate(`/skill/${s.id}`)}
        onTag={callbacks.onTag}
        onEdit={callbacks.onEdit}
        onDelete={callbacks.onDelete}
        onClone={callbacks.onClone}
        onRemoveClone={callbacks.onRemoveClone}
        onPull={callbacks.onPull}
        onCopy={callbacks.onCopy}
      />
    </div>
  );
}
