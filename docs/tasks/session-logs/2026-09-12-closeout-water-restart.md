# 2026-09-12 收口与打水重开

## 最新覆盖决定

用户随后明确“不要按照轮次，每次打水一般都不是同一群人”，并已批准实施每次独立账本、独立名单和邀请链接；新建不关闭或清空旧账本，通过最近/历史返回旧账本。已停止并撤回participantIds新轮扩展与客户端房间/本轮名单分离，保留此前稳定性/工具/legacy修复。旧浏览器稿均为未采纳提案，下文轮次研发仅作过程证据。批准增量见 [独立账本规范](../../specs/independent-water-ledgers.md)。

## 独立账本实现与验证

- 云端新增 `createLedger`：调用者与请求ID决定独立room；相同意图重试同账本，新请求新账本，只初始化发起人。旧create和旧分享保持兼容，不改变旧账本。
- 新增 `listLedgers`：仅本人有效owner/member，日期倒序分页；摘要含ID、标题、人数、记录数、更新时间与owner/legacy标记。每页扫描本人全部membership后汇总排序，成本随本人账本数增长。
- 旧V1至少发现本人owner稳定账本；V1成员历史不自动发现，仍走旧链接。没有真实迁移，底层round保留兼容但UI无新轮次。
- 新增 `waterRoomMembers_openid_id_asc` 索引声明和bootstrap校验，未部署索引或云函数。客户端已接入独立新建、历史列表与最近账本流程；最终行为/视觉验收由主控继续记录。
- 云聚焦验证：`waterSession.v2-cloud`、`waterSession.v2-migration`、`waterSession.index`、`water-v2-cloud-bootstrap` 共 **51/51通过**。覆盖独立创建、重试载荷冲突、旧账不变、owner/member列表隔离、V1发现、101份membership扫描和同时间跨页无重漏；bootstrap仅声明校验，无远程动作。
- 云目标ESLint与 `git diff --check` 通过。`compare_product` 独立复核未发现必须修复的新增合同问题，确认createLedger调用者/请求ID幂等隔离、列表有效成员过滤及旧create/分享兼容；新增云测试3/3、bootstrap测试3/3与声明校验通过。复核明确V1普通加入者无法历史自动发现，原链接仍可使用。以上不替代真实DevTools图或人工验收，当前不宣称UI完成或已部署。

## 授权与工作区

用户授权持续推进既有问题收口，并批准上述独立账本增量。此前“清零重开并重新选择本轮球友”已被覆盖；旧流水和原邀请链接保留。本轮没有 commit、push、preview、upload、云部署或真实数据写入授权。

工作区 `D:\projects(WIN)\badminton-miniapp`，分支 `codex/online-audit-optimizations-20260828`，HEAD `6827efa`，既有脏树保留。初始两子任务模型调用失败未修改；后续恢复成功。

## 已实施的收口

- post-commit 兼容脚本改为无操作，现有安装钩子不再触发云部署。
- 云公共错误分类不再把所有 document.get:fail 视为不存在；模板同步23副本。
- submitScore传递/校验锁会话，条件清锁含session；缺字段旧客户端兼容保留。锁读取与赛事写入非跨文档事务，仍有读取后被接管的理论窗口。
- 空云响应不再伪成功；隐藏页重连不重建监听；ranking卸载后头像不回写。
- 选测未知领域回退全量；上传来源/版本绑定目标Git，禁止不明镜像和未提交打包源码。
- legacy账本恢复房主撤销上一条，确认期间版本变化停止请求；无详情能力时不显示可点击详情。
- water卸载后加载/写响应不回写，旧弹层失败不污染新弹层；冲突刷新之后再次校验生命周期。
- 旧class精确测试按class token兼容；架构/README区分V1兼容与V2源码。

## 打水重开依据

V2已有createRound事务，但原入口藏在往期、默认继承全名单；V1兼容模式没有重开。2026-09-11在线非原子备份统计包含waterRooms 55、waterRounds 56、waterSessions 15；flags revision11的v2Read/ownerWrite/memberWrite/createRoundWrite为true，emergencyReadOnly为false，allowlist为空。这是昨日备份证据，不是当前实时云核验，也不证明15份旧文档均未迁移。

当时拟沿用V2房间/轮次模型重新选人，现已撤回；旧账本仍沿用已有显式迁移工具，不新增并行legacy轮次系统，不执行真实迁移。

## 验证（进行中）

此前收口聚焦：云50/50、客户端41/41、工具6/6；water lifecycle/V2 page85/85、V2 client10/10。均有修复前直接失败再转通过的证据。独立账本云验证见上文；最终全量/check/lint由主控在当前实现稳定后运行并记录。日志在tmp/closeout-*。

