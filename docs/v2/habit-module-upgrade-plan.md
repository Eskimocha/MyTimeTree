# MyTimeTree —「习惯养成」模块升级计划（TDD-first）

- 文档类型：升级计划 / 开发前需求与 Epic 拆解（**仅计划，不实现**）
- 产品版本语境：习惯养成落地后产品线称为 **MyTimeTree 2.0**（相对已交付的 **1.0**）
- 对齐基线：V1.0 已交付（`Account` / `LedgerEntry` / `deposit` / `auto_grant` / 魔法树 / Portal）
- 开发模式：Test Driven Development（先红 → 最小绿 → 重构）
- 分支建议：`feature/habit-*`（Epic **H0–H9**，避让 E0–E9）；**版本/文件管理见 §15（正式约定）**
- 产品目标一句话：把「好行为 → 可存时间」从线下口头约定收进 App；用 Fogg（Motivation / Ability / Prompt）同时设计**孩子微习惯**与**家长记录行为**；激励为**三通道**（时间兑换 · 内生情绪 · 庆祝含总表大庆祝）。

---

## 0. 背景与问题陈述

### 0.1 现状（V1）

| 能力 | 现状 |
|------|------|
| 时间资产 | 家长为孩子账户 `deposit` / `auto_grant`；流水不可变；余额由流水重算 |
| 「好行为奖励」 | **发生在 App 外**：家长口头约定后，在 Portal 手动存入分钟 |
| Prompt | 弱：无习惯清单、无打卡、无规则驱动的入账 |
| Motivation | 主要靠手机时间激励 + 魔法树果实；习惯内生情绪与**庆祝（尤其总表大庆祝）**未产品化 |
| Ability | 无技能教学；亦无「只做微习惯」边界；**家长记录**缺少话术/线下庆祝等 Ability 支持 |
| 家长 Prompt | 无待记录小红点；成败依赖家长自觉打开手动 deposit |

### 0.2 升级要解决的核心问题

**可存时间从哪里来？**  
V1：家长判断「今天表现好」→ 手动 `deposit`。  
本升级：家长（或规则）预先配置「微习惯 ↔ 分钟」兑换规则 → 孩子完成打卡 / 家长确认 → **规则引擎产出可入账分钟** → 写入账本（建议新流水类别或带 `meta` 的 `deposit`，见开放问题 Q1）。

---

## 1. 目标与 Fogg 行为模型映射

### 1.1 产品目标

1. **微习惯养成**：只支持「一次可完成、无需 App 教技能」的行为（刷牙、按时睡觉、读一页书等）。
2. **习惯 → 时间兑换内化**：规则可配置、可兑换、可审计，替代线下口头协议作为主路径；保留家长手动 `deposit` 作兜底。
3. **三要素同时设计**，避免只做打卡（纯 Prompt）：

| Fogg 要素 | 产品含义 | 本模块设计要点 |
|-----------|----------|----------------|
| **Motivation** | 想做 | **三通道**（见 §4.1）：① 手机时间兑换 ② 习惯内生情绪路径 ③ **庆祝**（单次小庆祝 + **大庆祝/总表复盘**，见 §4.3）；家长侧另有记录动机（见 §4.4） |
| **Ability** | 能做 | 孩子侧：只开放微习惯 + 一步打卡。**家长侧**：降低「记得记」的难度——一键记录、话术模板、线下庆祝动作指引（可配图），见 §4.4 / §5.4 |
| **Prompt** | 被提醒去做 | 孩子：今日清单 / 日成就。**家长**：待记录提醒、小红点、好习惯记录总表入口；见 §6 |

### 1.2 非目标（本阶段 Out）

- 用 App 教授复杂技能（乐器完整练习法、系统作文课等）
- 孩子独立端完整 App（仍以**家长端 Portal 为主**；孩子参与形态见开放问题 Q2）
- 替代 V1 日结息 / 自动派发 / 魔法树既有规则（仅**挂钩**，不改 D1–D7）
- 医疗/心理诊断承诺（情绪路径文案为激励话术，不做疗效宣称）

---

## 2. 业务流（端到端）

```
[种子库 / 自定义微习惯]
        │
        ▼
[兑换规则]  habit_id + 条件(每日1次/连续N天…) + minutes_reward
        │
        ▼
[家长 Prompt]  待记录提醒 / 小红点 → 一键记好习惯 (HabitLog)
        │
        ├─► [三通道 Motivation]
        │     ① 兑换分钟  ② 情绪路径  ③ 小庆祝（单次）
        │
        ▼
[兑换 / 入账]  待入账分钟池 → 确认兑换 → Ledger(deposit 或 habit_reward)
        │
        ▼
[展示 · 大庆祝]  好习惯记录总表 → 展示 / 庆祝 / 复盘
        │
        └─► [家长 Ability] 亲子话术 + 线下庆祝建议（击掌等，可配图）
```

