# 设置页旧请求重试成功后保留新草稿（2026-10-03）

## 范围与结果

- checkout：`D:\projects\badminton-miniapp\main`，branch `master`，HEAD `b571c68754e964e1a73800645f68a49d99f40f41`。开始时核对了 `AGENTS.md`、`current.md`、Git 状态及[冷读记录](2026-10-03-client-defect-cold-review.md)，保留全部既有未提交改动。
- 修复冷读 P2：P1 保存失败后，用户编辑成 P2，再以旧 payload 与旧 request ID 重试 P1 成功；刷新后 P2 仍有未保存字段时，成功分支取消旧返回计时器并留在设置页。新保存继续从当前字段取得 P2 并生成新 request ID。无新草稿时仍在 420ms 后返回 lobby。
- 本次只在 `settings/index.js` 增加基于既有表单基线与可编辑字段的未保存判断，在 `settingsActions.js` 成功返回前使用该判断，向 `tests/settings.draft-retry.test.js` 增加两项直接行为回归。未修改 `settingsViewModel.js` 或 `current.md`，未改旧请求 payload/ID 重放合同。

## 验证

- 实现前运行 `node --test tests/settings.draft-retry.test.js`：6 通过、1 失败。新“重试成功且存在更新草稿”用例因返回计时器数量 `1 !== 0` 失败；“无新草稿正常返回”用例通过，直接复现冷读问题。
- 最小修复后同一直接测试：7 通过、0 失败。覆盖 P1/原 ID 重放、P2/新 ID 保存、清重试状态、释放页面忙状态、正常自动返回。
- 先审阅 `npm run test:affected -- miniprogram/pages/settings/settingsActions.js miniprogram/pages/settings/index.js tests/settings.draft-retry.test.js` 计划：31 测试文件，`full=false`，`cloudCommon=false`，无未覆盖 area；随后 `--run` 同一明确路径计划：144 通过、0 失败、0 跳过。
- 聚焦 ESLint：`$env:ESLINT_USE_FLAT_CONFIG = 'true'; node node_modules/eslint/bin/eslint.js miniprogram/pages/settings/settingsActions.js miniprogram/pages/settings/index.js tests/settings.draft-retry.test.js`，退出码 0、无错误或警告。
- `git diff --check` 按本次文件路径通过。上述检查使用同一共享脏树，包含当时其他任务已存在的改动；没有把结果声称为已提交或线上验证。

## 交付边界

- 本次未运行全量 `npm test`；为局部客户端行为修复执行了直接与 affected 验证。没有涉及云合同或依赖调整，未追加云部署检查。
- 未获取真实微信 DevTools 图或真机交互验证；Node 模拟行为验证不替代 UI/人工验收。
- 未执行 commit、push、preview、上传、发布、部署或真实业务写入。主控后续仍需决定客户端交付及实际微信验收。
