# SkillHub

English | [简体中文](./README.zh-CN.md)

A local web registry and management workbench for AI Agent skills repositories. Catalog GitHub skill repos, tag and filter collections, shallow-clone repositories to a local registry, inspect `SKILL.md` / `README.md` files, install/update/diff skills across 73 supported local agents, and synchronize catalog metadata across machines via Git.

## Quick Start (Fresh Machine)

Requires **Node.js 22.13+** (for built-in `node:sqlite`), `git`, and an authenticated `gh` CLI (`gh auth login`) if fetching repository metadata from GitHub.

```bash
git clone https://github.com/xdlkc/SkillHub.git
cd SkillHub
npm install          # Frontend/test dependencies only; backend uses zero npm dependencies
npm run setup:first  # Imports data/skills.json into SQLite and clones flagged repos
npm run dev:all      # Starts backend (:8787) and Vite frontend (:5173)
```

Open `http://localhost:5173`. `setup:first` runs `npm run import && npm run clone-all`, pulling all repositories marked `cloned: true` in [`data/skills.json`](./data/skills.json) into `~/Code/skills-registry/` while skipping existing clones.

### Alternative Development Startup

```bash
npm install
npm run seed         # Optional: idempotently seed 115 starter repos from data/skills-seed.json
npm run dev:all      # Or run separately: npm run dev:server (:8787) + npm run dev (:5173)
```

Build and test commands:

```bash
npm run build        # tsc -b && vite build
npm test             # Vitest unit/component tests + Node native tests in test/*.test.mjs
```

## Architecture & Stack

- **Frontend**: Vite 5 + React 18 + TypeScript with custom CSS (zero UI library dependencies) on `:5173`, proxying `/api` to `:8787`.
- **Backend**: Native `node:http` + `node:sqlite` + child-process `git` / `gh` / `diff` calls on `:8787` (zero backend npm dependencies).
- **Local Registry**: Shallow clones (`git clone --depth 1`) stored under `~/Code/skills-registry/{owner}-{repo}` (configurable via `SKILLS_REGISTRY`).
- **Agent Distribution**: Follows the `npx skills` target-directory convention across **73 agents** defined in [`server/agents.mjs`](./server/agents.mjs) (including Claude Code, Codex, Cursor, Gemini CLI, OpenCode, Windsurf, Cline, Goose, Hermes Agent, Antigravity, etc.) in copy mode, tracking provenance in SQLite (`installed_items`) for updates and `diff -u` comparisons.

## Multi-Machine Sync Workflow

- [`data/skills.json`](./data/skills.json) (currently `version: 1`, 115 repositories) is the Git-tracked sync file holding shared metadata (`full_name`, `stars`, `desc`, `lang`, `url`, `tags`, and boolean `cloned` flag) without machine-local paths.
- `data/skills.db` is the local SQLite runtime database (git-ignored).
- Cloned skill repositories live outside Git under `~/Code/skills-registry/`.

### Manual Push & Pull

After editing, tagging, adding, or cloning repos on Machine A:

```bash
npm run export
git add data/skills.json
git commit -m "sync: update skills catalog"
git push
```

On Machine B:

```bash
git pull
npm run import       # Upserts data/skills.json into local SQLite without deleting local-only rows
npm run clone-all    # Shallow-clones repos marked cloned=1 (or click Batch Clone in header)
# To mirror the remote catalog strictly (delete local rows missing from skills.json):
npm run import:prune
```

### Optional Metadata Auto-Sync

Metadata auto-sync is **disabled by default**. You can toggle it in `#/settings` or override it via `AUTO_SYNC=on|off` (when set via environment variable, the UI switch becomes read-only).

When enabled, catalog mutations schedule a debounced (~2.5s) `export` -> `git commit` (`SkillHub Bot`) -> `git push` targeting **only** `data/skills.json`. As implemented in [`server/git-sync.mjs`](./server/git-sync.mjs), auto-sync refuses safely if the branch has no upstream, is behind upstream, or has pending commits touching files other than `data/skills.json`.

## Features & UI Routes

| Route | View | Capabilities |
|---|---|---|
| `#/` | Leaderboard | Sort by Stars, filter/search, edit/delete rows, tag, clone/pull/remove local clones |
| `#/skills` | Skill Items | Scans `SKILL.md` files across cloned repos; preview content and install/update/diff per agent |
| `#/agents` | Agents | Inspect detected local agents (73 supported definitions), toggle bulk/individual enable state, manage/update/uninstall/diff installed skills |
| `#/skill/:id` | Repo Detail | Install commands, summary card, local `README.md`/`SKILL.md` preview, batch "Install All" to selected/enabled agents |
| `#/topics`, `#/topic/:tag` | Topics | Browse 8 built-in categories (`official`, `collection`, `tool`, `design`, `research`, `security`, `domain`, `zh`) + custom tags |
| `#/packs`, `#/pack/:owner` | Packs | Repositories grouped by GitHub owner/organization |
| `#/official` | Official | Curated view of official vendor repositories |
| `#/settings` | Settings | Toggle metadata auto-sync (`metadata_auto_sync`) |
| `#/docs` | Docs | Built-in usage, API, and FAQ reference |
| Header `Import` | One-Click Import | Enter `owner/repo` to fetch GitHub metadata, insert into catalog, and shallow-clone |

