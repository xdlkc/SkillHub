import { useEffect, useRef, useState } from 'react';
import type { Skill } from '../types';
import { TAG_META } from '../types';

function Bars({ data, color, max }: { data: [string, number][]; color: string; max: number }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOn(true), 120);
    return () => clearTimeout(t);
  }, []);
  return (
    <>
      {data.map(([k, n]) => (
        <div className="bar-row" key={k}>
          <div className="k" title={k}>{k}</div>
          <div className="track">
            <div className={`fill ${color}`} style={on ? { width: `${(n / max) * 100}%` } : undefined} />
          </div>
          <div className="v">{n}</div>
        </div>
      ))}
    </>
  );
}

export default function DistCharts({ skills }: { skills: Skill[] }) {
  const tagCount = Object.keys(TAG_META)
    .map((t) => [TAG_META[t].label, skills.filter((s) => s.tags.includes(t)).length] as [string, number])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const langMap = new Map<string, number>();
  for (const s of skills) if (s.lang) langMap.set(s.lang, (langMap.get(s.lang) ?? 0) + 1);
  const langData = [...langMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7);
  const colors = ['acid', 'amber', 'cyan', 'purple', 'red'];

  return (
    <div className="dist-wrap">
      <div className="dist">
        <h3><span>TYPE · 类型分布</span><span className="hl">{tagCount.reduce((a, [, n]) => a + n, 0)}</span></h3>
        <Bars data={tagCount} color={colors[0]} max={tagCount[0]?.[1] ?? 1} />
      </div>
      <div className="dist">
        <h3><span>LANGUAGE · 语言 Top 7</span></h3>
        {langData.length ? (
          <Bars data={langData} color={colors[2]} max={langData[0][1]} />
        ) : (
          <p style={{ color: 'var(--dim2)', fontSize: 12 }}>暂无数据</p>
        )}
      </div>
    </div>
  );
}
