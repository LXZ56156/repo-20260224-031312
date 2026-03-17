# UI 重构实施计划

方向：轻专业赛事中控台风
状态：✅ 全部完成 (2026-03-17)

## 阶段 1：设计系统 ✅

1. 重写 `app.wxss` — 新色彩 token、文字层级、间距系统、按钮体系、状态条、空态/错态/骨架
2. 提取 sync-banner 到全局样式，改为固定占位不插拔 (`hidden` + CSS transition)
3. matchPrimaryNav 样式全局化 (Section X)

## 阶段 2：五个关键页 ✅

match → lobby → share-entry → analytics → home

## 阶段 3：其余页面 ✅

launch → create → schedule → ranking → mine → profile → settings → preferences → feedback

## 阶段 4：统一状态 ✅

- sync/stale/offline → `.sync-banner` hidden 模式，全局 `[hidden]` 折叠规则
- error → 统一 `.state-error` 结构 (icon/title/desc/actions)
- empty → 统一 `.state-empty` 结构 (icon/title/desc)
- skeleton → 全局基类

## 阶段 5：自检 ✅

447/447 测试通过，详见 `docs/ui-refactor-checklist.md`
