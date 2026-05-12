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
