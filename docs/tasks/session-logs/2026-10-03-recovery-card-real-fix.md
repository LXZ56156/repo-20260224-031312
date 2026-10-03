# 找回列表卡片：真实图触发的局部全宽修复

只把 `pages/tournament-list/index.wxss` 的既有卡片规则从 `.recovery-item` 提高为 `.recovery-page button.recovery-item`。保留原 `width:100%`、零左右margin及bottom间距、border-box、内边距和触达高度，使页面容器内的卡片规则覆盖微信原生button默认宽度/居中边距。不改结构、正文、点击或云逻辑，也不改全局按钮样式。

本轮已查看真实390签名PNG `tmp/authorized-ui-after-install-20261003/finals-readiness/simulator-frame/tournamentList.png`，可见三张列表卡片窄而居中。读取同名receipt：3张 `.recovery-item` 均宽183.9966px、left103.1037px，而 `.recovery-intro` 宽366.2075px、left11.9983px。实际图与DOM共同触发本次优先级修复；没有把fixture定义当成这项实图证据。

在现有 `tests/ui-local-layout.test.js` 加1项具体回归，先复现缺少高优先级规则的失败，再修复。测试检查容器+button选择器、100%宽、零左右margin、border-box及既有openTournament入口保留。

- `node --test tests/ui-local-layout.test.js tests/button-layout-containment.test.js`：**13/13通过，0失败/跳过**。
- 定向ESLint（测试JS）：**0错误/0警告**；定向 `git diff --check` 通过。

仅修改上述CSS、现有测试和本唯一日志；未改runner/cases/current/其他文件。没有抓修复后截图、没有部署或运行应用全量。修复后的真实三卡全宽/左右边距、长名称换行和320/390/430可视效果待主控统一重拍/复核；当前实图只证明原回归存在。本轮文件完成后停止写入，供主控冻结签名与验图。
