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

- `miniprogram/pages/`：页面层
- `miniprogram/core/`：跨页面业务逻辑
- `miniprogram/core/storage/`：本地存储与缓存
- `miniprogram/permission/`：权限判断
- `cloudfunctions/`：云函数
- `scripts/`：构建与模板同步脚本
- `tests/`：`node:test` 测试

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

## Codebase Notes

- 云函数共享代码以 `scripts/*-common.template.js` 为准，不直接修改 `cloudfunctions/*/lib/*`
- 所有回复默认使用中文，技术名词和代码标识保持原文
- 提交信息使用 `feat/fix/refactor/chore` 风格
