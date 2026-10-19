# 当前状态

2026-10-18 产品实现与跨平台工具已交付 master `e0b4bdf`。最新用户授权在重连 VM 的单个任务继续迁移并截图验收；只操作 VM 独立 checkout，不操作宿主机 LZX，原 Windows 修改和 UI14 两稿保留。

## 当前源码候选

- EFF-04：50 份完整赛事/总 4 MiB 双软预算，LRU、索引重建及活动页/草稿/在途和未确认写入保护，独立战绩快照不删除。
- FA-01/03：休息、覆盖、均衡三档，修改比赛页保存 rules.schedulerProfile；服务端从赛事读取，默认均衡。固定搭档/单打和已开始赛程不改。
- FA-02：D 在原排程预算内预留最多 150 ms/6000 候选，有界同队替换/跨批交换；动态连打/等待边界以可行基线定义，指标按最终赛程重新计算。
- BIZ-02：普通加入不认领；本人显式选 guest 并二次确认，服务端校验微信身份/draft/版本/目标、幂等与并发竞争，保留队别/搭档/赛程及统计，不授予管理权。满员允许认领已有位置，多同名不自动猜测。
- 文档、旧断言与新回归同步；完整规则见[产品正文](../specs/cache-fairness-and-member-claim-policy.md)，结果/风险/证据统一在[实施记录](cache-fairness-claim-implementation-2026-10-18.md)。

## 验证与待办

旧 rsync/wslpath 镜像运行时、测试枚举、废弃 API 扫描和云共享库检查已改 Node，旧 Shell 入口转发，保留真实平台边界及隔离部署合同。按用户要求移除 GitHub Actions，不启用远端自动测试；见[跨平台测试工具](../tools/cross-platform-tests.md)。

产品关联测试和 36 组排程探针通过。云端冻结复核 1981 项：1973 通过、0 失败、8 Windows 专属跳过；check 通过，lint 0 错误/35 既有警告。旧 WSL 失败及各轮结果保留在[实施记录](cache-fairness-claim-implementation-2026-10-18.md)。

VM迁移与390/430隔离原生流程已验：DevTools Stable2.02.2608080/SDK3.17.4，430×752/font16在取消/布局基础上补完一次保存重开rest/index1/v2、满员第二guest最终认领6人/v2、普通加入5→6/v2且原五人不变。三组各一写，finish完整恢复storage/globalData/SDK、watch/listener/pending清零、owner inactive，最终doctor8/8。真实云/手机仍未验；VM USB手机枚举0、无线未核、未配置独立测试云且无CloudBaseCLI。官方本地线程可接续，durable native挂载未修复。重连恢复分支仅65回归，未现场触发。详情和证据见[VM迁移正文](vm-migration-and-ui-acceptance-2026-10-18.md)。

Windows全量2032/2032通过、0失败/跳过/取消；旧launch静态断言修正后69项关联与全量复跑通过，运行/业务代码未再变。当前只更新验收文档并跑相称回归。用户已明确批准本轮提交推送至LXZ56156/repo-20260224-031312的master；不force、不部署/preview/upload/发布、不写生产。源码签名与收尾差异独立记录，旧receipt不改，不为文档重跑GUI。截图红色错误计数2在补验前已存在且三组未增长，确切条目原文尚未映射；不把doctor当错误清零。
