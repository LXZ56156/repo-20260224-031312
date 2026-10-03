# 2026-10-03 留痕与每日故障报告准备

结论：总计划第3项的本地客户端最小埋点、离线CLS报告工具、只读查询计划及事件合同已完成，合成SDK及直接相关回归通过；已用主控06:09采样离线复核。微信后台配置、上传/发布、真实实收和告警订阅未完成，不能把本记录当留痕闭环上线回执。

本子任务先新增 `scripts/cloud-ops-daily-report.js`、`tests/cloud-ops-daily-report.test.js`、[合同](../../specs/activity-observability.md)及本日志；接续新增 `core/activityTracker.js` 与直接测试，并修改core/cloud.js和water/index.js的非可见埋点。未改growthTracker、settings/schedule、云函数、current或备份。实际workdir main/master，HEAD b571c687；既有未提交修改均保留。未调用生产API/函数、写生产事件/业务数据、部署、付款、上传/发布、commit或push。

## 工具行为

- 默认离线，显式manifest列文件、北京时间窗口和分页inputContext；拒绝混窗口/混query，只接纳manifest同目录内命名文件，不扫描旧文件。输出必须新目录，拒绝覆盖既有目录。
- 原始日志按function_name+request_id去重，系统终态排除202/retry，关联app业务错误；平台成功与业务成功/失败/未知/冲突分开；缺参烟测候选单列。trace/版本缺失保留missing，原始业务文本不进入简报。
- 完整原始查询才可输出全窗口平台失败率；聚合分组仅展示reportedDistinctPerGroup，不求和推导不可核实总数。原始请求P95按每请求终态最大耗时计算并列覆盖数；分页/SQL LIMIT可能截断均报告未完整。
- `--queries`只生成logs search计划，不执行网络请求。本轮选择不提供live模式，避免为了本地准备扩大生产入口。完整原始查询、聚合、异常及缺参查询均固定同一显式窗口。

## 已有部署后样本离线核对

输入为主控已采样的 `tmp/online-followup-20261003-0607/start-post-deploy.json`，窗口 `2026-10-03 02:32:00–06:09:08` 北京时间；没有重新采样。新增显式manifest `ops-report-input.json`，输出新目录 `tmp/cloud-ops-report-20261003-preparation/report.json`。该份SQL返回1个status200分组、distinct request为1，业务ok:false/code=TOURNAMENT_ID_REQUIRED，与部署缺参烟测回执相符。没有观察到可计入真实用户开赛的调用，不能报告用户成功率100%，不能检验7天/100调用目标。聚合无request_id逐条明细，requestReconstruction明确unavailable-aggregate-only；版本/trace缺失，不填假值。

上述首次解析回执使用当时工具版本；随后工具进一步显式输出聚合trace/版本缺失、requestAssociation及metricPopulation，最终回执见文末验证。新输出拒绝覆盖第一次回执。

## 事件合同准备

合同明确share_enter、加入/创建/开赛、录分进入/提交、water_create/加成员/首笔、完赛/分享的attempt/result及去重意图；禁止姓名、头像、openid和文本输入。14天原始事件/90天无会话日聚合、管理员访问、每日1000/会话20/批次10额度是待定稿建议，没有配置生产。远端reportOpsActivityEvents默认disabled，不在受管23函数；logic、byte cap、集合/TTL及客户端协议须从完整包核对，不能只开ENABLE。新方案的实际字段和保留期不从历史代码推导授权。

## 本地客户端最小接入

- 新activityTracker仅wx.reportEvent，不新增云接收/集合、不保存会话、不输出PII。SDK实际版本/envVersion、现有合法格式trace、进程内随机session、固定码和字段allowlist；缺失元数据为空。已有growth事件完全保留。
- cloud.call指定写动作统一attempt/result，业务ok:false和最终异常计入；SDK自动重试一对事件，retryCount列明。手动重试是新operationId，未匿名关联底层clientRequestId，文档明确不能据调用数推算独立意图。
- water只增加进入view；首笔依据已核实V2原始entry.seq=1且eventType为game_recorded/transfer_recorded，deduped标replayed、缺字段标unknown；不依分页为空推断。不能据该信号直接计算跨会话新账本7日首笔率。
- 新增6项合成SDK旅程测试，覆盖11种指定写操作、业务拒绝/异常、自动/手动重试、严格PII剔除、offline eventId去重、首笔/更正/replay区分、采集同步/异步失败、SDK元数据缺失、只读/心跳排除及水页进入。

## 验证与未完成

- `node --test tests/cloud-ops-daily-report.test.js`：6项通过，0失败。直接覆盖request去重、平台200业务失败、硬超时、缺参、app关联、不误认committed成功、分页cursor链/缺页、混窗口/CLI失败/身份缺失、冲突、SQL LIMIT、命名输入及禁止覆盖。
- 聚焦ESLint：工具与直接测试0错误0警告；git diff --check通过。只改独立离线工具/合同，未以全量测试替代真实采集，最终聚焦复核由执行回执补充。
- 最终聚焦6项再次通过、ESLint0错误0警告、diff检查通过；最终实际样本报告保存在 `tmp/cloud-ops-report-20261003-preparation-final/report.json`，首次输出仍保留。聚合缺trace/版本、不可恢复request关联均显式输出，未报告实际开赛成功率。
- 客户端新增6项直接测试通过；连同growth、cloud错误/返回合同、water V2客户端/页面生命周期及日报共8文件74项通过、0跳过、0失败。6个本任务JS文件聚焦ESLint0错误0警告，diff检查通过；终端出现其他主控正修改submitScore的CRLF提示，非本任务改动。共享cloud调用变化的最终全量检查由主控合并后统一执行，本子任务未声称全量已通过。
- 最后补充确认：排阵异常中文“超时”不误算为平台硬超时，433按现有CLS平台超时码计数；本任务两文件12项直接测试最终通过，聚焦ESLint及diff检查通过。微信后台的事件定义/参数约束及实收仍未核实；官方检索未获得可用资料，不以合成SDK替代平台验收。
- 未验证：真实客户端事件实收、远端完整协议兼容、生产TTL/访问配置、真实测试旅程、生产测试分离、7日成功率及告警订阅。后续先准备具体客户端/接收改动和本地验收证据，再请求生产启用/写入/部署/上传各项授权。
