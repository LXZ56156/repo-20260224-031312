# 2026-09-03截图失败历史摘录

从工作流移出，原文保留；不是当前操作指令，现行结果见 [current.md](../current.md)。

### 8.1 2026-09-03 现场结果（历史失败，当前已修复）

- 环境：Stable DevTools `2.01.2510290`、基础库 `3.14.2`、390px、exact worktree。
- prewarm 成功，窗口只读检查为 visible、restored、not minimized；ChatGPT 保持前台。
- `launch` route、3 个 selector 的数量/尺寸和 500ms settle 成功，随后 `App.captureScreenshot` 45 秒超时；另一个不经过 runner 的原始协议调用也在后台 30 秒超时，均无 PNG。
- 首轮 probe 记录 `devToolsForegroundHits=0`，但 48 个 ChatGPT 样本因 ancestry 中已退出父进程均为 unknown，最大 sample gap 约 1.54 秒，所以 `samplingReliable=false`。该结果只能证明“本轮没有捕获到成功截图”，不能证明零抢焦。
- 安装包链路已将 45 秒挂起定位到顶层 NW.js `global.Win.capturePage(callback)` 不回调；前置 webview 稳定等待最多 5 秒，不是该长超时来源。与当前 Chromium 91 未禁用 Windows Native Window Occlusion 的状态高度吻合，但必须由全新顶层进程的开关 A/B 才能完成因果验证。
- 前台分类随后已改为签名 DevTools 安装根路径判定；辅助实测可把 ChatGPT 判为 non-target、DevTools 判为 target，不再遍历已退出父进程。不要在旧单实例上机械重跑三次；完整退出后用新端口、新签名和已验证开关重做本节验收。
