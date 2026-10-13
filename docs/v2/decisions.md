# MyTimeTree 2.0 — 习惯模块决策锁定

## A. 产品决策（保留）

来源：原 `habit-module-upgrade-plan.md` §11  
状态：**Accepted**（2026-10-12，Kai Fang「可以开工」）

| ID | 决策 |
|----|------|
| Q1 | 流水类别 `habit_reward`（新账本类别） |
| Q2 | 仅家长代打；孩子入口本阶段不做 |
| Q3 | 习惯入账 +果实（同 deposit） |
| Q4 | `auto_redeem` 默认关 |
| Q5 | 禁止跨日补打 |
| Q6 | streak 本阶段仅展示；加奖后置 |
| Q7 | 长度限制 + 既有 sanitize |
| Q8 | 与 `auto_grant` 并存独立 |
| Q9 | 周满 5 记触发一次 board 大庆祝 |
| Q10 | 小红点 = 今日启用且未记录习惯数 |
| Q11 | 线下庆祝 `image_key` + 文字 fallback |
| Q12 | 本阶段仅 App 内 badge，不做 OS 推送 |

## B. 交付面决策（2026-10-13 修订）

状态：**Accepted**（Kai Fang 明示）

| ID | 决策 |
|----|------|
| P-D1 | **只做 iOS 离线 App**（Capacitor + 本机 sql.js + iCloud 整库）；家长主路径不依赖在线服务 |
| P-D2 | **单端实现**：方案优化后直接做 iOS；**Web Portal 产品线不再继续演进** |
| P-D3 | Web Portal（含已关闭的 PR #1 Python 习惯实现）可作 **Kai 直观试玩 / 找改进点的沙盒**，**不是** 2.0 交付真源 |
| P-D4 | PR [#1](https://github.com/Eskimocha/MyTimeTree/pull/1) **已关闭**；习惯 2.0 在 **iOS 基线**（`feature/v1-tdd`）上重开 |
| P-D5 | 1.0 正式交付面 = `feature/v1-tdd` @ App Store Build 6 快照（及后续该线 tip），**不是** 早期 Space SPA 草稿壳 |

版本 / 文件管理：见 `habit-ios-delivery-plan.md` §工程约定。
