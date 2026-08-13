# 多人协作打水账本 V2 完整方案

> 日期：2026-08-08
>
> 状态：产品、客户端、页面、兼容云函数、迁移库和本地测试已在独立开发树实现；390px 当前源码真实 DevTools 验收完成，320/430 实图或明确例外、云端前置、真实迁移、canary、上传和发布仍待执行
>
> 线上已实现版本：6.1.2-911a9c7 / V1（单一发起人写入、单文档账本）；V2 已形成本地提交候选，但尚未 push、部署或上传
>
> 目标版本：稳定共享房间 + 多轮账本 + 可追溯多人流水
>
> 本文只确定产品、交互、权限、云合同、迁移和验收边界，不授权云部署、小程序上传、正式发布或真实数据写入。

## 1. 决策摘要

独立打水从“发起人的单次账本”重构为“固定共享打水房”。同一个邀请链接长期指向同一个房间；房间内每次重新开始会生成独立轮次；所有记一局、单独记水、修改和撤销都形成可追溯记录。

V2 的核心原则：

1. 已加入成员都可以记一局和单独记水，不再只有发起人能写。
2. 成员只能修改或撤销自己创建的记录；发起人可以处理当前轮全部记录。
3. 总账是流水计算结果，任何人都不能直接覆盖某人的总数。
4. 修改不覆盖历史，撤销不删除历史；每次更正都保留操作者、时间和前后版本。
5. 当前轮可持续使用；发起人通过“新一轮”归档旧轮并从 0 开始，不提供“结束”选项。
6. 旧邀请链接继续有效，原有名单、认领身份和历史数据不丢失。
7. 页面以“总账 / 流水 / 球友”组织信息，底部固定“记一局 / 单独记水”，避免长名单把主要操作推到屏幕外。

## 2. 背景与现状问题

当前版本已经支持：

- 不创建比赛直接开始打水；
- 手动添加、导入接龙、邀请和认领名字；
- 1v1 起的等人数记一局；
- 对球友直接加减 1–99 水，原生滚轮默认 1；
- 24 人名单搜索；
- 下拉刷新、8 秒轮询、版本冲突和重复请求保护。

当前模型同时存在以下限制：

- 除加入外，所有名单和记账操作均为发起人专属；
- 页面只显示最近 4 条记录，成员不能查看完整过程；
- “撤销上一条”在多人同时写入后会变得含糊并可能误伤他人的操作；
- 所有 entries 放在一个 waterSessions 文档，达到 200 条后无法继续；
- 同一发起人永久复用一个稳定账本 ID，没有真正的新一轮和历史轮次；
- 直接清空原文档会导致历史不可恢复、旧邀请链接语义漂移和多人并发覆盖。

因此，本次不采用“把现有加减按钮对成员放开”的局部方案，而是重构账本生命周期和写入模型。

## 3. 产品目标

### 3.1 核心目标

- 群内任何已加入成员都能快速记录，不需要把手机交给发起人。
- 每条账都有明确来源，出现争议时能看见“谁、何时、记了什么、后来如何更正”。
- 记录一局和单独记水都保持少步骤、单手可完成。
- 4 人与 24 人、0 条与长流水时都能稳定使用。
- 新一轮不破坏旧记录，不改变分享入口，不依赖比赛模块。

### 3.2 成功标准

- 成员加入后，底部立即出现“记一局”和“单独记水”。
- 两个成员同时提交不同记录时，两条都成功，不要求其中一人手动刷新重试。
- 总账始终满足所有人的净水合计为 0。
- 流水能分页查看全部记录，并按“全部 / 对局 / 单独”筛选。
- 任一记录都显示类型、内容、记录人、时间和更正状态。
- 成员能修改或撤销自己的记录，不能处理别人记录；发起人能处理全部当前轮记录。
- 新一轮后总账归零，旧轮只读可查，名单、加入身份和邀请链接继续有效。
- 原 room ID 和旧分享路径不变。

## 4. 明确不做

- 不把独立打水接入 tournament、赛程、排名、复盘或云端比赛写入。
- 不允许直接输入或覆盖某人的净水总数。
- 不提供物理删除流水、删除旧轮或清空历史。
- 不提供用户可见的“结束 / 完成”操作。
- 不新增管理员、裁判、审核员等复杂角色。
- 不要求 4 人才能开始，也不要求名单中所有人参加一局。
- 不允许未加入访客写入。
- 不在本轮重做 launch、Home、全局设计系统或其他页面。
- 不引入 WebSocket、跨页面实时平台或未验证的全局同步框架。
- 不因本文自动执行云部署、上传、预览二维码、正式发布或真实数据迁移。

## 5. 术语与不可变规则

### 5.1 术语

| 术语 | 含义 |
|---|---|
| 打水房 room | 稳定共享空间，拥有固定 roomId 和长期有效的邀请链接 |
| 轮次 round | 房间中的一轮独立账本；同一时间只能有一个 active 轮次 |
| 球友 participant | 总账中的姓名槽位，可由发起人预添加，也可由用户加入后创建 |
| 成员 actor | 已用 OpenID 绑定某个球友身份、具备写入权限的用户 |
| 记录 entry | 用户看到的一笔“对局”或“单独”账目 |
| 修订 event | 创建、修改或撤销记录产生的不可丢失审计事件 |

### 5.2 账务规则

- 净水 = 赢水 − 请水。
- 每一笔有效记录产生的全部净水变化之和必须为 0。
- 对局记录中胜方与负方人数相同，至少各 1 人；支持 1v1、2v2 和等人数多人对阵。
- 对局每人水数为 1–99，默认 1。
- 单独记录必须有不同的请水方和赢水方，水数为 1–99，默认 1。
- 已撤销记录不再影响总账，但原记录和撤销信息仍可查看。
- 已修改记录只按最新有效版本计算，历史版本保留在详情中。
- 已归档轮次只读，不能新增、修改或撤销。

### 5.3 身份规则

- 发起人自动成为第一个已加入成员。
- 预添加名字是未认领球友，不自动获得写权限。
- 用户可认领一个未绑定名字，或使用自己的昵称新增球友。
- 同一 OpenID 在同一房间只能绑定一个球友。
- 同一球友同时只能绑定一个 OpenID。
- 新增 participant 的本局显示名按 trim + 大小写不敏感保持唯一；同名已认领时必须先提供不同的本局称呼。
- 房间最多 24 个球友；新轮不重复占用名额。
- 权限始终按 OpenID 对应的 actor 判断，昵称和头像只用于展示。

## 6. 角色与权限

| 操作 | 未加入访客 | 已加入成员 | 发起人 |
|---|---:|---:|---:|
| 通过邀请链接查看当前轮总账 | 是 | 是 | 是 |
| 查看当前轮完整流水 | 是 | 是 | 是 |
| 加入或认领名字 | 是 | 已加入 | 已加入 |
| 记一局 | 否 | 是 | 是 |
| 单独记水 | 否 | 是 | 是 |
| 修改或撤销自己创建的记录 | 否 | 是 | 是 |
| 修改或撤销其他人的记录 | 否 | 否 | 是 |
| 分享邀请链接 | 否 | 是 | 是 |
| 查看本人身份参与过的往期轮次 | 否 | 是 | 是 |
| 手动添加球友 | 否 | 否 | 是 |
| 导入接龙 | 否 | 否 | 是 |
| 开始新一轮 | 否 | 否 | 是 |

补充约束：

- 成员可以为名单中的任意球友记账，不强制记录必须包含本人，满足现实中一人代全场记账的需求。
- 成员写入时必须在记录中保存其 actor 快照；不能使用前端传入的“记录人姓名”作为权限依据。
- 访客知道不可枚举的 roomId 后可查看当前轮，这是对现有分享链接能力的兼容。
- 发起人可查看房间全部往期；普通成员只能查看自己的 participantId 出现在轮次快照中的往期。认领旧 participantId 可继承该身份的往期；使用新昵称新增身份时，只能查看加入当轮及以后。
- 发起人的名单管理权限不因新轮而改变。

## 7. 页面信息架构

### 7.1 单页骨架

~~~text
8月8日打水局 · 第3轮                    往期 >
4 位球友 · 12 笔账 · 16 条流水

总账                 流水                 球友
────────────────────────────────────────────
当前标签内容

┌──────────────────┬───────────────────────┐
│      记一局       │      单独记水         │
└──────────────────┴───────────────────────┘
~~~

### 7.2 固定区域

- 顶部显示当前轮标题、轮次、球友数、recordCount“笔账”和 eventCount“条流水”。没有更正/撤销时两者相同；不能用一个含糊的“记录数”同时表示两种数量。
- 不再显示“平衡 0”或“总账差 0”；该值是内部守恒校验，不是用户任务。
- “往期”是低频入口，进入轮次列表；发起人的“新一轮”放在往期页中，避免误触。
- 页面底部固定两个同级主要操作：“记一局”和“单独记水”。
- 固定操作栏必须计算 safe-area，并给滚动内容保留等高底部空间。
- 未加入访客的固定栏替换为“加入后一起记水”，不能显示可点击但必然失败的写入按钮。

### 7.3 三个工作区

#### 总账

- 显示姓名、赢水、请水和净水。
- 排序继续使用：净水降序、赢水降序、姓名升序。
- 每行保留已批准的直接加减快捷入口：
  - “＋”预选该球友为赢水方；
  - “−”预选该球友为请水方；
  - 点击后进入同一个“单独记水”弹层，而不是直接改总数。
- 快捷入口只对已加入成员显示；访客看到只读总账。
- 总账行主体保持只读，只展示姓名和当前净水数；仅行内“＋ / −”是操作入口，避免整行点击与快捷按钮争抢触发范围。

#### 流水

