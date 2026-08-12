import { useEffect, useState } from 'react';
import type { Skill, SkillItem } from '../types';
import { TAG_META } from '../types';
import { api, fmt } from '../api';
import { renderMarkdown } from '../markdown';
import { navigate } from '../router';
import InstallAllModal from './InstallAllModal';
import AgentModal from './AgentModal';

interface ReadmeData {
  cloned: boolean;
  path: string;
  content: string;
  truncated: boolean;
  total_chars?: number;
}

const EMPTY_README: ReadmeData = { cloned: false, path: '', content: '', truncated: false };

export default function DetailView({
  skill, all, onTag, onEdit, onDelete, onClone, onRemoveClone, onPull, onCopy,
}: {
  skill: Skill;
  all: Skill[];
  onTag: (s: Skill) => void;
  onEdit: (s: Skill) => void;
  onDelete: (s: Skill) => void;
  onClone: (s: Skill) => void;
  onRemoveClone: (s: Skill) => void;
  onPull: (s: Skill) => void;
  onCopy: (t: string) => void;
}) {
  const [readme, setReadme] = useState<ReadmeData | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [lastCommit, setLastCommit] = useState('');
  const [installAllOpen, setInstallAllOpen] = useState(false);
  const [items, setItems] = useState<SkillItem[] | null>(null);
  const [openItem, setOpenItem] = useState('');
  const [itemContent, setItemContent] = useState<string | null>(null);
  const [agentModal, setAgentModal] = useState<SkillItem | null>(null);
  const [owner, repo] = skill.full_name.split('/');

  useEffect(() => {
    let alive = true;
    setReadme(null);
    setExpanded(false);
    api
      .cloneState(skill.id)
      .then((st) => {
        if (!alive) return;
        if (st.cloned) {
          setLastCommit(st.last_commit || '');
          api.fetchReadme(skill.id).then((r) => { if (alive) setReadme(r); }).catch(() => { if (alive) setReadme(EMPTY_README); });
        } else {
          setLastCommit('');
          setReadme(EMPTY_README);
        }
      })
      .catch(() => { if (alive) setReadme(EMPTY_README); });
    return () => { alive = false; };
  }, [skill.id]);

  useEffect(() => {
    let alive = true;
    setItems(null);
    setOpenItem('');
    setItemContent(null);
    setAgentModal(null);
    if (!skill.cloned) {
      setItems([]);
      return () => { alive = false; };
    }
    api.repoItems(skill.id)
      .then((result) => { if (alive) setItems(result); })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, [skill.id, skill.cloned]);

  const toggleItem = async (i: SkillItem) => {
    if (openItem === i.path) {
      setOpenItem('');
      setItemContent(null);
      return;
    }
    setOpenItem(i.path);
    setItemContent(null);
    try {
      const result = await api.skillContent(skill.id, i.path);
      setItemContent(result.content);
    } catch {
      setItemContent('');
    }
  };

  const sameOwner = all.filter((s) => s.full_name.split('/')[0] === owner && s.id !== skill.id).slice(0, 4);
  const sameTag = all
    .filter((s) => s.id !== skill.id && s.tags.some((t) => skill.tags.includes(t)))
    .sort((a, b) => b.stars - a.stars)
    .slice(0, 4);
  const related = [...new Map([...sameOwner, ...sameTag].map((s) => [s.id, s])).values()].slice(0, 6);

  const infoCards: [string, string, string?][] = [
    ['REPOSITORY', skill.url || `https://github.com/${skill.full_name}`, 'link'],
    ['GITHUB STARS', `★ ${fmt(skill.stars)}`],
    ['LANGUAGE', skill.lang || '—'],
    ['类型', skill.tags.map((t) => TAG_META[t]?.label ?? t).join(' / ') || '未打标'],
    ['收录时间', skill.created_at?.slice(0, 10) || '—'],
    ['最后更新', skill.updated_at?.slice(0, 10) || '—'],
    ['本地 clone', skill.cloned ? skill.clone_path : '未 clone'],
    ['最后提交', lastCommit || '—'],
  ];

  return (
    <div className="detail">
      {/* 面包屑 */}
      <div className="crumbs">
        <a onClick={() => navigate('/')}>SkillHub</a>
        <span className="sep">/</span>
        <a onClick={() => navigate(`/pack/${encodeURIComponent(owner)}`)}>{owner}</a>
        <span className="sep">/</span>
        <span className="cur">{repo}</span>
      </div>

      {/* 头部 */}
      <div className="detail-head">
        <div>
          <div className="detail-title">
            <span className="repo-name">{repo}</span>
            <span className="owner">/{owner}</span>
          </div>
          <div className="detail-badges">
            {skill.tags.map((t) => (
              <span key={t} className={`badge ${TAG_META[t]?.cls ?? ''}`}>{TAG_META[t]?.label ?? t}</span>
            ))}
            {skill.cloned && <span className="clone-tag" title={skill.clone_path}>✓ 已 clone 到本地</span>}
          </div>
        </div>
        <div className="detail-ops">
          <button className="btn primary" onClick={() => setInstallAllOpen(true)}>⤓ 安装到全部 agents</button>
          {skill.cloned ? (
            <>
              <button className="btn" onClick={() => onPull(skill)}>⟳ 更新 (git pull)</button>
              <button className="btn danger" onClick={() => onRemoveClone(skill)}>✕ 移除 clone</button>
            </>
          ) : (
            <button className="btn" onClick={() => onClone(skill)}>⧉ clone 到本地</button>
          )}
          <button className="btn" onClick={() => onTag(skill)}>⌘ 打标</button>
          <button className="btn" onClick={() => onEdit(skill)}>✎ 编辑</button>
          <button className="btn danger" onClick={() => onDelete(skill)}>⌫ 删除</button>
        </div>
      </div>

      {/* 安装命令 */}
      <div className="cmd detail-cmd">
        <span className="prompt">$</span>
        <code>npx skills add {skill.full_name}</code>
        <button className="btn ghost" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => onCopy(`npx skills add ${skill.full_name}`)}>COPY</button>
      </div>

      {/* Summary */}
      <section className="detail-section">
        <h3 className="section-label">SUMMARY</h3>
        <p className="summary-text">{skill.desc || '（无简介）'}</p>
      </section>

      {/* 仓库内 skills */}
      <section className="detail-section">
        <h3 className="section-label">SKILLS · 本仓库{items ? ` ${items.length} 个` : ''}</h3>
        {!skill.cloned ? (
          <div className="readme-hint">该仓库尚未 clone 到本地，无法扫描 skills。点击上方「⧉ clone 到本地」。</div>
        ) : items === null ? (
          <div className="readme-hint">扫描中…</div>
        ) : items.length === 0 ? (
          <div className="readme-hint">未扫描到 SKILL.md</div>
        ) : (
          <div className="board" style={{ marginBottom: 0 }}>
            {items.map((i, index) => (
              <div key={i.path}>
                <div
                  className="skill-item"
                  style={{ gridTemplateColumns: 'minmax(0,1fr) 70px', animationDelay: `${Math.min(index * 18, 300)}ms` }}
                >
                  <div className="skill-main" onClick={() => toggleItem(i)}>
                    <div className="skill-name">{i.name}</div>
                    <div className="skill-desc">{i.description || '（无描述）'}</div>
                    <div className="skill-meta"><span className="skill-path">{i.path}</span></div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
                    <button
                      className="op clone"
                      title={`安装 ${i.name} 到 agent`}
                      onClick={(e) => { e.stopPropagation(); setAgentModal(i); }}
                    >
                      ⤓
                    </button>
                    <span className="skill-chevron" onClick={() => toggleItem(i)}>{openItem === i.path ? '▴' : '▾'}</span>
                  </div>
                </div>
                {openItem === i.path && (
                  <div className="skill-detail">
                    {itemContent === null ? (
                      <div className="readme-hint">加载中…</div>
                    ) : itemContent === '' ? (
                      <div className="readme-hint">（读取失败）</div>
                    ) : (
                      <div className="readme" dangerouslySetInnerHTML={{ __html: renderMarkdown(itemContent) }} />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 信息卡 */}
      <section className="detail-section">
        <h3 className="section-label">INFORMATION</h3>
        <div className="info-grid">
          {infoCards.map(([k, v, kind]) => (
            <div className="info-card" key={k}>
              <div className="info-k">{k}</div>
              {kind === 'link' ? (
                <a className="info-v link" href={v} target="_blank" rel="noreferrer">↗ {v}</a>
              ) : (
                <div className="info-v" title={v.length > 60 ? v : undefined}>{v}</div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* README 预览 */}
      <section className="detail-section">
        <h3 className="section-label">
          README 预览
          {readme?.cloned && readme.path && <span className="hl-file">· {readme.path}</span>}
        </h3>
        {readme === null ? (
          <div className="readme-hint">读取中…</div>
        ) : !readme.cloned ? (
          <div className="readme-hint">
            该仓库尚未 clone 到本地，无法预览 README。点击上方「⧉ clone 到本地」后即可查看。
          </div>
        ) : readme.content === '' ? (
          <div className="readme-hint">本地目录中未找到 README.md / SKILL.md</div>
        ) : (
          <>
            <div className={`readme ${expanded ? 'expanded' : ''}`}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(readme.content) }} />
            {(readme.truncated || readme.total_chars! > 8000) && (
              <div className="readme-more">
                {expanded ? (
                  <button className="btn ghost" onClick={() => setExpanded(false)}>收起 ↑</button>
                ) : (
                  <button className="btn ghost" onClick={() => setExpanded(true)}>显示全部（预览截断于 8000 字符）↓</button>
                )}
              </div>
            )}
          </>
        )}
      </section>

      {/* 相关仓库 */}
      {related.length > 0 && (
        <section className="detail-section">
          <h3 className="section-label">RELATED · 相关仓库</h3>
          <div className="related-grid">
            {related.map((s) => (
              <div className="related-card" key={s.id} onClick={() => navigate(`/skill/${s.id}`)}>
                <div className="related-name">{s.full_name.split('/')[1]}<span className="owner">/{s.full_name.split('/')[0]}</span></div>
                <div className="related-desc">{s.desc || '（无简介）'}</div>
                <div className="related-meta">
                  <span>★ {fmt(s.stars)}</span>
                  {s.tags.slice(0, 3).map((t) => (
                    <span key={t} className={`badge ${TAG_META[t]?.cls ?? ''}`}>{TAG_META[t]?.label ?? t}</span>
                  ))}
                  {s.cloned && <span className="clone-tag">✓</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <button className="btn ghost" onClick={() => navigate('/')} style={{ marginTop: 8 }}>← 返回排行榜</button>

      {installAllOpen && (
        <InstallAllModal skill={skill} onClose={() => setInstallAllOpen(false)} onToast={(m, e) => { /* toast 由 App 层处理 */ }} />
      )}
      {agentModal && (
        <AgentModal skill={agentModal} onDone={() => setAgentModal(null)} onClose={() => setAgentModal(null)} />
      )}
    </div>
  );
}
