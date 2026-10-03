# 局部经验

已稳定规则不在此复制；本文件按任务需要读取，不作为每次开工必读清单。

现行规范和按任务读取入口统一查 [文档索引](../README.md)，当前状态查 [current](../tasks/current.md)。这里仅保留尚有独立价值的局部经验；吸收到对应规范后删除重复项。

## 仍有独立价值的局部经验

- Launch CTA对齐优先让quick-water与tournament action row拥有相同节点子结构，再复用flex；仅适用于对应页面。selector应精确命中一次，左右相对一致不排除共同溢出。
- ESLint Flat Config的构建产物忽略项应放独立全局 `ignores` 配置对象，避免前置推荐规则扫描 `miniprogram/miniprogram_npm`。
- 已授权upload时，先查看距上次上传的Git变化，把工程提交翻译为用户可感知的 `MP_DESC`，不要直接复用commit message；上传后记录实际commit和备注。本条不构成upload授权。

## 历史

[整理前完整快照](../archive/learnings-before-consolidation-2026-09-11.md)保留增长飞轮、旧端口、旧授权和经验原文。不要据此重新触发已完成安装/授权、恢复旧worktree或要求无关全量测试。