- 默认显示“全部”，可切换“对局 / 单独”。
- 初次加载 20 条，按新到旧排列；滚动到底加载下一页。
- 不再使用“最近 4 条”作为完整记录入口。
- 每条至少显示：
  - 类型：对局或单独；
  - 完整描述；
  - 记录人；
  - 本地时间；
  - 已更正或已撤销状态。
- 更正和撤销本身也出现在流水中，例如“Chris 将 1 水更正为 2 水”“阿杰撤销了这条单记”；原记录仍停留在原时间位置并标记状态。
- 自己创建的有效记录显示“修改 / 撤销”；发起人对全部有效记录显示；其他成员只读。
- 已撤销记录保留在原时间位置并降低强调，不从列表消失。

#### 球友

- 显示当前 24 人以内的名单、是否已加入、本人标识。
- 名单超过 8 人时显示本地姓名搜索和明显的清除按钮。
- 发起人可使用“添加球友”，弹层内继续提供“手动添加 / 导入接龙”。
- 已加入成员和发起人都可以使用唯一一个显式“邀请加入”入口。
- 页面不得在顶部和球友区重复摆放两个同名邀请按钮。

## 8. 核心用户流程

### 8.1 发起或继续房间

1. 用户从 launch 的“快速打水”进入。
2. 继续沿用完整资料门禁。
3. 若该 OpenID 已有稳定房间，打开房间当前轮。
4. 若没有，创建 room、owner member 绑定和第 1 轮。
5. 创建或继续的结果应用到页面，不跳转到比赛流程。

房间是长期稳定入口；新轮不会创建新的分享路径。

### 8.2 访客通过邀请链接加入

1. 打开 /pages/water/index?id=<roomId>。
2. 可先查看当前轮总账和流水。
3. 点击“加入后一起记水”。
4. 通过资料门禁后选择：
   - 使用自己的昵称加入；
   - 认领一个尚未绑定的预添加名字。
5. 若资料昵称与唯一一个未认领名字准确匹配，界面优先推荐认领，避免重复身份，但仍由用户确认。
6. 名单已满 24 人时，仍允许认领现有未绑定名字；只禁止新建第 25 个名字。
7. 若资料昵称与一个已认领球友同名，不能静默生成两个无法区分的身份；加入弹层要求用户填写一个不同的“本局称呼”后才能新增。
8. 加入成功后页面原地切换为成员状态，底部出现两个记水操作。

并发认领同一名字时，只允许第一个事务成功；后到用户刷新名单后重新选择。

### 8.3 记一局

1. 点击固定栏“记一局”。
2. 打开底部弹层，默认激活“选胜方”。
3. 选择至少 1 位胜方，再切换“选负方”；同一人不能同时属于两方。
4. 双方人数必须相同，不要求正好 4 人。
5. 名单超过 8 人时可搜索；搜索、清空搜索和后台同步不得清除仍有效的选择。
6. 使用微信原生 selector 选择“每人水数”，范围 1–99，默认 1。
7. 提交前显示确定性预览，例如：
   - 阿杰、王姐 胜 Chris、陈哥 · 每人 2 水
8. 点击“确认记一局”。
9. 成功后关闭原弹层、立即更新总账，切换到“流水”并高亮新记录。
10. 页面短时提供“已记入流水 · 撤销”，该撤销只针对本次刚提交记录。

### 8.4 单独记水

有两个入口，最终进入同一个弹层：

- 固定栏“单独记水”：依次选择请水方、赢水方和水数；默认不替用户预选两个人，防止误记。
- 总账行快捷“＋ / −”：预选目标球友和方向，再选择另一方和水数。

弹层必须用自然语言显示最终含义：

~~~text
阿杰 请 王姐
水的数量：1 水
~~~

水数继续使用微信原生 selector，1–99，默认 1。确认后生成“单独”流水，不直接改任何球友总数。

### 8.5 查看记录

- 流水页支持完整分页和类型筛选。
- 点击一条记录在 water 页内打开底部详情弹层，显示创建人、创建时间、当前有效版本和完整修订历史；本期不新增页面 route。
- 本期不新增“按球友查看全部历史”的第二套分页入口；总账行主体保持只读信息，行内“＋ / −”只负责快捷单记。
- 记录描述使用记录创建时的姓名快照，后续昵称变化不能让历史语义漂移。

### 8.6 修改记录

可修改范围：

- 普通成员：自己在当前轮创建、尚未撤销的记录。
- 发起人：当前轮任意尚未撤销的记录。
- 已归档轮次：任何人都不能修改。

修改规则：

- 对局可修改胜方、负方和每人水数，但仍需满足等人数与不重叠。
- 单独记录可修改请水方、赢水方和水数。
- 不允许直接把“对局”改成“单独”，或反向转换；需要先撤销再新增另一类型。
- 保存修改后，原记录保留原内容与原时间并标记“已更正”；新的更正事件按新 seq 出现在流水顶部。详情明确展示当前有效版本及每次修改人、时间。
- 多人同时修改同一条时，以当前 active entryId 作为记录级前置条件；后提交者发现目标已不是 active 后看到最新版本并重新确认，不静默覆盖。

### 8.7 撤销记录

- 删除多人环境中含糊的“撤销上一条”。
- 用户从具体记录或刚提交后的短时反馈执行“撤销”。
- “已记入流水 · 撤销”显示 6 秒，绑定云端返回的 rootEntryId 和当前 expectedEntryId。连续成功提交时，新反馈替换旧反馈，不再保留多个悬浮撤销入口。
- 轮次切换、目标已被更正/撤销、用户失去权限或页面卸载时，该短时入口立即失效。
- 点击短时“撤销”仍打开包含具体记录描述的确认层，不能无确认删除。
- 撤销前确认内容必须包含具体记录描述，不能只问“确定撤销吗”。
- 撤销后记录仍留在流水并标记“已撤销”，其账务影响被反向冲销。
- 已撤销记录不能再次修改；需要重记时新增一条。

### 8.8 添加和邀请球友

- 手动添加、接龙解析、去重、20 字姓名上限和 24 人上限保持现行合同。
- 接龙写入前继续显示识别数、重复数、超额数、预览名和实际新增数。
- 发起人管理名单；普通成员不能增加占位名字，但可分享邀请链接让对方自行加入。
- V2 首期不新增删除球友、改名或转移发起人。

### 8.9 新一轮与往期

1. 已加入成员点击“往期”可查看按轮次倒序排列的列表。
2. 发起人在往期页看到“新一轮”。
3. 当前轮 recordCount 为 0 时不生成空往期，“新一轮”禁用并说明“本轮还没有记录”。曾记录后又全部撤销时 recordCount 仍大于 0，可以归档这段历史。
4. 点击后显示确认：

~~~text
开始新一轮？
当前 12 笔账（共 16 条流水）会归档，球友和加入状态会保留，新一轮从 0 开始。

取消                         开始新一轮
~~~

5. 确认后同一事务完成：
   - 当前轮改为 archived；
   - 创建下一轮，账目归零；
   - room.activeRoundId 指向新轮；
   - 保留现有球友和 actor 绑定；
   - 建立 previousRoundId / nextRoundId。
6. 当前页面切换到新轮；旧轮从往期进入，只读展示。

全程不出现“结束 / 完成”，也不清空或覆盖旧轮。

标题与往期信息固定为：

- room 没有另一个会与日期冲突的用户可见标题；分享入口长期只依赖稳定 roomId。
- 每轮标题按服务端 Asia/Shanghai 的创建日期生成“M月D日打水局”，页面同时显示“第 N 轮”；同一天多轮依靠轮次号区分。
- 往期每行至少显示：第 N 轮、开始日期时间、recordCount 笔账、球友数和“已归档”。
- 无往期时显示“还没有往期记录”；加载失败保留已显示轮次，并在列表尾部提供“重试”。

## 9. 页面状态与异常处理

### 9.1 基础状态

| 状态 | 页面行为 |
|---|---|
| 首次加载 | 保留页面骨架，显示简洁加载占位，不闪现错误页 |
| 空房间 | 发起人已在名单；总账提示添加或邀请球友，写入前不显示无效的直接记水 |
| 只有 1 人 | 两个主 CTA 保持位置但禁用，隐藏行内＋/−；显示“再添加或邀请 1 位球友，就能开始记水” |
| 未加入访客 | 当前轮只读；固定栏显示“加入后一起记水” |
| 已加入成员 | 可写入、可修改自己的记录 |
| 发起人 | 在成员能力上增加名单管理、处理全部记录和新一轮 |
| 归档轮次 | 全部只读；底部写入栏隐藏，显示“本轮已归档” |
| 24 人且有待认领名字 | 加入弹层只显示可认领名字，隐藏“使用我的昵称加入”；添加/接龙禁用，邀请仍可用于认领 |
| 24 人且全部已认领 | 加入 CTA 替换为只读状态“球友已满 24 人，暂时无法加入”；添加/接龙和邀请加入均禁用 |
| 长流水 | 每页 20 条，游标分页，不把全部记录塞进 Page.data |
| 无效 roomId | 显示“打水房不存在或链接不完整”和“返回发起页”，不得自动创建新房间 |
| 首次网络加载失败 | 显示明确原因和“重试”，不渲染伪总账 |
| 资料门禁取消/登录失败 | 保持来源路径；取消不写入，登录失败提供重试 |
| activeRound 缺失 | 不自动猜测轮次；返回可诊断错误。只有发起人通过 create 或受控修复建立新轮 |
| V2 capability 不可用 | 使用服务端返回能力进入明确兼容/只读状态，不显示必然失败的 CTA |
| 流水为空 | “还没有记录，记一局或单独记水后会显示在这里” |
| 当前筛选无结果 | “没有这类流水”，保留筛选切换 |
| 加载更多中/失败/完成 | 尾部显示加载状态；失败只在尾部提供“重试”且不清空已有内容；完成显示“已加载全部” |
| 往期为空/失败 | 空态“还没有往期记录”；失败保留已有列表并在尾部重试 |

