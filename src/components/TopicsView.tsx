import type { Skill } from '../types';
import { TAG_META } from '../types';
import { fmt } from '../api';
import { navigate } from '../router';

const TAG_DESC: Record<string, string> = {
  official: 'Anthropic / OpenAI / Google / GitHub 等官方维护',
  collection: 'Awesome 清单与大型 skill 合集',
  tool: 'CLI / 管理器 / 加载器 / 框架类工具',
  design: '设计、PPT、幻灯片、UI 视觉',
  research: '科研、学术论文、科学数据库',
  security: '安全研究、逆向、漏洞分析',
  domain: '垂直领域：NotebookLM / Obsidian / n8n / GSAP 等',
  zh: '中文社区维护或中文描述',
};

export default function TopicsView({ skills }: { skills: Skill[] }) {
  const tagData = Object.keys(TAG_META)
    .map((t) => ({
      tag: t,
      label: TAG_META[t].label,
      desc: TAG_DESC[t] ?? '',
      count: skills.filter((s) => s.tags.includes(t)).length,
      top: skills.filter((s) => s.tags.includes(t)).sort((a, b) => b.stars - a.stars).slice(0, 3),
    }))
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count);

  const langs = [...new Set(skills.map((s) => s.lang).filter(Boolean))]
    .map((l) => ({ lang: l, count: skills.filter((s) => s.lang === l).length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return (
    <div>
      <div className="page-head">
        <h2 className="page-title">Topics</h2>
        <p className="page-desc">按领域浏览 skill 仓库 —— 每个 Topic 是一类工作的起点，点击进入过滤后的榜单。</p>
      </div>
      <div className="topic-grid">
        {tagData.map((d) => (
          <div className="topic-card" key={d.tag} onClick={() => navigate(`/topic/${d.tag}`)}>
            <div className="topic-label">
              <span className={`badge ${TAG_META[d.tag].cls}`}>{d.label}</span>
              <span className="topic-count">{d.count} 个仓库</span>
            </div>
            <p className="topic-desc">{d.desc}</p>
            <div className="topic-top">
              {d.top.map((s) => (
                <div className="topic-repo" key={s.id} onClick={(e) => { e.stopPropagation(); navigate(`/skill/${s.id}`); }}>
                  {s.full_name.split('/')[1]}<span className="owner">/{s.full_name.split('/')[0]}</span>
                  <span className="topic-stars">★ {fmt(s.stars)}</span>
                </div>
              ))}
            </div>
            <div className="topic-go">查看全部 →</div>
          </div>
        ))}
      </div>
      <div className="page-head" style={{ marginTop: 34 }}>
        <h2 className="page-title" style={{ fontSize: 22 }}>按语言浏览</h2>
      </div>
      <div className="lang-chips">
        {langs.map((l) => (
          <button key={l.lang} className="chip" onClick={() => navigate('/')}>
            {l.lang} <span className="cnt">{l.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
