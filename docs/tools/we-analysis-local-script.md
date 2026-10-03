# We 分析 / datacube 本地拉取脚本

本脚本只在本地运行，不需要云函数，也不会改小程序前端。真实密钥只放在本机 `.env.local`，不要提交到仓库。

## 配置

复制示例文件并填写小程序后台的 AppID 和 AppSecret：

```bash
cp .env.local.example .env.local
```

`.env.local` 内容：

```bash
WX_APPID=你的 AppID
WX_APPSECRET=你的 AppSecret
```

`.env.local`、`.cache/`、`data/we-analysis/` 已加入 `.gitignore`。脚本会把 `access_token` 缓存在 `.cache/wechat-access-token.json`，用于减少重复取 token；该目录不应提交。

## 运行

```bash
node scripts/fetch-we-analysis.js dailyVisitTrend 20260512 20260512
node scripts/fetch-we-analysis.js visitPage 20260512 20260512
node scripts/fetch-we-analysis.js dailySummary 20260512 20260512
```

参数顺序固定为：

```text
node scripts/fetch-we-analysis.js <type> <begin_date> <end_date>
```

日期必须是有效 `yyyymmdd`，例如 `20260512`。

## 支持的 type

| type | 微信 datacube endpoint |
| --- | --- |
| `dailySummary` | `/datacube/getweanalysisappiddailysummarytrend` |
| `dailyVisitTrend` | `/datacube/getweanalysisappiddailyvisittrend` |
| `weeklyVisitTrend` | `/datacube/getweanalysisappidweeklyvisittrend` |
| `monthlyVisitTrend` | `/datacube/getweanalysisappidmonthlyvisittrend` |
| `visitPage` | `/datacube/getweanalysisappidvisitpage` |
| `visitDistribution` | `/datacube/getweanalysisappidvisitdistribution` |
| `userPortrait` | `/datacube/getweanalysisappiduserportrait` |
| `dailyRetain` | `/datacube/getweanalysisappiddailyretaininfo` |
| `weeklyRetain` | `/datacube/getweanalysisappidweeklyretaininfo` |
| `monthlyRetain` | `/datacube/getweanalysisappidmonthlyretaininfo` |

## 输出

原始 JSON 会保存到：

```text
data/we-analysis/{type}-{begin_date}-{end_date}.json
```

JSON 结构包含：

```json
{
  "type": "dailyVisitTrend",
  "begin_date": "20260512",
  "end_date": "20260512",
  "fetched_at": "2026-05-12T00:00:00.000Z",
  "raw": {}
}
```

如果微信返回的结构适合表格，脚本会额外保存：

```text
data/we-analysis/{type}-{begin_date}-{end_date}.csv
```

## 常见错误码

- `40001` / `40014` / `42001`：`access_token` 无效或过期。脚本会自动强制刷新 token 并重试一次。
- `40164`：调用 IP 可能不在小程序后台的接口安全域或 IP 白名单配置内，需要到微信公众平台检查配置。
- `48001`：接口权限不足或接口未开通，检查小程序账号权限和 datacube 接口可用性。
- 其他 `errcode`：脚本会打印 `errcode` 和 `errmsg`，按微信返回信息定位。

脚本不会在控制台打印 AppSecret 或完整 `access_token`。本地 token 缓存文件包含可复用 token，必须保留在 `.cache/` 下并避免提交。

## 交给 AI 分析

拉取后，把 `data/we-analysis/` 下对应日期的 JSON 或 CSV 文件发给 AI，并说明你想看的问题，例如：

```text
请分析 data/we-analysis/dailyVisitTrend-20260512-20260512.json，
重点看访问次数、访客数、平均停留和次日留存是否异常。
```

适合交给 AI 的材料：

- 同一 type 连续多天或多周的 JSON/CSV。
- `dailyVisitTrend` 搭配 `visitPage`，用于判断流量变化来自哪个页面。
- `visitDistribution` 搭配 `userPortrait`，用于判断用户来源和画像变化。