### 9.2 同步状态

- 自己的写入以云端成功响应立即应用，不等待下一轮刷新。
- 页面回到前台时立即拉取当前 room、round revision 和新增流水。
- 自己写入或发现远端变化后，3 秒增量轮询最多持续 5 次；随后恢复 8 秒常规间隔。连续失败按 8 / 16 / 30 秒退避，成功后恢复。
- 隐藏或卸载时停止轮询。
- 旧响应晚于新响应到达时必须丢弃。
- 列表分页请求按 roundId、filter 和 cursor 隔离，切换轮次或筛选后不得把旧结果拼入新列表。
- 用户停留在较旧流水位置时，新记录到达不得强制跳回顶部；显示“有 N 条新记录”，由用户主动回到最新位置。
- 弱网时保留最近成功数据，并显示“连接不稳定，正在重试”；不得把缓存误标为最新。
- 增量同步使用 roomId + activeRoundId + syncVersion + seq。检测到 seq 断档时放弃局部拼接并完整刷新当前轮。
- V2 首期不依赖直连数据库 watch 或 WebSocket；如后续采用，必须先证明权限规则不会扩大房间可枚举性，并保留轮询降级。

### 9.3 冲突与失败

| 场景 | 用户反馈 |
|---|---|
| 同名额被别人先认领 | “这个名字刚刚被认领，请选择其他名字”并刷新名单 |
| 修改记录版本已变化 | “这条记录已被更新，请确认最新内容”并展示最新版本 |
| 当前轮刚被切换 | “已开始新一轮，刚才的操作未写入”并切到当前轮 |
| 自己的写请求结果不明确 | 使用同一 clientRequestId 自动重试，不生成重复记录 |
| 已撤销记录再次处理 | “这条记录已经撤销” |
| 已归档轮次尝试写入 | “本轮已归档，请回到当前轮记水” |
| 离线提交 | 不做本地伪成功；保留草稿并提示恢复网络后重试 |

## 10. 文案合同

### 10.1 固定导航与 CTA

| 用途 | 文案 |
|---|---|
| 页面标题 | 快速打水 |
| 主标签 | 总账 / 流水 / 球友 |
| 主操作 | 记一局 / 单独记水 |
| 加入操作 | 加入后一起记水 / 确认加入 |
| 历史入口 | 往期 |
| 新轮操作 | 新一轮 / 开始新一轮 |
| 流水筛选 | 全部 / 对局 / 单独 |
| 记录操作 | 修改 / 撤销 |
| 状态 | 已更正 / 已撤销 / 本轮已归档 |

### 10.2 禁止使用

- 不使用“改余额”“清空总账”“删除历史”等会误导数据语义的文案。
- 不显示“平衡 0”“总账差 0”作为产品指标。
- 不显示“结束打水”“完成本局”。
- 不把“记一局”和“单独记水”混成含义不明的“记账”单按钮。
- 不用“提交”代替具体动作；确认按钮应与动作一致。

## 11. 视觉与原生实现约束

本页的单一任务是：在球场边用最少注意力完成一笔可信记录。设计必须服务快速识别、多人协作和账目可追溯，不做无功能装饰。

### 11.1 必须保留

- 页面整体仍是原生 WXML / WXSS / JS。
- 微信系统字体与原生 selector。
- 所有主要触点至少 44px。
- 320 / 390 / 430 宽度无横向溢出。
- safe-area、长名字截断、数字等宽显示、reduced motion。
- 当前 Vant 依赖只使用已审查的必要组件，不引入整套新组件库。

### 11.2 必须避免

- 不使用装饰性球场线、莫名背景图或无意义几何纹样。
- 不堆叠大量独立白卡、胶囊和浮层制造层次。
- 不把所有内容做成同一种扁平矩形。
- 不重复邀请入口。
- 不用阴影掩盖对齐、间距和信息层级问题。
- 不复用已被否决的暖米色酸绿、暗底荧光绿或报纸规则线方向。

### 11.3 无障碍与可读性

- 正文验收最低 28rpx，辅助信息最低 24rpx，并验证系统字体放大；不得原样保留当前 18–23rpx 的关键说明。
- 正文对比度目标不低于 4.5:1；大字和必要控件边界不低于 3:1。
- “＋ / −”必须有完整 aria-label，例如“给阿杰记赢水”“记录阿杰请水”，不能只让读屏读出符号。
- tabs、筛选、搜索清除、总账行“＋ / −”、记录修改/撤销和全部图标按钮都必须使用语义按钮并提供完整 accessible name；tabs 还必须暴露选中状态。
- 胜负、赢请、正负不能只依赖红绿；必须同时有文字或符号。
- 流水类型使用“对局 / 单记”，不只显示“局 / 单”。
- 标签必须传达当前选中状态，不能只靠颜色。
- 弹层内容过长时内部滚动，顶部摘要和底部确认保持可见；键盘与 safe-area 不得遮挡输入或提交。
- 关键成功和失败不能只依赖瞬时 toast，页面内必须留下可见反馈。

### 11.4 待浏览器方案选择的视觉轴

行为合同确定后，先制作三套高质量浏览器近似稿，只比较视觉与排布，不改变本文流程：

1. 总账优先：打开即突出球友净水与快捷单记。
2. 流水优先：打开即突出最新协作记录和记录人。
3. 操作优先：主操作与当前轮状态最醒目，总账和流水次级展开。

每套都必须使用真实中文名字、24 人、长流水和已更正记录进行压力预览。用户选定后才进入原生实现；浏览器稿不能替代 DevTools 验收。

24 人选择区的额外要求：

- 选择状态独立于搜索结果保存。
- 320 宽可降为三列，390 / 430 根据实图决定三或四列。
- 20 字姓名可视觉截断，但无障碍名称保留全称。
- 最多 12v12 时，双方摘要显示前若干名加“等 N 人”，可展开查看完整名单，不能把确认按钮推离可视区。

## 12. 目标数据模型

### 12.1 总体关系

~~~mermaid
flowchart TD
  R["waterRooms：稳定房间"] --> A["waterRoomMembers：OpenID 与角色"]
  R --> RD["waterRounds：当前轮与往期"]
  RD --> E["waterEntries：不可丢失事件流水"]
  RD --> L["轮次总账聚合"]
~~~

### 12.2 waterRooms

~~~text
waterRooms/{roomId}
  schemaVersion: 2
  ownerParticipantId
  activeRoundId
  lastRoundId
  roundCount
  participants[]:
    id, name, source, claimed, createdAtMs
  roomVersion
  syncVersion
  migrationStatus: staging | active | failed
  createdAt, updatedAt, updatedAtMs
  migration:
    source, sourceVersion, sourceHash, migratedAtMs
~~~

规则：

- roomId 沿用现有稳定 water_<hash>，保证旧链接不变。
- participants 最多 24 个，不保存可返回客户端的 OpenID。
- room 只保存当前名单和 activeRoundId，不保存流水。
- 名单和 active round 变化更新 roomVersion；任何成功写入更新 syncVersion，供客户端判断是否需要增量拉取。
- 记水不要求客户端携带整房间 expectedVersion。

### 12.3 waterRoomMembers

~~~text
waterRoomMembers/{deterministicMemberKey}
  roomId
  participantId
  openid
  role: owner | member
  status: active
  joinedAt, updatedAt
~~~

规则：

- memberKey 由 roomId + OpenID 确定性哈希生成。
- 该集合只供云函数使用，不返回 OpenID，不开放客户端直读写。
- owner 和 member 的写权限从该文档判断，不能从昵称、头像或 claimed 布尔值推断。
- 客户端上传的 createdBy、role 或 memberId 一律忽略；操作者只能由云端 OpenID 重新映射。

### 12.4 waterRounds

~~~text
waterRounds/{roundId}
  roomId
  number
  title
  status: active | archived
  participantIds[]
  participantSnapshot[]:
    id, name
  ledger[]:
    participantId, won, treat, net
  recordCount
  activeRecordCount
  eventCount
  nextSeq
  revision
  previousRoundId, nextRoundId
  createdByParticipantId
  createdAt, createdAtMs
  archivedAt, archivedAtMs
  updatedAt, updatedAtMs
~~~

规则：

- roundId 唯一，不复用旧轮文档。
- 同一 room 同时只能有一个 active round。
- ledger 是固定上限 24 人的服务端读模型，用于快速打开总账。
- recordCount 只在创建 root 业务记录时增加、永不减少；activeRecordCount 表示当前仍生效的 root 记录，创建时 +1、撤销时 -1、更正不变；eventCount 统计创建、更正和撤销事件。
- nextSeq 在事务内单调增加，流水按 seq 倒序分页，避免同毫秒时间戳造成漏项或重复。
- 每次有效创建、修改或撤销都在事务内更新 ledger、eventCount、nextSeq 和 revision；其中只有创建 root 业务记录会增加 recordCount，只有创建或撤销会改变 activeRecordCount。
- active round 内新增球友时，事务同步追加 participantSnapshot 和 0 值 ledger 行；round 归档后 participantSnapshot 永久只读，后续名单变化不重写旧轮姓名。

### 12.5 waterEntries

~~~text
waterEntries/{entryId}
  roomId, roundId, seq
  eventType:
    game_recorded | transfer_recorded |
    entry_corrected | entry_reversed
  category: game | direct
  status: active | corrected | reversed | applied
  payload:
    game: winnerIds[], loserIds[], unitsPerPlayer
    transfer: fromPlayerId, toPlayerId, units
  effectSnapshot[]
  ledgerDelta[]
  actorParticipantId
  actorNameSnapshot
  rootCreatedByParticipantId
  rootEntryId
  targetEntryId
  targetEffectSnapshot[]
  previousEntryId
  successorEntryId
  createdAt, createdAtMs
