# 列表元数据自动同步开关设计

## 背景与目标

SKILLS·INDEX 当前在录入、编辑、删除、clone 状态变化等管理操作后，默认通过 2.5 秒防抖执行 `export data/skills.json → git commit → git push`。这个行为适合多机维护者，但会让普通用户在未明确选择时产生远端写入。

本功能将列表元数据自动同步改为显式选择：新增独立设置页和一个持久化开关，默认关闭。只有用户开启后，管理操作才会自动导出、提交并推送 `data/skills.json`。

## 范围

本次包括：

- 新增“设置”导航与 `#/settings` 页面。
- 新增“列表元数据自动同步”开关，默认关闭。
- 将开关保存在本地 SQLite，服务重启后保持。
- 保留 `AUTO_SYNC=on/off` 环境变量作为强制覆盖。
- 关闭开关时取消尚未执行的防抖同步。
- 更新 README、页面文案和 API 参考。

本次不包括：

- 不扫描、提交或推送 `SKILLS_REGISTRY` 中 clone 下来的 skill 源码仓库。
- 不改变仓库的 clone、pull、安装、更新或 diff 行为。
- 不改变 `npm run export`、`npm run import` 等手动同步命令。
- 不新增“立即同步”按钮、同步历史或远端冲突处理界面。

## 方案选择

采用 SQLite 作为后端权威状态。相比仅使用环境变量，它允许用户在运行中的设置页切换；相比浏览器 `localStorage`，它能保证所有浏览器和直接 API 调用共享同一后端状态。

## 后端状态模型

新增通用设置表：

```sql
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

本功能使用键 `metadata_auto_sync`，值为字符串 `1` 或 `0`。没有记录时按关闭处理。

该设置只保存在本机 `skills.db`，不导出到 `data/skills.json`。因此不同电脑可以独立决定是否允许自动推送，不会因列表同步而互相覆盖。

环境变量优先级如下：

1. `AUTO_SYNC=on`：强制开启。
2. `AUTO_SYNC=off`：强制关闭。
3. 未设置 `AUTO_SYNC`：读取 SQLite；无记录时默认关闭。

环境变量覆盖时，设置页显示实际状态和来源，但开关只读。这样既保留无界面部署方式，也确保 `AUTO_SYNC=off` 始终是可靠的安全开关。其他 `AUTO_SYNC` 值视为未设置，不再沿用“只要不是 off 就开启”的旧行为。

后端集中通过一个状态读取函数决定自动同步是否生效，`markDirty()` 不再读取启动时固定常量。开启设置不会立即产生提交，只影响之后的管理操作。

关闭设置时，后端必须同时：

- 清除现有的 2.5 秒防抖计时器；
- 将待同步标记设为 false；
- 阻止已排队但尚未开始的导出和推送。

已经开始执行的 Git 子进程不强行终止，接口通过文案说明开关控制的是后续与尚未执行的任务。

## API

新增状态查询：

```text
GET /api/settings

200 OK
{
  "metadata_auto_sync": {
    "enabled": false,
    "locked": false,
    "source": "default"
  }
}
```

`source` 取值：

- `default`：SQLite 无记录，使用默认关闭；
- `database`：使用 SQLite 保存值；
- `environment`：由 `AUTO_SYNC=on/off` 强制覆盖。

新增运行时更新：

```text
PATCH /api/settings/metadata-auto-sync
{ "enabled": true }

200 OK
{
  "metadata_auto_sync": {
    "enabled": true,
    "locked": false,
    "source": "database"
  }
}
```

校验与错误行为：

- `enabled` 不是布尔值时返回 `400`。
- 环境变量覆盖生效时返回 `409`，不写 SQLite，并说明需修改 `AUTO_SYNC` 后重启。
- SQLite 写入失败返回 `500`，前端保留原状态。

## 前端交互

路由、导航和页面标题新增“设置”。设置页沿用现有深色终端视觉语言，使用一个设置卡片展示：

- 名称：列表元数据自动同步；
- 状态：已开启 / 已关闭；
- 说明：开启后，列表管理操作约 2.5 秒后自动导出、提交并推送 `data/skills.json`；
- 影响范围：明确注明不会提交或推送 clone 下来的 skill 源码；
- 开关控件。

用户从关闭切换为开启时，先弹出确认框，说明会执行 Git 远端写入。确认后调用 PATCH；取消则保持关闭。关闭不需要二次确认，成功后显示 toast，文案提示待执行同步已取消。

环境变量覆盖时，开关禁用，并显示 `由 AUTO_SYNC 环境变量强制开启/关闭`。页面不提供绕过环境变量的操作。

## 数据流

1. 设置页加载时请求 `GET /api/settings`。
2. 用户开启时确认风险，随后发送 PATCH。
3. 后端写入 SQLite 并返回标准化状态。
4. 前端以响应覆盖本地状态并显示 toast。
5. 后续管理操作调用 `markDirty()`；它实时读取有效设置。
6. 有效状态为关闭时直接返回；开启时沿用现有防抖 export/commit/push 流程。

## 错误处理

- 设置页初次加载失败时显示错误态与重试按钮，不假定开关状态。
- PATCH 失败时恢复服务端返回前的 UI 状态并展示错误。
- 自动 Git 同步失败继续记录后端错误日志；本功能不自动关闭开关，也不吞掉下一次管理操作的重试机会。
- 从开启切换为关闭后，下一次重新开启只响应新的管理操作，不恢复此前取消的 dirty 标记。

## 文档迁移

README 将“后端默认自动同步远端”改为“默认关闭，可在设置页开启”。环境变量文档更新为：

- `AUTO_SYNC=on` 强制开启；
- `AUTO_SYNC=off` 强制关闭；
- 未设置时由设置页和 SQLite 决定，初始默认关闭。

保留手动 `npm run export` 与 `git push` 操作说明。

## 测试与验收

后端测试覆盖：

- 无 SQLite 设置且无环境变量时默认关闭。
- PATCH 开启和关闭可持久化并由 GET 返回。
- 非布尔值被拒绝。
- `AUTO_SYNC=on/off` 覆盖 SQLite，PATCH 返回冲突。
- 关闭会清理待执行计时器与 dirty 标记，等待超过防抖时间也不产生 export/commit/push。
- 开启后发生管理操作才进入现有自动同步流程。

前端测试与浏览器验收覆盖：

- `#/settings` 路由与导航高亮。
- 默认关闭状态、开启确认、关闭操作和 toast。
- 环境变量覆盖时只读状态和说明。
- API 错误时不进行错误的乐观更新。

完成前运行自动化测试、`npm run build`、`git diff --check`，并在隔离数据库和 Git 仓库中验证不会误推送真实远端。
