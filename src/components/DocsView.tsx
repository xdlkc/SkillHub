export default function DocsView({ registry }: { registry: string }) {
  return (
    <div>
      <div className="page-head">
        <h2 className="page-title">Docs</h2>
        <p className="page-desc">SkillHub 本地管理台的用法、架构与 API 参考。</p>
      </div>

      <section className="doc-section">
        <h3 className="section-label">快速开始</h3>
        <pre className="doc-code">{`# 安装依赖并初始化
npm install
npm run seed          # 导入初始 115 条 skill 数据（幂等）

# 启动（前后端各一终端，或 npm run dev:all）
npm run dev:server    # 后端 http://localhost:8787
npm run dev           # 前端 http://localhost:5173`}</pre>
        <p className="doc-p">打开 <b>http://localhost:5173</b> 使用。数据存于 <code>data/skills.db</code>（SQLite），clone 目录在 <code>{registry}</code>。</p>
      </section>

      <section className="doc-section">
        <h3 className="section-label">页面导航</h3>
        <div className="doc-table-wrap">
          <table className="doc-table">
            <thead><tr><th>页面</th><th>地址</th><th>说明</th></tr></thead>
            <tbody>
              <tr><td>排行榜</td><td><code>#/</code></td><td>全部仓库，Stars 降序，搜索/过滤/clone</td></tr>
              <tr><td>详情</td><td><code>#/skill/:id</code></td><td>安装命令 / README 预览 / 相关仓库 / 信息栏</td></tr>
              <tr><td>设置</td><td><code>#/settings</code></td><td>本地 SQLite 中的列表元数据自动同步开关（默认关闭）</td></tr>
              <tr><td>Topics</td><td><code>#/topics</code></td><td>按领域（8 类标签）浏览</td></tr>
              <tr><td>Topic</td><td><code>#/topic/:tag</code></td><td>某标签下的过滤榜单</td></tr>
              <tr><td>Packs</td><td><code>#/packs</code></td><td>按作者/组织聚合</td></tr>
              <tr><td>Pack</td><td><code>#/pack/:owner</code></td><td>某作者的全部仓库</td></tr>
              <tr><td>Official</td><td><code>#/official</code></td><td>官方维护仓库（Anthropic/OpenAI/Google…）</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="doc-section">
        <h3 className="section-label">API 参考（后端 :8787）</h3>
        <div className="doc-table-wrap">
          <table className="doc-table">
            <thead><tr><th>方法</th><th>路径</th><th>说明</th></tr></thead>
            <tbody>
              <tr><td>GET</td><td><code>/api/skills</code></td><td>列表（Stars 降序）</td></tr>
              <tr><td>GET</td><td><code>/api/settings</code></td><td><code>metadata_auto_sync</code> 含 <code>enabled</code> / <code>locked</code> / <code>source</code></td></tr>
              <tr><td>PATCH</td><td><code>/api/settings/metadata-auto-sync</code></td><td>请求 JSON <code>{'{"enabled": true}'}</code>；非布尔值返回 400，环境变量锁定时返回 409</td></tr>
              <tr><td>POST</td><td><code>/api/skills</code></td><td>录入</td></tr>
              <tr><td>PATCH</td><td><code>/api/skills/:id</code></td><td>更新（打标/字段）</td></tr>
              <tr><td>DELETE</td><td><code>/api/skills/:id</code></td><td>删除（只删记录，不删本地目录）</td></tr>
              <tr><td>GET</td><td><code>/api/skills/:id/clone</code></td><td>clone 状态</td></tr>
              <tr><td>POST</td><td><code>/api/skills/:id/clone</code></td><td>clone 到 registry</td></tr>
              <tr><td>POST</td><td><code>/api/skills/:id/clone/remove</code></td><td>移除本地 clone</td></tr>
              <tr><td>POST</td><td><code>/api/skills/:id/pull</code></td><td>git pull 更新本地代码</td></tr>
              <tr><td>GET</td><td><code>/api/skills/:id/readme</code></td><td>README/SKILL.md 预览（需已 clone）</td></tr>
              <tr><td>GET</td><td><code>/api/agents</code></td><td>支持安装的 agents + 本机安装探测</td></tr>
              <tr><td>PATCH</td><td><code>/api/agents/:id</code></td><td>启用或禁用单个 Agent</td></tr>
              <tr><td>PATCH</td><td><code>/api/agents</code></td><td>原子地批量启用或禁用所选 Agents</td></tr>
              <tr><td>GET</td><td><code>/api/installed</code></td><td>各 agent 已安装的 skills 列表</td></tr>
              <tr><td>POST</td><td><code>/api/skills/items/install</code></td><td>安装 skill 到指定 agent（copy 模式）</td></tr>
              <tr><td>POST</td><td><code>/api/skills/items/update</code></td><td>更新已安装 skill（覆盖同步）</td></tr>
              <tr><td>POST</td><td><code>/api/skills/items/uninstall</code></td><td>卸载已安装 skill</td></tr>
              <tr><td>POST</td><td><code>/api/skills/items/diff</code></td><td>源仓库 vs 已安装的文件级 diff</td></tr>
              <tr><td>POST</td><td><code>/api/rescan</code></td><td>扫描 registry 同步状态</td></tr>
              <tr><td>GET</td><td><code>/api/fetch?repo=</code></td><td>GitHub 元数据（需 gh 登录）</td></tr>
              <tr><td>GET</td><td><code>/api/stats</code></td><td>汇总统计</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="doc-section">
        <h3 className="section-label">FAQ</h3>
        <div className="faq">
          <p><b>clone 到哪？</b> 默认 <code>{registry}</code>，可用环境变量 <code>SKILLS_REGISTRY</code> 覆盖。</p>
          <p><b>删除仓库会删本地代码吗？</b> 不会，只移除数据库记录，本地 clone 目录保留。</p>
          <p><b>列表元数据自动同步会同步 skill 源码吗？</b> 不会。该开关只控制 <code>data/skills.json</code> 的导出、提交和推送，绝不会扫描、提交或推送已 clone 的 skill 源码仓库。</p>
          <p><b>如何手动同步列表元数据？</b> 依次执行 <code>npm run export</code> → <code>git add data/skills.json</code> → <code>git commit</code> → <code>git push</code>。</p>
          <p><b>环境变量会覆盖自动同步开关吗？</b> 会。<code>AUTO_SYNC=on</code> 强制开启，<code>AUTO_SYNC=off</code> 强制关闭；两者都会覆盖本地 SQLite 设置并使页面开关只读。</p>
          <p><b>录入时怎么自动填充？</b> 输入 <code>owner/repo</code> 点「拉取」，后端调用 <code>gh api</code> 获取真实元数据。</p>
          <p><b>Node 版本要求？</b> 后端使用内置 <code>node:sqlite</code>，需要 Node 22.13+。</p>
          <p><b>风格参考？</b> 致敬 <a href="https://www.skills.sh/" target="_blank" rel="noreferrer">skills.sh</a>（Vercel Agent Skills 目录）。</p>
        </div>
      </section>
    </div>
  );
}
