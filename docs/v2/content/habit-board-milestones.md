# 大庆祝 · 好习惯总表 12 级里程碑（可编辑）

> 对应产品「board / 大庆祝」通道（与单次小庆祝并列）。  
> **与 tip 图标、小庆祝动作图无关**；大庆祝可用独立 overlay 资源。  
> `trigger_rule` 供实现解析；先按草案落地，Kai 可改阈值。  
> **2026-10-16**：去掉「十五次」；新增「二百次」；仍为 12 级。

## 触发规则约定（可实现）

| 规则名 | 含义 | 计数源 |
|--------|------|--------|
| `lifetime_logs >= N` | 账号累计好习惯记数（所有种子合计）≥ N | `habit_logs` 成功记 |
| `week_logs >= N` | **本自然周**（周一 00:00–周日 24:00，本地时区）记数 ≥ N | 同上，按 week_key |
| `month_logs >= N` | **本自然月**记数 ≥ N | 按 month_key |
| `streak_days >= N` | 连续 N 个日历日，每日至少 1 记 | 按 day_key 连续 |
| `week_categories >= N` | 本自然周内，至少 N 个不同 `category` 有记 | logs ⋈ templates.category |

**幂等**：同一 `milestone_id` 每个账号只触发大庆祝 **一次**（写入 `celebration_done` / milestones 表）；周/月类若需「每周期可再达」另开 `repeatable=1`（本表默认 `repeatable=0`）。  
**展示**：触发后 board overlay + `title` / `body`；可选 `offline_action_id` 引用 `celebration-actions.md`（大庆祝也可用站立类）。

| level | id | title | body | trigger_rule | repeatable | offline_action_id | image_key | active |
|-------|-----|-------|------|--------------|------------|-------------------|-----------|--------|
| 1 | bm_first | 第一颗星 | 第一次记下来了——习惯树发芽了。 | lifetime_logs >= 1 | 0 | ca_high_five | img-bm-01 | 1 |
| 2 | bm_life_5 | 五次打卡 | 已经记下五次好习惯，小树晃了晃叶子。 | lifetime_logs >= 5 | 0 | ca_thumbs_up | img-bm-02 | 1 |
| 3 | bm_life_30 | 三十次 | 三十次！像攒了一小篮星星。 | lifetime_logs >= 30 | 0 | ca_double_high_five | img-bm-04 | 1 |
| 4 | bm_streak_3 | 连续三天 | 连续三天都有记录，节奏出现了。 | streak_days >= 3 | 0 | ca_air_high_five | img-bm-05 | 1 |
| 5 | bm_week_5 | 本周满五 | 这一周记下五次——小庆祝升级！ | week_logs >= 5 | 0 | ca_spin_clap | img-bm-06 | 1 |
| 6 | bm_life_60 | 六十次 | 六十次好习惯，树冠更密了一点。 | lifetime_logs >= 60 | 0 | ca_hug_3s | img-bm-07 | 1 |
| 7 | bm_streak_7 | 连续七天 | 一整周每天都有记，太稳了。 | streak_days >= 7 | 0 | ca_victory_dance | img-bm-08 | 1 |
| 8 | bm_week_cats_3 | 本周三色 | 本周至少三个不同类别的好习惯都记下了。 | week_categories >= 3 | 0 | ca_fridge_star | img-bm-09 | 1 |
| 9 | bm_life_100 | 一百次 | 一百次被看见——总表闪了一下。 | lifetime_logs >= 100 | 0 | ca_double_high_five | img-bm-10 | 1 |
| 10 | bm_life_200 | 二百次 | 二百次！习惯树已经长成一片小森林的气势。 | lifetime_logs >= 200 | 0 | ca_fridge_star | img-bm-03 | 1 |
| 11 | bm_streak_14 | 连续十四天 | 两周不断档，习惯像小路被踩实了。 | streak_days >= 14 | 0 | ca_outdoor_spin | img-bm-11 | 1 |
| 12 | bm_month_20 | 月满二十 | 这个月记下二十次，大树为你们鼓掌。 | month_logs >= 20 | 0 | ca_spin_clap | img-bm-12 | 1 |

> 已移除：`bm_life_15`（十五次）。`img-bm-03` 现归属 `bm_life_200`（重画）。

## 实现提示（不改代码，仅交接）

1. 每日记成功后评估：先小庆祝 → 再检查未达成里程碑（按 `level` 升序，一次最多弹 1 个大庆祝，避免叠屏）。  
2. `week_*` / `month_*` 用本地日历边界；跨时区以设备本地为准。  
3. `streak_days`：中间断一天即清零再计；只要求「当天 ≥1 记」，不要求同一种子。  
4. 若 Kai 要把 L5「本周满五」改成可每周重复：将该行 `repeatable` 改为 `1`，并按 `week_key` 存达成记录。