~~~

规则：

- 每次创建、更正和撤销都新增独立 entry，不物理删除。
- entryId 由 roundId + memberKey + action + clientRequestId 确定性生成。
- effectSnapshot / ledgerDelta 使用 participantId、wonDelta、treatDelta、netDelta 的整数数组；服务端断言 sum(wonDelta) = sum(treatDelta)、sum(netDelta) = 0。
- 原始 game / direct entry 的 payload、effectSnapshot、actor 和时间创建后永久不可改；事务只允许更新 lifecycle status 和 successorEntryId。
- rootCreatedByParticipantId 在整条修订链中保持为最初记录人；普通成员的“自己的记录”按该字段判断。actorParticipantId 表示本次创建、更正或撤销实际由谁执行。
- 更正创建 entry_corrected：
  - targetEntryId 指向当时的 active entry；
  - payload 保存更正后的完整内容；
  - effectSnapshot 保存更正后的完整账务效果；
  - ledgerDelta 等于“新效果 − 旧效果”；
  - 被指向 entry 标为 corrected；
  - correction entry 的 status 为 active；
  - 新 correction entry 成为该 rootEntryId 的 active 版本，仍可再次更正或撤销。
- 撤销创建 entry_reversed：
  - targetEffectSnapshot 保存被撤销的完整有效效果；
  - ledgerDelta 为其相反数；
  - 被指向 entry 标为 reversed；
  - reversal entry 状态为 applied，不提供再次更正。
- 原始 entry 的 rootEntryId 等于自身 entryId，previousEntryId 为空；后续事件继承 rootEntryId，previousEntryId 指向被处理的当前 active entry。
- 记录详情沿 rootEntryId / previousEntryId 展示完整链；列表同时显示原记录的状态和后来发生的更正/撤销事件。
- category 继承原业务类型，使“全部 / 对局 / 单独”能对更正和撤销进行一致分页。

### 12.6 client_request_logs

复用项目共享 common 中的 client_request_logs，不再依赖单个旧账本文档内最近 20 个 requestId：

- 所有 V2 mutation 包括 create 都纳入幂等；scope 固定为 water_v2_<action>。
- 每个 action 的 subjectKey 统一为 room:<roomId>。roundId、rootEntryId、expectedEntryId 和全部业务参数进入 payloadHash，而不是改变 subjectKey，确保同一请求 ID 改目标记录也会被识别为错误复用。
- 同一 operatorOpenId + clientRequestId 的成功重试返回原 resourceId。
- payload 先按 action 的固定字段顺序进行 canonicalization：字符串 trim、数值转整数、ID 数组去重但保留提交顺序、缺省值显式填充，再对 UTF-8 canonical JSON 计算 SHA-256。
- 日志保存 payloadHash、resourceType、resourceId、roundId、responseCode 和 responseState；重试可据此加载资源并重建原成功响应。
- 同 ID 同 payload 返回 deduped，同 ID 不同 payload 返回 CLIENT_REQUEST_ID_REUSED/invalid。
- 不同成员即使产生相同 requestId，也不能互相去重。
- 幂等日志检查必须早于“旧轮已归档”“记录已撤销”等状态检查，确保成功请求重试仍返回 deduped，而不是误报失败。
- 当前共享 helper 不支持 payloadHash 校验。V2 首选在 waterSession 内实现专用 request-log wrapper，继续写 client_request_logs，不修改共享模板；若实施时必须扩展共享 helper，则只改 scripts/cloud-common.template.js 并同步所有派生文件。
- 迁移把 legacy recentRequestIds 保存为独立的 V1 dedupe tombstone。V1 适配器重放命中时返回 deduped 且不创建 entry；tombstone 不冒充带 payloadHash 的 V2 成功日志。
- V1 兼容窗口结束前不清理这些 tombstone。

### 12.7 waterMigrations

~~~text
waterMigrations/{roomId}
  runId
  status: staging | active | failed
  sourceVersion, sourceHash
  targetHash
  participantCount, entryCount
  legacyRecentRequestIds[]
  checkpoint:
    lastLegacyIndex, writtenEntries
  errorCode, errorMessage
  createdAt, updatedAt, activatedAt
~~~

规则：

- 200 条及以上迁移允许分批确定性 upsert，不能假定单事务完成。
- staging / failed 的 waterRooms 和目标文档不能被 V2 正常路由读取或写入。
- checkpoint 只记录进度，不代表迁移成功；重复执行从确定性 ID 安全续跑。
- 最终激活事务重新读取 V1 sourceVersion/sourceHash，核验 targetHash、人数、recordCount 和总账后，一次写入 room.migrationStatus: active、activeRoundId / lastRoundId 和 migration.status: active。
- 源在迁移期间变化时不得激活，标记 failed 或回到 staging 重新计算；原 waterSessions 保持权威。

### 12.8 索引

实施前建立并验证最小索引：

- waterRounds：roomId + number 降序。
- waterEntries：roomId + roundId + seq 降序。
- waterEntries：roundId + category + seq 降序。
- waterEntries：rootEntryId + seq 升序。

所有业务读写通过 waterSession 云函数；新集合默认不开放客户端直接写入。

V2 不再设置用户可见的 200 条硬上限。长流水由服务端聚合、seq 游标、分页和监控承载，不把全量 entry 返回 Page.data。

listRounds 的成员分页不依赖未验证的对象数组索引：round 同时保存 participantIds[]。服务端按 roomId + number 倒序分批扫描，过滤 participantIds 是否包含 viewerParticipantId，直到凑满一页或扫描结束；next cursor 使用“最后扫描的 number”，不能使用“最后返回的 number”，确保晚加入成员也不会重页或漏页。发起人无需过滤。

## 13. 云函数 V2 合同

### 13.1 版本与兼容

- 云函数名继续使用 waterSession，避免新增一套部署入口。
- V2 客户端所有请求带 apiVersion: 2。
- create 和 get 沿用现有 action 名；未带 apiVersion 的旧请求继续走 V1 兼容适配器。
- V2 recordDirect 只接受明确 fromPlayerId / toPlayerId；V1 adapter 继续接受 playerId / counterpartyId / direction 并确定性转换。
- 迁移完成后，V1 action 也必须路由到 V2 单一数据源并返回旧 session 形状，不能继续写旧数组造成双源分叉。
- V2 客户端先做 capability negotiation；云端尚不支持 V2 时只能回退到兼容只读或旧能力，不能盲目发送成员写入。

### 13.2 V2 action

| action | 类型 | 权限 | 说明 |
|---|---|---|---|
| create | 写/读 | 登录用户 | apiVersion: 2；创建或继续自己的稳定房间并返回当前轮 |
| get | 读 | 知道 roomId 的登录用户 | apiVersion: 2；返回房间、当前轮、viewer 和首屏流水 |
| getMineActive | 读 | 登录用户 | 仅保留旧客户端兼容，不作为 V2 页面主入口 |
| listEntries | 读 | 当前轮访客；往期成员 | beforeSeq 向旧分页，afterSeq 拉取新事件，均绑定 category |
| getEntry | 读 | 当前轮访客；往期成员 | 返回 rootEntryId 对应的当前有效版本和完整修订链 |
| listRounds | 读 | 已加入成员 | 发起人看全部；成员只返回 participantId 参与过的往期 |
| getRound | 读 | 该轮有访问权的成员 | 返回指定轮只读快照 |
| join | 写 | 未加入登录用户 | nickname、claimParticipantId、expectedRoomVersion |
| addParticipants | 写 | 发起人 | names、expectedRoomVersion；手动或接龙增加占位球友 |
| recordGame | 写 | 已加入成员 | roomId、roundId、winnerIds、loserIds、unitsPerPlayer |
| recordDirect | 写 | 已加入成员 | roomId、roundId、fromPlayerId、toPlayerId、units |
| correctEntry | 写 | root 创建者或发起人 | roomId、roundId、rootEntryId、expectedEntryId、replacement |
| reverseEntry | 写 | root 创建者或发起人 | roomId、roundId、rootEntryId、expectedEntryId |
| createRound | 写 | 发起人 | roomId、expectedActiveRoundId、expectedRoomVersion |

### 13.3 标准结果

所有结果继续满足 miniprogram/core/cloud.js 的标准结构：

~~~text
{
  ok,
  code,
  message,
  state,
  traceId,
  data
}
~~~

data 按 action 返回 room、round、entry、entries、page、viewer 或 resourceId；禁止把字段无评审地从 data 移到根级。

任何响应都不得包含 OpenID、内部 waterRoomMembers 文档 ID、clientRequestId 日志或迁移校验明细。流水只返回 actorParticipantId 和 actorNameSnapshot。

成功合同正式锁定为：

- WATER_ROOM_CREATED
- WATER_ROOM_READY
- WATER_ROOM_LOADED
- WATER_ROOM_LEGACY_READY
- WATER_ENTRIES_LOADED
- WATER_ENTRY_LOADED
- WATER_ROUNDS_LOADED
- WATER_ROUND_LOADED
- WATER_MEMBER_JOINED
- WATER_PARTICIPANTS_ADDED
- WATER_ENTRY_CREATED
- WATER_ENTRY_CORRECTED
- WATER_ENTRY_REVERSED
- WATER_ROUND_STARTED
- WATER_WRITE_DEDUPED