### 2.1 角色与操作

| 角色 | 操作 |
|------|------|
| 家长 | **核心记录者**：选种子/建微习惯；设兑换规则；**记录孩子好习惯**；确认兑换；打开总表做大庆祝与复盘；使用话术/线下庆祝建议 |
| 孩子（若启用轻量参与） | 在家长监督下打卡；体验小庆祝与总表大庆祝（Q2） |
| 系统 | 日界线（Asia/Shanghai）结算日成就；家长待办小红点；防重复兑换；与账本原子关联 |

### 2.2 「可存时间如何产生」（规则语义草案）

1. **完成事件**：某账户某日某习惯满足完成条件 → 产生 `EarnedCredit`（待兑换分钟，**尚未**进资产）。
2. **兑换**：家长确认（或规则设为 auto-redeem）→ 调用账本入账 → 资产 `+N` 分钟；建议副作用与现有 `deposit` 一致（+果实），或单独策略（Q3）。
3. **上限**：每习惯每日最多兑换一次；可选账户日上限，防止刷规则。
4. **兜底**：家长仍可直接 `deposit`（摘要可标「线下奖励」），与习惯模块并存。

---

## 3. 领域模型草案（对齐现有命名）

沿用 V1：`account_id` 隔离、`Minutes` 整数分钟、`Clock` 可注入、流水禁止 update/delete、时区 `Asia/Shanghai`。

```
HabitTemplate（种子库，只读或版本化）
  id, slug, title, category, ability_tier=micro,
  motivation_paths[]  # {kind: approach|avoid, emotion_copy, celebration_key}
  default_minutes_hint, prompt_hints[], active

Habit（账户启用的习惯实例）
  id, account_id, template_id?, title, category,
  motivation_override?, archived_at?, created_at

ExchangeRule（好行为 ↔ 时间）
  id, account_id, habit_id,
  minutes_per_completion,  # Minutes
  cadence: daily | streak_n,
  auto_redeem: bool,
  daily_cap_minutes?, active

HabitLog（完成记录，不可变或仅允许「作废」标记）
  id, account_id, habit_id, completed_at, source: parent|child|import,
  day_key: YYYY-MM-DD(+08:00), meta_json

EarnedCredit（待兑换 / 已兑换）
  id, account_id, habit_log_id, minutes, status: pending|redeemed|void,
  ledger_entry_id?, redeemed_at?

DailyAchievement（派生视图或物化）
  account_id, day_key, completed_habit_ids[], minutes_earned, minutes_redeemed

HabitRecordBoard（好习惯记录总表 — 大庆祝/复盘的聚合视图）
  account_id, range_from, range_to,
  entries[]  # HabitLog 投影：habit, category, day_key, minutes, celebration_done?
  stats: total_logs, by_category, streak_summary, minutes_redeemed

OfflineCelebrationHint（线下庆祝建议种子，非 App 内动作）
  id, slug, title, body, image_key?, effort: easy|playful,
  suitable_for: after_log | weekly_review | board_milestone

ParentPromptState（家长侧 Prompt）
  account_id, pending_unlogged_habits_today, badge_count,
  last_nudge_at, snoozed_until?

ParentScript（亲子沟通话术）
  id, habit_category?, situation: before_habit|after_log|review,
  script_text, tone: warm|playful|firm_kind
```

**Ledger 衔接（待 Kai 拍板 Q1）**

- 方案 A：新 `LedgerCategory.HABIT_REWARD`（展示独立，对账清晰）
- 方案 B：仍用 `deposit`，`meta.habit_log_id` / `summary` 前缀约定  
推荐规划默认：**A**（测试断言更干净）；实现前锁定。

---

## 4. Motivation：不止手机时间

### 4.1 三通道激励

庆祝是与「手机时间兑换」「习惯内生情绪路径」**并列的第三通道**，而非附属特效。

