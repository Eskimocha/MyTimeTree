# 习惯 2.0 × iOS 基线 — 差距盘点

- 日期：2026-10-13  
- 基线：`feature/v1-tdd` / 当前支 `cursor/habit-ios-replan-5c97`  
- 对照：关闭的 PR #1（`cursor/habit-h0-scaffold-5c97`）领域模型  
- UX 调研：Agent Store `internal/habit-home-ux-research.md`（[Home-first UX research](https://github.com/Eskimocha/MyTimeTree) 子代理结论）

---

## 0. IA 修正（盘点前置）

Kai：**不要**新增「习惯」第二 Tab。  
调研推荐默认：**Tree Hero + Today Habit Strip**（主屏记录 + 一层庆祝叠加；复盘进「分析」；规则进「设置」）。

| 能力 | 落点 |
|------|------|
| 今日待记 / 一键记录 | **主屏** strip |
| 小庆祝 + 家长话术 + 线下动作 hint | **主屏** 单层 overlay（不离页） |
| 待兑「兑」 | **主屏** 余额旁次要控件 |
| 总表 / 时间线 / 分类 / 大庆祝复盘 | **分析** Tab 新区块 |
| 规则 CRUD / 种子启用 | **设置**「习惯规则」 |
| `habit_reward` 核对 | **流水** |

原计划 IH7「习惯 Tab」→ 改写为 **主屏记录面 + 分析复盘面 + 设置规则面**（见 delivery plan 修订）。

---

## 1. 架构对照

| 层 | iOS 正式基线（有） | 习惯所需（缺） | 缺口 |
|----|-------------------|---------------|------|
| 壳 | Capacitor 7 · WKWebView · UIScene · Face ID · iCloud 整库 | 同壳扩展 | 无新壳 |
| 持久化 | `sql.js` + `schema_migrations` **v1–v7** | habit 相关表 **v8+** | **大** |
| 领域 API | `local/store.js` 镜像 `/api/*` | habit complete/redeem/badge/overview | **大** |
| 账本类别 | spend/borrow/repay/deposit/auto_grant/auto_interest | `habit_reward` + `effects`/`displayFor` | **中** |
| UI | 主屏树 PNG + 余额 + 支/借/存；四 Tab | 主屏 strip + overlay；分析/设置扩展 | **中**（有明确插入点） |
| 视觉 | `tree/*.png` `ornaments/*.png` `ui-theme.md` | 庆祝动效贴合树；hint 图可复用/扩展 | **小–中** |
| 同步源 | `npm run sync-web`：`www-src` → public | 改 `www-src` + portal 静态时需走 sync | **流程** |

---

## 2. Schema 差距（相对 PR#1 表）

iOS 当前最高迁移：**7**（`interest_fruit_count`）。  
PR#1 习惯表（需移植语义，非原样拷 Python）：

| 表 | 用途 | iOS |
|----|------|-----|
| `habit_templates` | 种子库 | 无 |
| `habits` | 账户启用习惯 | 无 |
| `exchange_rules` | 分钟/日上限/auto_redeem | 无 |
| `habit_logs` | 打卡（日唯一） | 无 |
| `earned_credits` | 待兑/已兑 | 无 |
| `parent_scripts` | 话术 | 无 |
| `offline_celebration_hints` | 线下动作 | 无 |
| `parent_prompt_state` | badge / snooze | 无 |
| `celebration_events` | small/board | 无 |

**IH0 建议**：`db.js` 增加 migration **v8**（上表 + 必要索引）；种子 JSON/SQL 进包内资源。

---

## 3. `store.js` 挂钩点

| 既有能力 | 文件锚点 | 习惯接入 |
|----------|----------|----------|
| `appendEntry` / `effects` / `displayFor` | `store.js` ~388–423, ~609 | 增加 `habit_reward`：资产 +N、进账红、**与 deposit 一样可钩果实**（Q3） |
| `repay`/`deposit` 加果 | ~697 `addFruit` | redeem 路径复用 |
| 路由分发 | ~1448+ `/api/portal/*` | 新增本地路由或平行 `habitApi`（不必 HTTP，但保持可测边界） |
| 日界 | `todayStr()` Asia/Shanghai | 打卡 `day_key`、禁补打（Q5） |
| `app_state` | snooze 可先放 key 或正式表 | `parent_prompt_state` 优先正式表 |

---

## 4. UI 插入点（主屏优先）

**主屏**（`index.html` `#tab-home`）现有结构：

1. tagline  
2. `#tree-stage`（PNG + 挂件）← **保持英雄位，勿塞卡片**  
3. `.balances`（资产/负债/累积利息/当日利息）  
4. `.actions`（支出 / 借用 / 存入）  
5. `#home-msg`

**建议插入：**

- 在 `.balances` 与 `.actions` 之间（或余额行内）：**「兑」**（仅 pending>0 显示）  
- 在 `.actions` **之上或之下**：`#habit-today-strip`（今日好习惯 chips）  
- body 级：`#habit-celeb-overlay`（庆祝+话术+线下 hint 单层）

**分析**（`#tab-analytics`）：现仅 week/month `<pre>` → 增「好习惯」区块（总表/时间线/分类）。  
**设置**：现规则说明 aside → 增「习惯规则」配置入口。

---

## 5. 与 Web 沙盒的可复用 / 不可复用

| 可复用（语义） | 不可直接搬 |
|----------------|------------|
| Q1–Q12、状态机（记→credit→兑） | FastAPI 路由、Python 服务 |
| 种子文案 / 话术 / hint 文案 | 草稿 SPA「习惯 Tab」IA |
| 测试用例意图 | CSS 圆树与 Space 部署假设 |
| UX 试玩发现的摩擦点 | 整包 merge habit 分支 |

---

## 6. 风险（iOS 特有）

| 风险 | 缓解 |
|------|------|
| 主屏变矮后树被挤 | strip 限高；完成日折叠；矮屏允许主屏滚动（ui-theme 已有） |
| 庆祝叠层挡操作 | 单层 overlay + 明确关闭；2.8s 可自动收但保留「知道了」 |
| iCloud 整库含新表 | 迁移幂等；旧库打开自动 v8 |
| sync-web 漏改 | 改 `www-src`/`static/portal` 后必须 `npm run sync-web`（树路径教训已在 .cursorrules） |
| `habit_reward` 未进 effects → 兑了不加资产 | IH4 必测 |

---

## 7. IH0 开工切片（建议）

1. 文档：本盘点 + IA 写入 delivery plan（本 PR）  
2. migration v8 空表 + 红灯冒烟（Node 测 migrate 版本）  
3. `effects`/`displayFor` 先认 `habit_reward`（可先无 UI）  
4. 主屏 strip 静态壳（无数据）走查视觉  

**不在 IH0：** 完整种子 50+、分析总表、OS 推送。

---

## 8. 结论

差距主要在 **本地 schema + store 领域 + 主屏/分析/设置三处 UI 扩展**；壳与视觉基线已够用。  
交互上应 **否定独立习惯 Tab**，采用调研推荐的主屏 strip 方案，与降低家长门槛一致。
