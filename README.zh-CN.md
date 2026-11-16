# SkillHub — Agent Skills 仓库管理台

[English](./README.md) | 简体中文

面向 AI Agent Skills 生态的本地 Web 仓库管理台与分发工作台：收录并管理 GitHub 高热度 skill 仓库、打标分类、通过 `gh` CLI 一键拉取元数据并浅克隆到本地 registry、在线预览 `SKILL.md` / `README.md`、向本地 **73 个**主流 Agent 目录安装/更新/卸载与文件级 `diff`，并支持通过 Git 在多台机器间同步清单数据。

## 快速开始（全新电脑启动）

前置要求：**Node.js 22.13+**（后端直接依赖内置 `node:sqlite`）、`git`，以及已登录的 `gh` CLI（`gh auth login`，用于从 GitHub 拉取仓库元数据）。

```bash
git clone https://github.com/xdlkc/SkillHub.git
cd SkillHub
npm install          # 仅安装前端与测试依赖，后端零 npm 依赖
npm run setup:first  # 从 data/skills.json 导入 SQLite，并批量克隆已标记仓库
npm run dev:all      # 同时启动后端 (:8787) 与 Vite 前端 (:5173)
```

浏览器打开 `http://localhost:5173`。`setup:first` 会依次执行 `npm run import && npm run clone-all`，自动把 [`data/skills.json`](./data/skills.json) 中标记为 `cloned: true` 的仓库拉取到 `~/Code/skills-registry/`（本地已存在 `.git` 目录自动跳过）。

### 常用开发命令

```bash
npm install
npm run seed         # （可选）幂等导入 data/skills-seed.json 中的 115 条初始数据并补全标签
npm run dev:all      # 或分开启动：npm run dev:server (:8787) + npm run dev (:5173)
npm run build        # 类型检查与前端构建（tsc -b && vite build）
npm test             # 运行 Vitest 前端测试与 Node 原生后端测试（test/*.test.mjs）
```

## 架构与技术栈

- **前端**：Vite 5 + React 18 + TypeScript + 手写深色终端风格 CSS（零 UI 框架依赖），默认端口 `:5173`，将 `/api` 代理至 `:8787`。
- **后端**：Node 原生 `node:http` + `node:sqlite` + 子进程调用 `git` / `gh` / `diff`（零后端 npm 依赖），默认端口 `:8787`。
- **本地仓库目录**：采用 `git clone --depth 1` 统一存放到 `~/Code/skills-registry/{owner}-{repo}`（可通过 `SKILLS_REGISTRY` 覆盖）。
- **多 Agent 安装分发**：参考 `npx skills` 目录约定，内置 [`server/agents.mjs`](./server/agents.mjs) 中定义的 **73 个 Agent**（覆盖 Claude Code、Codex、Cursor、Gemini CLI、OpenCode、Windsurf、Cline、Goose、Hermes Agent、Antigravity 等），采用 copy 模式安装并在 SQLite `installed_items` 表中记录来源以支持一键更新与 `diff -u` 对比。

## 多机同步机制

- [`data/skills.json`](./data/skills.json)（当前 `version: 1`，含 115 条仓库记录）是 Git 跟踪的跨机同步载体，保存共享元数据（`full_name`、`stars`、`desc`、`lang`、`url`、`tags`）与 `cloned` 布尔标记，不含机器本地绝对路径。
- `data/skills.db` 是本地 SQLite 运行库（已被 `.gitignore` 忽略）。
- 克隆到本地的 skill 仓库源码存放在 `~/Code/skills-registry/`，同样不入 Git。

### 手动推送与拉取

在本机完成录入、打标、删除或 clone 变更后推送远端：

```bash
npm run export
git add data/skills.json
git commit -m "sync: 更新列表"
git push
```

在另一台机器同步并补全本地仓库：

```bash
git pull
npm run import       # 将 data/skills.json upsert 到本地 SQLite（保留本地独有条目）
npm run clone-all    # 批量克隆缺失的 cloned=1 仓库（等价于页面顶部「⧉ 批量 clone」）
# 如需完全以远端清单为准并删除本地多余条目：
npm run import:prune
```