| # | 通道 | 内容 | 验收方向 |
|---|------|------|----------|
| ① | **外在 · 手机时间** | 兑换分钟 → 资产/树 | 与 E2/E4 集成测试 |
| ② | **内生 · 情绪路径** | 每习惯至少 1 条 approach（趋利）+ 1 条 avoid（避害） | 种子库测试；记录后 UI 展示对应文案 |
| ③ | **庆祝** | **小庆祝**：单次记录后的 `celebration_key`（动画/音效/挂件钩子）。**大庆祝**：围绕「好习惯记录总表」的展示、庆祝与复盘（§4.3），可叠加线下动作建议（§4.4） | 契约：单次完成 → `CelebrationEvent(kind=small)`；总表里程碑/周复盘 → `CelebrationEvent(kind=board)` |

### 4.2 示例（种子文案，非最终文案）

| 微习惯 | Avoid（避害） | Approach（趋利） | 激励（情绪 / 庆祝要点） |
|--------|---------------|------------------|-------------------------|
| 刷牙 | 少牙痛、少看牙医 | 口气清新、笑容自信 | 小庆祝：闪光牙齿贴纸音效；大庆祝：总表里「卫生」类连点高亮；线下：击掌「牙齿保卫战胜利」 |
| 按时睡觉 | 少第二天没精神 | 长高/大脑充电的仪式感 | 小庆祝：月亮入睡短动画；大庆祝：本周按时睡天数条；线下：关灯前肩碰肩「充电成功」 |
| 读一页书 | 少「完全没读」的内疚 | 故事又前进了一页 | 小庆祝：书页翻动音效；大庆祝：总表阅读页数/次数复盘；线下：击掌或跳一下「又一页！」 |

原则：文案短、具体、儿童可感；**不做医疗承诺**；家长可覆盖账号级文案；「激励」列指导种子 `celebration_key` / 线下 hint 选型，**非最终文案**。

### 4.3 大庆祝：好习惯记录总表

单次打卡的小庆祝不够支撑长期动机。产品需以 **「好习惯记录总表」**（`HabitRecordBoard`）为舞台：

| 能力 | 说明 | 可测验收 |
|------|------|----------|
| **展示** | 按日/周/自定义区间列出已记录好习惯；支持按分类筛选；摘要统计（次数、兑换分钟、streak） | `GET board` 固定数据集断言条数与聚合 |
| **庆祝** | 打开总表或达成里程碑（如本周满 N 记）触发 `CelebrationEvent(kind=board)`；可选与魔法树挂件联动（Q3/Q9） | 事件 kind/原因可断言；幂等（同里程碑不重复刷） |
| **复盘** | 亲子一起看「这周我们记下了什么」；带出话术（`ParentScript` situation=review）与线下庆祝建议 | payload 含 scripts[] + offline_hints[] |

总表是 **Prompt + Motivation** 的交汇：家长因「看得见积累」更愿继续记；孩子因「被看见」获得第三通道激励。

### 4.4 家长行为引导（成败关键路径）

**成败关键取决于家长是否记录孩子好习惯。** 因此家长侧必须单独按 Fogg 设计，而不是假设家长会自发打开 App 记账。

| Fogg（家长） | 设计 | 可测验收 |
|--------------|------|----------|
| **Motivation** | 强调「记下来 = 孩子被看见 + 可兑时间 + 总表可庆祝」；记录成功后给家长正向反馈（非仅孩子向） | 记录 API 返回 `parent_motivation_payload` |
| **Prompt** | 今日未记完清单、**小红点** / badge、可选推送文案键（实现可先 Web badge）；从 Portal 主屏进入「待记录」 | `ParentPromptState.badge_count` 随未记习惯增减；清零条件可测 |
| **Ability** | 记录对家长有难度（忙、忘、不知怎么夸）→ App 提供：① **一键记录** ② **亲子沟通话术**（`ParentScript`）③ **线下庆祝建议**（击掌、跳起来肩碰肩等好玩动作，**可配图** `image_key`；动作发生在 App 外） | 种子：话术 ≥N、线下 hint ≥N 且含 image_key 可选；记录路径 ≤ 约定步数（H7 UI 契约） |

线下庆祝示例（种子，非最终）：击掌、跳起来肩碰肩、转转圈击掌、贴纸贴冰箱（配图引导「怎么做」而非 App 内体感）。

---

## 5. Ability：微习惯边界与种子库

### 5.1 「微」判定（可测规则）

满足**全部**：

1. 单次可在约 **≤5 分钟**内完成（字段 `est_minutes ≤ 5`）
2. 不依赖 App 内技能教学即可执行
3. 结果可被家长用「是/否」判定（二元完成，不做模糊评分）
4. 分类落在种子 taxonomy 内（见下）

自定义习惯若不满足 → DomainError（如 `HABIT_NOT_MICRO`），测试覆盖拒绝路径。

