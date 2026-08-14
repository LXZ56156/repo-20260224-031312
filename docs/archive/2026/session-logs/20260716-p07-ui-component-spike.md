# 2026-07-16 P07 UI 组件库 discovery session log

## 范围

- worktree：`D:\projects(WIN)\badminton-miniapp-worktrees\ui-component-spike`
- branch / start HEAD：`codex/roadmap-ui-component-spike` / `70845c1`
- 只做 TDesign Miniprogram、WeUI Miniprogram、Vant Weapp 官方资料调研、同权重评分、包体估算与单页试点审批包。
- 用户授权本分支本地提交；未授权 push、PR、preview/upload、发布、部署或真实数据写入。

## 本地审计

- 启动时 `git status` 干净；路径、分支和 HEAD 与工作线约定一致。
- 完整阅读 AGENTS、current task、增量 UI 边界、并行路线图、P07 文档、架构、真实截图流程、app/project/package 配置、全部页面 JSON 与截图 case 配置。
- 当前没有 UI library dependency、`usingComponents`、自定义组件目录、`miniprogram_npm` 或分包。
- 当前保留 `app.json.style = "v2"`，DevTools `libVersion = 3.14.2`，全局 `app.wxss` 已有项目自有 token。
- 按现有 pack ignore 统计的源码包基线为 156 文件、883,965 B；该值不是编译后主包大小。

## 官方证据与结论

- 访问日 2026-07-16，维护观察窗统一为 2024-07-16 至 2026-07-16。
- 只引用候选官方 GitHub/release/tag/docs、npm registry 与微信开放文档。
- 评分：WeUI 77、TDesign 72、Vant 66。
- TDesign `1.15.3` 与 Vant `1.11.7` quickstart 均要求删除 `style:v2`；这会改变全局基础组件样式，违反当前单页试点门槛。
- 微信官方 `useExtendedLib.weui` 不占小程序包体且无需安装依赖；唯一推荐为 WeUI ExtendedLib。
- 试点提案限定 feedback 页面与 `mp-form/mp-cells/mp-cell`，不接管现有校验、提交、Toast、Modal、导航或云契约。

## 包体测量

- 仅在本 worktree 的 ignored `tmp/p07-ui-libs` 解包官方 npm tarball，不执行 npm install，不写入生产目录。
- 默认 npm 构建目录：TDesign 1,451,378 B；WeUI 668,861 B；Vant 458,076 B。
- WeUI ExtendedLib 的库代码包增量按微信官方文档为 0 B；未来本地 wrapper/page 原始增量软限 16 KiB、硬限 32 KiB，编译后主包增量硬限 32 KiB。
- 临时 tarball/解包目录在提交前删除。

## 交付

- `docs/reports/ui-component-library-discovery-2026-07-16.md`
- `docs/tasks/parallel-development/07-ui-component-spike.md` 状态与报告链接
- 本 session log

## 验证结果与边界

- 未安装或构建任何候选，未修改 production/app/package/lock/script/test/cloud 文件。
- 未运行真实组件、真机、截图或 DevTools package report；这些属于获批后的实现验收。
- 独立只读审阅复核了评分加总、敏感性区间、包体加法、官方核心结论与审批完整性；审阅要求的三项文档修正已落实。
- `npm run check` 通过：deprecated wx API 与 9 个共享模板 / 22 个云函数同步检查均通过。
- feedback、cloud write、timeout guard、截图矩阵聚焦测试共 29 项，29 项通过。
- 完整 `npm test` 共发现 1,133 项：1,123 项通过、4 项失败、6 项跳过。失败文件为 `share-card.test.js`、`share-poster.test.js`、`share-timeline-card.test.js`、`ui-screenshot-safety.test.js`，共同原因是当前 worktree 未安装 lockfile 已声明的 `canvas`；本任务禁止安装依赖，因此未改变环境来规避该失败。
- 提交前继续检查文档链接/格式、生产目录零差异、临时目录清理和 `git diff --check`。