| action / 结果 | code / state | data 必须字段 |
|---|---|---|
| create 新房 | WATER_ROOM_CREATED / created | room, round, viewer, entries, page, capabilities |
| create 继续 | WATER_ROOM_READY / loaded | room, round, viewer, entries, page, capabilities |
| create/get legacy | WATER_ROOM_LEGACY_READY / loaded | legacySession, migrationRequired, fallbackMode, capabilities |
| get | WATER_ROOM_LOADED / loaded | room, round, viewer, entries, page, capabilities |
| listEntries | WATER_ENTRIES_LOADED / loaded | entries, page.nextBeforeSeq, page.latestSeq, page.hasMore |
| getEntry | WATER_ENTRY_LOADED / loaded | rootEntryId, currentEntry, history |
| listRounds | WATER_ROUNDS_LOADED / loaded | rounds, page.nextBeforeNumber, page.hasMore |
| getRound | WATER_ROUND_LOADED / loaded | room, round, viewer, entries, page |
| join | WATER_MEMBER_JOINED / updated | room, round, viewer, capabilities |
| addParticipants | WATER_PARTICIPANTS_ADDED / updated | room, round |
| recordGame/recordDirect | WATER_ENTRY_CREATED / created | roomSyncVersion, round, entry |
| correctEntry | WATER_ENTRY_CORRECTED / updated | roomSyncVersion, round, entry, targetEntry |
| reverseEntry | WATER_ENTRY_REVERSED / updated | roomSyncVersion, round, entry, targetEntry |
| createRound | WATER_ROUND_STARTED / created | room, round, archivedRoundId |
| 任意成功重试 | WATER_WRITE_DEDUPED / deduped | deduped: true，并重建原 resource 数据 |

失败 code 正式锁定为：

- PERMISSION_DENIED
- PROFILE_MINIMUM_REQUIRED
- WATER_ROOM_NOT_FOUND
- WATER_ROOM_MIGRATION_REQUIRED
- WATER_ROUND_NOT_FOUND
- WATER_FEATURE_NOT_ENABLED
- WATER_WRITES_DISABLED
- WATER_JOIN_REQUIRED
- WATER_ROOM_FORBIDDEN
- WATER_PARTICIPANT_INVALID
- PLAYER_LIMIT_REACHED
- WATER_ENTRY_INVALID
- WATER_ENTRY_FORBIDDEN
- WATER_ENTRY_ALREADY_REVERSED
- WATER_ENTRY_NOT_ACTIVE
- WATER_ROUND_ARCHIVED
- CLIENT_REQUEST_ID_REQUIRED
- CLIENT_REQUEST_ID_REUSED
- WATER_CLIENT_UPGRADE_REQUIRED
- VERSION_CONFLICT

| 条件 | code / state | message |
|---|---|---|
| 未登录 | PERMISSION_DENIED / forbidden | 登录状态失效 |
| 资料不足 | PROFILE_MINIMUM_REQUIRED / invalid | 请先完善个人资料 |
| room 不存在 | WATER_ROOM_NOT_FOUND / not_found | 打水房不存在 |
| legacy 尚未迁移时调用 V2 mutation | WATER_ROOM_MIGRATION_REQUIRED / conflict | 账本升级尚未完成，请稍后重试 |
| 未加入写入 | WATER_JOIN_REQUIRED / forbidden | 加入后才能一起记水 |
| 需要发起人权限 | WATER_ROOM_FORBIDDEN / forbidden | 只有发起人可以进行此操作 |
| 人员/双方/水数非法 | WATER_PARTICIPANT_INVALID 或 WATER_ENTRY_INVALID / invalid | 返回对应具体原因 |
| 第 25 人 | PLAYER_LIMIT_REACHED / invalid | 这次打水最多 24 人 |
| 处理别人记录 | WATER_ENTRY_FORBIDDEN / forbidden | 只能修改自己记录的内容 |
| target 已被更正 | WATER_ENTRY_NOT_ACTIVE / conflict | 这条记录已更新，请确认最新内容 |
| target 已撤销 | WATER_ENTRY_ALREADY_REVERSED / conflict | 这条记录已经撤销 |
| archived round 写入 | WATER_ROUND_ARCHIVED / finished | 本轮已归档，请回到当前轮记水 |
| activeRound 指针损坏 | WATER_ROUND_NOT_FOUND / not_found | 当前轮不存在，请重试或联系发起人 |
| 缺少 requestId | CLIENT_REQUEST_ID_REQUIRED / invalid | 缺少请求编号 |
| 同 requestId 不同 payload | CLIENT_REQUEST_ID_REUSED / invalid | 请求内容已变化，请重新操作 |
| capability 未开启 | WATER_FEATURE_NOT_ENABLED / forbidden | 此功能暂未开放 |
| emergencyReadOnly | WATER_WRITES_DISABLED / forbidden | 打水账本暂时只读 |
| V1 超出安全投影 | WATER_CLIENT_UPGRADE_REQUIRED / invalid | 当前记录较多，请升级后继续 |
| room/entry 前置版本变化 | VERSION_CONFLICT / conflict | 账本刚刚有更新，请确认后重试 |

state 继续使用项目已识别的 loaded、created、updated、deduped、forbidden、invalid、not_found、conflict、finished、error。对 archived round 的写入返回 WATER_ROUND_ARCHIVED + state: finished；activeRoundId 指向不存在文档时返回 WATER_ROUND_NOT_FOUND/not_found；WATER_ROOM_MIGRATION_REQUIRED 使用 conflict；WATER_FEATURE_NOT_ENABLED / WATER_WRITES_DISABLED 使用 forbidden。客户端展示具体产品文案，不新增含义不明的 state。

所有业务参数错误必须映射到上表中的具体 WATER_* code + invalid，不能再退化为 WATER_SESSION_FAILED/error。V1 兼容 action 的既有 code/state/message 由兼容测试锁定，不因 V2 命名改变。

### 13.4 写入事务

#### 创建房间

create 先做无写入的稳定 room 查找：

1. 已有 active V2 round 时，V2 create 必须先通过 eligible && v2Read；通过后才返回 WATER_ROOM_READY 和 V2 只读投影。该“继续已有房间”分支不写 request log，只绕过 emergencyReadOnly 的写入拦截，不能绕过 read gate。未通过时返回 WATER_FEATURE_NOT_ENABLED/forbidden，不泄露 V2 room 投影；V1 create 仍可按兼容适配器返回 V1 投影。
2. 命中待迁移 V1 数据时返回迁移等待合同，不创建同 ID 的空 V2 room。
3. 只有确实需要创建 room 或 round 时才进入下面的真实事务。

真实事务内：

1. 先检查 create 的 action-scoped request log。
2. 再次检查稳定 roomId、activeRoundId 和待迁移 V1 数据，防止无写入查找后的并发变化；若此时已出现 active round，立即返回 WATER_ROOM_READY，不写 request log。
3. 已有 active V2 room 但 activeRoundId 为空时，仅 owner 可创建下一轮；V2 create 的该分支必须通过 createRoundWrite，不得绕过 canCreateRound。
4. 仅在 V1/V2 都不存在时创建 room、owner waterRoomMember 和第 1 轮。
5. 第 1 轮从 owner participant 建 participantIds、participantSnapshot 和 0 值 ledger。
6. 每轮 title 均由云端按 Asia/Shanghai 创建日期生成，不信任客户端标题。
7. room.migrationStatus 直接为 active，activeRoundId 指向第 1 轮。
8. 仅在本事务真正创建 room 或 round 后写成功 request log。

任一步失败都不允许留下“只有 room、没有 owner member 或 active round”的半成品。若存在 V1 数据，返回迁移等待合同，不得创建同 ID 的空 V2 room。

V1 compatibility create 是明确例外：已有 active round 时仍只读返回既有 session；V1 finish 后 activeRoundId 为空时，owner 可按旧合同创建下一轮，不受 V2 createRoundWrite 控制，但仍受 emergencyReadOnly、owner 权限和 V1 安全投影上限约束。该例外只为旧客户端兼容，不向 V2 页面暴露能力，并由兼容测试单独锁定。

#### 新增记录

同一事务内：

1. 按 action-scoped request log 检查是否已成功。
2. 读取 room、member 和请求指定的 round。
3. 验证成员身份、roundId 等于 room.activeRoundId、轮次状态、参与人和水数。
4. 计算 ledgerDelta，断言净变化合计为 0。
5. 分配 round.nextSeq，并创建 payload、effectSnapshot、ledgerDelta、actor 和 createdAt 不可变的 game_recorded 或 transfer_recorded entry；其 lifecycle status 和 successorEntryId 只允许按更正/撤销规则推进。
6. 更新 round ledger、recordCount +1、activeRecordCount +1、eventCount +1 和 revision。
7. 更新 room.syncVersion。
8. 写成功 request log。

普通新增不使用客户端整轮 expectedVersion；数据库事务负责并发重试，避免两个成员写不同记录时产生无意义冲突。

record 与 createRound 并发时只允许两种完整结果：记录在归档前完整进入旧轮，或因 activeRoundId 已变化而整体失败。绝不能把带旧 roundId 的记录悄悄写入新轮。

#### 修改记录

同一事务内：

1. 先查幂等日志。
2. 读取 member、entry 和 round。
3. 校验 target entry 为当前 active 版本、round.status、操作权限和 expectedEntryId。
4. 计算“新账务效果 − 旧账务效果”的 ledgerDelta。
5. 把 target entry 标为 corrected。
6. 分配新 seq，新增 payload/effect 不可变的 entry_corrected，并链接 rootEntryId / previousEntryId。
7. 更新 round ledger、eventCount +1、revision 和 room.syncVersion；recordCount / activeRecordCount 不变。
8. 写成功 request log。

#### 撤销记录

流程与修改相同，但 ledgerDelta 是当前有效记录效果的相反数；target entry 标为 reversed，新增 entry_reversed，eventCount +1、activeRecordCount -1，recordCount 不变。

#### 名单与认领

