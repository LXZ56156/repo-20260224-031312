# 后台截图 P0–P2 实测验收（2026-09-10）

## 结论

P0、P1 已实现并实测闭合。日常截图主链可用：Stable 热会话通过 App.captureScreenshot 获取真实像素，不切前台、不模拟输入。P2 其他项目已完成，Nightly A/B 仍被本机授权阻挡，不能宣称全部完成。

这是工具链验收，不是产品 UI 全面验收、真机验收或线上版本证明。全部改动仍未提交，未 push/preview/upload/发布/部署，未进行真实云数据写入。

## 原清单逐项核对

| 阶段 | 原验收项 | 当前证据与结论 |
|---|---|---|
| P0 | 精确依赖、删除 npx cache 自动发现 | automator 0.12.1、ci 2.1.31；package-lock 锁定；dev 脚本不再修改或发现 npx cache |
| P0 | endpoint/project/viewport 强约束 | 无默认 39420；prewarm 显式指定项目、端口、宽度，connect 只读取签名的 loopback session；缺失/漂移拒绝 |
| P0 | 严格 receipt | project、Git/dirty manifest、SDK、route/query、fixture nonce、state hash、viewport、PNG CRC/IDAT/hash、selector 任一失败非零；所有 30 个真实 case 通过 |
| P0 | 拒绝旧 Home receipt | 专门回归覆盖来源/源码证据缺失，全量测试通过 |
| P0 | 只读 doctor | 实测 exit 0，磁盘 session 与 AppService marker 前后均不变；刷新单独移到 ui:session:refresh |
| P1 | 仅 App.captureScreenshot | Win32/private-desktop 已退出 active runner；官方 GUI 显式传 occlusion 开关并校验实际进程链 |
| P1 | candidate 全成功后晋升 | 30 张先入 run/candidate，再整批提交；故障注入覆盖回滚与无法证明时 indeterminate，不把失败覆盖旧图 |
| P1 | tracked registry、页面与录分状态 | 30 case，15/15 页面，match idle/editing/locked/error 全部真实截图通过 |
| P1 | 稳态、nonce、日志 | selector + reveal/geometry 连续稳定采样替代固定 sleep；每例 nonce 和截图前后数据 hash；console/exception 进入 receipt |
| P1 | 本地像素资源 | registry fixture 不含远程 URL/头像依赖；不修改业务头像语义 |
| P1 | pixelmatch 仅报告 | pixelmatch 7.1.0/pngjs 7.0.0；实图自比 0 差异；100% 差异测试也不阻断且 baseline 字节不变 |
| P2 | 取消自动重验证、影响映射 | .codex/.claude hooks 均停用；test:affected 默认打印计划，--run 才执行；docs 不触发测试，未知共享代码保守选择全量 |
| P2 | fairness 墙钟不确定性 | node:test 保留；仅测试以无记录开销的确定性操作时钟替代性能墙钟，17/17；生产 deadline 与业务实现保持不变 |
| P2 | Nightly 同批 10–15 case × 10 A/B | **未完成**：2.02.2609082 官方 CLI 安装诊断 compatible:true，但本机 auth 两次 CONNECT_ERROR/authorization timeout；没有绕过授权，没有替换 Stable |
| P2 | ci 低频 analyseCode/质量检查 | 显式 mp:quality；实测 534 files / 11 quality items；仅本地报告，不调用 preview/upload |
| P2 | SDK 4.x 独立合同审计 | 离线安装 4.0.2 检查 API 与迁移风险；决策继续 2.6.3；远程合同验证是未来单独迁移门槛，不称升级完成 |

“tracked registry”指仓库源文件中的集中声明，非 tmp 自动发现；本次没有提交授权，新增源文件目前在 Git status 中仍为 untracked，需未来经授权随改动提交。

## 现场环境与产物

- exact repo：`D:\projects(WIN)\badminton-miniapp`；branch：`codex/online-audit-optimizations-20260828`；HEAD：`6827efa3cf00182f4edacaefc5d399d58f82f260`。每轮 dirty 文件哈希以各 manifest 为准。
- Stable：2.01.2510290，SDK 3.14.2，390px；官方安装根 `D:\Soft\微信web开发者工具`。
- 10 连截：`tmp/ui-focus-probes/20260910-020844-857-a2610f377d594b099be413a09eb557d1.json` 至 `20260910-021149-786-663d68959b784791bb6c0603974cab24.json`。10/10 成功，共 3511 样本，前台命中 0、unknown 0，每轮 samplingReliable:true，均为 no-publish probe。该轮早于 nonce/动态 settle 最终补丁，因此另做最终代码焦点复测，记录在同目录和 `tmp/ui-final-focus-20260910.log`。
- 完整最终矩阵：`tmp/ui-runs/2026-09-09T18-26-39-071Z-19784-694beabf/manifest.json`；30/30 ok，publicationState:committed（这里只表示本地产物事务，不是 Git commit）。PNG 位于其 candidate 目录，并晋升到 `tmp/ui-screenshots-actual/`。
- 主控实际查看 launch、matchError、waterV2Member24Game PNG；机器 receipt 的 reviewStatus:pending 不自动改为产品视觉验收通过。
- 只读 doctor：`tmp/ui-doctor-20260910.json`，全部 binding checks 通过；额外现场对比确认 disk/session marker 不变。
- pixel diff：`tmp/ui-diffs/1788978034553/report.json`；本地质量检查：`tmp/delivery-quality/1788978335779.json`。
- 全量：`tmp/test-20260910.log`，1421 total / 1415 passed / 0 failed / 6 skipped；check 通过；lint 0 errors / 42 warnings。
- 最终代码补测：`tmp/ui-final-regression-20260910.log` 72/72；`tmp/ui-final-focus-20260910.log` 3/3，共 1083 样本、0 前台命中、0 unknown，三轮采样可靠。对应 focus receipts 为 `20260910-023823-928-0546ec671e71415d8248cc37843c524d.json`、`20260910-023844-599-a27b1d537dd54044b79fd5e7dc93a045.json`、`20260910-023905-536-794197d3db6b46fdb1242b98a64a938c.json`。

## 修复与限制

前次后台 capturePage 不回调；本次冷启动显式携带 `--disable-backgrounding-occluded-windows` 后通过。仅 NW_PRE_ARGS 不足以在命令行证明生效，现先启动官方 GUI exe 再 launch/签名。没有完成严格的开关 off/on 同版本交叉试验，不把相关性写成唯一因果证明。

不抢焦结论限于焦点采样分辨率和 restored-but-background 热会话；不保证冷启动、最小化、锁屏或断开远程桌面。系统 picker、modal、软键盘和分享面板继续人工/真机检查。本轮仅 390px，未声称覆盖 320/430。

Nightly 官方下载来自 [微信开发者工具下载页](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html) 的官方配置，安装包 Tencent Authenticode 有效。隔离解包，无全局覆盖安装。官方安装诊断在含括号目录误报 CLI unavailable，复制到无括号的临时测试目录后 compatible:true；CLI auth 仍超时。按官方 wechatide-skill 授权门禁暂停该步骤，用户在 Nightly 完成 Codex 本机授权/必要登录后才继续 A/B；不得读取安全配置或伪造令牌。

SDK 迁移详情见 `../tools/wx-server-sdk-4-migration-audit-2026-09-10.md`。截图工作流与命令见 `../tools/weapp-ui-screenshot-workflow.md`。
