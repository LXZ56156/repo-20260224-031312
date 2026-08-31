# 2026-08-31 UI/UX 全面评审素材

## 仓库与版本

- 仓库：`https://github.com/LXZ56156/repo-20260224-031312`
- 分支：`codex/online-audit-optimizations-20260828`
- 待评审应用源码 HEAD：`1c7a99ed616cbff92a9370ca1890d37a638d6b3c`
- 线上起点：`online/6.1.2-e60d827-r3`

本目录是应用提交 `1c7a99ed616cbff92a9370ca1890d37a638d6b3c` 之后增加的纯评审素材，不包含新的应用源码改动。外部评审者可以直接读取同一仓库中的 `miniprogram/`、`cloudfunctions/`、`scripts/` 和 `tests/`，不需要额外源码压缩包。

收到评审请求后应先执行：

```bash
git branch --show-current
git rev-parse HEAD
git diff --exit-code 1c7a99ed616cbff92a9370ca1890d37a638d6b3c..HEAD -- miniprogram cloudfunctions scripts tests AGENTS.md
```

第一项必须是上述分支；第二项必须与请求者给出的 GitHub 素材交付 HEAD 一致；第三项应为空，证明素材提交没有改变待评审应用源码。

## 项目背景

这是一个个人使用的原生微信小程序，技术栈为 WXML / WXSS / JavaScript + 微信云开发。

核心赛事链路：创建比赛 → 邀请/导入成员 → 设置参数 → 开赛 → 录分 → 排名 → 复盘。另有一个不依附比赛的独立“打水账本”。

本次重点不是只检查一致性，而是结合全部截图和源码，完成：

1. 基础可用性、触达、状态和布局检查；
2. 按钮及交互控件的主次、造型和质感评审；
3. 整体审美、视觉体验、运动产品气质和核心流程连续性判断；
4. 简单直接的最小改法，以及确有价值时的适度组件级或页面级改造建议。

## 截图事实

- 微信开发者工具真实模拟器截图，不是浏览器近似稿。
- 项目路径：`D:\projects(WIN)\badminton-miniapp`
- 设备：iPhone 12/13 (Pro)
- 逻辑窗口宽度：390px
- 基础库：3.14.2
- 共 136 张 PNG：19 张内建可复现场景 + 117 张扩展状态图。
- 136 张图片 SHA-256 均唯一；19/19 内建 receipt 通过；扩展状态抓图错误 0。
- 长页面按真实 `scrollTop` 分段保存，没有拼接固定底栏。
- `SCREENSHOT_MANIFEST.json` 是逐图索引，包含页面、状态、滚动位置、环境、尺寸、hash 和 evidence 位置。
- fixture 只证明当前源码在指定状态下的渲染，不证明云端业务链路已执行。

截图 receipt 中的 `55bfc4fa319ab74a33d406f05fbdab975ab8cfb7 + dirty 文件 hash` 是抓图来源证明，不是本次评审目标源码版本。评审目标始终是 `1c7a99ed616cbff92a9370ca1890d37a638d6b3c`；同一组产品改动随后提交到了该 HEAD。

## 覆盖范围

覆盖全部 15 个页面，以及主要可达的角色、生命周期、赛制、长列表、空态、加载态、错误态、busy、只读、筛选和应用内弹层：

| 页面 | 主要覆盖状态 |
| --- | --- |
| home | 首次空态、混合赛事、Hero、加载、筛选空态、整页错误 |
| launch | 全部玩法卡片、页面顶部/底部 |
| mine | 有本机战绩、无战绩 |
| profile | 空资料、已填写、字段错误、头像失败、保存 busy |
| feedback | 空表单、长内容、缺资料、登录失败、提交 busy |
| share-entry | 草稿/进行中/完赛、身份识别中/超时、无效链接、小队选择、加入 busy |
| water | owner/member/visitor、2/24 人、总账/流水/球友、搜索空态、记一局/单独/更正、详情、往期、加载/错误、添加/加入弹层 |
| create | 预设人数、自定义多人转、小队转、固搭、离线重试、创建 busy |
| lobby | 管理员/成员/游客、草稿/进行中/完赛、小队未分组、固搭组队、加入弹层、长管理面板、加载/错误 |
| schedule | 草稿空态、进行中长赛程、筛选空态、球友/状态筛选弹层、加载/错误 |
| match | 未编辑、编辑草稿、他人占锁、完赛只读、无权限、批量录分、重试、加载/错误 |
| ranking | 空榜、12 人长榜、固搭组合榜、海报预览、加载/错误 |
| analytics | 完整长复盘、零完赛、小队复盘、重试、海报预览、加载/错误 |
| settings | 管理员、名单未就绪、小队结束条件、固搭、高级场次、进行中只读、busy、加载/错误 |
| preferences | 默认偏好、关闭动效/紧凑列表/关闭自动操作 |

这不是所有数据排列组合的穷举。以下微信原生系统层无法由 `App.captureScreenshot` 稳定证明，应列入真机人工检查：

- `wx.showModal`；
- 展开的原生 picker / 滚轮；
- 输入法键盘与键盘顶起后的 safe-area；
- `chooseAvatar`、系统分享、保存相册和权限提示；
- `wx.showToast`、`wx.showLoading` 等短暂系统层。

## 产品与实现边界

- 保留现有业务合同、权限语义、导航和核心流程。
- 这是个人项目，优先简单、直接、易维护的原生实现；不新增设计框架、抽象层、兼容层、重试链路或假设性兜底。
- 使用系统字体，兼顾低端机、户外强光、44px 触达、reduced motion 和无远程视觉依赖。
- 在线缓存先显和健康后台刷新必须静默；不得恢复“当前展示缓存数据”或同义提示。
- 暖米色+酸绿、暗底+荧光绿、报纸规则线，以及历史 Next-Gen / C3 / Home 全面重做均已被否决，不得复用。
- 允许在不改变业务合同的前提下提出适度组件级或页面级重排，但必须同时说明最小改法、收益、成本和回归风险。

## 目录

```text
README.md
REVIEW_PROMPT.md
SCREENSHOT_MANIFEST.json
screenshots/
  builtin/                 # 19 张
  custom/                  # 117 张
evidence/
  launcher-provenance.json
  custom-manifest.json
  builtin-receipts/        # 19 份
```

评审必须遵守 `REVIEW_PROMPT.md` 中的 136/136 逐图门槛。