此前旧DevTools签名session连接失败，需新prewarm；Edge启动后扩展已自动连接。新轮浏览器稿不再是实现目标；独立账本原生UI实图与用户验收尚待主控记录，不能宣称已上线或UI完成。

## 授权与桌面边界修复

- 误用小写 `codex` 触发新MCP客户端授权；原配置实际为 `Codex`。改为读取原配置后状态读取、模拟器编译均真实成功，没有新增授权。`scripts/dev/wechatide-local.js` 固定读取客户端名/Token，处理Windows中文stdin编码、失败非零及秘密遮蔽；4/4测试通过。
- 主控为恢复最小化窗口和切换320px设备调用前台激活，违反用户对日常后台工作的预期；这不是日常capture主动抢焦点，也不能证明全部超时由最小化导致。用户明确要求不再抢桌面后，停止所有激活、改尺寸、预热。
- `ui:prewarm` 默认拒绝，只有本次明确前台授权对应的 `WEAPP_ALLOW_FOREGROUND_PREWARM=1` 才允许启动；无opt-in不spawn/launch回归通过。日常失败不能自动升级为前台恢复。
- 最新全量 `tmp/independent-final-test.log`：1458项、1452通过、6跳过、0失败；check通过，lint 0错误42警告。第一次全量的唯一失败为截图测试读取共享Git快照的隔离缺陷，已局部固定该用例快照，整文件46/46后全量通过，不标成既有波动。
- 用户明确要求原生至少达到已批准浏览器演示水平；随后补齐发起卡片全宽CTA/最近行，以及water新建提示、添加球友入口、层级。直接water88/88、launch/截图37/37通过，check通过。
- 320px后台批次 `tmp/independent-runs/320/simulator-frame/2026-09-12T13-06-25-092Z-26220-67c32955/manifest.json` 三项机器证据通过，但主控实图发现历史弹层样式失效，因此不算视觉验收。正在局部修复。390/430新版尚未补验，不为补图再次抢桌面。

## 正常尺寸恢复与最终本地证据（21:37）

- 用户手动切换iPhone12/13(Pro)，实际window390×671、screen390×844。新增显式 `--rebind-viewport 390`：先验证原launch receipt、listener PID/启动时间、SDK、projectBinding链和当前源码，再两阶段challenge，中间只用已授权Codex MCP后台编译。保留原launch来源、记录320→390；不改设备、不launch/activate、不手改receipt。第二阶段全部检查通过，随后只读doctor全项通过。原session路径仍为tmp/independent-320/session.json，文件名不代表当前宽度。
- 最新全量日志 `tmp/independent-closeout-final-test.log`：1464项、1458通过、0失败、6跳过。随后新增viewport绑定两条测试，整截图工具50/50通过（tmp/independent-viewport-rebind-test.log），未再次全量。最终check通过（tmp/independent-final-check.log），lint 0错误42警告（tmp/independent-final-lint.log）。
- 320正常实图：13-12-45批次candidate的新账、历史及legacy房主/成员流水；历史空态13-16-27、错误态13-17-50独立成功。主控亲眼检查，两隔离评审主要三图无P0/P1；共同认可CTA层级、长标题和边界，源码44px核对与仅图不证明像素触达的提醒并不矛盾。采纳可见状态通过，保留交互覆盖限制。
- 390三项批次 `tmp/independent-runs/390/simulator-frame/2026-09-12T13-33-00-281Z-74180-9d01cd54`：launchRecentWater、waterIndependentNew捕获成功；history被样式合同拒绝（position static/display block），整批未晋升。主控已检查前两张candidate正常。
- 390历史正常独立成功并晋升：`tmp/independent-runs/390/simulator-frame/2026-09-12T13-34-26-916Z-76492-6ee52f5a/manifest.json`；空态13-35-36-413Z-59352-d952af9a、错误13-36-17-561Z-53668-67f96d29同样独立通过。发布图在tmp/independent-shots/390/simulator-frame。主控已亲眼检查三种历史状态。
- 390发起/新账/历史正常三图，两隔离评审均无新增P0/P1，结论一致：绿白层级、全宽新建/添加、长标题和底部安全区可见状态正常。主控采纳，无需进一步样式修改。430、键盘、完整交互和最终用户验收未覆盖；fixture截图不证明线上云链路。
- 截图样式门禁现在同时核验元素与computed style，已避免无样式图冒充通过。相邻case同一路径连续reLaunch、中间省略中性页重建是批次与单跑的已观察差异；Element.style每次实际请求而非值缓存。未证明它是内部根因，未放宽门禁或增加盲重试；保留为批次工具限制，不声称超时/失样式彻底修复。
- 本轮没有commit、push、PR、preview、upload、云部署、真实数据写入。独立账本每次重新添加球友，旧账和旧邀请保留；云新增接口及索引仍待独立部署授权。文档本次更新后，下次截图仍需按既有流程刷新源码签名。
