# 开赛部署后线上只读观察（2026-10-03）

2026-10-04用户要求暂停，goal paused、原七日只读观察automation-3已PAUSED；以下仅已有10-03累计窗口，不是10-04新采集或七日结论。恢复前核调度历史/漏跑/保留期及原10-10截止，不能相加重叠窗口、伪造未来或调用凑数。[暂停交接](2026-10-04-plan-paused-handoff.md)。

## 最新累计窗口（至15:48，非增量）

现有认证下只读查询`function_name:*`，100条升序/context分页；北京时间2026-10-03 02:32:05至15:48:53（结束时UTC07:48:53），20页1987条，末页`meta.listOver=true`。主控独立核对20页可解析、`data.results.length === meta.returnCount`、context链和总数；既有报告`complete=true`、issues0、1个raw来源。原始分页、manifest、报告和脚本保存在ignored `tmp/online-followup-20261003-afternoon/`，没有覆盖下面13:29窗口。

startTournament按request_id去重后有**9个非缺参候选**，平台/业务均9/9成功，失败/冲突/未知0，硬超时0，trace缺失0，版本缺失9；终态时长覆盖9/9，请求P95=3993ms。另1个缺参烟测候选与此前烟测ID集合相同，排除在9次之外。累计窗口含旧窗口，不能把4+9相加。来源仍未知，未读赛事业务数据验证真实用户；这不是9场已验真实开赛，也不满足连续7天≥100调用。9样本P95不能推断稳定性或手机性能。

首次`summary.json`误把CLI的`data`对象当顶层数组，得出`allPageJsonValid=false`；原摘要保留，按实际`{data:{results,analysisRecords},meta:{…}}`核验后只新增`summary-corrected.json`。没有重查云、改raw或重算报告。`filteredRows=0`是排除行数，不是输入0；`complete=true`是采集完整，不等于所有业务成功。报告有两条manageActivityId平台200但业务PERMISSION_DENIED，非硬超时、来源未知；不据此臆造新回归。没有调用函数、部署或业务写入，身份/请求/追踪ID不写本记录。

## 历史窗口（至13:29，保留）

使用现有 CloudBase CLI 3.7.3 登录态执行只读 `logs search`，复用此前 follow-up 的查询、100条分页、升序及 context 链合同。查询范围为全函数 `function_name:*`，北京时间 **2026-10-03 02:32:05 至 13:29:02**；结束时间取自发起查询前的当前UTC时间 **05:29:02** 换算为北京时间，没有查询未来区间。8页共776条原始日志，末页 `listOver=true`。

新原始样本仅保存于 `tmp/online-followup-20261003-latest/sample/`；manifest固定窗口和逐页输入context。既有离线报告器退出码0，完整性 `complete=true`、0 issues、1个raw来源、全函数范围、`request_id` 去重；用于分析的报告保存在 `tmp/online-followup-20261003-latest/report/report.json`。身份与赛事业务字段、请求/追踪ID未输出到聊天或本记录。

`startTournament` 有 **4个非缺参候选的唯一请求**：平台4/4成功、业务4/4成功、失败/冲突/未知均0、硬超时0；4条都有trace，4条均缺版本字段。终态时长覆盖4/4，按每个请求的最大终态duration计算P95为 **952ms**。报告另列 **1个缺参烟测候选**；其 request_id 与此前记录的部署缺参烟测相同，单独排除在以上4次请求统计外。

这4条是日志所示的非缺参、业务返回成功调用；日志没有可靠的生产/测试来源标记，也未独立读取赛事数据，因此“是否为真实用户的真实开赛”记为**未知**，不能将4条直接称为4场已验证真实开赛。候选数和时长样本都远低于连续7天、至少100次调用的观察门槛，不能据此验收目标或作稳定性/P95结论。未调用云函数、未部署、未改规则、未写业务数据；使用现有认证，未尝试登录或其他工具。原始数据没有输出到对话。

## 证据文件

- 查询脚本：`tmp/online-followup-20261003-latest/collect.cjs`
- 原始分页响应与manifest：`tmp/online-followup-20261003-latest/sample/`
- 离线汇总：`tmp/online-followup-20261003-latest/report/report.json`
- 查询窗口与先前观察依据：`docs/tasks/session-logs/2026-10-03-local-stage-validation.md`