- join 和 addParticipants 都在真实事务内校验 expectedRoomVersion、24 人上限和重复身份。
- 认领已有 participant 时，原子创建 waterRoomMember 并把 room.participants 对应项标为 claimed；不新增人数。
- 使用新昵称加入或发起人添加名字时，同时更新 room.participants、active round participantSnapshot 和 0 值 ledger 行。
- 成功名单写入同步增加 roomVersion、syncVersion 和 active round revision，但不增加 recordCount / eventCount。
- 同一 OpenID 并发认领多个名字时，确定性 memberKey 只允许一个绑定成功。
- archived round 的 participantSnapshot 不因当前名单变化而更新。

#### 新一轮

同一事务内：

1. 先按 action scope、subject=`room:<roomId>`、operatorOpenId 和 clientRequestId 查幂等日志，并校验 canonical payload hash。
2. 验证发起人、expectedActiveRoundId 和 expectedRoomVersion。
3. 若旧 round.recordCount 为 0，返回明确 invalid，不创建空往期。
4. 将旧 round 标为 archived。
5. 创建确定性新 round，从最新 room.participants 重建 participantIds、participantSnapshot 和 0 值 ledger，不能复制可能落后的旧 round snapshot。
6. 更新 room.activeRoundId、roundCount、roomVersion 和 syncVersion。
7. 写前后轮链接和成功 request log。

重试必须返回同一个新 roundId。

所有 V2 多文档写入必须使用真实 db.runTransaction。不能在事务能力不可用时退回普通顺序写入，否则 entry 和 round aggregate 可能出现半成功。

### 13.5 Capability、灰度开关与总写入止损

服务端使用只允许云函数读取的私有配置 water_feature_flags/collaborative_v2。客户端参数不能开启任何能力。

最小配置：

~~~text
emergencyReadOnly
v2Read
rosterWrite
ownerWrite
memberWrite
correctWrite
reverseWrite
createRoundWrite
canaryRoomIds[]
canaryOpenids[]
revision
~~~

规则：

- allowlist 命中公式锁定为：canaryRoomIds 和 canaryOpenids 都为空时 eligible=true；任一列表非空时，服务端计算出的稳定 roomId 命中 canaryRoomIds，或当前 OPENID 命中 canaryOpenids，任一成立即 eligible=true，否则 false。新建房间也先根据 OPENID 算出稳定 roomId 后使用同一公式。
- v2Read capability = eligible && v2Read；写 capability = v2Read capability && eligible && 对应写开关 && 角色允许 && !emergencyReadOnly。canManageRoster 对应 rosterWrite，canOwnerWrite 对应 ownerWrite，canMemberWrite 对应 memberWrite，canCorrect / canReverse 还分别要求 correctWrite / reverseWrite 和该角色的基础写能力，canCreateRound 对应 createRoundWrite 且仅 owner 为 true。
- emergencyReadOnly 优先级最高。开启后同时阻断 V1 和 V2 create 中真正创建 room/round 的分支，以及 join、addParticipants、record、undo/correct/reverse、finish、createRound 等全部新 mutation；get 和 create 中“已有 active room，仅返回 READY/投影”的无写入继续分支仍允许。
- 已成功 requestId 的纯读取式 deduped 重放可在 emergencyReadOnly 下返回原结果，因为它不产生新写入；未命中成功日志的请求一律被拦截。
- V2 create 在已有 room 但 activeRoundId 为空时必须验证 canCreateRound；不存在 room 时创建首轮必须验证 eligible、v2Read 和 ownerWrite。V1 compatibility create 的例外按 13.4 的锁定合同执行。
- canary allowlist 只保存在服务端；客户端上传 roomId 之外的“我是 canary”字段一律忽略。
- 配置缺失、格式错误或读取失败时全写入 fail closed：V2 mutation、已迁移房间的 V1 adapter mutation、未迁移 legacy 房间的 V1 mutation，以及 create 中真正创建 room/round 的分支，全部返回 WATER_WRITES_DISABLED 且数据不变。此时 V2 v2Read 视为 false，V2 get/create 不返回 V2 room 投影；V1 get 和 V1 create 的无写入 READY/投影分支仍允许。不得因配置异常默认放开任何旧版或新版写入。
- V2 create/get 返回经服务端计算的 data.capabilities，页面只根据结果渲染，不自行推断权限。
- capability 字段锁定为：v2Read、canManageRoster、canOwnerWrite、canMemberWrite、canCorrect、canReverse、canCreateRound、emergencyReadOnly、revision。
- 关闭某项能力后，新请求立即返回稳定错误；已完成事务不回滚，进行中的事务按服务端最新配置决定是否继续。
- 开关配置本身的读写权限、缺失降级、allowlist 命中和 emergencyReadOnly 必须有自动化测试。

## 14. 客户端状态与分页合同

### 14.1 页面状态

建议拆分为：

~~~text
roomState:
  room, viewer, participants, activeRound

ledgerState:
  rows, roundRevision

feedState:
  filter, items, latestSeq, nextBeforeSeq, loadingMore, exhausted

draftState:
  gameDraft, directDraft, correctionDraft

uiState:
  activeTab, sheets, busyByAction, syncStatus
~~~

禁止继续使用一个全页 busy 阻断所有成员操作。写入 guard 至少按 room + action + draft fingerprint 隔离；同一个草稿防重复提交，不同的只读分页不应被写入 busy 阻塞。

### 14.2 游标

- 首屏流水随 V2 get 返回最多 20 条。
- listEntries 只接受服务端分配的整数 seq：beforeSeq 向旧分页，afterSeq 拉取新增事件；两者不能同时提交。
- 客户端分页状态必须绑定 roomId、roundId 和 category；响应返回 nextBeforeSeq、latestSeq 和 hasMore。
- 不使用 createdAt 作为唯一游标。新记录插入顶部后，已有 beforeSeq 仍稳定；合并结果按 entryId 去重。
- 切换 round 或 filter 时取消旧请求结果应用。

### 14.3 本地草稿

- 网络失败不丢失当前选择和水数。
- 相同草稿重试复用 clientRequestId。
- 任何人员、顺序、水数或动作类型变化都生成新 requestId。
- 成功后清除对应 intent，允许马上重复记录相同对局。
- 关闭并重开相同失败草稿可继续使用同一 requestId，直至内容改变或成功。

## 15. 旧数据与旧客户端迁移

### 15.1 原则

- 不删除、不覆盖 waterSessions 旧文档。
- roomId 原样沿用，旧分享路径不变。
- 迁移必须幂等、可校验、可回滚到 V1 读取适配器。
- 云端兼容能力先部署，V2 客户端后上传。
- 任何真实迁移前先输出只读 dry-run 统计和哈希，并取得明确授权。

### 15.2 映射

| V1 | V2 |
|---|---|
| waterSessions._id | waterRooms._id |
| ownerOpenid | owner waterRoomMember |
| participants[] | room.participants[] + claimed member documents |
| title | 第 1 轮 title |
| status active/finished | round active/archived |
| entries[] | game_recorded / transfer_recorded entries |
| version | migration.sourceVersion |
| recentRequestIds | V1-only dedupe tombstone；不伪造 V2 payloadHash 日志 |

旧记录过去只能由发起人写入，因此迁移后的 createdBy 统一归属 owner，并标记 source: legacy。原 entry.id 和 createdAtMs 尽量保留；缺失 ID 时按 roomId + 原数组下标 + 内容哈希确定性生成。

legacy active 映射为 activeRoundId 指向第 1 轮；legacy finished 映射为 activeRoundId 为空、lastRoundId 指向 archived 第 1 轮。此时分享链接 get 返回 room 和“当前没有进行中的打水”；发起人执行 V2 create 后原子创建第 2 轮，其他访客不能代为创建。

### 15.3 幂等迁移步骤

1. 读取旧文档并生成 sourceHash、人数、记录数和总账哈希。
2. 若存在成功 migration marker，比较 sourceHash；一致则直接返回。
3. 建立可恢复备份，并再次确认迁移期间 sourceVersion / sourceHash 未变化。
4. 创建 waterMigrations staging 记录和 migrationStatus: staging 的 room；V2 路由不得把它当成可用房间。
5. 按 checkpoint 分批确定性 upsert members、第 1 轮和 recorded entries；中断后从已写索引续跑。
6. 重新计算 V2 ledger，校验：
   - 人数一致；
   - 记录数一致；
   - 每人 won / treat / net 一致；
   - 全局 net 合计为 0。
7. 最终激活事务重新读取 V1 sourceVersion/sourceHash；一致时才一次写入 targetHash、migrationStatus: active 和 activeRoundId / lastRoundId。
8. 保留旧文档作为只读备份。

任一校验失败时不得切换数据源。

普通 get 不得在用户无感知时偷偷触发真实迁移写入。迁移通过显式、可审计的工具或受控 canary 执行；每次真实写入都需要单独授权。

若 V2 create/get 命中尚未迁移的 legacy room：

- 不创建同 roomId 的空 V2 room，也不执行隐式迁移。
- 返回 ok: true、WATER_ROOM_LEGACY_READY、state: loaded。
- data 包含脱敏 legacySession、migrationRequired: true、fallbackMode: legacy，以及 v2 全关闭、legacyRead 开启、legacyOwnerWrite 按服务端 owner 判断的 capabilities。
- V2 页面以兼容模式渲染现有总账；发起人可继续走 V1 owner-only action，成员只读并看到“账本正在升级，暂时由发起人记水”。
- 任何 V2 mutation 返回 WATER_ROOM_MIGRATION_REQUIRED/conflict。

正式上传 V2 客户端前，所有计划继续使用的 legacy room 必须完成可校验迁移或明确留在上述兼容范围。

### 15.4 V1 兼容窗口

