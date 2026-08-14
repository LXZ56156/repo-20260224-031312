# 2026-07-17 并行路线图本地集成记录

## 范围与授权

- 权威仓库：`D:\projects(WIN)\badminton-miniapp`
- 目标分支：`codex/ui-optimization-v2`
- 统一 checkpoint：`70845c1`
- 用户已授权：原工作线收口、本地提交和主分支本地集成。
- 用户未授权且本轮未执行：push、PR、preview/upload、正式发布、云函数部署、真实云数据写入。
- 所有 cherry-pick、冲突解决提交和文档提交均设置 `SKIP_CLOUD_POST_COMMIT_DEPLOY=1`。

## 集成顺序与提交映射

| 顺序 | 工作线 | 源提交 | 主分支本地提交 | 结论 |
|---:|---|---|---|---|
| 1 | P06 组局 Lite 规格 | `6de24f4` | `a64b95f` | docs-only；保持待产品审批 |
| 2 | P07 UI 组件调研 | `f4d0881` | `0aca9c4` | docs-only；保持待试点审批 |
| 3 | P01 数据基线工具 | `0c79d1d` | `ace6b0f` | 可复现审计工具 |
| 4 | P01 赛事快照 | `42367b0` | `bb85e7b` | 脱敏 90/180 天赛事证据 |
| 5 | P01 We 分析收口 | `611207f` | `73f6b5f` | 931/931 只读请求，内存 token |
| 6 | P02 排阵观测初版 | `3b2566e` | `49b164e` | 当前树模板/路径/公平性/性能审计 |
| 7 | P02 证据收口 | `d48d19d` | `1fd17be` | compact tracked evidence + ignored full artifact |
| 8 | P05 clone preset | `d1b6e04` | `beb34bc` | 保留 canonical rotation preset/config |
| 9 | P05 收口文档 | `30e82b9` | `c9321b4` | 记录已批准、未部署边界 |
| 10 | P04 事件管道 Phase A | `4070f7b` | `8ddd408` | 双端默认关闭、独立接收云函数 |
| 11 | P04 收口文档 | `c8e5c7d` | `9bd7ddc` | 记录启用前安全门槛 |
| 12 | P03 打水 MVP | `74cc333` | `b9eb046` | 9 项已批准范围，本地实现 |
| 13 | 跨线组合回归 | 总控新增 | `530ecae` | preset × water × rounds 清空 |

## 收口结论

### P01 数据基线

- We 分析截止 `2026-07-15`，931/931 个 datacube 读取任务成功；没有远端写入，token 未落盘。
- 最近 90 日：UV person-days 2689、PV 46450、新用户占比 60.0%；D1/W1/W4 新用户留存 8.5%/11.8%/6.4%。
- 180 日 180/180 请求成功，但早期 27 日为空响应，明确标记 unavailable，不作为 0 或均值分母。
- 数据库证据是稳定客户端可见快照，不冒充管理员全量；身份 token、凭据、地理画像、query/hash 路由和小样本 bucket 均未进入 tracked evidence。

### P02 排阵覆盖

- P80 证据守恒：438 场 = 424 场 `multi_rotate` + 3 场 mode-specific + 11 场 unclassified。
- 424 场 `multi_rotate` 中 406 场已命中当前模板前缀，18 场超过现有 horizon，覆盖率 95.7547%；缺失模板键为 0。
- 7 个 horizon 审计候选中，仅 `13p-2c@30m` 不满足 `(4 × totalMatches) % playersCount == 0` 的等场必要条件；其余 6 项仍需逐项产品与公平性审批。
- 旧 tracked 明细 3,244,021 bytes 压缩为 111,641 bytes；完整 3,329,094 bytes 产物位于 ignored `tmp/`。验收依赖稳定不变量哈希 `3750dd17…`，不把含墙钟噪声的单次 byte hash 冒充跨运行确定性。
- 未修改生产模板、排阵算法、fallback 或阈值。

### P05 clone 契约

