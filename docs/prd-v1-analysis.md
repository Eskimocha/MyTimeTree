# MyTimeTree V1.0 — 需求分析（开发前）

- 文档版本：与产品说明 V1.0（2026-07-22，Eskimocha）对齐
- 分析日期：2026-08-05（决策锁定同日）
- 开发模式：Test Driven Development（TDD）
- Worktree：`/Users/fangkai/编程/mytimetree-tdd`（分支 `feature/v1-tdd`）

## 1. 产品一句话

**家长端**时间资产理财工具：家长在自己手机上为孩子（多账户可切换）管理「时间」资产；用时间代替货币，在稀缺约束下通过存、借、还、结息与「魔法树」激励，疏堵结合管理手机/上网时间。孩子侧对账邮件为后续能力，V1 不实现。

## 2. 范围界定（V1 In / Out）

### In Scope（V1 必须交付）

| 模块 | 能力 |
|------|------|
| 账号 | 首启强制开户；多账户新增/切换；密码；利率约定；预留账户属性字段 |
| 资产 | 时间资产、时间负债、时间净资产；不可篡改流水 |
| 交易 | 支出、借（随借随用=2 笔流水）、还、家长手动存入、自动派发、资产/负债分开结息 |
| 魔法树 | 按净资产生长；星/太阳/果/害虫/啄木鸟（结息不加星） |
| 门户 UI | 家长端单 Portal；一屏主交互；Tab 流水；浅色儿童主题；移动优先 |
| 作业流 | 每日 0 点结息→写流水→备份；每日 1 点自动派发 |
| 备份/对账 | 日备份（流水+资产负债+每账户设置）；月末自动对账 |
| 分析 | 月/周：资产负债、利息、流水趋势 |
| 设置 | **每账户**独立：支出/还入默认、派发、利率等 |
| 安全/持久化 | 防注入、账号隔离、危险操作二次确认、关页前保存检查 |

### Out of Scope / 仅预留（V1 不实现完整能力）

- 完整会员权益在线库（仅预留接口/表结构）
- 邮件查账（后续完善）、新时间金融产品
- PC 专属布局
- 完整「名词解释 / 竞品调研」文案体系
- 非中文环境下的字体配色细则（仅配置项预留）

## 3. 领域模型（核心实体）

```
Account（账户 = 一个孩子画像，由家长操作）
  id, name, password_hash, attributes(json预留), created_at

BalanceSnapshot（余额快照，可由流水重算；日终可落库）
  account_id, asset_minutes, liability_minutes, net = asset - liability, as_of

LedgerEntry（不可变流水）
  id, account_id, category, amount_minutes, signed_effect, summary,
  correlation_id(optional), created_at, meta(json)  — 禁止 update/delete

Category: spend | borrow | repay | deposit | auto_grant | auto_interest
  # 借（随借随用）= 连续写入 3 条：borrow（负债+N）+ deposit（资产+N）+ spend（资产−N），共用 correlation_id
  # 还 = 优先还负债；超出部分记 deposit（资产+）；仅对有变化的一侧写流水

TreeState（由净资产派生阶段 + 挂件计数持久化）
  stage(from net), fruit_count, golden_fruit_count, pest_count, woodpecker_count

OrnamentEvent（挂件事件，建议可审计）
  type: fruit | golden_fruit | pest | woodpecker, reason, at

Settings（**每账户独立**）
  account_id, daily_grant_minutes, default_spend_minutes, default_repay_minutes,
  asset_interest_rate, liability_interest_rate(= asset_rate/2 默认可改),
  # 以上均为【日利率】，例如 0.01 = 每天 1%
  repay_presets[], display_colors(预留), ...
  # 调度时钟固定 Asia/Shanghai（UTC+8）；账户级 timezone 字段暂不启用

BackupArtifact
  path, created_at, kind: daily | monthly_reconcile

ReconcileReport
  period, expected_vs_actual, ok/fail, details
```

**账户切换层级**：最外层选中 `current_account_id`（孩子）后，Portal 内一切读写与设置均绑定该账户。

## 4. 业务规则（已锁定，2026-08-05 产品确认）

### 4.0 决策记录

| # | 决策 | 状态 |
|---|------|------|
| D1 | 生长阶段看 **净资产** `asset − liability` | 已锁定 |
| D2 | 不同交易分开记流水；「借且强制消费」= **3 笔**：`borrow` + `deposit` + `spend`；还入超额进资产 | 已锁定 |
| D3 | **结息不加星** | 已锁定 |
| D4 | 负债按日计息；资产/负债本金分开；利率为 **日利率**（非年利率）；负债日利率默认=资产日利率/2 | 已锁定 |
| D5 | App 为 **家长端**；手动存入由家长在当前孩子账户操作；邮件对账后续再做 | 已锁定 |
| D6 | **设置按账户**；多孩切换即切换该孩设置与账本 | 已锁定 |
| D7 | 日终 0/1 点统一使用 **UTC+8（Asia/Shanghai）**；设备时区不一致问题后续再处理 | 已锁定 |

