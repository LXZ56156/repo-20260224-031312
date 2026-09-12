# Current Task

## 当前状态（2026-09-12）

- 当前方向：`db3be6d` 云修复已提交推送；本轮 UI 未提交。首页筛选/排序及全局同类选择控件层级已优化，五项390px实图经主控和双评审通过，全量1485通过/6跳过/0失败；其他尺寸及人工验收待完成。按用户要求跳过Edge，自动真机调试已发起但响应超时，手机连接未确认。证据见 [UI 排布优化](ui-layout-polish-2026-09-12.md)；独立账本及云修复见[前轮记录](session-logs/2026-09-12-closeout-water-restart.md)。
- 云开发原环境已付19.90元续至 **2026-10-12 23:59:59**；已保存16集合10665文档和2239已发现文件的在线非原子备份。[备份](session-logs/2026-09-11-huawei-migration-backup.md)、[成本](../reports/2026-09-11-cloud-migration-cost-comparison.md)、[优惠](../reports/2026-09-11-cloudbase-discount-verification.md)作为背景保留，未购买域名/备案提交/迁移部署。
- 工作区：`D:\projects(WIN)\badminton-miniapp`；branch：`codex/online-audit-optimizations-20260828`。
- 实现提交：`d1d0040`，工具`a85e326`、云修复`9c25075`均已推送当前分支；实际HEAD另含交付记录提交。仅本地运行产物 `.playwright-cli/`、`preview-qrcodes/` 未纳入Git。
- 线上客户端基线记录为 `55bfc4fa319ab74a33d406f05fbdab975ab8cfb7`（`6.1.2-e60d827-r3`）；本地实现不代表已上传或部署。
- 审查范围：用户现已授权修复此前收口问题；提交/上传/部署/真实数据写入仍独立授权。[审查报告](../reports/2026-09-11-project-audit.md)为发现时快照，修复状态按本轮记录。
- 两技能入口7684→2552字符，含引用Markdown18980→5375字符；校验及四场景独立前向审查通过。wechat-visual-story仍未定位，未改动。详见 [实施与审查记录](../reports/2026-09-11-workflow-skill-audit.md)。

## 已实现与实际验证

- 日常截图为用户批准的独立 `simulator-frame` 模式；旧 `page` 合同和基线保留，输出隔离，不声明页面区几何等比。
- 固定已安装 DevTools `D:\Soft\微信web开发者工具` / 2.02.2609102；MCP沿用已授权的 `Codex` 身份/Token。本轮SDK 3.17.3；用户手动切为390px iPhone12/13(Pro)，已后台显式重绑并通过只读doctor，未激活窗口。
- 新版30case单批27通过、3官方响应超时；3项独立重跑通过并晋升。各case有通过回执，不等于单批30/30。
- 新版3连focus-check通过：1747次有效采样，DevTools前台命中0、unknown0；仅覆盖 restored-but-background 热会话，不覆盖冷启动/最小化/锁屏。
- 本次全量1478项：1472通过、6跳过、0失败；含新增云加载与打水/赛事跨handler串联测试。最终check通过、lint 0错误42警告、diff检查通过。water89/89、launch/截图37/37通过。
- 详细证据：[新版实测](wechatide-nightly-admission-2026-09-11.md)；[原Stable及P0–P2逐项验证](weapp-background-screenshot-validation-2026-09-10.md)。
- Prompt/Edit/Stop重型hooks已停用；按需 `test:affected`；pixel diff仅报告；云SDK4仅审计，23函数仍用2.6.3；本轮云修复已全部部署并核验。

## 日常截图入口

在上述工作区的 PowerShell 中：
```powershell
$env:WEAPP_UI_SESSION_FILE = 'tmp/independent-320/session.json'
$env:WEAPP_CAPTURE_SURFACE = 'simulator-frame'
npm run ui:doctor
npm run ui:screenshot -- launch
```

用户允许前台恢复后已重新prewarm，当前热会话恢复，390px错误态实图通过。源码或文档变化后原签名不可直接复用；截图前按 [截图工作流](../tools/weapp-ui-screenshot-workflow.md) 的两阶段 `ui:session:refresh`（中间明确编译）重新绑定。

## 未完成与下一步

- 独立账本本地实现见[增量规范](../specs/independent-water-ledgers.md)；320及390主要实图经主控和双隔离评审无共同P0/P1，390历史正常/空态/错误态单项通过。430及完整交互、最终用户验收未完成；索引与23函数已部署并远端核验；客户端尚未upload/发布。
- 连续同页面case仍可能失样式，新样式门禁已正确拒绝；390三项批次2项capture通过、历史失败，不能称整批通过。独立历史case成功不证明DevTools内部根因已修复，详见本轮记录。
- 锁会话、错误分类、legacy撤销/详情、异步和工具修复已在本地实施；post-commit兼容脚本已无部署行为。录分锁与赛事跨文档原子性仍是已注明限制。
- 新版完整30case批次偶发响应超时仍需定位；原Stable/Nightly同SDK页面图15×10 A/B未完成，不称P0–P2全部闭合。
- 日常只连接热会话；不得因失败自动激活窗口、预热或改尺寸。前台预热默认拒绝，须本次明确授权。MCP本地入口读取原 `Codex` 身份/Token，已实机验证，禁止手写小写客户端名。
- 此前提交推送完成；本次waterSession已改CLI重新部署，23函数无业务写入烟测通过（资料接口仅启动验证）。本次错误提示、部署运行烟测与串联测试已完成收口，交付提交另见本轮记录；真实小程序身份读取资料/历史账本成功。客户端未upload/发布，完整用户人工验收仍不由自动化替代。
- 原产品实现清单、分阶段验证、旧授权和会话历史完整保留在 [整理前快照](session-logs/2026-09-11-before-doc-consolidation.md)，按需检索，不默认整篇读取。