- `rotation_6/7/8` 复制为 canonical `presetKey` 并重新推导 `playerLimit`。
- custom、缺失或未知 preset 统一降级为 `custom` 且不复制污染的 `playerLimit`；非 `multi_rotate` 不携带 rotation 字段。
- 权限、幂等、返回结构、`rules/courts/totalMatches` 保持兼容；`rounds/rankings/scheduler` 继续清空。

### P04 事件管道

- 客户端固定 `enabled:false`；服务端只在 `PRODUCT_EVENTS_ENABLED === 'true'` 时写入，关闭判断位于数据库操作前。
- 当前仅允许本地集成，禁止部署启用、建真实集合或真实写入。
- 启用前必须处理：32-bit FNV `t` 可碰撞/可猜、持久 install ID 可跨会话关联、服务端缺少调用者绑定和限流、集合权限、保留/删除、容量告警与成本熔断。

### P03 打水 MVP

- 9 项用户可见审批矩阵已全部批准；仅 `multi_rotate`，默认关闭，单局输方每人 0/1/2 瓶。
- 比分与 `match.water` 使用同一 optimistic version 写入；覆盖重试、修改、锁、版本冲突、弱网恢复和旧客户端省略字段。
- 水榜仅从 rounds 派生，不参与正式排名；clone 保留规则但清空 rounds，reset 清空历史账目。
- P05 与 P03 唯一冲突位于 `tests/cloneTournament.index.test.js`。人工保留三组 preset 测试和 water 测试，并新增两项功能同时存在的组合用例；未使用整文件 ours/theirs。

## 主集成树阶段验证

- P06/P07 合入后 `npm run verify:light`：80 pass、6 skip、0 fail。
- P01 聚焦：59/59。
- P02 紧凑证据测试：19 pass、1 skip、0 fail；ignored full artifact 在原 worktree 已复验。
- P05 clone/readiness/start：64/64。
- P04 事件管道与云契约：46/46。
- P03 + P05 跨域聚焦：148/148。
- `git diff --check`：阶段检查均通过。
- 云契约审计：`cloneTournament` 54/54、`updateSettings` 52/52、`submitScore` 72/72；审计快捷脚本尚未登记新目标 `reportProductEvents`，因此使用其专属事件/通用云契约套件 46/46 覆盖。
- 最终 `npm run verify:full`：1310 pass、7 skip、0 fail；deprecated API 检查通过；cloud-common 为 9 templates / 23 functions；lint 0 error、64 条既有 warning；`git diff --check` 通过。

## 主集成树真实截图

- DevTools：`2.01.2510290`，SDK `3.14.2`；真实 `Tool.getInfo` / `App.getCurrentPage` 探测通过。
- `settingsWater.png`：717×1384，159583 bytes，SHA-256 `09e4fcfb4f57fa02219f35a7f421125a39a77e57467bf0cd6ae925d6363db7c4`。
- `matchWater.png`：717×1384，181088 bytes，SHA-256 `171cfc43865fe02a0efb4e9b55ab77e605c911d67e8fb61bb14e0842d91031d6`。
- `analytics.png`：717×1384，264860 bytes，SHA-256 `ea9673bc068a6873baaec6093ccbff08db072725561a572a3ac95ca83dc03a59`。
- 三个 case 均 `allOk:true`、原子 promoted、首轮成功；视觉区域非空、探针发生变化、恢复帧连续稳定，deprecated file API warning 0、fake fixture sync error 0。
- 逐图肉眼复核：无裁切、遮挡或横向溢出；打水开关、每局 0/1/2 选择、独立打水榜和“不影响正式排名”边界清晰。
- subset runner 按设计只对 smoke/full 写全局 workflow record；本次 subset 结果由本日志、PNG 路径/尺寸/哈希和控制台成功契约共同锚定。
- 未做实体手机、真实云数据库或已部署云函数 smoke。

## 未部署边界

本轮源码变更未来可能需要部署的云函数，仅记录、不执行：

- `cloneTournament`
- `reportProductEvents`
- `updateSettings`
- `submitScore`

其中 `reportProductEvents` 在安全加固与关闭态零写入验证前为 NO-GO；P04 客户端开关也不得启用。任何 preview/upload 还会同时带入尚未上线的 schedule 中央比分和 P03 打水 UI，必须先单独审阅发布包。