### 4.1 生长阶段（半开区间；指标 = 净资产）

| 阶段 | 净资产（分钟） |
|------|----------------|
| 种子 | `[0, 20)` |
| 胚芽 | `[20, 50)` |
| 破土 | `[50, 100)` |
| 发芽 | `[100, 150)` |
| 树苗 | `[150, 200)` |
| 小树 | `[200, 250)` |
| 高树 | `[250, 300)` |
| 大树 | `[300, 400)` |
| 巨树 | `[400, 500)` |
| 结果 | `≥ 500` |

### 4.2 交易语义（分笔流水）

| 动作 | 资产 | 负债 | 流水（分开） | 副作用 |
|------|------|------|--------------|--------|
| 支出 | −N | — | `spend` ×1 | — |
| 借（随借随用） | 不变（先 +N 再 −N） | +N | `borrow` + `deposit` + `spend`（同 correlation_id） | +害虫（按「借」一次） |
| 存入 | 超额部分 +E | −min(N,负债) | 有负债则 `repay`；有超额则 `deposit`（同 correlation_id） | 每次 +星；负债归零 → +啄木鸟 |
| 手动存入 | +N | — | `deposit` ×1 | +星 |
| 自动派发 | +N | — | `auto_grant` ×1 | 不加星 |
| 资产结息 | +I_a | — | `auto_interest`（asset） | **不结果实** |
| 负债结息 | — | 按规则增加负债利息 | `auto_interest`（liability） | **不结果实** |

**计息（D4，已改为日息）**

- 设置中的利率均为 **日利率**（方便孩子心算），例如 `0.01` = 每天 1%。
- 当日利息（整分钟）= `floor(本金 × 日利率)`。
- 资产侧：以资产本金余额 × 资产日利率；负债侧：以负债本金余额 × 负债日利率（默认 = 资产日利率 × 1/2）；分开写流水。
- 结息不加星（D3）。

### 4.3 挂件

- 星：仅手动存入（`deposit` / 存入优先还债）每次 +1；**自动派发不加星**；每 100 星 → 1 太阳
- 害虫：每次「借」操作 +1（一次借一次害虫，即使多条流水）
- 啄木鸟：每次还清债务 +1
- 果（**实时显示**）：实时月均净资产 = Σ(当月每日结算净资产) ÷ 当月已过天数；缺快照日向前结转，当日用实时净值；达标即显示对应果数（不写入挂件库存、不等月末）：
  - ≥100 → 1 果
  - ≥200 → 4 果
  - ≥300 → 8 果
  - ≥400 → 12 果
  - ≥500 → 16 果
  - 通式：`n=floor(均/100)`；n=1→1；n≥2→`4×(n-1)`

### 4.4 日终工作流

```
每日 00:00（固定 Asia/Shanghai / UTC+8）
  1) 分账户：资产结息流水 + 负债结息流水（均不加星）
  2) 若当日为月末：自动对账
  3) 备份：流水 + 资产负债表 + 每账户设置
每日 01:00（同上时区）
  分账户自动派发 → auto_grant（不加星）
# 注：设备本地时区与 UTC+8 不一致时的展示/提醒策略后续迭代
```

## 5. 非功能与技术建议（V1）

| 项 | 建议 |
|----|------|
| 本地库 | SQLite（SQLAlchemy/SQLModel）；参数化查询防注入 |
| API | FastAPI；会话绑定当前 `account_id`（家长切换孩子） |
| 前端 | 移动优先 SPA（浅色明亮）；家长操作主路径 |
| 作业 | 可注入时钟的 job runner |
| 密码 | 仅存 hash；账户级隔离 |
| 流水 | 禁止 UPDATE/DELETE；借操作原子写入 2 条 |
| 备份 | 外部目录 + 下载链接 |
| 邮件对账 | V1 Out of scope / stub |
| 在线会员 | stub |

## 6. 决策状态

D1–D7 全部已锁定。设备时区与 UTC+8 不一致的 UX 处理列为后续迭代（非 V1 阻塞）。

## 7. TDD 原则（本仓库约定）

1. 先写失败测试 → 最小实现 → 重构  
2. 领域规则（阶段、结息、挂件、对账）**纯函数优先**，与 UI/DB 解耦  
3. 时间与随机性全部可注入（`Clock`）  
4. 集成测试覆盖：流水不可变、账号隔离、借=2 笔原子、日终工作流顺序  
5. 每个 Epic 以红灯测试清单开工，绿灯后才进 UI
