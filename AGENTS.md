# AGENTS.md

## Project Overview

微信小程序羽毛球赛事管理项目，使用原生微信框架（WXML / WXSS / JS）和微信云开发。核心链路覆盖：创建、配置、开赛、录分、排名、复盘。

## Commands

```bash
# 全量测试
node --test tests/*.test.js

# 单测
node --test tests/ranking-core.consistency.test.js

# 同步云函数共享库
./scripts/sync-cloud-common.sh

# 检查云函数共享库是否同步
./scripts/check-cloud-common.sh
```

云函数部署仍通过微信开发者工具完成。

## Architecture

- `miniprogram/pages/`：页面层（14 个页面，tabBar: home, launch, mine）
- `miniprogram/core/`：跨页面业务逻辑
- `miniprogram/core/storage/`：本地存储与缓存
- `miniprogram/permission/`：权限判断
- `cloudfunctions/`：20 个云函数
- `scripts/`：构建与模板同步脚本
- `tests/`：~170 个 `node:test` 测试文件
- 云函数共享代码以 `scripts/*-common.template.js` 为准，不直接修改 `cloudfunctions/*/lib/*`

## Deprecated APIs

- 不使用 `wx.saveFile` / `wx.removeSavedFile` → 改用 `wx.getFileSystemManager().saveFile` / `.removeSavedFile`
- 不使用 `wx.getSystemInfo` / `wx.getSystemInfoSync` → 改用拆分后的官方 API 或现有封装 `miniprogram/core/systemInfo.js`
- 涉及系统信息能力时，优先复用 `miniprogram/core/systemInfo.js`
- 检查脚本: `scripts/check-deprecated-wx-api.sh`（或 `npm run check:deprecated-wx-api`）

## Methodology

接到任务时，按以下顺序工作：

1. **影响判断**：改动是否会影响用户可见行为？是 → 输出方案等待确认，否 → 直接进行
2. **测试先行**：实现功能或修复 bug 前，先写或确认测试能覆盖该路径
3. **验证后声称完成**：宣称完成前，必须运行以下命令并确认无报错：
   - `node --test tests/*.test.js`
   - `npm run check`
4. **涉及微信 API**：查 context7 文档再写代码，避免引入废弃 API
5. **涉及云函数模板**：改 `scripts/*-common.template.js`，改完运行 `./scripts/sync-cloud-common.sh`，不直接改 `cloudfunctions/*/lib/*`

## Working Rules

- 所有会影响用户可见行为的改动，都必须先向用户提出方案并获得明确审核，再开始实施。
- 这条规则覆盖但不限于：
  - 页面结构与信息架构
  - 按钮文案、状态文案、提示文案
  - 入口数量、主次 CTA、菜单项
  - 页面跳转路径、返回路径、分享落地路径
  - 用户操作步骤、提交流程、默认行为
  - 删除/取消/修改等动作语义
- 即使改动看起来很小，只要会改变用户看到的内容或操作方式，也不能跳过审核直接修改。
- 只有当用户明确指定某个改动时，才能视为该项已经审核通过。

## Style

- 回复默认使用中文，技术名词和代码标识保持原文
- 提交信息使用 `feat/fix/refactor/chore` 风格