### 5.2 分类（category）草案

`hygiene` | `sleep` | `reading` | `chores` | `sport_micro` | `emotion` | `study_micro` | `other_micro`

### 5.3 种子库规模目标

- **H1 交付**：≥ **30** 条可启用种子（覆盖上述分类各 ≥2）
- **H1.x 充实**：争取 ≥ **50–80** 条（「尽量多」但不阻塞主路径）
- 种子以 YAML/JSON fixture 入库，**测试断言** slug 唯一、双路径文案齐全、`ability_tier=micro`、激励要点字段可解析（供 §4.2「激励」列落地）

### 5.4 家长 Ability 种子（与微习惯种子并列）

| 种子类型 | H5/H9 目标 | 验收 |
|----------|------------|------|
| `ParentScript` | ≥ **12** 条（before_habit / after_log / review 各 ≥3） | slug 唯一；文案非空；situation 枚举合法 |
| `OfflineCelebrationHint` | ≥ **8** 条（含击掌、肩碰肩等）；≥ **4** 条带 `image_key` | 加载失败不阻断主路径；缺图走文字 fallback |

---

## 6. Prompt：记录、展示、兑换（含家长侧）

| 能力 | 说明 |
|------|------|
| 今日清单 | 当前账户当日未完成/已完成（家长待记录视角为主） |
| **家长小红点** | `badge_count` = 今日启用习惯中尚未记录数（或未兑换 pending，策略见 Q10）；主屏/Tab 可见 |
| 一键记录 | 家长完成 → HabitLog；防同日重复（除非规则允许） |
| 兑换 | pending credits 列表 → redeem → 账本 |
| 时间线 | 按 `completed_at` 倒序；支持按日折叠 |
| 分类视图 | 按 `category` 聚合次数与分钟 |
| 日成就 | 当日完成数、兑换分钟、连续天数（streak 可 H3+） |
| **好习惯记录总表** | 区间展示 + 大庆祝入口 + 复盘（话术/线下建议），见 §4.3 |

---

## 7. TDD 方法约定（与 V1 一致）

沿用 `docs/prd-v1-analysis.md` §7：

1. 先写失败测试 → 最小实现 → 重构  
2. 领域规则纯函数优先（兑换计算、微习惯校验、日成就聚合）与 UI/DB 解耦  
3. `Clock` 全可注入；日界线固定 Asia/Shanghai  
4. 集成测试：账户隔离、入账不可变、兑换幂等、与 Portal 接线  
5. **每个 Epic 以红灯清单开工，领域绿灯后再 UI**  
6. 状态约定：`Todo` / `Doing` / `Done`；默认产出 `tests/...` 先于 `src/...`  
7. 建议测试布局：`tests/unit/test_h*_…`（纯域）+ `tests/integration/test_h*_…`（服务/API）

**Red / Green / Refactor 节奏（每故事）**

```
Red:    写下验收测试（表中「验收」列可直接转 pytest 名）
Green:  最小实现使测试通过
Refactor: 去重、对齐 Ledger/Settings 风格，不扩 scope
```

---

## 8. 分阶段交付（Epic H0–H9）

推荐顺序：`H0 → H1 → H2 → H3 → H4 → H5 → H6 → H7 → H9`（H8 可并行 stub）。  
H5 扩展庆祝分层；**H9 新建**专责家长 Fogg（Prompt 小红点 / 话术 / 线下庆祝）；H6/H7 承接总表大庆祝 UI。

状态约定：`Todo` / `Doing` / `Done`。

---

### H0 — 脚手架与契约

| ID | 任务 | 验收（测试/行为） | 状态 |
|----|------|-------------------|------|
| H0.1 | 包路径约定 `domain/habit*`、`services/habit*`；pytest 可发现 `test_h*` | 空测通过收集 | Done |
| H0.2 | 错误码扩展：`HABIT_NOT_MICRO` / `HABIT_ALREADY_LOGGED` / `CREDIT_NOT_REDEEMABLE` 等 | 枚举断言 | Done |
| H0.3 | Schema 迁移骨架：habits / rules / logs / credits；（预留）scripts / offline_hints / prompt_state | idempotent migrate | Done |
| H0.4 | 锁定 Q1–Q3 / Q9–Q12 的**工程默认**；确认 §15（tag `v1.0.0`、单仓库演进） | 决策表 + tag/分支检查清单 | Done |

---