### 可选：元数据自动同步

列表元数据自动同步**默认关闭**。可在 `#/settings` 页面开启，或通过环境变量 `AUTO_SYNC=on|off` 强制锁定（环境变量生效时页面开关为只读）。

开启后，列表变更会在约 2.5 秒防抖后自动执行 `export` → `git commit`（提交者默认 `SkillHub Bot`）→ `git push`。[`server/git-sync.mjs`](./server/git-sync.mjs) 严格限定**只**暂存、提交并推送 `data/skills.json`；若当前分支缺少上游分支、落后于上游，或存在涉及其他文件的待推送提交，会自动安全拒绝且不改动工作区其他文件。

## 页面导航（Hash 路由）与功能

| 路由 | 页面 | 说明 |
|---|---|---|
| `#/` | 排行榜 | 按 Stars 降序浏览全部仓库，支持搜索、标签过滤、行内编辑/删除、clone/pull/移除本地 clone |
| `#/skills` | Skills | 扫描已 clone 仓库内的全部 `SKILL.md`，在线预览内容并安装/更新/diff 到各 Agent |
| `#/agents` | Agents | 查看本机探测到的 Agent（共支持 73 个定义），批量或单独启用/禁用目标 Agent，管理/更新/卸载/diff 已安装 skill |
| `#/skill/:id` | 仓库详情 | 查看安装命令、摘要卡、本地 `README.md` / `SKILL.md` 预览，支持一键批量安装到已启用/选定 Agent |
| `#/topics`、`#/topic/:tag` | Topics | 按 8 个内置领域标签（`official`、`collection`、`tool`、`design`、`research`、`security`、`domain`、`zh`）及自定义标签浏览 |
| `#/packs`、`#/pack/:owner` | Packs | 按作者或组织聚合展示仓库包 |
| `#/official` | Official | 聚合官方维护仓库 |
| `#/settings` | 设置 | 控制列表元数据自动同步开关（`metadata_auto_sync`） |
| `#/docs` | 文档 | 内置用法、API 与 FAQ 说明 |
| 顶部「⚡ 导入」 | 一键导入 | 输入 `owner/repo`，自动拉取 GitHub 元数据、入库并完成浅克隆 |

## 环境变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| `PORT` | 后端 HTTP 监听端口 | `8787` |
| `SKILLS_REGISTRY` | 本地 clone 仓库存放根目录 | `~/Code/skills-registry` |
| `SKILLS_DB_PATH` | SQLite 数据库文件路径 | `data/skills.db` |
| `AGENTS_HOME` | 本地 Agent 安装探测与目录解析基准（测试可用） | `os.homedir()` |
| `AUTO_SYNC` | 强制设定自动同步为 `on` 或 `off`（锁定 `#/settings` 开关） | 未设置（读取 SQLite，首次默认关闭） |
| `SYNC_GIT_NAME` / `SYNC_GIT_EMAIL` | 自动同步 commit 的作者信息 | `SkillHub Bot` / `skills-bot@users.noreply.github.com` |
| `VITE_PROXY_TARGET` | [`vite.config.ts`](./vite.config.ts) 中 `/api` 开发代理目标 | `http://localhost:8787` |

