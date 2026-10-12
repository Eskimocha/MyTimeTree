# MyTimeTree 2.0 — 习惯模块决策锁定

来源：`docs/v2/habit-module-upgrade-plan.md` §11 / §15  
状态：**Accepted**（2026-10-12，Kai Fang「可以开工」）

| ID | 决策 |
|----|------|
| Q1 | 流水类别 `habit_reward`（新 `LedgerCategory`） |
| Q2 | 仅家长代打；孩子入口 H8 stub |
| Q3 | 习惯入账 +果实（同 deposit） |
| Q4 | `auto_redeem` 默认关 |
| Q5 | 禁止跨日补打 |
| Q6 | streak H5 仅展示；加奖 H8+ |
| Q7 | 长度限制 + 现有 sanitize |
| Q8 | 与 `auto_grant` 并存独立 |
| Q9 | 周满 5 记触发一次 board 大庆祝 |
| Q10 | 小红点 = 今日启用且未记录习惯数 |
| Q11 | 线下庆祝 `image_key` + 文字 fallback |
| Q12 | 本阶段仅 App 内 badge，不做 OS 推送 |
| H2.4 | 停用兑换规则：`INACTIVE_RULE_PENDING_POLICY=keep_redeemable`（已有 pending 仍可兑；不可再 earn） |

版本管理：见计划 §15（单仓库演进；tag `v1.0.0` 冻结 1.0）。
