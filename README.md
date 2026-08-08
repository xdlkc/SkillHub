# SKILLS·INDEX — Agent Skills 仓库管理台

深色终端美学的 **AI Agent Skills 仓库管理后台**：收录 GitHub 高热度 skill 仓库，支持录入、打标、删除、一键导入/克隆、安装到本地各 agent（含更新/diff），数据可通过 git pull/push 在**多台电脑间同步**。

## 🚀 全新电脑启动

```bash
git clone https://github.com/xdlkc/skills-leaderboard.git   # 私有仓库需已配置 GitHub 认证
cd skills-leaderboard
npm install          # 安装前端依赖
npm run import       # 从同步的 data/skills.json 导入列表（无需 seed）
npm run dev:all      # 同时启动后端(:8787) + 前端(:5173)
```

打开 http://localhost:5173 。**不需要 clone 所有 skill 仓库**——列表已在 `data/skills.json`，页面上对需要的仓库点「⧉ clone 到本地」即可按需拉取。

## 🔄 多机同步（pull / push）

> 设计：**`data/skills.json` 是 git 跟踪的同步载体**（只含共享元数据：名称/Star/描述/语言/标签）；SQLite（`data/skills.db`）是本地运行缓存，不入 git；skill 仓库 clone 在 `~/Code/skills-registry/`，也不入 git。

**本机修改列表后（录入/打标/删除/更新 Star 等）→ 推送到远端：**

```bash
npm run export                       # db → data/skills.json
git add data/skills.json
git commit -m "sync: 更新列表"
git push
```

**对端电脑拉取更新：**

```bash
git pull
npm run import                       # skills.json → db（upsert，不删本地）
# 想完全以远端为准（删除本地多余条目）：
npm run import:prune
```

> 页面内对列表的修改（录入/打标/删除）即时写入本地 SQLite，**记得 `npm run export` 后再 push** 才能同步到对端。

## 技术栈

- **前端**: Vite + React 18 + TypeScript（零 UI 依赖，纯手写 CSS）
- **后端**: Node 原生 `node:http` + `node:sqlite`（零 npm 依赖，Node 22.13+）
- **clone**: `git clone --depth 1`，统一存放到 `~/Code/skills-registry/`（可用环境变量 `SKILLS_REGISTRY` 覆盖）

## 快速开始（开发）

## 页面导航（Hash 路由）

| 页面 | 地址 | 说明 |
|---|---|---|
| 排行榜 | `#/` | 全部仓库，Stars 降序，搜索/过滤/clone |
| **Skills** | `#/skills` | **skill 级条目**（扫描已 clone 仓库内的 SKILL.md），**安装到本地各 agent**、更新、diff、卸载 |
| **Agents** | `#/agents` | **每个 agent 的 skill 管理**：来源/更新/卸载/diff/全部更新 |
| **一键导入** | Header「⚡ 导入」 | 输入 owner/repo → 拉取元数据 + 入库 + clone 一条龙 |
| **详情** | `#/skill/:id` | 安装命令 / Summary / 信息卡 / **README 预览**（本地 clone）/ 相关仓库 / 操作 |
| Topics | `#/topics` | 按领域（8 类标签）浏览，点击进入过滤榜单 |
| Topic | `#/topic/:tag` | 某标签下的榜单 |
| Packs | `#/packs` | 按作者/组织聚合的仓库包 |
| Pack | `#/pack/:owner` | 某作者的全部仓库 |
| Official | `#/official` | 官方维护仓库（Anthropic/OpenAI/Google…） |
| Docs | `#/docs` | 用法 / API / FAQ |

## 功能

| 功能 | 说明 |
|---|---|
| 排行榜 | 按 Stars 排序，含类型徽章 / 语言 / Star 条形图 / 搜索过滤 |
| 录入 | 填 `owner/repo` 可一键从 GitHub 拉取元数据（desc/stars/lang）自动填充 |
| README 预览 | 已 clone 的仓库在详情页直接预览 README/SKILL.md（手写轻量 Markdown 渲染） |
| **安装到 agent** | skill 级安装到 Claude Code / Codex / Cursor / Gemini CLI 等 15 个 agent（`npx skills` 目录约定，copy 模式） |
| **一键安装全部** | 仓库详情页「⤓ 安装到全部 agents」：仓库内所有 skills × 选定 agents 批量安装（含结果汇总/失败列表） |
| **agent 管理** | `#/agents`：每个 agent 的已安装 skills（来源追溯/更新/卸载/diff/全部更新） |
| **更新 / diff** | 已安装 skill 可一键 git 同步更新；diff 对比源仓库与已安装的文件级差异（`diff -u`） |
| 打标 | 8 个内置标签（官方/合集/工具/设计/研究/安全/垂直/中文）+ 自定义标签 |
| 编辑 / 删除 | 行内操作，删除有确认弹窗 |
| clone 管理 | 每行一键 clone 到本地 registry，支持移除、批量扫描同步状态 |
| 统计 | 仓库总数 / Star 总和 / 官方数 / 中文数 / 已 clone 数 |

## API（后端 :8787）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/skills` | 列表（Stars 降序） |
| POST | `/api/skills` | 录入 `{full_name, desc, stars, lang, url, tags}` |
| PATCH | `/api/skills/:id` | 更新（打标/改字段） |
| DELETE | `/api/skills/:id` | 删除 |
| GET | `/api/skills/:id/clone` | 查询本地 clone 状态 |
| POST | `/api/skills/:id/clone` | clone 到 registry |
| POST | `/api/skills/:id/clone/remove` | 移除本地 clone |
| POST | `/api/rescan` | 扫描 registry 目录同步 clone 状态 |
| GET | `/api/fetch?repo=owner/repo` | 从 GitHub 拉取仓库元数据（需 gh CLI 已登录） |
| GET | `/api/stats` | 汇总统计 |

## 目录结构

```
skills-leaderboard/
├── index.html              # Vite 入口
├── server/
│   ├── index.mjs           # 后端（http + sqlite + git）
│   └── seed.mjs            # 初始数据导入
├── data/
│   ├── skills.db           # SQLite 数据库（git 忽略）
│   └── skills-seed.json    # 初始 115 条种子数据
├── src/
│   ├── App.tsx             # 状态管理 + 组件组装
│   ├── api.ts / types.ts
│   └── components/         # Hero/DistCharts/Toolbar/Leaderboard/SkillForm/TagEditor/Modal
└── legacy/                 # 旧的单文件版本备份
```

## 注意

- 删除仓库只移除数据库记录，**不会**删除本地已 clone 的目录（防止误删代码）
- `gh` CLI 需已登录（`gh auth login`），`/api/fetch` 依赖它
- 数据全部存本地 `data/skills.db`，clone 目录在 `~/Code/skills-registry/`
