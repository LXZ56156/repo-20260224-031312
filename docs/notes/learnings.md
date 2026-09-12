# 局部经验与规范索引

已稳定规则不在此复制；本文件按任务需要读取，不作为每次开工必读清单。

## 规范已集中

- 授权、静默缓存、按风险选测、Windows shell、云模板来源：[AGENTS.md](../../AGENTS.md)。
- UI实图、44px、高密度名单与双盲审：[视觉验收](../tools/weapp-ui-acceptance.md)。
- 签名会话、后台截图、失败诊断：[截图工作流](../tools/weapp-ui-screenshot-workflow.md)。
- 当前版本、实际通过/失败、未部署状态：[current.md](../tasks/current.md)。
- we分析本地拉取及已有数据检查：[数据拉取工作流](../tools/we-analysis-local-script.md)。
- 文档生命周期见AGENTS；不再在多个位置维护同一规则。

## 仍有独立价值的局部经验

- Launch CTA对齐优先让quick-water与tournament action row拥有相同节点子结构，再复用flex；仅适用于对应页面。selector应精确命中一次，左右相对一致不排除共同溢出。
- ESLint Flat Config的构建产物忽略项应放独立全局 `ignores` 配置对象，避免前置推荐规则扫描 `miniprogram/miniprogram_npm`。
- 已授权upload时，先查看距上次上传的Git变化，把工程提交翻译为用户可感知的 `MP_DESC`，不要直接复用commit message；上传后记录实际commit和备注。本条不构成upload授权。

## 历史

[整理前完整快照](../archive/learnings-before-consolidation-2026-09-11.md)保留增长飞轮、旧端口、旧授权和经验原文。不要据此重新触发已完成安装/授权、恢复旧worktree或要求无关全量测试。
