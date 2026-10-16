# MyTimeTree 习惯内容表（可编辑 · 离线发版真源）

> 产品/Kai 在发版前直接改这些 Markdown 表；构建脚本打入 App 包。  
> **不做**在线 CMS。更好实践 → 改表 → 升版推送（C-D2）。  
> 本目录为仓内发版真源（与 Project store `docs/content/` 对齐）。

## 表清单与 App 字段映射

| 文件 | 用途 | 主键 | 打入包后主要字段 | UI 曝光 |
|------|------|------|------------------|---------|
| `habit-templates.md` | 可打卡**种子**习惯 | `slug` | `title`, `category`, `default_minutes`, `active`, `sort_default`, `notes` | 设置清单默认项；主屏 chip |
| `micro-steps.md` | **建议**微步骤（不可打卡） | `id` | `habit_slug`, `sort`, `step_text`, `active` | 记前，chip 旁「怎样更容易做」（默认可折叠）；家长之后可在 App 自定义，不回写本表 |
| `parent-scripts.md` | 家长预录话术 | `id` | `habit_slug`, `category`, `script_text`, `active` | 记前，chip 旁一行；匹配优先级：`habit_slug` → `category` → 空（通用） |
| `celebration-copy.md` | 激励 + 小庆祝句 + 动作引用 | `id` | `habit_slug`, `category`, `habit_env`, `incentive_text`, `small_celebration`, `offline_hint_id`(`ca_*`), `image_key`, `active` | tip「激励」←`incentive_text`；记后小庆祝←`small_celebration`；`offline_hint_id` → 动作库 |
| `celebration-actions.md` | **≥24** 线下动作库（主） | `id`(`ca_*`) | `title`, `body`, `env_tags`, `image_key`, `active` | 小庆祝 hint + 图 |
| `habit-board-milestones.md` | **12** 大庆祝里程碑 | `id`(`bm_*`) | `level`, `title`, `body`, `trigger_rule`, `image_key`, `repeatable` | board overlay + 分析页 12 格 |
| `offline-celebration-hints.md` | 旧 `och_*` 动作（兼容） | `id` | `title`, `body`, `image_key`, `categories`, `active` | 被 `celebration-actions` 合并进 seed |
| `habit-board-copy.md` | 分析页图例/汇总文案 | `id` | `slot`, `copy_text`, `active` | 分析看板 |

### 与旧表关系（Polish）

| 旧文件（初版） | 状态 |
|----------------|------|
| `emotion-copy.md` 的 approach/avoid（趋利/避害）成对说教 | **已退役**：由 `celebration-copy.md` 取代；构建脚本不再打入 |
| `habit-micro-steps.md` | **已改名**为 `micro-steps.md`（旧文件仅保留跳转说明） |

### 匹配规则（消费端）

1. 对某 `slug`：取 `active=1` 且 `habit_slug=slug` 的行；若无，再取同 `category`；再无则取 `habit_slug` 与 `category` 皆空的通用行。  
2. 微步骤：仅按 `habit_slug` 精确匹配，按 `sort` 升序；**永不**写入今日打卡清单，无分钟、无 `habit_logs`。  
3. 家长自定义微步骤 / 自定义习惯标题：存在用户库，**不进**本目录。

## 编辑约定

1. **只改表格行，勿改列名**（`build-habit-content` 按表头解析）。  
2. 新增用新 `slug`/`id`；停用写 `active=0`，勿复用已删 id。  
3. 用户面文案一律**简体中文**。  
4. 家长话术建议 **≤28 字**（chip 旁一行）；激励/小庆祝建议 **≤16 字**。  
5. 微步骤动词向下拆：具体、能立刻做、不讲大道理。  
6. **禁止医疗/疗效承诺**（如「防蛀牙」「治疗失眠」「长高保证」）；卫生/睡眠类只写可感当下体验。  
7. **禁止说教词/趋利避害讲义**：如「少后悔」「为未来负责」「少浪费人生」「你应该明白」等。抽检时可维护禁词表。  
8. 发版检查：可解析、无空主键、活跃种子尽量各有 ≥1 微步骤 + ≥1 话术 + ≥1 庆祝行；`offline_hint_id` 空则允许文字 fallback。

## 与设置 UI 的关系

| 谁改 | 改什么 | 载体 |
|------|--------|------|
| 家长 | 启用哪些种子、自定义标题、排序、后续自定义微步骤 | App 设置 → SQLite / iCloud |
| Kai / 内容 | 默认话术、短激励、小庆祝、种子默认微步骤 | 本目录表 → App 发版 |

## 内容原则（摘要）

- **B=MAP**：Motivation 用具体感受；Ability 用微步骤降难度；Prompt 给家长「当下能说的一句」。  
- **庆祝塑造习惯**：小庆祝一句 + 可选线下动作，代替趋利/避害讲座。  
- **向下拆，不向上讲**：宁可「先挤牙膏」也不要「养成终身好习惯」。

详见 Project store：`internal/fogg-content-notes.md`；仓内仍保留 `offline-celebration-hints.md`、`habit-board-copy.md`。
