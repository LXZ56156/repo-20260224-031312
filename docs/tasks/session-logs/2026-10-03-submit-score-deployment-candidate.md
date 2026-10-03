# submitScore 部署候选与回退准备

本地候选已固化，未部署；这不是部署授权申请回执。真实隔离事务、超时余量及双手机验收尚缺，因此暂不把生产部署列为可验收完成。

## 固化内容

`tmp/submit-score-candidate-20261003/` 保存13个源文件副本、manifest和ZIP；拒绝覆盖既有候选。源树SHA256为`2609ab7e7c7af888fe5e80022bcb97037b95d2be6c6bad1fc53bf715097c2d90`；ZIP SHA256为`3a5c4fc084b7e8491e630b5371deab5487212fc41d395fe235cb1c0f442a4180`。主控重新打开ZIP逐项比对13个文件大小和SHA256全部一致。后续源有变化必须重新固化并复核，不能沿用此候选证据。

相对旧0238备份，该函数完整源包的实际差异只有`index.js`、`lib/share-activity.js`。前者包含本轮录分事务；后者为此前共享模板的分享更新有界等待修改，不能把部署描述成仅index变化。候选包含其余11个未变化文件、package.json/config.json；不包含node_modules，没有新增接收服务或其他函数。

目标仍为原环境`cloud1-1ghmqjyt6428702b`的单个`submitScore`。旧备份detail-after为Nodejs16.13、Timeout3、MemorySize256、index.main、Active；07:27主控通过已登录Edge只读查看该函数配置页，仍显示Node.js16.13、3秒、256MB、index.main、正常、修改时间2026-09-12 22:04:58。页面另明示“运行环境不支持修改”；这是该配置页能力，不推断所有API都不可迁移。URL为`tcb.cloud.tencent.com/dev?envId=cloud1-1ghmqjyt6428702b#/scf/detail?id=submitScore&NameSpace=cloud1-1ghmqjyt6428702b`。未点击编辑/测试或提交。候选没有更改runtime、超时、内存或规则，实际部署前仍须重读并比较。3秒超时是否足够完成新事务和既有分享后处理尚未实测；不能根据单元测试承诺线上时延。

package.json固定直接依赖wx-server-sdk2.6.3，但没有package-lock。若采用现有installDependency=true，转依赖的新解析不能由备份版本推定一致；执行前需选定并验收依赖打包方式，不能把源ZIP称可复现的完整安装产物。

## 已有验收与待补项

- [事务修复和确定性竞争回归](2026-10-03-score-transaction-repair.md)、[独立冷审](2026-10-03-score-transaction-cold-review.md)证明本地锁接管拒绝、原子锁删除、幂等回放及wx包装形状；当时全量1529通过/6跳过。客户端后续变化需要新的整合检查。
- 未验证真实CloudBase快照冲突、callback重试/回滚、双手机录分、提交时延及3秒余量。隔离envId仍待用户提供；对应部署、规则或测试写入需提交具体case/fixture/清理范围取得单独授权。
- 生产批准时应明确只部署此函数完整候选及实际依赖方式，保留原配置，独立验证Active/Available、代码hash、缺参只读烟测、CLS及获准测试旅程；不顺带改规则、升级SDK或部署其他函数。

## 回退来源

旧`D:\Relocated\LIZIXUAN\Codex\backups\badminton-cloudbase\2026-10-03-0238\cloud\functions\submitScore\code`及原detail/包完整性回执保留；新backup-index指向其已安装完整依赖。回退需要真实平台部署，仍是独立外部动作，必须得到明确授权；不因准备回退自动执行。候选没有改数据schema，但任何已提交比分不会因代码回退自动恢复，禁止凭旧备份覆盖生产赛事。

## 后续完整依赖候选

另行固化[完整依赖候选](2026-10-03-submit-score-full-bundle.md)，保留本13-source候选原样。13源hash与当前相同，复用原已安装6368依赖文件逐hash核验；新bundle6381文件、ZIP37,594,753bytes，固定顺序/时间重复字节一致，本机Windows Node24真实SDK及入口加载通过，无网络且未调用main。该路径关闭本地fresh install漂移风险，计划不远端重新安装依赖；CLI支持false参数已只读确认。上传接受/包限制、生产Node16及Timeout3、真实事务和规则仍未验证，未生成可直接执行的生产部署指令，未部署。最新应用回归为1564项1558通过/6跳过/0失败，业务源码没有因此改变。
