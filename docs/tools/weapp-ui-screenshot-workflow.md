# WeChat DevTools UI Screenshot Workflow

> 用于小程序 UI 改动后的真实视觉检查。当前重点服务 `docs/specs/growth-flywheel-optimization.md` 第一阶段增长方案。

## 适用场景

- 任何 `miniprogram/pages/**` 的 WXML / WXSS / 用户可见文案 / CTA / 页面状态变更。
- 分享落地页、排名页、赛程页、赛后分析页、首页赛事卡、lobby 新用户引导等增长链路 UI。
- 截图前需要确认页面真实渲染，而不是只看单元测试或 DOM 数据。

## 结论

本机稳定端口是：

```bash
ws://127.0.0.1:39420
```

不要使用旧端口 `9420`。

`miniprogram-browser` 适合做运行态健康检查和结构快照；在 WSL + 微信开发者工具下，官方 page screenshot 通道可能超时或生成空白图。真实 UI 验收优先使用 `scripts/dev/weapp-ui-screenshot.js`。

## 标准流程

1. 启动或恢复开发者工具自动化：

```bash
./scripts/dev/weapp-dev.sh preview
```

2. 确认自动化链路健康：

```bash
WECHAT_DEVTOOLS_CLI='/mnt/d/Soft/微信web开发者工具/cli.bat' \
npx --yes miniprogram-browser doctor \
  --session growth-ui \
  --project /home/lizixuan/projects/badminton-miniapp \
  --devtools-project 'D:\projects\badminton-miniapp-preview' \
  --project-map '/home/lizixuan/projects/badminton-miniapp=D:\projects\badminton-miniapp-preview' \
  --auto-port 39420 \
  --timeout 30000 \
  --json
```

如果 `39420` 已被 live session 绑定，先查看 session：

```bash
WECHAT_DEVTOOLS_CLI='/mnt/d/Soft/微信web开发者工具/cli.bat' \
npx --yes miniprogram-browser session list \
  --project /home/lizixuan/projects/badminton-miniapp \
  --json
```

然后复用列表里的 session 名称运行 `doctor`，不要重复用新 session 绑定同一个 `--auto-port`。

3. 先用结构快照确认页面节点和布局比例：

```bash
WECHAT_DEVTOOLS_CLI='/mnt/d/Soft/微信web开发者工具/cli.bat' \
npx --yes miniprogram-browser snapshot -i --layout \
  --session growth-ui \
  --project /home/lizixuan/projects/badminton-miniapp \
  -c --timeout 30000
```

4. 截真实 UI 图：

```bash
WEAPP_SCREENSHOT_DIR=tmp/ui-screenshots-actual \
WEAPP_SCREENSHOT_TIMEOUT_MS=45000 \
npm run ui:screenshot -- ranking
```

不传 case 时会跑全部内置增长 UI 用例：

```bash
WEAPP_SCREENSHOT_DIR=tmp/ui-screenshots-actual \
WEAPP_SCREENSHOT_TIMEOUT_MS=45000 \
npm run ui:screenshot
```

脚本会对每个 case 独立连接和断开，避免一个 stale screenshot 通道拖垮整轮。

列出可用 case：

```bash
npm run ui:screenshot -- --list
```

## 当前内置用例

| Case | 页面 | 覆盖点 |
|------|------|--------|
| `shareDraft` | `pages/share-entry/index` | draft 报名态、参赛名单、加入 CTA |
| `shareRunning` | `pages/share-entry/index` | running 进行态、排名预览、赛程/排名入口 |
| `shareFinished` | `pages/share-entry/index` | finished 结束态、最终排名、战报入口 |
| `lobbyGuide` | `pages/lobby/index` | 加入后首次引导卡 |
| `ranking` | `pages/ranking/index` | 顶部分享 CTA、战绩卡入口、前三名行布局 |
| `schedule` | `pages/schedule/index` | finished hero、最终排名/分享战绩 CTA |
| `analytics` | `pages/analytics/index` | 赛后战报 hero、朋友圈 CTA、报告卡 |
| `home` | `pages/home/index` | finished 赛事卡、查看战绩/再办一场 |

`match` 当前增长改动是埋点，不改变可见 UI；如后续加入单场比分分享卡，再新增截图 case。

## 判断标准

- 截图文件大小应明显大于 20KB；小于该值通常是空白或失败图。
- 同时查看脚本输出的 `dom`：重点看文本是否完整、元素尺寸是否异常、`offset` 是否明显重叠。
- 每个 UI 页面至少检查：信息层级、CTA 主次关系、文字换行、横向溢出、首屏密度、增长方案意图是否清楚。
- 涉及用户可见修改时，先输出优化方案给产品/用户确认，再实施。

## 故障处理

- `mcp__weapp_dev` 报 `Transport closed` 时，不要依赖 MCP 截图；改用 direct `miniprogram-automator` 脚本。
- `miniprogram-browser screenshot --mode page` 超时或空白时，不要连续硬试；先跑 `doctor` / `snapshot` 判断运行态，再用 `npm run ui:screenshot`。
- 如果 direct screenshot 也连续超时，先执行 `./scripts/dev/weapp-dev.sh preview` 重启开发者工具自动化，再单页重试。
- `screenshot --mode layout` 只作为结构/重叠辅助，不作为高保真视觉验收依据。
