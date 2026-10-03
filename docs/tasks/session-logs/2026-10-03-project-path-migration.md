# 项目路径迁移（2026-10-03）

## 授权与顺序

用户要求先检查现状、更新相关文档与聊天接续信息，再把完整项目迁到 `D:\projects\badminton-miniapp`，不同 worktree 均在此总目录内整理。本轮只涉及本地路径、Git worktree 元数据、相应工具默认值和交接文档；不包含 commit、push、PR、preview/upload、部署或业务数据写入。

当前阶段：文档已先在旧主仓库更新，全部实体目录已迁入总目录；完整文件清单、关键hash、Git状态、npm check与lint已验证。用户随后将总目录设为Codex主要文件夹，已核验同一项目入口切换；开发命令进入main执行，旧聊天通过Junction访问新main。

## 迁移前现状

- 实际cwd：`D:\projects(WIN)\badminton-miniapp`；branch：`codex/online-audit-optimizations-20260828`；HEAD：`b571c68754e964e1a73800645f68a49d99f40f41`。
- 用户既有9份已跟踪文档改动，以及 `.playwright-cli/`、`preview-qrcodes/`、`2026-09-23-online-release-confirmed.md` 未跟踪文件；不清理、不reset、不stash、不提交。
- Git仅注册主仓库及control/production两个关联worktree；两个关联worktree原为clean。control：`codex/project-control` / `f36f964a25ced19ee5180108fb291282badbf57b`；production：`codex/production-baseline-20260814` / `55bfc4fa319ab74a33d406f05fbdab975ab8cfb7`。production名称不代表当前线上源码；线上版本仍以current链接证据为准。
- 旧worktrees目录只有nextgen-cloud-data、nextgen-product-architecture、nextgen-product-research三个空目录；备份目录另含15份独立恢复仓库与4个Git bundle，不是注册工作树，不恢复或混入当前实现。
- 总计7个旧项目目录，约3.67GB文件内容（依赖、备份、ignored私有配置、截图均包含）；目标目录原为空。所有源/目标均在D盘，使用同卷目录/子项移动保留本地内容。

## 目录映射

下表旧路径前缀为 `D:\projects(WIN)`，新路径前缀为 `D:\projects\badminton-miniapp`。

| 旧目录 | 新目录 | 角色 |
|---|---|---|
| badminton-miniapp | main | 主Git仓库与默认开发源码 |
| badminton-miniapp-control | worktrees/control | 保留原分支与HEAD的关联worktree |
| badminton-miniapp-production | worktrees/production | 历史生产基线关联worktree |
| badminton-miniapp-worktrees | worktrees/historical | 三个空目录的原样历史留存 |
| badminton-miniapp-preview | preview | 历史非Git镜像，不作为源码或当前版本证明 |
| badminton-miniapp-visual-evidence | evidence | 历史视觉证据，原图/回执不重写 |
| badminton-miniapp-worktree-backups | backups/worktrees | 2026-08-14备份与独立恢复仓库 |

总目录新增README/AGENTS作导航；原主仓库的docs、scripts、tests、cloudfunctions、miniprogram、依赖、tmp及私有配置仍整体位于main，不拆分。新worktree继续建在worktrees下。备份与历史分支不整体复用或合并。

## 文档、聊天与工具

- 更新main中的AGENTS、README、current、Windows环境说明，以及活跃脚本/配置默认路径；旧记录绝对路径保留为发生时证据，通过本表映射定位。迁移前current保存在[快照](2026-10-03-before-path-migration-current.md)。
- [聊天接续记录](2026-10-03-chat-context-before-path-migration.md)保存原项目ID、相关聊天标题/ID、近期事实及官方项目操作步骤。Codex sessions/archived_sessions位于独立的 `D:\Relocated\LIZIXUAN\Codex`，不搬动、不修改其DB或聊天文件。
- 旧主路径将保留单一Junction指向新main，接续已记录旧cwd的聊天；其他旧项目实体目录搬走，不在projects根目录保留关联worktree。
- 用户于2026-10-03选择 `D:\projects\badminton-miniapp` 总目录为Codex主要文件夹；list_projects确认项目 `local-b62ceb7c8df8710cd049297cf35d3aa2` 的path已改为总目录，原projectId保持不变。该选择取代迁移前将main设为primary的建议；当前源码工作区仍是main。总目录的AGENTS/README明确路由到main，Git/npm/测试通过显式workdir或Git -C执行。
- 微信DevTools仍需导入新main；旧签名session及preview同步manifest只作为历史记录，禁止改字符串伪造新路径证据。本轮不启动DevTools、签发session或执行preview。

## 验证计划及迁移前结果