- V1 create/get/getMineActive/join/addParticipants/recordGame/recordDirect/undoLast/finish 继续被兼容云函数接受。
- 已迁移房间的 V1 mutation 由适配器翻译到 V2 事务；V1 仍保持 owner-only 写入，成员写入只对声明 apiVersion: 2 的客户端开放。
- V1 get 返回旧客户端可识别的 root session，并保证 root session 与 data.session 内容一致，且不暴露 OpenID。
- V1 session.version 固定映射 room.syncVersion；V1 mutation 的 expectedVersion 与该值精确比较，冲突继续返回现有 VERSION_CONFLICT/conflict。
- V1 成功与失败的 code/state/message 和 session 位置在迁移前后不能漂移。
- V1 get 投影当前有效 game / transfer：更正返回最新有效内容，reversal 不进入旧数组，使旧客户端计算出的总账保持正确。
- V1 getMineActive 继续兼容当前误导性命名：有 active round 时返回当前轮；没有时返回 lastRoundId 对应的 finished 投影，而不是擅自改成 not_found。
- 当前轮 activeRecordCount 不超过 200 时必须提供完整投影；超过旧客户端安全范围时，V1 get 和全部 V1 mutation 都返回 WATER_CLIENT_UPGRADE_REQUIRED，禁止继续写入或截断后给出错误总账。该兼容限制不限制 V2 长流水。
- V1 undoLast 映射为对当前轮最后一条有效记录创建 reversal；由于旧客户端只有 owner 能调用，仍保持原权限。
- V1 finish 在 migrated room 中保持 owner-only：原子把当前 round 归档、activeRoundId 置空，但不创建新轮；返回旧客户端可识别的 finished session。之后 V1/V2 create 为该 room 创建下一 active round。V2 action 表和页面仍不暴露 finish。
- legacy finished 迁移为 archived round；发起人下次使用 V2 create 时创建新 active round，历史仍保留。
- 兼容窗口结束前，不删除 V1 action 和旧集合。

## 16. 测试计划

当前实现的 waterSession 5 个测试文件加截图 case 测试基线为 52/52 通过，但只覆盖 owner、4 人、2 条记录和单一截图宽度。V2 不得把这组基线误当成多人协作验收。

统一固定 fixture：

| Fixture | 内容 |
|---|---|
| W0 | owner + 1 位球友，0 条流水 |
| W4 | 4 人，game / direct / correction / reversal 混合 |
| W24 | 24 人，包含已加入和待认领名字 |
| WLONG | 24 人、1000 条业务流水、多次更正和撤销 |
| WHISTORY | 2 个 archived round + 1 个 active round |
| WLEGACY | V1 active / finished，0 / 24 人，0 / 200 条 entries |

### 16.1 纯逻辑

- 1v1、2v2、等人数多人对局。
- 双方为空、人数不等、人员重叠、未知 participant。
- 单独记录的 from/to 与 ＋/− 语义。
- 1、99 合法；0、100、非整数非法。
- create、correct、reverse 的 ledgerDelta。
- 更正前后总账一致性和全局净水守恒。
- 撤销后的账务回退。
- create / correct / reverse 后 recordCount、activeRecordCount、eventCount 的固定语义。
- 24 人排序、同名去重、长名字展示模型。

### 16.2 云合同

- room 创建和继续使用稳定 ID。
- viewer 输出不含 owner/member OpenID。
- 未加入访客写入被拒绝。
- 成员能创建 game 和 transfer。
- 成员修改自己的记录成功、修改他人被拒绝。
- 发起人修改和撤销任意当前轮记录成功。
- archived round 所有写入被拒绝。
- 两名成员并发新增不同记录均成功。
- 两人并发修改同一记录只有一个 revision 成功。
- 20 个不同成员并发记账，最终 20 条均存在、无丢失、无重复。
- 同一请求重放 100 次只产生 1 条 entry。
- 已成功但响应丢失后，用相同 clientRequestId 重试返回 deduped。
- 原请求之后即使发生超过 20 次其他写入，延迟重试仍不得重复。
- 同一 clientRequestId 携带不同 payload 返回 CLIENT_REQUEST_ID_REUSED。
- 不同成员使用相同 clientRequestId 不得互相去重。
- request log 先于 archived/reversed 状态判断。
- createRound 原子归档、单 active round、重试返回同一 roundId。
- record 与 createRound 并发时，记录只完整进入旧轮或完整失败。
- 同一 OpenID 并发认领不同名字只能绑定一个 participant。
- 两个不同 OpenID 并发认领同一 participant 只能一个成功，另一方收到稳定冲突。
- 当前 23 人时两个新 OpenID 并发使用昵称加入，最终只能 24 人，另一方收到 PLAYER_LIMIT_REACHED/invalid。
- 任一事务故障点都不得留下 entry 已写而 aggregate 未更新的半状态。
- 用表驱动方式覆盖每个 mutation 的 owner / member / visitor 权限，以及 visitor / member 的往期访问边界。
- 返回结构始终包含 ok/code/message/state/traceId/data。
- 返回对象递归检查不得出现 OpenID、内部 memberId 或请求日志。
- capability 配置缺失/损坏/读取失败时，migrated V1、legacy V1 和 V2 mutation 全部 fail closed 且数据不变；V2 read gate 关闭、不返回 V2 room 投影，V1 只读 get/create READY 仍可用。canary allowlist 只按服务端 room/OpenID 命中。
- V2 get/create READY 必须同时验证 eligible && v2Read；emergencyReadOnly 只阻断写，不让未命中 read gate 的请求读取 V2 room。
- emergencyReadOnly 同时阻断全部 V1/V2 mutation，只保留读取和 V1 投影。
- emergencyReadOnly 下，V1/V2 create 对已有 active room 仍能无写入返回 READY/投影，且不新增 request log；真正创建 room/round 的分支被阻断、数据不变。
- V2 create 在 activeRoundId 为空时受 createRoundWrite / canCreateRound 阻断；V1 compatibility create 仅按锁定的 owner-only 例外创建下一轮，并覆盖 emergencyReadOnly 和安全上限。
- allowlist 为空、只配置 room、只配置 OpenID、两者同时配置的 eligible 公式逐项验证；capabilities 与服务端实际拒绝结果一致。
- reserved root keys、事务更新结果和 shared common 同步检查。

### 16.3 页面与交互

- owner、member、visitor 三种页面能力矩阵。
- visitor 加入和认领后原地变为 member。
- 总账 / 流水 / 球友切换保持状态。
- 固定底栏不遮挡最后一行或最后一条流水。
- 两个写入入口都产生正确草稿和文案。
- 总账行 ＋/− 正确预选方向。
- 对局搜索、清除、轮询刷新不破坏选择。
- 流水筛选、20 条分页、去重、切换 filter 的过期响应。
- 自动加载覆盖 visible loading、尾部失败重试、exhausted、筛选空态，以及新记录到达不破坏 cursor 或滚动位置。
- 修改弹层加载当前版本，冲突后展示最新版本。
- 具体撤销替代“撤销上一条”。
- 新记录反馈只能撤销刚提交的 entryId。
- 前后台切换、下拉刷新、弱网、离线草稿和 stale response。

### 16.4 迁移

- 空旧账本、1 人账本、24 人账本。
- game / transfer 混合 200 条。
- claimed 和 unclaimed participant。
- active 和 finished 旧状态。
- 缺失 entry.id 或 createdAtMs 的确定性补齐。
- 同一迁移重复执行无重复记录。
- 中途失败后重试。
- V1 与 V2 读取结果的每人总账一致。
- 旧链接打开同一个 roomId。
- dry-run 必须零写入，并输出房间数、人数、流水数、源 hash、目标 hash、守恒结果和异常清单。
- 迁移过程中 sourceVersion / sourceHash 变化时整房间中止。
- 未知 participant、重复 entryId、非法水数或非零守恒必须隔离，不能静默修复后切换。
- legacy recentRequestIds 中的请求在切换后重放：命中 V1 tombstone、返回 deduped、不创建 entry，且不冒充 V2 payloadHash 日志。
- V1 create/get/getMineActive/join/addParticipants/owner record/direct/undo/finish 在迁移前后全部通过兼容 smoke。
- V1 get 在更正和撤销后仍投影出正确总账；超过安全投影范围明确要求升级。
- 超过 200 条安全投影范围时，至少选择 V1 recordGame 和 V1 undoLast 做 mutation 阻断测试：均返回 WATER_CLIENT_UPGRADE_REQUIRED，且 entry、round aggregate、room version 和 request log 全部不变。

### 16.5 视觉与真实 DevTools

浏览器方向获批、原生实现完成后，必须重新生成当前源码证据。最低阻断矩阵为 3 宽度 × 4 高风险状态，共 12 张：

| 宽度 | 状态 1 | 状态 2 | 状态 3 | 状态 4 |
|---|---|---|---|---|
| 320 | owner 空总账 + 固定底栏 | member 24 人总账 + 行内＋/− | member 24 人记一局弹层 | visitor 长流水 + 加入 CTA |
| 390 | owner 空总账 + 固定底栏 | member 24 人总账 + 行内＋/− | member 24 人记一局弹层 | visitor 长流水 + 加入 CTA |
| 430 | owner 空总账 + 固定底栏 | member 24 人总账 + 行内＋/− | member 24 人记一局弹层 | visitor 长流水 + 加入 CTA |

390 宽另补：

- 单独记水弹层；
- member 修改自己的记录；
- owner 修改成员记录；
- member / owner 长流水，验证每条“修改 / 撤销”不溢出；
- 新一轮确认；
- 往期只读页；
- 长昵称、系统字体放大、最后一行不被底栏遮挡、键盘弹起、原生滚轮和 safe-area。