## 离线可复算报表（2026-10-03起）

报表只读取现成JSON，不取token、不请求微信API、不读取业务数据库。旧 `scripts/analyze-we-data.js` 已改为以下新入口的CLI别名：无参数运行会报错退出，不再扫描 `data/we-analysis/` 的全部CSV/JSON或生成经营判断。旧CSV分析行为不兼容，已有原始文件和报告保留不覆盖。

```powershell
node scripts/we-analysis-report.js --manifest data/we-analysis/audit-20261003/fetch-manifest.json --begin 20260902 --end-exclusive 20261002 --latest-complete 20261001 --out tmp/we-report-30d
node scripts/we-analysis-report.js --manifest data/we-analysis/audit-20261003/fetch-manifest.json --begin 20260925 --end-exclusive 20261002 --latest-complete 20261001 --out tmp/we-report-7d
```

日期为北京时间自然日，参数可使用 `YYYYMMDD` 或 `YYYY-MM-DD`；begin包含、endExclusive排除，latestComplete必须人工根据已核实接口状态指定，脚本不猜测最新完整日。`--out` 必须是尚不存在、且父目录已存在的新目录；已有目录拒绝，结果保存为 `report.json`。省略 `--out` 输出JSON到stdout。

输入二选一：`--manifest` 或一个/多个重复的 `--file <精确JSON路径>`。manifest仅使用 `results`、可选 `retries`、`additional` 中 `ok:true` 的请求，按清单所在目录的 `{type}-{begin_date}-{end_date}.json` 精确读取；`ok:false` 留作错误证据。同一请求失败后成功重试可用，同一请求有多个成功项、重复文件、同type重叠请求均报错。唯一重叠例外是画像的不同窗口：分别保留、不加总。每日接口只接受begin_date=end_date，月接口必须完整自然月，周接口必须七天；wrapper元数据与manifest、raw.ref_date/访问列表日期错配或出界直接失败。

报表口径：

- `window.uvDays`、页面UV合计和分享UV合计是人天；不输出日UV简单加总后的unique人数。周/月接口去重UV及画像放在 `periods` 独立保留原始聚合，不与日报相加；周/月留存仅留原始证据，标为 `maturity_not_evaluated`，不能据此使用尚未成熟的值。
- UV停留按日UV、session停留/深度按启动次数、页面停留按页面PV加权；各自分子、分母、逐日值/权重及缺失日期放在 `evidence`。`avgDailyUv` 是已有非缺失日UV的人天/这些日数，部分窗口必须连同coverage解释。
- 日留存D1/D7/D14只纳入队列首日+lag不晚于latestComplete且key0和目标key都有数值的队列；按留存人数之和/首日人数之和，不平均日比例。`included`、`missing`、`immature`分开列；没有分母时rate为null，缺失key不补零。
- 61503、未完成日、缺失文件/字段保持unknown：没有已知值时输出null，有部分值时为已知子集之和并标partial。错误、成功重试是否解决分别记录于 `inputs.attempts`；零只来自明确提供的数值0。
- 页面缺席有效当日日列表仅代表无报告行；整份页面响应或某字段缺失仍单列unknown。页面 `sharePv=0` 与 `dailySummary` 全局shares是两类字段，不能相互替代或推导“无人分享”。页面UV不形成跨页漏斗。
- `inputs`记录manifest及每份成功输入的SHA-256、日期和是否进入日报窗口，`dailyEvidence`保留窗口内原始日聚合，便于离线重算。窗口外输入不进入日报，周期指标可位于窗口外。`window.status`和各指标status需要一起审阅；不追加趋势原因、版本因果或业务转化结论。

直接回归：`node --test tests/we-analysis-report.test.js`。本轮真实164份JSON的30日/7日复算与报告逐项对齐，回执见 [离线报表修复记录](../tasks/session-logs/2026-10-03-analytics-report-repair.md)。