## Environment Variables

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | Backend HTTP port | `8787` |
| `SKILLS_REGISTRY` | Directory for cloned repositories | `~/Code/skills-registry` |
| `SKILLS_DB_PATH` | SQLite database file path | `data/skills.db` |
| `AGENTS_HOME` | Base home directory for agent skill path resolution/detection | `os.homedir()` |
| `AUTO_SYNC` | Force metadata auto-sync `on` or `off` (locks `#/settings` toggle) | Unset (reads SQLite; defaults to off) |
| `SYNC_GIT_NAME` / `SYNC_GIT_EMAIL` | Git author metadata for auto-sync commits | `SkillHub Bot` / `skills-bot@users.noreply.github.com` |
| `VITE_PROXY_TARGET` | Dev proxy target for `/api` in [`vite.config.ts`](./vite.config.ts) | `http://localhost:8787` |

## Backend API (`:8787`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/skills` | List catalog repositories ordered by Stars descending |
| `POST` | `/api/skills` | Create a catalog entry `{full_name, desc, stars, lang, url, tags}` |
| `PATCH` | `/api/skills/:id` | Update repository fields or tags |
| `DELETE` | `/api/skills/:id` | Delete SQLite record only (keeps cloned files on disk) |
| `GET` | `/api/fetch?repo=owner/repo` | Fetch GitHub repository metadata via `gh api` |
| `POST` | `/api/repos/import` | Fetch metadata, insert into DB (if new), and shallow-clone |
| `GET` | `/api/stats` | Return total repos, stars, official count, Chinese-tag count, cloned count, and registry path |
| `GET` | `/api/skills/:id/clone` | Check local `.git` clone state and last commit timestamp |
| `POST` | `/api/skills/:id/clone` | Shallow-clone repository into `SKILLS_REGISTRY` |
| `POST` | `/api/skills/:id/pull` | Run `git pull --ff-only` in an existing clone |
| `POST` | `/api/skills/:id/clone/remove` | Remove the local clone directory and set `cloned = 0` |
| `POST` | `/api/rescan` | Scan `SKILLS_REGISTRY` and sync `cloned` flags in SQLite |
| `POST` | `/api/clone-all` | Clone all missing repositories marked `cloned = 1` |
| `GET` | `/api/skills/:id/readme` | Read `README.md` or `SKILL.md` preview from local clone (up to 8,000 chars) |
| `GET` | `/api/skill-items` | List all `SKILL.md` items scanned across cloned repositories (30s TTL cache) |
| `GET` | `/api/repos/:id/items` | List `SKILL.md` items inside a specific cloned repository |
| `GET` | `/api/skill-items/content?repo=<id>&path=<rel>` | Read raw `SKILL.md` content within a cloned repository (up to 20,000 chars) |
| `POST` | `/api/repos/:id/install-all` | Batch-install selected/all skills from a repo to selected/enabled agents |
| `GET` | `/api/agents` | List all 73 supported agents with install detection and `enabled` preference |
| `PATCH` | `/api/agents` | Bulk-update agent `enabled` preferences |
| `PATCH` | `/api/agents/:id` | Update a single agent's `enabled` preference |
| `GET` | `/api/installed` | List installed skills across agents enriched with source repo provenance |
| `POST` | `/api/skills/items/install` / `update` | Install or update a skill into an agent directory (`copy` mode) |
| `POST` | `/api/skills/items/uninstall` | Remove a skill from an agent directory and `installed_items` |
| `POST` | `/api/skills/items/diff` | Compare source clone directory vs. installed agent copy (`diff -u`) |
| `GET` | `/api/settings` | Query settings (`metadata_auto_sync`) |
| `PATCH` | `/api/settings/metadata-auto-sync` | Toggle auto-sync (`400` on non-boolean, `409` if locked by `AUTO_SYNC`) |

## Repository Layout

```text
SkillHub/
├── index.html                  # Vite HTML entry
├── package.json                # Frontend deps & CLI/dev scripts
├── vite.config.ts              # Vite + Vitest config and /api proxy
├── data/
│   ├── skills-seed.json        # 115-repo starter seed dataset
│   └── skills.json             # Git-tracked sync snapshot (metadata + cloned flags)
├── docs/superpowers/           # Design specs and implementation plans
├── legacy/
│   └── standalone-index.html   # Legacy single-file prototype backup
├── scripts/
│   ├── clone-all.mjs           # Batch shallow-clone CLI script
│   ├── dev.mjs                 # Concurrent backend + Vite dev launcher
│   ├── sync.mjs                # export / import / import --prune sync CLI
│   └── ...                     # Smoke & UI verification scripts
├── server/
│   ├── index.mjs               # Zero-dep HTTP + SQLite API server
│   ├── agents.mjs              # 73-agent directory registry, installer, and diffDirs
│   ├── agent-prefs.mjs         # Per-agent enable preferences
│   ├── auto-sync.mjs           # Debounced metadata auto-sync controller
│   ├── git-sync.mjs            # Safe git add/commit/push guard for data/skills.json
│   └── seed.mjs                # Seed loader and tag classifier
├── src/                        # React 18 + TypeScript UI & tests
└── test/                       # Node native backend & settings tests
```