### H1 — 微习惯种子与 Ability 门禁

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| H1.1 | `HabitTemplate` 加载；slug 唯一；双 Motivation 路径必填 | fixture ≥30；缺路径失败 | Todo |
| H1.2 | `is_micro(habit)` 纯函数 | 边界：est=5 ok，6 reject | Todo |
| H1.3 | 账户启用习惯（从种子或自定义） | 隔离：A 不见 B；非微拒绝 | Todo |
| H1.4 | 归档习惯不影响历史 Log | 归档后不可新打卡 | Todo |

---

### H2 — 兑换规则（好行为 ↔ 时间）

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| H2.1 | CRUD `ExchangeRule`；分钟 >0；绑定本账户 habit | 校验失败路径 | Todo |
| H2.2 | 日上限 / 每习惯每日一次默认 | 超限 DomainError | Todo |
| H2.3 | `auto_redeem` 标志持久化 | 读写往返 | Todo |
| H2.4 | 停用规则：已有 pending 可 void 或仍可兑（策略测例写清） | 显式断言 | Todo |

---

### H3 — Prompt：打卡与可存时间产出

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| H3.1 | `complete_habit(account, habit, at=Clock)` → HabitLog | 固定 Clock；同日重复失败 | Todo |
| H3.2 | 由规则生成 `EarnedCredit(pending)` | 分钟=规则；无规则则仅记录不入账 | Todo |
| H3.3 | `auto_redeem=true` → 同事务入账 | 原子：有 Log 必有 Ledger 或全回滚 | Todo |
| H3.4 | 日界线：23:59 与 00:01 分属两日 | Shanghai 边界用例 | Todo |

---

### H4 — 兑换入账与账本集成

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| H4.1 | `redeem(credit_id)` → Ledger；credit→redeemed | 余额 +N；幂等第二次失败 | Todo |
| H4.2 | 流水类别按 Q1 默认实现；`meta` 含 habit_log_id | 查询可回溯 | Todo |
| H4.3 | 果实副作用按 Q3 | 与 E2 ornament 断言一致或显式豁免 | Todo |
| H4.4 | 账户隔离与密码/会话门禁（沿用 E5） | 越权 403 | Todo |

---

### H5 — Motivation：三通道 · 情绪路径与庆祝分层

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| H5.1 | 完成事件返回 `motivation_payload`（approach/avoid 各可抽一条）= 通道② | 快照测试 | Todo |
| H5.2 | `CelebrationEvent(kind=small)` 可观测（单次记录）= 通道③小庆祝 | 订阅/记录断言 | Todo |
| H5.3 | 家长可覆盖文案；种子默认回退 | 覆盖优先 | Todo |
| H5.4 | 连续完成轻量 streak 展示数据（纯计算） | 间断归零 | Todo |
| H5.5 | `CelebrationEvent(kind=board)`：总表打开或里程碑触发大庆祝 | 里程碑规则纯函数；同 milestone_id 幂等 | Todo |
| H5.6 | 大庆祝 payload 附带 review 话术 id + 线下 hint id（可空） | 契约字段存在 | Todo |

---

### H6 — 展示：时间线 / 分类 / 日成就 / **好习惯记录总表**

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| H6.1 | 按时间倒序查询 HabitLog | 分页；账户过滤 | Todo |
| H6.2 | 按 category 聚合 | 固定数据集断言 counts/minutes | Todo |
| H6.3 | `DailyAchievement` API | 某日完成列表 + 已兑/未兑分钟 | Todo |
| H6.4 | 展示层中文文案键（与 `domain/display` 风格一致） | 键存在性测试 | Todo |
| H6.5 | `HabitRecordBoard` 区间查询（总表） | from/to；统计与 entries 一致 | Todo |
| H6.6 | 总表复盘聚合：可触发 board 庆祝的 milestone 列表 | 与 H5.5 对齐 | Todo |

---

### H7 — Portal UI（家长端）

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| H7.1 | 设计清单：习惯 Tab / 今日记录 / 规则 / 总表大庆祝 / 家长引导（浅色儿童主题，移动优先） | checklist 文档 + 红灯 UI 契约 | Todo |
| H7.2 | 今日清单 + 一键记录 + **小庆祝**反馈 | API 接线；无控制台错误 | Todo |
| H7.3 | 规则设置与兑换确认页 | 与 H2/H4 集成 | Todo |
| H7.4 | 时间线 / 分类 / 日成就视图 | 与 H6 集成 | Todo |
| H7.5 | **好习惯记录总表**页：展示 + 大庆祝动效 + 复盘区（话术/线下建议卡，可配图） | 与 H5.5–H5.6 / H6.5 / H9 接线 | Todo |
| H7.6 | 主屏/Tab **小红点**与待记录入口 | badge 与 `ParentPromptState` 一致 | Todo |

