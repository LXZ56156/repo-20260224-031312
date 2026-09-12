# 华为云 Flexus 迁移准备记录

> 记录时间：2026-08-29。本文只记录已购买主机的已验证状态和未来迁移门槛，不表示已迁移、已部署、已切流或已写入真实数据。

> 2026-09-11状态：用户决定迁移方案以后再商榷，当前准备继续原云开发下的小程序开发。本文的主机验证和迁移阶段仅在以后明确恢复迁移工作时参考，不作为日常开发前置。[最新接续背景](../tasks/session-logs/2026-09-11-migration-paused-development-handoff.md)

## 1. 主机事实

| 项目 | 当前状态 |
|---|---|
| 控制台名称 | `shared-app-host-01` |
| 系统 hostname | `shared-app-host-01` |
| 地域 | 华南-广州（`cn-south-1`） |
| 公网 IP | `110.41.87.36` |
| 私网 IP | `172.31.9.89` |
| 系统 | Ubuntu 24.04 Server 64-bit |
| 规格 | 2 vCPU、2 GiB 内存、40 GiB 系统盘 |
| 公网套餐 | 峰值 2 Mbit/s、100 GB 流量包 |
| 到期时间 | 2027-11-29（控制台在 2026-08-29 显示剩余 457 天） |
| 配置后容量 | 根盘约 32 GiB 可用；2 GiB swap；空载可用内存约 1.3 GiB |

以上容量适合当前小流量应用和少量附属项目。迁移前必须按真实并发、数据库体量、对象存储量、日志增长和备份保留期重新估算，不能仅按空载数据判断。

## 2. 登录与安全基线

- 本机快捷入口：`ssh huawei-app`。
- 日常系统用户：`deploy`；属于 `sudo` 和 `docker` 组。
- SSH 当前监听 `22` 和 `443`，实际跨网络管理入口暂用 `443`。
- 本机 SSH alias 位于 `C:\Users\LIZIXUAN\.ssh\config`。
- 当前有效私钥位于 `C:\Users\LIZIXUAN\.ssh\huawei_shared_app_host_01_access_ed25519`。私钥不得提交到 Git、复制到项目目录或发给其他用户。
- `root` SSH 登录、SSH 密码登录和键盘交互认证均已关闭；只允许公钥认证。root 系统密码仅保留给华为云 VNC 救援，不写入本文。
- 新协作者应使用独立 Linux 用户和独立公钥，不共享 `deploy` 私钥；离开项目时单独撤销其 key。
- Fail2ban 已保护 SSH，规则为 10 分钟内最多 5 次失败、封禁 1 小时。
- UFW 已启用，主机层允许 TCP `22`、`80`、`443`。
- 华为云安全组当前允许公网 `80/443`；`22` 仍只允许 `24.199.121.61/32`，描述为临时 SSH 配置。修改安全组会触发华为云操作保护验证，本次未绕过。

## 3. 已安装运行环境

- Docker `29.1.3`
- Docker Compose `2.40.3`
- Nginx `1.24.x`（Ubuntu 包）
- Git、curl、CA certificates
- Fail2ban、UFW
- `unattended-upgrades`，每日更新软件包清单并自动安装安全更新
- 时区：`Asia/Shanghai`

已验证服务：`ssh`、`nginx`、`docker`、`fail2ban`、`unattended-upgrades` 均为 active。

目录约定：

```text
/srv/apps       各项目源码、Compose 文件和持久化挂载入口
/srv/backups    应用级备份产物；后续必须再复制到异机或对象存储
/srv/shared     多项目共享但不含密钥的文件
/srv/www/landing 当前占位页
```

当前公开检查：

- 占位页：`http://110.41.87.36/`
- 健康检查：`http://110.41.87.36/health`，预期响应 `ok`

## 4. 当前端口限制

当前 `443` 被 SSH 占用，Nginx 只监听 `80`，因此此状态不能直接承载正式 HTTPS API。正式迁移前必须先完成管理端口方案，并保持至少一条已验证的救援路径：

1. 完成华为云操作保护验证；
2. 把 SSH 管理入口迁回受限的 `22`，或迁到单独受限的管理通道；
3. 用 `deploy` 新开会话验证密钥登录；
4. 再从 SSH 配置中移除 `443`，把公网 `443` 交给 Nginx/HTTPS；
5. 最后验证 VNC、SSH、HTTP→HTTPS、证书续期和回滚。

不得先关闭当前 `443` SSH 再测试新入口，以免锁死服务器。域名、备案、证书和微信小程序服务器域名配置也必须在切流前完成。

## 5. 小程序当前事实

- 当前小程序仍使用微信云开发，不在这台 Flexus 主机上运行。
- 仓库当前包含 15 个原生小程序页面、23 个云函数，以及按 develop/trial/release 分层的云环境配置。
- 赛事主链路是创建、配置、开赛、录分、排名、复盘；独立打水使用 `waterSession` 云函数和 `waterSessions` 集合。
- 云端权限依赖微信身份/OpenID；迁移时必须保留或明确替代身份绑定、owner/participant 权限和返回值脱敏语义。
- 当前云合同中的版本冲突、请求幂等、score lock、事务校验、缓存终态和 stale response 保护不能在迁移中静默降级。
- 本次服务器配置没有执行云函数部署、集合/index/config 写入、数据迁移、preview、upload、正式发布或真实数据写入。

## 6. 迁移前必须完成的只读盘点

迁移设计前先生成可复核清单，不直接改线上：

1. 逐一列出 23 个云函数的调用方、action、权限、超时、环境变量、共享模板和返回 shape。
2. 列出全部集合、索引、文档规模、增长速度、事务边界、TTL/归档和备份要求。
3. 统计云存储文件、头像 fileID、分享图片及其 URL 生命周期和访问权限。
4. 标出所有 OpenID、稳定 ID、owner、participant、管理员和游客权限依赖。
5. 盘点实时监听、轮询、锁、幂等 request ID、版本号和离线缓存语义。
6. 记录 develop、trial、release 的环境 ID、配置差异和当前线上版本；密钥只进入服务器 secret 管理，不进入文档。
7. 测量真实峰值请求数、带宽、数据量、响应时间、错误率和每日备份体积。
8. 明确哪些能力继续留在微信云开发，哪些迁到 Flexus；未经评审不默认全量替换 CloudBase。

## 7. 建议迁移阶段与闸门

```text
只读盘点
  → 目标架构和数据映射
  → 域名/备案/HTTPS/管理端口
  → 服务器测试环境与自动备份
  → 无真实写入的合同回归
  → 脱敏数据或空库演练
  → 小流量/只读验证
  → 明确授权的数据迁移与切流
  → 观察期
  → 明确授权的旧链路下线
```

每一阶段都要有：前置备份、成功指标、失败判定、回滚步骤、负责人和单独授权。云函数部署、真实数据迁移、DNS/域名切换、小程序 upload/发布及旧链路下线仍是不同动作，授权不可互相推导。

## 8. 以后明确恢复迁移工作时的验证参考

```powershell
ssh huawei-app
```

登录后：

```bash
hostname
id
docker version
docker compose version
sudo systemctl is-active ssh nginx docker fail2ban unattended-upgrades
curl -fsS http://127.0.0.1/health
df -h /
free -h
```

如公网 SSH 失败，先用华为云 VNC 检查 `ssh.service`、UFW、Fail2ban 和安全组，不重置系统盘，也不在未确认备份前重装系统。