## 后端 API（`:8787`）

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/skills` | 获取仓库列表（按 Stars 降序） |
| `POST` | `/api/skills` | 录入新仓库 `{full_name, desc, stars, lang, url, tags}` |
| `PATCH` | `/api/skills/:id` | 更新仓库字段或标签 |
| `DELETE` | `/api/skills/:id` | 仅删除数据库记录（**不会**删除本地已 clone 的代码目录） |
| `GET` | `/api/fetch?repo=owner/repo` | 通过 `gh api` 从 GitHub 拉取仓库元数据 |
| `POST` | `/api/repos/import` | 一键拉取元数据、入库并 clone 到本地 registry |
| `GET` | `/api/stats` | 获取仓库总数、总 Star、官方数、中文数、已 clone 数与 registry 路径 |
| `GET` | `/api/skills/:id/clone` | 查询本地 clone 状态与最近一次 commit 时间 |
| `POST` | `/api/skills/:id/clone` | 浅克隆仓库到 `SKILLS_REGISTRY` |
| `POST` | `/api/skills/:id/pull` | 对已 clone 仓库执行 `git pull --ff-only` |
| `POST` | `/api/skills/:id/clone/remove` | 删除本地 clone 目录并将 `cloned` 置为 `0` |
| `POST` | `/api/rescan` | 扫描 `SKILLS_REGISTRY` 目录并同步 SQLite 中的 `cloned` 状态 |
| `POST` | `/api/clone-all` | 批量克隆缺失的 `cloned = 1` 仓库 |
| `GET` | `/api/skills/:id/readme` | 读取本地 clone 中的 `README.md` 或 `SKILL.md` 预览（上限 8,000 字符） |
| `GET` | `/api/skill-items` | 扫描所有已 clone 仓库中的 `SKILL.md`（带 30s TTL 缓存） |
| `GET` | `/api/repos/:id/items` | 列出单个已 clone 仓库内的全部 `SKILL.md` |
| `GET` | `/api/skill-items/content?repo=<id>&path=<rel>` | 预览仓库内指定 `SKILL.md` 原文（上限 20,000 字符） |
| `POST` | `/api/repos/:id/install-all` | 将仓库内全部或选定 skills 批量安装到指定/已启用 agents |
| `GET` | `/api/agents` | 获取全部 73 个 Agent 的安装探测状态与启用偏好 |
| `PATCH` | `/api/agents` | 批量更新 Agent 启用偏好 |
| `PATCH` | `/api/agents/:id` | 更新单个 Agent 启用偏好 |
| `GET` | `/api/installed` | 查询各 Agent 已安装的 skills 及来源仓库追溯信息 |
| `POST` | `/api/skills/items/install` / `update` | 安装或更新指定 skill 到目标 Agent 目录（copy 模式） |
| `POST` | `/api/skills/items/uninstall` | 从目标 Agent 目录卸载 skill 并清理 `installed_items` 记录 |
| `POST` | `/api/skills/items/diff` | 对比本地源仓库目录与已安装目录的文件级差异（`diff -u`） |
| `GET` | `/api/settings` | 查询设置（含 `metadata_auto_sync` 的 `enabled` / `locked` / `source`） |
| `PATCH` | `/api/settings/metadata-auto-sync` | 切换自动同步开关（非布尔返回 400，被 `AUTO_SYNC` 锁定时返回 409） |

## 目录结构

```text
SkillHub/
├── index.html                  # Vite 入口 HTML
├── package.json                # 前端依赖与脚本定义
├── vite.config.ts              # Vite / Vitest 配置与 /api 代理
├── data/
│   ├── skills-seed.json        # 115 条初始种子仓库数据
│   └── skills.json             # Git 跟踪的多机同步元数据快照
├── docs/superpowers/           # 功能设计规格与实现计划
├── legacy/
│   └── standalone-index.html   # 早期单文件原型备份
├── scripts/
│   ├── clone-all.mjs           # 批量浅克隆 CLI 脚本
│   ├── dev.mjs                 # 前后端并发启动脚本
│   ├── sync.mjs                # export / import / import --prune 同步脚本
│   └── ...                     # 冒烟与 UI 验证脚本
├── server/
│   ├── index.mjs               # 零依赖 HTTP + SQLite API 后端
│   ├── agents.mjs              # 73 个 Agent 目录定义、安装器与 diffDirs
│   ├── agent-prefs.mjs         # Agent 启用偏好管理
│   ├── auto-sync.mjs           # 防抖自动同步控制器
│   ├── git-sync.mjs            # 限定 data/skills.json 的安全 git 推送保护
│   └── seed.mjs                # 种子导入与自动打标脚本
├── src/                        # React 18 + TypeScript 前端组件与测试
└── test/                       # Node 原生后端与设置测试
```
