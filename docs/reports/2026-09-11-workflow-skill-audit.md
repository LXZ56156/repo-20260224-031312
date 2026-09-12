# 小程序文档与技能冗余审查（2026-09-11）

## 已批准实施结果

用户随后明确“按照你的判断开始执行”。已原位修改全局 `weapp-regression-guard`、`weapp-cloud-contract-audit` 的SKILL、引用和既有UI描述；未删除技能、未设为explicit-only、未修改Codex/MCP配置。下方原审查中的“未实施”属于此前状态，由本节覆盖。

| 统计范围 | 修改前字符数 | 修改后字符数 | 减少 |
|---|---:|---:|---:|
| 两个SKILL.md合计 | 7684 | 2552 | 67% |
| 两技能全部Markdown（含引用） | 18980 | 5375 | 72% |

这些是文件字符数，不是实测token节省。已进入当前对话的旧内容不会因修改文件而消失；后续加载使用精简版本，不能声称本轮上下文已回收。

- regression保留轻量风险索引，仅跨链路依赖/测试覆盖不明确时触发；取消项目“新UI必连读回归技能”的要求。普通圆角、截图selector、文档不触发它。
- cloud保留返回shape/root-data兼容、错误语义、权限、保留字段、版本检查、幂等与锁所有权、模板唯一源等检查；仅合同变化/后端回归触发，不因碰到云目录便触发。
- 删除的是重复正文和重复测试目录，兼容引用文件仍可打开；旧3个helper脚本未变、不再推荐作为日常第二套选测器。没有改产品测试门禁或真实UI验收。
- 既有agents/openai.yaml描述同步缩窄；未修改自动发现的默认policy，未创建新技能或同名副本。
- wechat-visual-story在补查的.openclaw/skill-workshop、.baoyu-skills、Codex/Claude修复备份、.config/cagent等技能路径仍未定位；未读取凭据/聊天库或全盘搜索。只能在找到实际文件后继续处理，不冒称已优化该项。

验证：两个quick_validate.py通过，两个agents/openai.yaml解析及描述/默认prompt约束通过，4个本地Markdown链接有效，3个旧helper与备份逐字相同；git diff --check通过。独立只读前向审查四场景通过：圆角与截图selector不加载两技能，submitScore误释锁加载云合同清单，共享同步影响不明加载回归索引；未发现新增审批、自动部署或强制双技能连读。前向审查是场景解释验证，不是宿主自动触发率实测；本轮未跑产品全量或操作DevTools。

修改前全局文件快照：仓库gitignored `tmp/skill-slimming-20260911-before.json`，按绝对路径存原文，可对照恢复。本次全局文件不属于项目Git diff，故分别做了上述验证；未commit/push/发布。

## 以下为实施前审查记录

## 结论

用户重点是 `weapp-regression-guard`、`wechat-visual-story`、`weapp-cloud-contract-audit` 的上下文负担，不是通用插件清理。前两个已定位的weapp技能确有规则重复；最值得保留的是领域风险清单，而不是又一份审批/测试/截图流程。本轮整理项目文档；未删除、禁用或修改全局skills。

## 三个技能逐项判断

| Skill | 本机实测体量（字符，不是token） | 独有价值 | 建议 |
|---|---:|---|---|
| weapp-regression-guard | SKILL 4,353；全部Markdown 11,297 | 页面链路、同步/权限邻接风险索引 | 无需作为每次小程序任务的通用前置；收成短索引或将独有内容并入项目测试文档，再考虑取消独立技能 |
| weapp-cloud-contract-audit | SKILL 3,331；全部Markdown 7,683 | root/data兼容、错误与权限语义、幂等、乐观锁和锁代次 | 值得保留为窄触发清单，仅云合同变化或后端回归时加载；去掉通用审批/选测/Windows规则 |
| wechat-visual-story | 当前会话技能目录未列出，已检索的本机skill位置未找到，未计量 | 未读到文件，不能仅凭名字判断内容与必要性 | 不能断言它当前正在占用全文上下文；找到实际SKILL.md后再审查，不能用frontend-design或官方wechatide代替它得出结论 |