---

### H8 — 种子扩充与后续预留（可并行）

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| H8.1 | 种子扩至 ≥50（理想 80）；激励要点字段齐全 | 分类覆盖；双路径 + 激励列可解析 | Todo |
| H8.2 | 孩子轻量打卡入口 stub（若 Q2=延后则仅接口注释） | 不阻塞家长主路径 | Todo |
| H8.3 | 备份纳入 habits/rules/logs/credits + 家长引导种子引用 | 日备份可解析新表 | Todo |
| H8.4 | 分析：周习惯完成率 / 家长记录率（可接 E7 analytics） | 固定数据断言 | Todo |

---

### H9 — 家长 Fogg：Prompt · Ability · 话术与线下庆祝

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| H9.1 | `ParentPromptState`：按日计算 `badge_count`（未记录启用习惯数） | Clock 固定；记完清零；跨日重置 | Todo |
| H9.2 | 可选 snooze；过期后 badge 恢复 | 边界用例 | Todo |
| H9.3 | 加载 `ParentScript` 种子；按 situation / category 筛选 | ≥12 条；缺省回退通用话术 | Todo |
| H9.4 | 加载 `OfflineCelebrationHint`；支持 `image_key` 元数据（资源可后补） | ≥8 条；≥4 含 image_key；无图不崩 | Todo |
| H9.5 | 记录成功返回 `parent_motivation_payload` + 推荐话术 + 1 条线下 hint | 契约快照 | Todo |
| H9.6 | （集成）Portal 展示话术卡 / 线下动作卡（配图位） | 与 H7.5–H7.6 联调；无控制台错误 | Todo |

---

## 9. 建议首个 Sprint（领域优先）

1. H0 全部  
2. H1.1–H1.3（种子 + 微门禁 + 启用）  
3. H2.1–H2.2（规则）  
4. H3.1–H3.2（打卡 → pending credit）  
5. H4.1 最小 redeem → 账本  

完成后可演示：**选微习惯 → 设「刷牙=+5 分钟」→ 家长记录 → 兑换 → 资产增加**（小/大庆祝与家长引导可稍后接 H5/H7/H9）。

### 依赖简图

```
H0 ──► H1 ──► H2 ──► H3 ──► H4 ──► H6 ──► H7
                     │              ▲       ▲
                     └────► H5 ─────┘       │
                              │             │
                              └────► H9 ────┘
H8（种子扩充 / stub / 备份，可穿插）
```

---

## 10. 可测试验收标准（跨 Epic 汇总）

- [ ] 仅微习惯可启用；非微自定义被拒  
- [ ] 种子 ≥30 且每条含 approach + avoid，并有可解析的激励/庆祝要点  
- [ ] 规则决定「可存时间」分钟数；无线下口头步骤也可完成主路径  
- [ ] 记录幂等（同日同习惯默认一次）  
- [ ] pending → redeem → 资产增加；流水可追溯到 habit_log  
- [ ] 时间线按时间序；分类聚合正确；日成就与 Log 一致  
- [ ] **三通道**：完成返回情绪路径 + `CelebrationEvent(kind=small)`；总表里程碑返回 `kind=board`  
- [ ] **好习惯记录总表**可按区间展示并支持复盘 payload（话术 + 线下 hint）  
- [ ] **家长 Prompt**：`badge_count` 随未记录习惯变化；主路径可断言  
- [ ] **家长 Ability**：话术 ≥12、线下庆祝 hint ≥8（含配图位）；记录成功返回家长向激励 payload  
- [ ] 多账户隔离；Clock/时区边界用例通过  
- [ ] 手动 `deposit` 仍可用作兜底  

---

## 11. 开放问题（决策状态）

> **2026-10-12**：Kai Fang 反馈收口并指示「可以开工」。下列默认值视为 **已采纳（Accepted）**，实现按此锁定；若日后变更须另开决策修订。

