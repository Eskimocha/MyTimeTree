# MyTimeTree V1.0 — 开发任务拆解（TDD）

工作目录：`/Users/fangkai/编程/mytimetree-tdd`  
分支：`feature/v1-tdd`  
推荐顺序：E0 → E1 → E2 → E3 → E4 → E5 → E6 → E7 → E8（E9 可并行 stub）

状态约定：`Todo` / `Doing` / `Done`；每条任务默认产出：`tests/...` 先于 `src/...`。

---

## E0 — 工程基座与 TDD 脚手架

| ID | 任务 | 验收（测试/行为） | 状态 |
|----|------|-------------------|------|
| E0.1 | 包结构 `src/mytimetree`、pytest、覆盖率配置 | `pytest` 可发现测试；`pytest-cov` | Done |
| E0.2 | 可注入 `Clock` / `Minutes`（分钟整数）值对象 | Asia/Shanghai；Balance 非负 | Done |
| E0.3 | SQLite schema 迁移骨架 + 参数化查询约定 | 建库成功；idempotent | Done |
| E0.4 | 错误类型与结果对象（DomainError） | 统一异常断言 | Done |

## E1 — 时间账户

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| E1.1 | 开户：名、密码 hash、利率；首户强制 | 无账户时拒绝其他业务 | Done |
| E1.2 | 新增账户 / 列出账户 | 多孩场景 2+ 账户 | Done |
| E1.3 | 切换当前账户（会话/本地状态） | 隔离：A 的流水不可被 B 读到 | Done |
| E1.4 | 账户属性预留字段读写 | 未知字段不丢 | Done |

## E2 — 账本与交易（核心）

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| E2.1 | 不可变流水写入；禁止改删 | DB/API 层测试失败于 update/delete | Done |
| E2.2 | 余额由流水重算（资产/负债/净值） | 给定流水序列断言余额 | Done |
| E2.3 | 支出：一键默认分钟 + 手动分钟 + 可选摘要 | | Done |
| E2.4 | 借：原子写 3 条流水 `borrow`+`deposit`+`spend`（同 correlation_id）；害虫+1 次；还入优先偿债、超额记资产 | 余额与挂件断言 | Done |
| E2.5 | 还：预设场景/自定义；还清→啄木鸟 | | Done |
| E2.6 | 手动存入 →星；自动派发/结息不加星 | 100 星→太阳 | Done |

## E3 — 自动作业流

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| E3.1 | 日结息：资产/负债本金分开；**日利率**（非年利率）；负债日利率默认=资产日利率/2；不结果实 | `floor(本金×日利率)` | Done |
| E3.2 | 工作流：结息写流水 →（月末则对账）→ 备份 | 顺序断言 | Done |
| E3.3 | 01:00（Asia/Shanghai）自动派发 | 只跑目标账户 | Done |
| E3.4 | Job runner 可手动触发；Clock 固定 UTC+8 | 便于 TDD/运维 | Done |

## E4 — 魔法树

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| E4.1 | 阶段映射纯函数（输入=**净资产**；规范化区间表） | 边界值；负债拉低净值可降级 | Done |
| E4.2 | 挂件计数器状态机 | 星/太阳/虫/鸟；月均→果（显示） | Done |
| E4.3 | 实时月均净资产分级显示：均=Σ每日结算净值÷天数；≥100→1；n≥2 时 `4×(n-1)`；达标即显示 | 快照+假时钟 | Done |

## E5 — 设置与安全

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| E5.1 | **每账户**设置 CRUD（派发、默认支出/存入、利率、预设文案） | 切换账户后设置隔离 | Done |
| E5.2 | 密码校验、权限隔离中间件 | 越权 403 | Done |
| E5.3 | 危险操作二次确认 token | 改利率需一次性令牌；过期/错账户/错 action 拒绝 | Done |
| E5.4 | 输入消毒/长度限制（摘要等） | 注入样例被拒或转义；写入流水前消毒 | Done |

## E6 — 备份、对账、持久化体验

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| E6.1 | 日备份产物（流水+资产负债+设置）到外部目录 | 文件存在且可解析；`BackupService` list/get | Done |
| E6.2 | 备份下载链接 API | `GET /api/backups`、`GET /api/backups/{file}` | Done |
| E6.3 | 月末对账：上月末余额 ± 本月流水 = 本月末 | 人为造差异报 fail；月末另写 `monthly_reconcile` 产物 | Done |
| E6.4 | 关闭前未保存检测钩子（前端+API flush） | `PersistenceGuard` + `/api/persistence/*`；`can_close` | Done |

## E7 — 流水展示与数据分析

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| E7.1 | 流水查询（分页、按账户、分类过滤） | `LedgerQueryService` + `GET /api/ledger` | Done |
| E7.2 | 中文环境：进账红 / 支出绿（展示层配置） | `domain/display`；`en` 预留相反配色 | Done |
| E7.3 | 周/月趋势聚合：资产负债、利息、流水 | 固定数据集；`/api/analytics/weekly|monthly` | Done |

## E8 — Portal UI（移动优先）

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| E8.1 | 线框/原型初稿（浅色儿童主题）→ 评审 | `docs/portal-design-checklist.md` + SPA 原型 | Done |
| E8.2 | 最外层账户选择/切换壳 | bootstrap + switch API / UI | Done |
| E8.3 | 主屏：资产/负债/树/主按钮（支/借/还） | `/api/portal/home` + 动作 | Done |
| E8.4 | Tab：流水 | 接 E7 ledger + 红绿配色 | Done |
| E8.5 | Tab/页：设置、分析简报 | settings + weekly/monthly | Done |
| E8.6 | 首启强制开户引导 | `needs_onboarding` | Done |

## E9 — 会员与在线预留（Stub）

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| E9.1 | Membership 表/接口返回「未启用」 | 不阻塞主路径；`GET /api/membership` | Done |
| E9.2 | 远程同步点位注释与空实现 | `RemoteSyncClient` + `POST /api/sync/push` skip | Done |

---

## 建议首个 Sprint（约 1 周）

1. E0 全部  
2. E1.1–E1.3  
3. E2.1–E2.3  
4. E4.1（可与 E2 并行，因纯函数）

完成后即可演示：开户 → 支出 → 流水 → 树阶段变化（只读计算）。

## 任务依赖简图

```
E0 ──► E1 ──► E2 ──► E3
              │       │
              ├──────► E4
              │
              ├──────► E5
              │
              └──────► E6 ──► E7 ──► E8
E9（stub，可随时）
```