已定位两项同时加载SKILL正文为7,684字符；若连全部引用Markdown读入是18,980字符，另有项目AGENTS/current/工作流的重复内容。不是每次必定全部加载，也没有调用频次/逐轮token统计，不声称这是某轮的实际token消耗。

官方说明：初始通常只有技能名称/描述，决定使用后才读完整SKILL；description影响隐式触发。因此应优先减少重复正文、收窄触发，而不是只按安装数量判断负担。[OpenAI技能文档](https://learn.chatgpt.com/docs/build-skills)

### 已确认的重复

- 两个SKILL都重复cwd/branch、授权、test:affected限制、全量测试条件、Windows wrapper和交付边界；项目AGENTS已经规定。
- regression的`references/cloud-contract.md`与cloud的`references/contract-checklist.md`重复返回形状、权限、模板等检查；不应两份同时维护。
- regression的两个shell helper和cloud的一个helper重复维护测试映射，项目已有`test:affected`及直接node:test。它们并非日常必需，还存在混合未知路径可能漏选的已知限制；建议不再推荐为第二轮检查，物理删除不是本轮动作。
- skill有价值的“可能影响哪里”与脚本的“当前实际跑哪些测试”应区分。不能因为技能列出很多邻接领域，就每次把所有测试跑一遍。

建议未来形态：AGENTS管边界；current管事实；workflow管操作；只有独有领域知识留在skill。不要再造统一超级skill。本轮未改变全局触发政策，以上是待实施取舍，不冒称已经缩短技能正文。

## 本轮已落实的文档整理

- current由215行整理为不超过50行；历史实施清单、授权、失败和会话信息完整移入`docs/tasks/session-logs/2026-09-11-before-doc-consolidation.md`。不再让多轮相反状态都叫“当前”。
- AGENTS修正手填endpoint旧说明，改为显式签名session；补doctor/refresh现有命令。完整视觉门禁迁入`docs/tools/weapp-ui-acceptance.md`，入口仍强制相关UI任务读取，双盲审及安全要求未放宽。
- Windows文档改正旧worktree仍被标为当前、旧fairness失败仍被标为现状的问题；不再复制会话端口、测试历史和截图操作。
- learnings保留独有局部经验，其余引用权威正文；原内容完整保存在`docs/archive/learnings-before-consolidation-2026-09-11.md`。
- 截图工作流按“日常/源变化/会话失效/焦点验收/故障”分流；旧现场失败移出正文；补frame输出路径和不做page比例验证的实际合同。三连焦点验收不再与日常单张命令并列造成每次都要跑的误解。

## 仍可简化，但本轮未改变的门禁

- 每个UI点都走浏览器方案，对已经批准的小修复偏重。现有规则允许已批准方案不重复审批；若进一步改成“仅新设计/方向未定时出浏览器稿”，应明确修改流程，不借文档搬移悄悄取消。
- 真实DevTools图、来源/fixture回执、失败不覆盖final、云权限和独立交付授权不是冗余，应保留。
- 纯文档也改变截图Git manifest，目前仍需双阶段refresh。可另行评估把“全仓证据快照”与“运行时代码重编译判定”分开；这涉及runner合同，不能当成删一条文档规则完成，本轮未改代码。

## 验证范围

本轮仅文档/规则组织变更：核对新增本地链接、命令别名、历史内容保留、门禁迁移与git diff --check；不运行产品全量、不操作DevTools、不刷新会话。文档已改变Git manifest，下次截图按工作流重签。未改业务、全局技能、安装或凭据配置，未提交/发布。

审查来源：本机两个skills的SKILL.md及references，当前AGENTS/package.json/test:affected/截图脚本；wechat-visual-story在已检查的Codex skills、用户.agents/skills、用户.claude、项目技能目录及Codex插件SKILL路径未定位，搜索结论不代表其他机器/客户端不存在。
