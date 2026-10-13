# MyTimeTree 2.0 — 习惯养成 · iOS 单端交付计划

- 文档类型：交付规划（**本文件为工程真源**；产品 Fogg / 三通道 / Q1–Q12 仍有效）
- 修订日期：2026-10-13
- 触发：Kai 确认正式 iOS 在 `feature/v1-tdd`；关闭 Web 习惯 PR #1；单端离线 App
- 基线分支：`feature/v1-tdd`（Capacitor · 本机 SQLite/sql.js · Face ID · iCloud · PNG 树/挂件 · `docs/ui-theme.md`）
- 产品规则真源（语义）：Agent Store / 历史计划中的 Fogg、三通道、总表大庆祝、家长话术；决策表见 `docs/v2/decisions.md`
- 开发模式：TDD-first（先契约/红灯 → 最小绿 → 重构），测在 **mobile 本地域 + UI**，不新建在线 Portal 演进线

---

## 1. 目标一句话

在 **已上架路径的 iOS 离线家长端**上，把「微习惯 → 可兑时间 → 账本/魔法树」做成主路径；激励仍为三通道（时间兑换 · 内生情绪 · 小/大庆祝），并降低家长记录摩擦（小红点、一键记、话术、线下庆祝指引）。

## 2. 明确不做

| 不做 | 说明 |
|------|------|
| 继续演进 Web Portal 产品 UI/API | Portal **冻结**；不作为 2.0 合入目标 |
| 双端并行维护 Python 习惯服务 + iOS | Python/PR#1 仅参考与沙盒试玩 |
| 孩子独立端完整 App | Q2：仅家长代打 |
| OS 推送 | Q12：仅 App 内 badge |
| 改 D1–D7 账本/树核心语义 | 习惯只挂钩，不重写结息/派发规则 |

## 3. 现状分叉（为何要重开）

```
a772b25 (早期 Web Portal)
   ├─► feature/v1-tdd …… iOS 正式壳 + 素材 + 离线库  ← 1.0 / 2.0 基线
   └─► cursor/habit-h0-scaffold-5c97 …… Python 习惯 + 草稿 SPA Tab  ← 已关 PR#1，沙盒参考
```

草稿 Portal 看起来「不像正式 App」，是因为习惯做在了错误基线上；不是 iOS 1.0 被降级。

## 4. 工程约定（取代旧 §15 中「扩 Python Portal」部分）

| # | 约定 |
|---|------|
| E1 | **单仓库** `Eskimocha/MyTimeTree`；开发支自 `feature/v1-tdd`（或合入后的默认支）开 `cursor/habit-ios-*-5c97` |
| E2 | **实现面**：`mobile/`（Capacitor）+ 打包进 App 的 `public/`（或 `www` 同步源）+ 本地 DB schema 迁移 |
| E3 | **视觉真源**：`docs/ui-theme.md`、树/挂件 PNG、`docs/tree-visual-design-options.md`；习惯 UI 必须贴合现有主屏气质，禁止回到 CSS 圆树草稿风 |
| E4 | **数据**：在现有离线 SQLite 上迁移加表（habits / rules / logs / credits 等 + `sort_order`），整库仍走 iCloud 备份路径 |
| E5 | **账本**：写入与 iOS 现网一致的流水模型；类别名对齐 Q1：`habit_reward`（或该端等价枚举） |
| E6 | **Web Portal**：只读沙盒——可用现有隧道/本地起服务给 Kai 试交互找改进点；**不**再合入功能 PR |
| E7 | **参考实现**：关闭的 PR #1 / 分支 `cursor/habit-h0-scaffold-5c97` 可对照领域行为与测试意图，**禁止**整包合并进 iOS 线当交付 |
| E8 | **内容表**：`docs/v2/content/*.md` 为人读可编辑真源；构建/sync 打入 mobile；用户清单自定义存 SQLite（C-D1–C-D4） |

## 5. 建议 Epic（iOS 重开编号 IH0–IH9）

> 语义对齐原 H0–H9；实现栈换成 mobile。里程碑名保留 M1–M5 含义。

