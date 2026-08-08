import { useCallback, useEffect, useRef, useState } from 'react';
import type { Skill, Stats } from './types';
import { TAG_META } from './types';
import { api } from './api';
import { useRoute, navigate, activeTab, routeLabel } from './router';
import Hero from './components/Hero';
import DistCharts from './components/DistCharts';
import BoardView, { type BoardCallbacks } from './components/BoardView';
import DetailView from './components/DetailView';
import SkillsView from './components/SkillsView';
import AgentsView from './components/AgentsView';
import ImportModal from './components/ImportModal';
import TopicsView from './components/TopicsView';
import PacksView, { PackView } from './components/PacksView';
import DocsView from './components/DocsView';
import SkillForm from './components/SkillForm';
import TagEditor from './components/TagEditor';
import { ConfirmDialog } from './components/Modal';

const EMPTY_STATS: Stats = { total: 0, total_stars: 0, official: 0, zh: 0, cloned: 0, registry: '' };
const TABS: { key: string; label: string; href: string }[] = [
  { key: 'home', label: '排行榜', href: '/' },
  { key: 'skills', label: 'Skills', href: '/skills' },
  { key: 'agents', label: 'Agents', href: '/agents' },
  { key: 'topics', label: 'Topics', href: '/topics' },
  { key: 'packs', label: 'Packs', href: '/packs' },
  { key: 'official', label: 'Official', href: '/official' },
  { key: 'docs', label: 'Docs', href: '/docs' },
];

