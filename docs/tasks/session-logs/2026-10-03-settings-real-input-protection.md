# 设置页真实输入保护复核

本阶段关闭第4项“实际输入绑定与后台刷新保护”本地验证缺口，不关闭真机慢网、云保存/重试或整页视觉验收。仓库main/master/b571c687，既有脏树保留；没有修改应用源码、业务数据、身份缓存或原生API。

## 实际执行和证据

6.1 Sol high在ignored tmp准备探针，主控读全脚本后执行。`tmp/authorized-ui-after-install-20261003/settings-input-protection-probe.cjs` SHA256 `36a821bb51cd4fe654204e2a10d93b3ed3e42a35dd244f74528de9cbb3b9c99f`；语法与prepare-only通过。真实回执为同根`settings-input-real-20261003/receipt.json`和`settings-input-real.log`，终态exit0。

DevTools2.02.2609292/SDK3.17.3、390px、签名会话派生39473。初次doctor仅sourceSnapshot不符，其余7项通过；refresh产生challenge，官方simulator_refresh实际status0/result.success=true，随后refresh exit0/11项通过/changedSourceCompileProven=true。源文件从刷新到探针终态冻结，不手改session或端口。回执初末来源/身份/监听/SDK/宽度/路由/工具路径/源码绑定均8/8通过，runtimeExceptions0。

无ID settings路由返回在数据库读取前；隔离watcher/onHide及页内timer后应用合成赛事。creator仅在AppService内部从未改变的Page.openid取值，不落fixture/receipt、不打印，只有合成UI编辑资格，不是云身份权限验收。实际`InputElement.input('未保存名称')`触发bindinput；调用现有本地选分处理器选11分，再用真实Page.applyTournament应用同合成ID的后台名称、15分、5人、version2。

| 实际结果 | 回执 |
| --- | --- |
| 未保存草稿 | Page/DOM名称仍“未保存名称”；Page points11/index0，DOM“11分”，输入未禁用 |
| 权威数据及baseline | 名称“后台名称”、15分、5人、version2正常更新；hasUnsavedDraft=true |
| 页面与清理 | pageIdentityUnchanged=true，autoBack timer不存在；中性路由单页清理成功，断开/lock释放通过 |
| 外部动作边界 | save/retry、telemetry、goHome、nativeApi replacement、PNG capture均false |

选取4个处理器和10个纯依赖做源码闭包核查；这不是网络抓包。自动化readyObservedWallMs215.5031是单次本机观察，不是手机性能。未实际操作原生picker/键盘、迟到登录、慢网/页面切换、云端固定重试保存或完整视觉体验。goHome可能读取真实最近赛事并写本地缓存，本阶段未强行清缓存或替换handler以造通过。

## 验证范围

本阶段仅tmp探针及文档，沿用最近全量1648项/1642通过/6跳过/0失败，不重复应用全量；主控核真实receipt和终态。Luna只读冷核初末绑定8/8、嵌套session11/11/listener4/4、Page/DOM草稿11分/baseline15分、输入未禁用、页面隔离及清理/lock均相符，没有修改证据。最终主控核本阶段9文档92本地链接无缺失、diff通过，current33行。文档更新使旧源码签名过期，下次实际DevTools操作须重新challenge/官方编译/refresh。