| Epic | 内容 | Done 信号（摘要） |
|------|------|-------------------|
| **IH0** | 决策已锁 + 本地 schema 草案 + 与现库迁移策略 + UI 清单（主屏 strip 贴合 ui-theme） | 文档 + 空迁移红灯 |
| **IH1** | 种子自 `docs/v2/content/habit-templates.md`；Ability 门禁；**设置内清单：启用/停用/自定义新增/归档/排序**（C-D1） | 主屏顺序=设置顺序 |
| **IH2** | 兑换规则 CRUD、日上限、停用策略（规则仍决定「记一次值多少分钟」） | 规则可测 |
| **IH3** | 完成习惯 → **同路径自动入账** `habit_reward`（Q4′；无待兑家长交互） | 打卡后资产增加 |
| **IH4** | （并入 IH3）果实钩子与流水展示；**不做**手动兑换 UI | 树/流水可见 |
| **IH5** | 情绪路径 + 小庆祝 / 总表大庆祝事件（文案可来自 content 表） | 可断言 payload |
| **IH6** | 时间线 / 分类 / 日成就查询 | 本地 query |
| **IH7** | **主屏记录面**（按序 strip + 庆祝 overlay，**无兑按钮**）+ **分析复盘面** + **设置：清单自定义 + 规则**；**不新增「习惯」Tab** | 真机：排序反映到主屏 |
| **IH8** | 种子/话术/hint **表格充实**（Kai 编辑 `docs/v2/content/`）；分析页好习惯区块 | 表可解析且达门槛 |
| **IH9** | 从 content 表加载家长话术 + 线下庆祝 hint；**不含稍后提醒** | 记录后同屏引导；改表可发版更新 |

### 信息架构（2026-10-13，含内容/清单修订）

- **默认模式**：Tree Hero + Today Habit Strip（调研：`internal/habit-home-ux-research.md`）  
- **禁止**：根级第五 Tab「习惯」；主屏「兑」/待兑交互；本阶段「稍后提醒」  
- **兑换**：记完即 `habit_reward` 入账（Q4′）  
- **稍后提醒**：延后至闹钟模块版本（P-D6）  
- **清单**：设置内增减与排序（C-D1）  
- **话术/庆祝建议**：`docs/v2/content/` 表格真源，随 App 推送更新（C-D2）  
- **盘点**：`docs/v2/habit-ios-gap-analysis.md` |

### 里程碑

| 里程碑 | 含义 |
|--------|------|
| M1 规则可兑 | IH0–IH4：记→**自动**入账→账本/树 |
| M2 动机可测 | IH5 |
| M3 主屏记录 + 分析复盘 | IH6–IH7（**iOS 主屏优先**，非独立习惯 Tab） |
| M4 家长可坚持 | IH9（话术/线下 hint；无 snooze） |
| M5 种子充实 | IH8 |

## 6. 从 PR#1 / Web 沙盒吸收什么

| 吸收 | 不吸收 |
|------|--------|
| Q 表、Fogg、三通道、庆祝口径 | FastAPI 习惯路由当运行时 |
| 「记录→入账」状态机与边界（日一次、禁补打）；**改为自动兑，去掉待兑家长步** | 草稿 SPA 视觉、手动兑 UI、稍后提醒 |
| Kai 在 Web 沙盒上发现的 **UX 改进点**（记入本计划附录后再做进 iOS） | 将 Python 测试当 iOS 唯一测试 |

## 7. 开工前检查清单

- [x] P-D1…P-D5 已采纳（2026-10-13）
- [x] PR #1 已关闭
- [x] iOS 基线分支可拉取：`origin/feature/v1-tdd`
- [x] 差距盘点：`docs/v2/habit-ios-gap-analysis.md`
- [x] Q4′ / Q13 / P-D6 / P-D7（自动兑；稍后提醒延期）
- [x] Kai 确认方案 A：IH0–IH9 一并实现（支 `cursor/habit-ios-replan-5c97`）

## 8. 实现状态（2026-10-13）

1. **已完成**：migration v8、`habit_reward` 自动入账、主屏 Today Habit Strip、庆祝 overlay（话术/线下 hint）、设置清单自定义、分析复盘、content 表构建管线。  
2. **本地验收**：`cd mobile && npm run smoke:habits`；真机用 Xcode 打开 `mobile/ios/App/App.xcodeproj`（先 `npm run cap:sync`）。  
3. **明确未做**：稍后提醒 / OS 推送 / 手动兑 UI / 独立习惯 Tab。

---

*计划状态：IH0–IH9 方案 A 已落地；待 Kai 明早真机测。*