export default function App() {
  const route = useRoute();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);

  const [formSkill, setFormSkill] = useState<Skill | null | 'new'>(null);
  const [tagSkill, setTagSkill] = useState<Skill | null>(null);
  const [delSkill, setDelSkill] = useState<Skill | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string, error = false) => {
    setToast({ msg, error });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  const load = useCallback(async () => {
    try {
      const [list, st] = await Promise.all([api.list(), api.stats()]);
      setSkills(list);
      setStats(st);
    } catch (e) {
      showToast(`加载失败: ${(e as Error).message}（后端是否已启动？npm run dev:server）`, true);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  /* ---------- CRUD ---------- */
  const handleCreate = async (data: Partial<Skill>) => {
    const s = await api.create(data);
    setSkills((prev) => [s, ...prev]);
    setStats((prev) => ({ ...prev, total: prev.total + 1, total_stars: prev.total_stars + (s.stars || 0) }));
    showToast(`已录入 ${s.full_name}`);
  };
  const handleUpdate = async (id: number, data: Partial<Skill>) => {
    const s = await api.update(id, data);
    setSkills((prev) => prev.map((x) => (x.id === id ? s : x)));
    showToast(`已更新 ${s.full_name}`);
  };
  const handleDelete = async () => {
    if (!delSkill) return;
    try {
      await api.remove(delSkill.id);
      setSkills((prev) => prev.filter((x) => x.id !== delSkill.id));
      setStats((prev) => ({ ...prev, total: prev.total - 1, total_stars: Math.max(0, prev.total_stars - delSkill.stars) }));
      showToast(`已删除 ${delSkill.full_name}`);
      if (route.name === 'skill') navigate('/');
    } catch (e) {
      showToast((e as Error).message, true);
    } finally {
      setDelSkill(null);
    }
  };

  /* ---------- clone ---------- */
  const patchSkill = (id: number, patch: Partial<Skill>) =>
    setSkills((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const handleClone = async (s: Skill) => {
    try {
      const r = await api.clone(s.id);
      patchSkill(s.id, { cloned: true, clone_path: r.dir || s.clone_path });
      setStats((prev) => ({ ...prev, cloned: prev.cloned + 1 }));
      showToast(`已 clone → ${r.dir}`);
    } catch (e) {
      showToast((e as Error).message, true);
    }
  };
  const handleRemoveClone = async (s: Skill) => {
    try {
      await api.cloneRemove(s.id);
      patchSkill(s.id, { cloned: false, clone_path: '' });
      setStats((prev) => ({ ...prev, cloned: Math.max(0, prev.cloned - 1) }));
      showToast(`已移除本地 clone: ${s.full_name}`);
    } catch (e) {
      showToast((e as Error).message, true);
    }
  };
  const handlePull = async (s: Skill) => {
    try {
      const r = await api.pull(s.id);
      showToast(r.changed ? `已更新 ${s.full_name}（${r.last_commit}）` : `${s.full_name} 已是最新`);
    } catch (e) {
      showToast((e as Error).message, true);
    }
  };
  const handleRescan = async () => {
    try {
      const r = await api.rescan();
      await load();
      showToast(`扫描完成，同步 ${r.updated} 个仓库 → ${r.registry}`);
    } catch (e) {
      showToast((e as Error).message, true);
    }
  };
  const handleCloneAll = async () => {
    try {
      const r = await api.cloneAll();
      await load();
      const msg = `批量 clone 完成：新克隆 ${r.ok}，跳过 ${r.skipped}${r.failed.length ? `，失败 ${r.failed.length}` : ''}`;
      showToast(msg, r.failed.length > 0);
    } catch (e) {
      showToast((e as Error).message, true);
    }
  };

  const copy = useCallback(async (t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      showToast(`已复制 → ${t}`);
    } catch {
      showToast('复制失败（浏览器限制）', true);
    }
  }, [showToast]);

  const callbacks: BoardCallbacks = {
    onTag: (s) => setTagSkill(s),
    onEdit: (s) => setFormSkill(s),
    onDelete: (s) => setDelSkill(s),
    onClone: handleClone,
    onRemoveClone: handleRemoveClone,
    onPull: handlePull,
    onCopy: copy,
  };

  const detailSkill = route.name === 'skill' ? skills.find((s) => s.id === route.id) : undefined;

  if (loading) {
    return (
      <div className="wrap" style={{ paddingTop: 120, textAlign: 'center', color: 'var(--dim2)' }}>
        <div style={{ fontFamily: 'var(--disp)', fontSize: 22, marginBottom: 10 }}>加载中…</div>
        <div className="kicker" style={{ margin: '0 auto' }}><span className="dot" />connecting to backend :8787</div>
      </div>
    );
  }

  const tab = activeTab(route);

  return (
    <>
      <header>
        <div className="wrap nav">
          <div className="logo" onClick={() => navigate('/')}>
            <span className="mark">▚</span>SKILLS<b>·INDEX</b>
          </div>
          <div className="spacer" />
          <nav className="nav-links">
            {TABS.map((t) => (
              <a key={t.key} href={`#${t.href}`} className={tab === t.key ? 'active' : ''}>{t.label}</a>
            ))}
            <button onClick={() => setImportOpen(true)} style={{ color: 'var(--acid)' }}>⚡ 导入</button>
            <button onClick={handleCloneAll} title="按同步的 clone 标记批量拉取仓库">⧉ 批量 clone</button>
            <button onClick={handleRescan}>⟳ 扫描 clone</button>
          </nav>
        </div>
      </header>

      <main className="wrap">
        {route.name === 'home' && (
          <>
            <Hero stats={stats} onCopy={copy} />
            <div id="dist"><DistCharts skills={skills} /></div>
            <BoardView
              skills={skills}
              callbacks={callbacks}
              onAdd={() => setFormSkill('new')}
              onRescan={handleRescan}
            />
          </>
        )}

        {route.name === 'skills' && <SkillsView onCopy={copy} onToast={showToast} />}
        {route.name === 'agents' && <AgentsView onToast={showToast} />}

        {route.name === 'topic' && (
          <BoardView
            skills={skills}
            initialType={route.tag}
            title={`Topic · ${TAG_META[route.tag]?.label ?? route.tag}`}
            desc={route.tag === 'zh' ? '中文社区维护或中文描述的仓库' : `标签「${route.tag}」下的仓库榜单`}
            backTo="/topics"
            callbacks={callbacks}
          />
        )}

        {route.name === 'official' && (
          <BoardView
            skills={skills}
            initialType="official"
            title="Official"
            desc="Anthropic / OpenAI / Google / GitHub / Hugging Face / Microsoft 等官方维护的 skill 仓库"
            callbacks={callbacks}
          />
        )}

        {route.name === 'topics' && <TopicsView skills={skills} />}
        {route.name === 'packs' && <PacksView skills={skills} />}
        {route.name === 'pack' && <PackView owner={route.owner} skills={skills} callbacks={callbacks} />}
        {route.name === 'docs' && <DocsView registry={stats.registry} />}

        {route.name === 'skill' && detailSkill && (
          <DetailView
            skill={detailSkill}
            all={skills}
            onTag={callbacks.onTag}
            onEdit={callbacks.onEdit}
            onDelete={callbacks.onDelete}
            onClone={callbacks.onClone}
            onRemoveClone={callbacks.onRemoveClone}
            onPull={callbacks.onPull}
            onCopy={copy}
          />
        )}
        {route.name === 'skill' && !detailSkill && (
          <div className="page-head" style={{ padding: '60px 0' }}>
            <h2 className="page-title">∅ 未找到该仓库</h2>
            <p className="page-desc">它可能已被删除。<a onClick={() => navigate('/')} style={{ color: 'var(--acid)', cursor: 'pointer' }}>← 返回排行榜</a></p>
          </div>
        )}
        {route.name === 'notfound' && (
          <div className="page-head" style={{ padding: '60px 0' }}>
            <h2 className="page-title">404 · 页面不存在</h2>
            <p className="page-desc"><a onClick={() => navigate('/')} style={{ color: 'var(--acid)', cursor: 'pointer' }}>← 返回排行榜</a></p>
          </div>
        )}

        <div style={{ color: 'var(--dim2)', fontSize: 11, marginTop: 8 }}>当前页面：{routeLabel(route)}</div>
      </main>

      <footer>
        <div>SKILLS·INDEX — 数据存于本地 SQLite，clone 目录 {stats.registry}</div>
        <div>风格致敬 <a href="https://www.skills.sh/" target="_blank" rel="noreferrer">skills.sh</a> · 数据源 <a href="https://github.com/vercel-labs/skills" target="_blank" rel="noreferrer">vercel-labs/skills</a></div>
      </footer>

      {formSkill === 'new' && <SkillForm onSave={handleCreate} onClose={() => setFormSkill(null)} />}
      {importOpen && <ImportModal onClose={() => setImportOpen(false)} onToast={showToast} />}
      {formSkill && formSkill !== 'new' && (
        <SkillForm initial={formSkill} onSave={(data) => handleUpdate(formSkill.id, data)} onClose={() => setFormSkill(null)} />
      )}
      {tagSkill && (
        <TagEditor repo={tagSkill.full_name} current={tagSkill.tags} onSave={(tags) => handleUpdate(tagSkill.id, { tags })} onClose={() => setTagSkill(null)} />
      )}
      {delSkill && (
        <ConfirmDialog
          title="删除确认"
          message={`确定删除 ${delSkill.full_name}？该操作不会删除本地已 clone 的目录，只移除数据库记录。`}
          onConfirm={handleDelete}
          onCancel={() => setDelSkill(null)}
        />
      )}

      <div className={`toast${toast?.error ? ' error' : ''}${toast ? ' show' : ''}`}>{toast?.msg}</div>
    </>
  );
}
