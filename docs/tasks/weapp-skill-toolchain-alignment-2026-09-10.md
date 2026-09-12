# 专用技能与当前工具链对齐

本次范围：两个全局专用技能、其已有辅助脚本/引用，以及项目 AGENTS 中直接相关的状态、选测与审批冲突。未修改产品、package.json、仓库截图脚本、test:affected 或 hooks；未提交或执行外部交付。

## 改动

- 保留 `D:/Relocated/LIZIXUAN/Codex/skills/weapp-regression-guard` 与 `weapp-cloud-contract-audit` 原入口，无迁移或重复副本。
- 删除技能中不可用的 `verify:*`、`screenshot:diagnose` 推荐；以当前 package.json 为准，优先使用现有 `test:affected` 的只读计划及明确 `--run`，允许直接运行相关测试。
- 明确按风险选测；规则/文档不默认跑全部产品测试，选择器不等于完整依赖图，共享脏树传本任务路径。
- 明确已授权具体实现无需重复审批，新增产品语义及外部动作仍须相应授权；真实 DevTools 图与主控人工验收要求保持。
- 项目 AGENTS 将历史 UI 交接按需读取，移除旧版本/worktree/测试波动的当前事实断言，改为引用 current 状态入口。
- 旧辅助脚本保留可调用路径：修复 Windows 路径与 Git Bash 参数转换、auth/permission 漏选，补 water 区域和云目标；移除不存在的 `create.preset` 测试映射，缺失映射改为执行前报错。
- 文档区分仓库 shell wrapper 与全局技能 helper；全局 helper 用仓库现有 Git Bash resolver 启动，不放宽 wrapper 的仓库路径限制。

## 验证

- 两个技能的 `quick_validate.py` 均通过；Markdown 本地引用和全部推荐 npm alias 存在。
- 三个 shell helper 的 Bash 语法通过；区域列表与 25 个云 target 可调用。
- 用临时 shell `node` 替身检查实际选测参数：auth 13、permission 6、water 13 个测试文件；25 个云 target 均能解析现存测试。此项是选择器验证，不代表这些产品测试全部运行通过。
- Windows 反斜杠 water 路径推断通过；临时缺测试项目明确失败且未调用测试执行器。
- 真实执行 permission helper：21/21 通过，0 failed / 0 skipped。日志含测试 stub 缺 `wx.getStorageSync` 的两条 storage read 信息，未导致断言失败；未扩展修改业务或测试 stub。
- 现有 `tests/test-affected.test.js`：1/1 通过；`npm run test:affected -- AGENTS.md` 输出零测试只读计划。
- `npm run ui:screenshot -- --list` 正常列出 30 case；未连接/启动 DevTools，未生成截图，不作为 UI 验收。
- 仓库 `git diff --check` 与两技能相对修改前快照的空白检查通过。
- 未跑 `npm test`、仓库 `check`/`lint`：本次未改仓库可执行实现，已用最小实际执行及选择器检查验证技能 helper。没有将原任务的历史全量结果算成本次通过。

## 保留边界

原任务“优化小程序开发调试与截图链路”的未提交改动保留。本任务不重做 P0–P2、不启动暂停的自动化、不修改截图验收定义。旧 helper 的映射仍只是建议，未覆盖的新路径、混合输入和共享模板领域需要人工确认对应测试；当前技能已明确此限制。
