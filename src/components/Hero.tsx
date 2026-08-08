import { useEffect, useRef, useState } from 'react';
import type { Stats } from '../types';
import { fmt } from '../api';

function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const [disp, setDisp] = useState(0);
  const shown = useRef(false);
  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    const t0 = performance.now();
    const dur = 900;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setDisp(value * e);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [value]);
  return <>{format(disp)}</>;
}

export default function Hero({ stats, onCopy }: { stats: Stats; onCopy: (t: string) => void }) {
  const items: { label: string; value: number; acid?: boolean; format?: (n: number) => string }[] = [
    { label: '仓库总数', value: stats.total, format: (n) => String(Math.round(n)) },
    { label: 'Star 总和', value: stats.total_stars, acid: true, format: (n) => fmt(n) },
    { label: '官方仓库', value: stats.official, format: (n) => String(Math.round(n)) },
    { label: '中文社区', value: stats.zh, format: (n) => String(Math.round(n)) },
    { label: '已 clone', value: stats.cloned, format: (n) => String(Math.round(n)) },
  ];
  return (
    <section className="hero">
      <div className="kicker"><span className="dot" />Open Agent Skills Ecosystem · 本地管理台</div>
      <h1>
        <span className="outline">AGENT</span><br />
        <span className="acid">SKILLS</span> <span className="outline">//</span><br />
        <span className="outline">INDEX</span>
      </h1>
      <p className="sub">
        收录 GitHub 高热度 <b>AI Agent Skills</b> 仓库。支持 <b>录入</b>、<b>打标</b>、<b>删除</b>，
        并可一键 <b>clone 到本地</b>（{stats.registry}）统一管理。
      </p>
      <div className="cmd">
        <span className="prompt">$</span>
        <code>npx skills add &lt;owner/repo&gt;</code>
        <button className="btn ghost" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => onCopy('npx skills add <owner/repo>')}>COPY</button>
      </div>
      <div className="stat-row">
        {items.map((it, i) => (
          <div className="stat" key={it.label} style={{ animationDelay: `${i * 90}ms` }}>
            <div className={`num${it.acid ? ' acid' : ''}`}>
              <CountUp value={it.value} format={it.format ?? ((n) => String(Math.round(n)))} />
            </div>
            <div className="lbl">{it.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
