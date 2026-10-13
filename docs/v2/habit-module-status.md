# MyTimeTree 习惯模块 — 交付状态（iOS 重开）

- 仓库：`Eskimocha/MyTimeTree`
- **1.0 / 实现基线**：`feature/v1-tdd`（iOS Capacitor）
- **实现支**：`cursor/habit-ios-replan-5c97`
- **规划真源**：`docs/v2/habit-ios-delivery-plan.md`
- **决策**：`docs/v2/decisions.md`
- Web 习惯 PR [#1](https://github.com/Eskimocha/MyTimeTree/pull/1)：**已关闭**（分支 `cursor/habit-h0-scaffold-5c97` 仅作沙盒/参考）

## 当前阶段

| 项 | 状态 |
|----|------|
| 产品 Q1–Q12 | Accepted（保留） |
| 交付面改 iOS 单端 | Accepted（2026-10-13） |
| IA：主屏记录、勿增习惯 Tab | Accepted（IA-D1/D2） |
| 记完自动兑；无「兑」UI | Accepted（Q4′ / P-D7） |
| 稍后提醒延期（闹钟版） | Accepted（Q13 / P-D6） |
| 清单可自定义（增减/排序） | Accepted（C-D1） |
| 话术/庆祝建议表格真源 | Accepted（C-D2–C-D4）；模板在 `docs/v2/content/` |
| 差距盘点 | Done — `docs/v2/habit-ios-gap-analysis.md` |
| UX 调研（主屏优先） | Done — store `internal/habit-home-ux-research.md` |
| IH0–IH9 实现（方案 A） | **Done** — migration v8 + domain + 主屏 strip + 设置清单 + 分析复盘 |
| 内容种子 | `docs/v2/content/` → `npm run build:habit-content` → `habit-seed.js` |
| 冒烟 | `cd mobile && npm run smoke:habits` |

## Epic 完成对照

| Epic | Done 信号 | 状态 |
|------|-----------|------|
| IH0 | schema v8 + 决策文档 | Done |
| IH1 | 种子 + 设置清单自定义/排序 | Done |
| IH2 | 兑换规则改分钟 / 日上限=1 | Done |
| IH3–IH4 | 记完自动 `habit_reward`；无手动兑 UI | Done |
| IH5 | 小庆祝 + 周满大庆祝 + 情绪文案 | Done |
| IH6 | overview 时间线 / 分类 / 周统计 | Done |
| IH7 | 主屏 strip + 庆祝 overlay；分析复盘；无习惯 Tab | Done |
| IH8 | content 表 ≥50 种子 + 话术/hint | Done |
| IH9 | 记录后话术 + 线下庆祝 hint；无 snooze | Done |

## 历史（归档）

- 曾在 Web Portal + Python 上完成 H0–H9 原型与人工冒烟；因基线错误，**不作为上架路径**。
