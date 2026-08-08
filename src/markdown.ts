/** 极简 Markdown → HTML 渲染（安全转义，仅覆盖 README 常见语法） */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let inCode = false;
  let inList = false;
  let codeBuf: string[] = [];

  const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };

  for (const raw of lines) {
    const line = raw;
    if (/^```/.test(line)) {
      if (inCode) {
        out.push(`<pre class="md-code">${codeBuf.map(escapeHtml).join('\n')}</pre>`);
        codeBuf = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }
    if (/^#{1,6}\s/.test(line)) {
      closeList();
      const level = line.match(/^(#+)/)![1].length;
      const text = inline(line.replace(/^#{1,6}\s*/, ''));
      out.push(`<h${Math.min(level + 2, 6)} class="md-h">${text}</h${Math.min(level + 2, 6)}>`);
      continue;
    }
    if (/^[-*]\s/.test(line)) {
      if (!inList) { out.push('<ul class="md-ul">'); inList = true; }
      out.push(`<li>${inline(line.replace(/^[-*]\s/, ''))}</li>`);
      continue;
    }
    if (/^\d+\.\s/.test(line)) {
      if (!inList) { out.push('<ul class="md-ul md-ol">'); inList = true; }
      out.push(`<li>${inline(line.replace(/^\d+\.\s/, ''))}</li>`);
      continue;
    }
    closeList();
    if (line.trim() === '') continue;
    out.push(`<p class="md-p">${inline(line)}</p>`);
  }
  closeList();
  if (inCode) out.push(`<pre class="md-code">${codeBuf.map(escapeHtml).join('\n')}</pre>`);
  return out.join('\n');
}

/** 行内：粗体/斜体/行内代码/链接 */
function inline(s: string): string {
  let t = escapeHtml(s);
  t = t.replace(/`([^`]+)`/g, '<code class="md-ic">$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  return t;
}