| ID | 问题 | 选项 / 影响 | 采纳决策 |
|----|------|-------------|----------|
| **Q1** | 习惯兑换用新流水类别还是复用 `deposit`？ | A `habit_reward` / B `deposit`+meta | **Accepted: A** `habit_reward` |
| **Q2** | 孩子是否在 V1.1 拥有独立打卡入口？ | 仅家长代打 / 家长设备上孩子模式 / 延后 | **Accepted: 仅家长代打**；H8 stub |
| **Q3** | 习惯入账是否 +果实（同 deposit）？ | 是 / 否 / 仅手动兑换才给 | **Accepted: 是**（与 deposit 一致） |
| **Q4** | `auto_redeem` 默认开还是关？ | 开=更少摩擦；关=家长更可控 | **Accepted: 默认关** |
| **Q5** | 补打卡（补昨天）是否允许？ | 禁止 / 允许 N 天内 / 需家长确认 | **Accepted: 禁止跨日补打** |
| **Q6** | 连续天数奖励是否叠加分钟？ | 仅展示 streak / streak 加奖 | **Accepted: H5 仅展示**；加奖放 H8+ |
| **Q7** | 自定义习惯文案审核？ | 家长自负 / 敏感词过滤 | **Accepted: 长度限制 + 现有 sanitize** |
| **Q8** | 与每日 `auto_grant` 关系？ | 并存独立 / 习惯达标才派发 | **Accepted: 并存独立**（不改 E3） |
| **Q9** | 大庆祝里程碑规则？ | 仅「打开总表」 / 周满 N 记 / 连续天数档 | **Accepted: 周满 5 记触发一次 board**；打开总表可播轻量复盘动效但不重复里程碑奖 |
| **Q10** | 家长小红点计数口径？ | 仅未记录 / 未记录+未兑换 / 自定义 | **Accepted: 仅今日启用且未记录的习惯数** |
| **Q11** | 线下庆祝配图来源？ | 内置插画 / 后期再补 / 仅文字 | **Accepted: `image_key` + 文字 fallback** |
| **Q12** | 系统推送（OS 通知）是否进本阶段？ | 做 / 仅 App 内小红点 | **Accepted: 仅 App 内 badge/小红点** |

---

## 12. 风险与假设

| 风险 | 缓解 |
|------|------|
| 只做打卡变成「作业 App」，Motivation 不足 | 三通道并列验收；H5 小/大庆祝契约；总表复盘不晚于 H7.5 |
| **家长不记 → 全链路空转** | H9 家长 Fogg；小红点 + 一键记录 + 话术/线下建议降低 Ability 门槛 |
| 种子质量参差 | 模板评审清单；双路径 + 激励要点必填测试 |
| 刷习惯刷时间 | 日上限 + 每习惯每日一次 + 家长确认默认 |
| 与 V1 账本语义冲突 | Q1/Q3 先锁；集成测对接 `LedgerService` |
| 范围膨胀到「技能教学」或重运营推送 | Ability 门禁回归；Q12 默认不做 OS 推送 |
| 线下庆祝变成说教 | 种子偏「好玩动作」；配图指导怎么做，不做考核 |

**假设**：产品仍为家长端为主且**家长是记录主路径**；分钟仍为唯一时间货币；不修改 D1–D7；**源码在同一仓库演进（§15），不以整树拷贝管理 2.0**；实现工作在本计划批准后另开 PR，**本文不改代码**。

---

## 13. 文档与代码锚点（便于开工）

| 现有锚点 | 用途 |
|----------|------|
| `src/mytimetree/domain/ledger.py` · `LedgerCategory` | Q1 扩展点 |
| `src/mytimetree/services/ledger.py` · `deposit` | 入账 / 果实参考 |
| `src/mytimetree/domain/money_time.py` · `Minutes` | 兑换金额 |
| `src/mytimetree/jobs/runner.py` | 可选：日成就物化 job（非必须） |
| `docs/dev-tasks-v1.md` | Epic 表格式范本 |
| `docs/prd-v1-analysis.md` §7 | TDD 原则范本 |
| `tests/integration/test_e2_ledger.py` | 入账集成测风格参考 |

---

## 14. 里程碑定义（Done 标准）

