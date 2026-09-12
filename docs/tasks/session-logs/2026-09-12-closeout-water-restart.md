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

## 已授权交付执行与云端待确认

用户明确授权“提交，推送，部署好云接口”。提交前全量1466项/1460通过/0失败/6跳过；此前最终check通过、lint0错误42警告。新阶段只整理记录并修复一处文档尾空行，无产品新增变化。

已提交并推送origin/codex/online-audit-optimizations-20260828：
- a85e326：后台工具、固定Codex授权入口、工作流与历史证据。
- 9c25075：独立账本云API、23份common同步、录分锁及异步/错误合同修复。
- d1d0040：独立账本原生页面、最近/历史入口与直接测试。

未纳入Git：.playwright-cli/、preview-qrcodes/、全部tmp截图/日志和密钥。tracked源码干净，未强推或合并master，未upload/发布客户端。

原环境通过已授权WechatIDE cloud_env_list再次核实：appid wxf6f4e0b09e293521，唯一环境cloud1-1ghmqjyt6428702b。tcb CLI失去登录态，未重新登录，改用现有Codex客户端+Token的官方云工具。远端39个函数，本地23个均需部署以同步common；未删除其他16个。waterRoomMembers现有_id_与_openid_1，新openid/_id索引尚不存在。

pendingTask：
- taskId：confirmation_cloud_db_write_struct_6f974e62-0402-42c4-9345-bba0697254cb
- 原工具：cloud_db_write_struct；客户端：Codex。
- 参数：上述appid/env，action updateCollection，collection waterRoomMembers，仅CreateIndexes添加waterRoomMembers_openid_id_asc（openid ASC，_id ASC，非唯一），不删索引/集合/文档。
- 最后状态：pending，Waiting for user confirmation；未主动轮询、未重复写。
- 请求与回执：tmp/authorized-index-create.json、tmp/authorized-index-create.log。临时官方调用适配器tmp/authorized-cloud-call.cjs读取原配置，未保存/输出Token。
- 暂无函数部署请求，索引也不能称已创建。用户在DevTools确认后，先polling_task_result查询上述taskId，不重发；成功再listIndexes核验，然后逐个cloud_fn_deploy --remote-npm-install，最后cloud_fn_info读取23个状态。函数名来源cloudbaserc.json，目录固定canonical cloudfunctions/<name>。

这不是聊天授权缺失，也不是MCP客户端重新授权；是官方工具自身云写确认门禁。遵守安装包references/async-task-polling.md和approval-policy.md，不代用户绕过确认。用户回来后继续既有部署授权，不再请求同一范围批准。

## 继续部署：索引成功，waterSession等待原生确认

- 查询原索引taskId返回status success/execution_success，requestId c085b3a6-4128-4d28-a310-43ed34df4746。随后listIndexes读到waterRoomMembers_openid_id_asc，openid ASC、_id ASC、Unique false，大小20480，已核对无误。回执tmp/authorized-index-poll.log、tmp/authorized-index-after.log。
- 新pendingTask：confirmation_cloud_fn_deploy_9fce9528-09e5-4463-a006-5a7b2b500b53；工具cloud_fn_deploy，客户端Codex，appid wxf6f4e0b09e293521，env cloud1-1ghmqjyt6428702b，path D:/projects(WIN)/badminton-miniapp/cloudfunctions/waterSession，remote-npm-install true。最后状态pending/Waiting for user confirmation，尚不代表部署成功。
- 回执tmp/authorized-deploy-waterSession.log。用户确认回来后先polling_task_result查该taskId，勿重发。成功再核验waterSession，并继续其余22函数（cloudbaserc清单排除已成功的waterSession）。没有启动其余函数部署，无真实账本写入。源码未变，不重跑测试。

## 云部署完成与CLI恢复（2026-09-12）