每张图记录 exact worktree、HEAD、自动化 endpoint、真实 viewport、PNG 尺寸与 hash 和人工结论。endpoint 必须实际通过 Tool.getInfo、App.getCurrentPage 和 exact project/worktree provenance 验证，不能只记录端口字符串。若现有脚本不能切换宽度或证明源码新鲜度，只做最小独立工具适配，不整体迁入旧工具链。

浏览器稿、旧截图、旧 QR 和历史 records 不得替代当前源码 DevTools 实图。视觉 fixture 可使用本地确定性测试数据；真实跨账号权限验收需在获得云测试写入授权后单独执行。

### 16.6 现有测试迁移

必须保留的既有价值：

- 1v1、等人数、不重叠、1–99 和 from/to；
- 姓名清理、接龙去重、24 人；
- OpenID 不下发、不访问 tournaments；
- requestId 草稿复用、重复点击 guard、旧响应丢弃、前后台刷新和选择保持；
- Vant 1.11.7 与已审查组件范围。

必须替换的旧断言：

- “invitee cannot write entries”改为 member 可写、visitor 禁写、member 只处理自己的 root、owner 处理全部。
- owner-only command board、最近 4 条和固定三列总账结构改为三标签、完整分页与角色能力矩阵。
- undoLast 物理 pop 改为指定 rootEntryId / expectedEntryId 的 reversal。
- client-request 测试增加 createRound、correctEntry、reverseEntry、listEntries 和 capability fallback。

本 worktree 没有 waterSession 专用 targeted/cloud-contract runner；实施时先直接运行明确的 node --test 文件。若补 runner，只做本分支所需的最小独立适配，不整体迁入旧工具链。

## 17. 验收门槛

### 17.1 产品

- 已加入成员能看完整流水并完成两类记水。
- 修改和撤销权限符合角色矩阵。
- 无“结束”入口，无直接改余额。
- 新轮保留名单、身份和旧链接，旧轮可查。
- 24 人和长流水操作长度可控。

### 17.2 数据

- 任意事务后总账净水合计为 0。
- 没有物理删除历史。
- 每次写入有 member 身份、时间、不可丢失事件和可追踪的 request log；业务 payload/effect 不被覆盖。
- 并发新增不依赖客户端全局 version。
- 迁移前后人数、记录和每人账目校验一致。
- 20 路并发无丢失无重复，100 次同请求重放只产生 1 次业务效果。
- 权限泄漏、重复账、丢账、错误总账和旧链接失效均为零容忍阻断项。

### 17.3 工程

- 先测试失败，再实现通过。
- waterSession 云合同专项、权限、幂等、同步和页面测试通过。
- 当前 worktree 没有 verify:light / verify:full alias，必须运行仓库真实存在的命令：
  - node --test tests/waterSession.logic.test.js tests/waterSession.index.test.js tests/waterSession.client-request.test.js tests/waterSession.page-lifecycle.test.js tests/waterSession.ui-copy.test.js tests/weapp-ui-screenshot-cases.test.js，并把新增 V2 测试文件逐个显式列入；
  - npm run check；
  - npm run lint；
  - npm run check:deprecated-wx-api；
  - npm run check:cloud-common；
  - npm test；
  - git diff --check。
- 若未来确需 verify alias，只能做最小独立工具适配，不能在实现前假定它已存在。
- 全量测试若存在已知非本次失败，必须提供未改基线的可复现证据，不能宣称全绿。
- git diff --check 通过。
- 若修改共享 common，先改 scripts/cloud-common.template.js，再同步派生文件并通过一致性检查。
- 真实 DevTools 截图通过用户确认后才提交对应 UI 实现。

## 18. 分阶段实施顺序

### 阶段 0：方案文档

- 完成本文件。
- 不修改产品代码，不部署。

### 阶段 1：浏览器近似方案

- 加载 browser-router。
- 基于同一行为合同给出三套高质量方向。
- 覆盖正常、24 人和长流水。
- 用户选择一个方向并批准。

### 阶段 2：云合同与迁移适配器

- 先新增失败测试。
- 建立 V2 数据模型、action、权限、事务和 V1 适配器。
- 只在本地模拟数据库验证，不做真实迁移。
- 独立提交。

### 阶段 3：客户端模型与原生页面

- 先写 core/page/ui-copy/lifecycle 测试。
- 实现三标签、固定操作栏、完整流水、记录详情和成员写入。
- 保留接龙、搜索、原生滚轮及快捷加减。
- 独立提交。

### 阶段 4：新一轮与往期

- 先写生命周期、幂等、权限和历史只读测试。
- 实现 createRound、往期列表和归档详情。
- 独立提交。

### 阶段 5：当前源码验收

- 运行专项与全量验证。
- 生成真实 DevTools 截图。
- 用户确认后进行必要的 320 / 390 / 430 和状态矩阵检查。

### 阶段 6：部署与上传

仅在新的明确授权下执行：

1. 准备新集合和索引，保留 waterSessions；在部署前创建私有 feature config，emergencyReadOnly=false、全部 V2 capability flag=false、allowlist 为空，并记录初始 revision。若配置未成功创建，不部署新云函数。
2. 先部署向后兼容的 waterSession，V2 读写开关保持关闭。
3. 用现有 V1 客户端验证 create / get / getMineActive / join / addParticipants / owner record / direct / undo / finish 合同。
4. 运行零写入 dry-run 并展示迁移统计。
5. 获得真实数据授权后，只对测试房间执行 canary 迁移。
6. 在每次获得当时授权后，canary 依次开启 V2 读取、owner 写、member 写、correct/reverse、createRound；每次阶段授权必须同时明确预授权“命中本节零容忍条件时自动将 emergencyReadOnly=true”，否则不得启动该阶段。每次 flag 或 allowlist 修改都记录配置 revision、修改前值、修改后值和操作者，每一步验证后再继续。
7. 多账号真实验收通过后，才生成 preview / 体验版。
8. 兼容云函数稳定后才上传 V2 小程序代码。
9. 观察错误码、冲突率、幂等命中、seq 断档和迁移校验。
10. 正式发布仍需单独授权。

cloud deploy、索引/集合写入、canary 迁移、每一次 feature flag / allowlist 修改、preview、upload 和正式发布都是独立外部动作，必须分别取得当时的明确授权。进入任一 canary 阶段前，该阶段授权同时包含且仅包含零容忍条件触发时自动写入 emergencyReadOnly=true 的止损权限；若用户没有给出这项配套授权，就只展示计划，不启动 canary。flag / allowlist 写入回执必须包含配置 revision 和前后值。如果未修改共享 common，部署范围只包含 waterSession，不为本功能整体重部署其他云函数。

Canary 晋级门槛：

- 至少 3 个测试房间、3 个真实账号，覆盖 owner / member / visitor。
- 覆盖两类记水、更正、撤销、新一轮、V1 兼容、并发和旧链接。
- 每一阶段核对远端 waterSession 内容/hash 与批准 commit 一致，并验证新集合不能被客户端直写。
- 任一权限泄漏、重复/丢失账、迁移 hash 不一致、旧链接失效或 V1 投影错误，使用该阶段已取得的止损预授权立即开启 emergencyReadOnly，记录触发证据与新 revision，并停止晋级；没有止损预授权时不得事先进入该阶段。
- 部署、preview、upload 和发布记录必须包含 exact worktree、HEAD、客户端版本、云函数 hash 和实际执行顺序。

### 回滚与止损

- V2 尚未产生业务写入：关闭 V2 开关，legacy 数据不受影响；隔离的新文档保留为证据，不硬删。
- 已发生 V2 写入：禁止回滚到不理解 V2 数据的旧云函数。应立即开启服务端 emergencyReadOnly，阻断 V1/V2 全部 mutation，只保留读取与 V1 投影，然后前滚修复并分级恢复。
- 客户端回退只能在向后兼容云函数仍在线时执行，不能先回滚云端。
- 错误账目通过 correction / reversal 修复，不删除 entry。
- migration runId、sourceHash、targetHash 和备份保留到完整验收结束。

## 19. 预期文件影响

可能新增或修改：

~~~text
docs/specs/collaborative-water-ledger-v2.md
miniprogram/pages/water/index.js
miniprogram/pages/water/index.wxml
miniprogram/pages/water/index.wxss
miniprogram/pages/water/index.json
miniprogram/core/waterSession.js
miniprogram/core/waterLedger.js
cloudfunctions/waterSession/index.js
cloudfunctions/waterSession/waterLogic.js
scripts/cloud-common.template.js              # 仅在确有共享能力变化时
cloudfunctions/waterSession/lib/common.js     # 模板同步派生，不直接作为源修改
tests/waterSession.*.test.js
tests/waterSession.v2-*.test.js
~~~

明确不影响：

~~~text
miniprogram/pages/home/**
miniprogram/pages/launch/**                    # 入口和 CTA 保持不变
miniprogram/pages/create/**
miniprogram/pages/schedule/**
miniprogram/pages/match/**
miniprogram/pages/ranking/**
cloudfunctions/*Tournament/**
~~~

## 20. 已锁定决策与仍待选择内容

### 已锁定

- 多人协作写入。
- 成员改自己、发起人改全部。
- 总账 / 流水 / 球友。
- 记一局 / 单独记水。
- 完整流水、记录人、时间和更正状态。
- 具体记录修改与撤销，不再“撤销上一条”。
- room / round / entry + 审计 event。
- 新一轮自动归档，不显示结束。
- 保留名单、加入身份和稳定邀请链接。
- 旧数据不删除，先兼容云端后客户端。

### 仍需用户在下一步选择

- 三套浏览器近似稿中的最终视觉与布局方向。
- 视觉方向选定后的具体颜色、字阶、间距、控件质感和轻量动效。

这些视觉选择不得反向改变本文的权限、写入、分享、导航和生命周期合同。
