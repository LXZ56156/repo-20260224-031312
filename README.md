# 羽毛球轮转赛（CloudBase）

> 当前包已预置云环境 ID：`cloud1-1ghmqjyt6428702b`。

## 1. 导入项目
1. 打开 **微信开发者工具** → 选择 **导入项目**
2. 目录选择到 **包含 `project.config.json` 的那一层**（不要选到上一级）
3. 如果你有自己的小程序 AppID：填你的 AppID（或使用测试号）
4. 导入成功后，确认：
   - `miniprogramRoot` = `miniprogram/`
   - `cloudfunctionRoot` = `cloudfunctions/`

## 2. 绑定云开发环境
1. 右上角 **云开发** → 选择环境
2. 选择/创建云环境后，确认 `miniprogram/config/env.js` 中对应环境的 `cloudEnvId`
3. 默认已内置：`cloud1-1ghmqjyt6428702b`
4. 开发版/体验版/正式版会按 `envVersion` 读取对应配置；首页在非正式环境会显示环境标识

## 3. 数据库初始化（必须）
> 你遇到的 `database collection not exists: tournaments` 就是因为没有创建集合。

1. 云开发控制台 → **数据库** → **新建集合**
2. 创建集合名：`tournaments`
3. 建议权限规则（仅示例，按你实际需求调整）：
   - `tournaments`：所有用户可读；写入只通过云函数
   - 规则（在集合权限里配置）示例：
     ```json
     {"read": true, "write": false}
     ```

## 4. 部署云函数（必须）
1. 先在项目根目录执行：
   ```bash
   ./scripts/sync-cloud-common.sh
   ```
   用于同步云函数公共库、模式工具、权限工具到各函数目录。
2. 在开发者工具左侧资源管理器里，找到 `cloudfunctions/`
3. 右键 `cloudfunctions` → **上传并部署：所有云函数**
4. 部署完成后再运行项目，否则会出现 `FUNCTION_NOT_FOUND`。

当前云函数列表：
- login
- createTournament
- cloneTournament
- joinTournament
- updateSettings
- startTournament
- addPlayers
- removePlayer
- setReferee
- submitScore
- resetTournament
- rebuildRankings

## 5. 目录结构说明
- `miniprogram/`：小程序前端运行时代码（页面、核心模块、样式、静态资源）
- `cloudfunctions/`：云函数目录，每个子目录对应一个独立函数入口与依赖
- `tests/`：Node.js 单元测试（核心逻辑与权限/赛程算法回归）
- `project.config.json`：微信开发者工具项目配置（应纳入版本控制）
- `project.private.config.json`：本地私有配置（不纳入版本控制）

## 6. 运行 & 典型流程
### 6.1 创建赛事（管理员）
1. 首页 → **去创建**
2. 填：赛事名、昵称/头像（可选）
3. 创建并进入大厅
4. 在“赛事设置”中填写总场次 M、并行场地数 C（可选），并保存
5. 在大厅添加/导入参赛者（管理员可操作）
6. 点击 **开赛**（开赛后赛程锁定，生成完整对阵表）

### 6.2 分享观赛/自愿加入
1. 管理员在大厅点 **分享**
2. 群聊成员打开后：默认 **只观赛**（可看实时排名/赛程）
3. 成员点击 **加入比赛** 才会入参赛列表（不强制加入）

### 6.3 录入比分
1. 赛程页选择某一场 → 进入 **录入比分**
2. 输入左右两队得分 → 提交
3. 完赛后：
   - 观众页显示静态比分
   - 管理员/裁判可再次修改（需要权限）

## 7. 常见报错排查
- `FunctionName parameter could not be found`：没部署云函数 / 没选对云环境 / 目录没导入到包含 `project.config.json` 的层级
- `database collection not exists: tournaments`：未创建数据库集合 `tournaments`
- 模拟器提示实时监听不支持：不影响真机；本包在关键写入后会主动拉取一次最新数据作为兜底