- 原waterSession pending请求查询成功，执行回执含13files/45.1KB；未重发。DevTools读取Active；CloudBase CLI详情再次确认Active/Available、InstallDependency TRUE。
- 用户明确要求持续授权或改回CLI。只读核实当前DevTools2.02.2609102云部署每次进入runWithUserConfirmation，checkUserConfirmWithHistory不读取/保存许可；界面残留Always文案不构成可用持续授权。未修改内部权限状态。
- CloudBase CLI3.7.3通过device flow完成一次登录，env list返回原环境cloud1-1ghmqjyt6428702b/NORMAL。此后使用fn deploy --force --install-dependency true --json，显式绑定原env，依次部署其余22函数；每个核验Active/Available/InstallDependency TRUE，无失败、无重复部署waterSession。登录凭据留在CLI管理范围，未入库或日志。
- 最终cloud_fn_info按cloudbaserc全部23名称读取，expected23/received23/Active23/bad[]；CLI逐项详情验证均通过。其余16个远端历史函数未删除或变更。
- 新索引waterRoomMembers_openid_id_asc：openid ASC、_id ASC、非唯一，远端确认存在。water_feature_flags revision11、v2Read/rosterWrite/ownerWrite/memberWrite/correctWrite/reverseWrite/createRoundWrite均true、emergencyReadOnly false、灰度名单空；仅只读核验，未改flags。
- 证据：tmp/authorized-water-poll.log、authorized-cli-water-detail.log；tmp/authorized-cli-deployed.txt（22唯一函数）、authorized-cli-deploy-<name>.log、authorized-cli-detail-<name>.log；tmp/authorized-final-info.log；tmp/authorized-index-after.log、authorized-flags-read.log。运行证据属于本机tmp，不含在Git发布中。
- 本轮云代码来源9c25075（最终实现d1d0040）；之后仅文档变化。完整测试1466项/1460通过/6跳过/0失败，check通过，lint0错误42警告。部署阶段未改源码，不重复全量测试。
- 已完成用户授权的提交、推送、云接口与索引部署。没有客户端upload/正式发布，也没有写真实打水账本做冒烟；云端部署/状态核验不冒充客户端线上交互验收。无待确认云请求。未来已授权部署默认CLI，过期时恢复一次登录，不逐函数转IDE请求确认；入口见windows-dev-environment.md。

## 用户报告运行故障后的修复（22:15起）