| 里程碑 | 含义 |
|--------|------|
| **M1 规则可兑** | H0–H4 绿灯：家长记录→credit→账本可演示 |
| **M2 三通道动机可测** | H5 绿灯：情绪路径 + small/board celebration 事件可测 |
| **M3 总表 + Portal** | H6–H7 绿灯：时间线/分类/日成就/**好习惯记录总表大庆祝** + 主路径 UI |
| **M4 家长可坚持记** | H9 绿灯：小红点、话术、线下庆祝 hint；记录率相关分析可接 H8.4 |
| **M5 种子充实** | H8.1：习惯种子 ≥50；话术/线下 hint 达 §5.4 门槛 |

---

## 15. 版本与文件管理（正式约定）

> **约定效力**：本节为 MyTimeTree **1.0 → 2.0** 工程管理的默认规则。未另决议前，实现与文档均按此执行。

### 15.1 原则（先定调）

| # | 约定 | 说明 |
|---|------|------|
| P1 | **单仓库演进** | 2.0 在现有仓库的 `src/mytimetree/` 上扩展，**不**新建平行工程目录（如 `mytimetree-v2/`）再整树拷贝 1.0 |
| P2 | **1.0 靠 Git 冻结** | 「存档且不被改」指 **tag / release 分支上的快照**；工作区 `main` 继续演进属于 2.0，不是在改已发布的 1.0 |
| P3 | **可复用 = 直接扩展** | 账户、账本、`Minutes`、魔法树、Portal 壳等 **原地复用并加测**；仅新增习惯相关模块与迁移 |
| P4 | **禁止双份源码** | 不以「拷一份 1.0 只读目录 + 一份 2.0 开发目录」作为主结构（易分叉、双修） |

### 15.2 Git：标签、分支、发布

| 动作 | 约定 |
|------|------|
| 冻结 1.0 | 在当前已交付提交打 tag：`v1.0.0`（若尚未打；已有则沿用） |
| 可选长期分支 | `release/1.0`：仅接受 1.0 **热修**（严重 bug）；习惯功能 **不**合入该分支 |
| 2.0 开发 | 自 `main`（或等价默认支）开 `feature/habit-*`；合入后 `main` = 2.0 演进线 |
| 2.0 发布 | 习惯模块达到约定里程碑后打 `v2.0.0`（可先有 `v2.0.0-rc.N`） |
| 回看 1.0 | `git checkout v1.0.0` 或发布产物；**不**依赖磁盘上第二份完整源码树 |

### 15.3 源码与测试目录

| 项 | 约定 |
|----|------|
| 包根 | 继续 `src/mytimetree/` |
| 新增（示例） | `domain/habit*.py`、`services/habit*.py`、种子 fixture、Portal 习惯页相关静态资源 |
| 修改 | 允许扩展 `LedgerCategory`、迁移、Portal 导航等；**D1–D7 行为由既有 E\* 回归测试守住** |
| 测试 | `tests/unit/test_h*`、`tests/integration/test_h*`；**保留**全部 `test_e*`，2.0 不得无故删除 1.0 回归 |
| 不做 | `src/mytimetree_v1/` + `src/mytimetree_v2/` 双包并存；或把 1.0 文件复制后改名并行维护 |

### 15.4 数据库与用户数据

| 项 | 约定 |
|----|------|
| Schema | **迁移升级**（在现有 SQLite 上加 habits / rules / logs / credits 等），不另起「2.0 空库目录」当主路径 |
| 1.0 数据 | 升级后仍指向同一用户库；迁移须幂等、可测（接 H0.3） |
| 回滚 | 依赖备份（E6）+ tag 对应代码；不靠保留未迁移的平行库文件夹作日常开发 |

### 15.5 文档

| 项 | 约定 |
|----|------|
| 1.0 文档 | `docs/prd-v1-analysis.md`、`docs/dev-tasks-v1.md`、`docs/portal-design-checklist.md` 等视为 **1.0 档案**：**默认不再改业务结论**；若需勘误，只加「勘误/附录」，或另开 2.0 文档 |
| 2.0 / 习惯 | 本文件及后续 `docs/` 下 2.0 计划、设计清单；可选归入 `docs/v2/`（**仅文档**，不强制拷代码） |
| 任务表 | 2.0 Epic 用 H0–H9；与 E0–E9 并存于仓库，不覆盖删改已 Done 的 1.0 任务史 |

### 15.6 明确不采用的做法

1. 新建文件夹 → 拷贝全部可复用 1.0 源码 → 在拷贝上改成 2.0（主开发模型）  
2. 工作区里留一份「只读 1.0 完整树」与「2.0 树」长期双修  
3. 为 2.0 另起无关仓库，除非未来产品线真正拆分（当前 **否**）

### 15.7 开工检查清单（H0 前）

- [x] §11 Q1–Q12 与 §15 版本约定已采纳（2026-10-12「可以开工」）  
- [ ] 确认 / 补打 `v1.0.0` tag（1.0 存档锚点）— 实现 PR 中完成  
- [x] 默认开发支与 `feature/habit-*`（云代理分支 `cursor/habit-*-5c97`）策略  
- [x] 1.0 文档保持档案属性；本计划为 2.0 习惯模块真源之一  
- [x] 实现时按 §15.3 增量加文件，而非整树复制  

---

*计划状态：决策已锁定，**按 H0 红灯清单开工**。*
