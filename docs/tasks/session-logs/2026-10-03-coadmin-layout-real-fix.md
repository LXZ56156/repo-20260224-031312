# 协管卡：真实390证据触发的局部布局修复

已修复协管行按钮继承全局100%宽度的问题：局部高优先级选择器把动作按钮限制为104px，保留44px触达高度，姓名/身份占其余可收缩空间。权限和业务事件、全局btn、整页布局均未改动。本轮按主控解除冻结后授权，仅改协管WXML、大厅WXSS、现有局部布局测试和本唯一日志。

## 真实证据与可见范围

读取并查看当前390签名PNG `tmp/authorized-ui-after-install-20261003/finals-readiness/simulator-frame/lobbyCoManagerOwner.png`。首屏只显示协管卡顶部及主办者行，没有看到滚动后的操作按钮。未把该首屏图当作按钮可见/布局通过证据。

读取同名receipt的真实DOM：协管row宽约347.13px；两枚action按钮也为347.13px。第二/第三row高约180.93/126.95px，按钮document top约775.11/929.05px。全局 `button.btn { width:100% }` 的优先级高于旧 `.co-manager-action`，而旧动作不可收缩，压缩了姓名/身份列并拉高行。这是本次实际观察到的回归来源。

## 最小修改

- `.co-manager-row button.co-manager-action` 比全局 `button.btn` 更明确，设置104px宽/最小宽、`flex:0 0 auto`，不影响其他btn。
- 行保持nowrap；原姓名/身份列 `flex:1; min-width:0` 与姓名ellipsis保留，按钮和文字在同一行分配空间。104px给四字动作及busy图标留空间，宽度不随rpx缩成小触达目标。
- 动作高度/最小高度均44px，inline-flex居中，紧凑内边距；禁用/loading沿用原绑定和全局样式。
- 截断显示姓名保留完整DOM文字及 `aria-label={{item.name}}`；按钮aria-label带完整姓名和“授予/撤销…的协管权限”。未改canGrant、角色权限或catchtap handler。

## 验证和待办

先检索既有 `ui-local-layout`、`button-layout-containment` 和大厅结构/权限测试。在现有局部布局文件新增两项回归断言，先复现缺少局部宽度覆盖/完整标签的2项失败，再最小修复。

`node --test tests/ui-local-layout.test.js tests/button-layout-containment.test.js tests/lobby.coManagers.test.js tests/lobby.hero-structure.test.js`：**20/20通过，0失败/跳过**。覆盖局部高优先级宽度、44px高度、单行/可收缩列、完整标签和原权限/busy/handler；既有布局和协管权限保持通过。定向ESLint（测试JS）**0错误/0警告**；定向 `git diff --check` 通过。未跑应用全量，交主控合并后统一运行。

没有操作runner/cases、没有抓新图、没有部署。修复后真实滚动到协管卡的owner/busy/member图、按钮几何/文字与长名/触达可视区、320/430边界、真实读屏输出仍待主控验证。当前390首屏及修复前DOM只能证明回归存在，不能证明修复后的像素已通过。代码/测试/日志完成后停止写入，供主控重新冻结签名和验图。