- 用户实图明确waterSession实际执行Cannot find module ./lib/common。此前Active/Available验证不足，不能证明运行时可加载；本轮首先tcb fn invoke重现错误，CLI exit0/InvokeResult0同样包裹RetMsg.errorCode1。旧回执tmp/water-broken-invoke.log。
- 当前IDE安装代码路径证据：cloud_fn_deploy递归readdirDeep默认normalize:false，Windows生成lib反斜杠common.js；ZipService把该key直接交adm-zip，未归一化。这解释Linux require失败与本地Windows下载解压后lib存在的差异。未保留修复前原始ZIP，故不声称已按字节检验旧ZIP；源码路径与运行A/B共同支持IDE打包路径问题。
- 使用已登录CLI重新完整部署waterSession，日志tmp/water-cli-repair-deploy.log；随后真实调用返回预期PERMISSION_DENIED而非模块错误。下载修后云端原ZIP（不输出签名URL），7071entry、反斜杠0、index.js和lib/common.js均存在。其余22函数此前CLI部署，本轮未重复部署。
- 23函数实际无业务写入烟测：tmp/cloud-runtime-audit/<name>.json与summary.json。全部进入应用逻辑；getUserProfile在无小程序OPENID的CLI下PROFILE_LOAD_FAILED，仅证明handler已加载，不代表用户身份/资料读取验证。三个legacy throw严格匹配预期缺参错误，绝不泛化任何异常为pass。
- 新scripts/cloud-runtime-smoke.js管理固定无写入payload与嵌套RetMsg校验；部署脚本在状态检查后调用它。tests/deploy-runtime-verification.test.js先复现Active+CLI成功但MODULE_NOT_FOUND被误判，再证明新门禁拒绝；工具直接5/5通过。
- 新隔离串联测试：water客户端wrapper→真实cloud.call→云handler共享内存DB，新建/重试/加人/访客旧链接/加入/记账幂等/撤销/历史/再次新建隔离；赛事真实8handler创建→加人→设置→开赛→锁→错会话拒绝→提交完成排名→幂等→重置→删除。均无远端写入，未模拟CloudBase事务并发或完整真实页面交互。
- 用户补充禁止完整报错上屏：新增docs/specs/user-facing-errors.md单权威与AGENTS引用。core/cloud统一脱敏，保留业务code/state及诊断rawMessage，writeErrorUi不再弹开发修复提示；water新建/历史/流水/详情/加入等错误区均经统一入口。开发/体验/正式均禁止SDK堆栈、路径、trace/诊断号；直接103/103通过。
- 最终全量tmp/runtime-fix-full-test.log：1478项/1472通过/0失败/6跳过；check通过；lint0错误42警告；git diff --check通过。随后仅更新本记录与current，未改实现。
- 原生UI验证未完成：后台两阶段source-refresh的首阶段成功，MCP编译成功；第二阶段官方automator response timeout导致Node退出，留下tmp/independent-320/session.json.lock（旧PID52624已不存在）。按现有截图合同仅新prewarm能恢复。遵守用户不抢桌面要求，未激活/改尺寸/手删锁/预热；未执行已准备的authenticated-read-audit，也未取得新waterFriendlyLoadError真实图。
- 线上云启动故障已修好；本地错误提示实现与规则可测试，但不声称完整UI人工验收或身份链路已完成。本次新增客户端/工具/测试/文档尚未提交推送；后续先取得用户对一次前台预热的允许，恢复真实验收后再收口。未upload/正式发布客户端。

## 前台恢复与最终真实验证（用户明确允许后）

- 用户明确“现在可以抢桌面了，我不在电脑前，继续推进”，本轮无需重复申请。用WEAPP_ALLOW_FOREGROUND_PREWARM=1与新未占用端口39543在原session文件完成合法失效锁恢复；宽390、SDK3.17.3、同exact worktree，未手改回执或锁。
- tmp/authenticated-read-audit.cjs在签名会话校验后，通过小程序wx.cloud.callFunction只读调用真实线上接口：getUserProfile=>PROFILE_READY/ok true，waterSession listLedgers=>WATER_LEDGERS_LOADED/ok true。回执tmp/runtime-fix-authenticated-read.log不输出用户资料或账本内容。补足CLI无OPENID时仅启动验证的限制。
- 首次截图路由超时且清理失败，页面仍home；Computer Use激活既有DevTools并确认无弹窗，随后发现marker缺失但其余身份/源码检查通过，按相同源码refresh重新绑定后截图成功。保留失败日志，不声称工具偶发路由问题已根治。
- 主控亲眼检查390px真实DevTools错误态：只有“暂时打不开”“暂时无法打开打水账本，请稍后重试”和全宽重试按钮，无SDK/路径/堆栈/诊断号、无裁剪遮挡。当前源码fixture图证明渲染，103项直接错误回归证明实际SDK失败经过脱敏；不把fixture图说成真实云故障截图。
- 成功回执：tmp/runtime-fix-runs/390/simulator-frame/2026-09-12T15-14-15-023Z-62972-3634553c/manifest.json；发布图tmp/runtime-fix-shots/390/simulator-frame/waterFriendlyLoadError.png。仅局部错误提示变更，无明显视觉重做或高密度选择变化，不新增双盲评审矩阵。
- 沿用1478项/1472通过/6跳过/0失败、check通过、lint0错误42警告；本阶段未改产品代码，不重复全量。云端waterSession修复已部署；客户端错误提示、部署门禁、两条跨handler串联测试及文档本次提交推送。未upload/正式发布客户端，未对真实账本执行写入烟测。
