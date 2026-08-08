import { useState } from 'react';
import type { DiffEntry } from '../types';

const STATUS_LABEL: Record<DiffEntry['status'], string> = {
  same: '相同',
  added: '新增',
  modified: '修改',
  deleted: '删除',
};

export default function DiffPanel({ diff }: { diff: DiffEntry[] }) {
  const [openFile, setOpenFile] = useState<string | null>(null);
  const changed = diff.filter((d) => d.status !== 'same');
  return (
    <div className="diff-panel">
      <div className="diff-summary">
        <span className={changed.length === 0 ? 'diff-ok' : 'diff-changed'}>
          {changed.length === 0 ? '✓ 与源仓库完全一致' : `△ ${changed.length} 个文件有差异`}
        </span>
        <span className="diff-total">共 {diff.length} 个文件</span>
      </div>
      <div className="diff-files">
        {diff.map((d) => (
          <div key={d.path}>
            <div
              className={`diff-file ${d.status}`}
              onClick={() => d.diff && setOpenFile(openFile === d.path ? null : d.path)}
            >
              <span className={`diff-status ${d.status}`}>{STATUS_LABEL[d.status]}</span>
              <span className="diff-path">{d.path}</span>
              {d.diff && <span className="diff-chevron">{openFile === d.path ? '▴' : '▾'}</span>}
            </div>
            {openFile === d.path && d.diff && <pre className="diff-text">{d.diff}</pre>}
          </div>
        ))}
      </div>
    </div>
  );
}