- 已通过：两PowerShell脚本语法、两legacy Bash脚本语法、动态源码根定位；`node --test tests/weapp-hook-config.test.js tests/weapp-preview-workflow.test.js tests/mp-ci.test.js tests/wechatide-local.test.js` 共16项，10通过、6按既有Windows legacy WSL规则跳过、0失败；diff检查通过。
- 迁移后核对3个checkout的HEAD/branch/status、共同Git目录、refs/staged内容；对完整目录文件清单/长度及关键文件hash比较，并检查Git连通性。
- 迁移后运行npm check和lint确认同卷搬迁后依赖与Windows Git Bash解析仍有效；不重复业务全量测试或UI实图验收，因为没有业务/UI实现改动。
- 迁移前Git connectivity fsck通过，仅有222个dangling提示；不删除对象。历史恢复仓库仅核对可读取Git状态和相对Git定位，不以其旧基线代替current。

## 执行回执

- 两个关联worktree经git worktree move迁入新worktrees；主目录受Windows进程cwd句柄占用，整体Move拒绝。后续按已核对源/目标逐项同卷Move，未复制覆盖；隐藏.git的空源壳经Force清理，目标.git隐藏属性保留。旧主目录为空后，普通New-Item Junction仍因占用失败，改用Windows [FSCTL_SET_REPARSE_POINT](https://learn.microsoft.com/en-us/windows/win32/api/winioctl/ni-winioctl-fsctl_set_reparse_point) 在原空目录设置Junction，不关闭用户应用、不结束其他任务、不改Windows权限。
- 剩余historical、preview、evidence与backups/worktrees均完成移动；git worktree repair修复关联指针。完整前后清单比较通过：所有相对文件/目录仍在，文件长度及mtime不变，只有两个worktree的.git指针和主.git内部两份gitdir按预期改变。
- 清单覆盖130808文件、19082子目录，迁移后文件内容长度合计3667068756字节（约3.67GB，不含总目录新增导航及迁移回执）。main 53298文件，control 24386，production 1273，preview 557，evidence 189，历史备份51105；historical只含原3个空目录。
- 38个本地改动/私有配置/关键Git文件SHA-256一致；3checkout的HEAD、branch、全部refs、staged diff、dirty/untracked状态完全一致，common-dir均指向新main/.git。15个独立恢复仓库的HEAD/branch一致，备份objects/info/alternates数为0。
- 旧cwd运行Node实测realpath为新main，packageName与.git/HEAD可读取；旧父目录只剩主路径Junction，没有实体worktree散落。D:\projects根目录只有本项目总目录。
- 清单、38项hash、Git前后状态、既有dirty补丁和恢复脚本均在总目录 `backups/migration-2026-10-03/`；验证通过回执为migration-result.json。此比较在随后文档收口之前完成，本记录/current的最终说明属于明确的后续文档修改。
- 迁移执行时项目入口切换交由用户操作：当前本机应用返回名称为ChatGPT；[computer-use SKILL.md](D:/Relocated/LIZIXUAN/Codex/plugins/cache/openai-bundled/computer-use/26.930.21537/skills/computer-use/SKILL.md) 引用的guidance规定“Do not automate the ChatGPT desktop app UI”，且没有修改project folders/primary的专用工具。本轮未自动操作UI或内部状态文件；随后用户已完成总目录primary设置，主控通过list_projects复核，并保存 `backups/migration-2026-10-03/codex-primary-folder-confirmation.json`。
- 此布局限制已明确：list_projects对总目录返回isGitRepository=false；[官方项目说明](https://learn.chatgpt.com/docs/projects)规定默认Git与PR/worktree动作定位主要仓库。因此不能把‘总目录primary已切换’等同于‘应用内置Git已识别main’。本地main中的Git和现有worktree连接仍有效；保留用户总目录primary选择，后续命令显式进入main或对应worktree。
- 独立复核Git connectivity：`git --no-optional-locks fsck --connectivity-only --no-reflogs` exit 0，仅222个dangling提示，0其他输出，与迁移前数量一致；不删除对象。回执：`backups/migration-2026-10-03/git-connectivity-fsck-path-audit.txt`。
- 新main中的npm check通过（V2声明manifest、deprecated-wx-api、cloud-common）；npm lint exit 0，0错误/42警告。最终diff检查通过。日志：`npm-check.log`、`npm-lint.log`。业务全量测试未运行：本轮没有业务/UI实现修改，相关测试和工具静态检查已覆盖本次路径变更。
- DevTools未启动、未重绑或截图；提交/推送/上传/发布/部署/真实数据写入均未执行。线上、云费用和产品未完成项继续见current，不以目录迁移推导它们已经闭合。
