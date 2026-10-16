# 习惯文本资源清单（逐条审阅用）

- 修订：2026-10-16g（小庆动作 28 + 里程碑 12；绑定对齐 `celebration-actions` / `celebration-copy` / KEYS v2 图）
- **28+12 与 tip 图标无关**
- 睡觉相关仅 `quiet_bed` 动作
- **已弃用旧名（勿再作现行绑定）**：脚趾动一动 · 轻声说成功 · 桌面轻敲 · 躺着抬起脚敲敲床 · 十五次（`bm_life_15`）

## 0. 总览

| 表 | 活跃 | 文件 |
|----|------|------|
| 种子 | 55 | habit-templates.md |
| 微步骤 | 55 | micro-steps.md |
| 毛伊 | 67 | maui-habits.md |
| 家长话术 | 67 | parent-scripts.md |
| 激励 + 小庆祝句 | 55+ | celebration-copy.md（`incentive_text`保留字段，tip **不展示**；`small_celebration`→记后；→ `ca_*`） |
| 小庆祝动作 | **28** | celebration-actions.md（真源） |
| 里程碑达成奖章 | **12** | habit-board-milestones.md（UI 标题；无十五次；含二百次） |

环境匹配：**通过**（以 `celebration-copy` × `celebration-actions.env_tags` 为准）

## A. 小庆祝动作库（= celebration-actions 现行 28）

| id | 标题 | env | image_key |
|----|------|-----|-----------|
| `ca_high_five` | 击掌 | standing,any | `img-ca-high-five` |
| `ca_fist_bump` | 碰拳 | standing,any | `img-ca-fist-bump` |
| `ca_elbow_bump` | 碰肘 | standing,any | `img-ca-elbow-bump` |
| `ca_shoulder_bump` | 碰肩 | standing | `img-ca-shoulder-bump` |
| `ca_hug_3s` | 拥抱三秒 | standing,any | `img-ca-hug-3s` |
| `ca_thumbs_up` | 竖大拇指 | any | `img-ca-thumbs-up` |
| `ca_air_high_five` | 隔空击掌 | any | `img-ca-air-high-five` |
| `ca_nod_smile` | 点头微笑 | any | `img-ca-nod-smile` |
| `ca_mirror_wink` | 对镜眨眼 | standing | `img-ca-mirror-wink` |
| `ca_fridge_star` | 冰箱贴纸 | standing | `img-ca-fridge-star` |
| `ca_spin_clap` | 转圈鼓掌 | standing | `img-ca-spin-clap` |
| `ca_victory_dance` | 胜利小舞 | standing | `img-ca-victory-dance` |
| `ca_jump_once` | 原地跳一下 | standing | `img-ca-jump-once` |
| `ca_desk_tap` | 敲敲桌子 | seated | `img-ca-desk-tap` |
| `ca_chair_shimmy` | 坐着晃肩 | seated | `img-ca-chair-shimmy` |
| `ca_pencil_twirl` | 笔转庆祝 | seated | `img-ca-pencil-twirl` |
| `ca_silent_clap` | 无声鼓掌 | quiet_bed,seated,any | `img-ca-silent-clap` |
| `ca_whisper_ok` | 贴耳轻说「成功了」 | quiet_bed,seated,any | `img-ca-whisper-ok-v2` |
| `ca_quiet_heart` | 胸口比心 | quiet_bed,seated,any | `img-ca-quiet-heart` |
| `ca_pillow_bump` | 碰枕头 | quiet_bed | `img-ca-pillow-bump` |
| `ca_blanket_squeeze` | 抱抱被子 | quiet_bed | `img-ca-blanket-squeeze` |
| `ca_toe_wiggle` | 躺卧踩单车 | quiet_bed | `img-ca-toe-bike-v2` |
| `ca_bed_shoulder` | 床上轻碰肩 | quiet_bed | `img-ca-bed-shoulder` |
| `ca_outdoor_spin` | 户外转一圈 | outdoor | `img-ca-outdoor-spin` |
| `ca_nature_point` | 指一下风景 | outdoor,any | `img-ca-nature-point` |
| `ca_double_high_five` | 双击掌 | standing,any | `img-ca-double-high-five` |
| `ca_cheek_soft` | 轻轻点额头 | any | `img-ca-cheek-soft` |
| `ca_seated_stretch` | 坐姿伸臂 | seated,quiet_bed | `img-ca-seated-stretch` |

## B. 大庆祝 12 级（= habit-board-milestones；已去十五次、含二百次）

| Lv | id | 标题 | 触发 | image_key |
|----|-----|------|------|-----------|
| 1 | `bm_first` | 第一颗星 | `lifetime_logs >= 1` | `img-bm-01` |
| 2 | `bm_life_5` | 五次打卡 | `lifetime_logs >= 5` | `img-bm-02` |
| 3 | `bm_life_30` | 三十次 | `lifetime_logs >= 30` | `img-bm-04` |
| 4 | `bm_streak_3` | 连续三天 | `streak_days >= 3` | `img-bm-05` |
| 5 | `bm_week_5` | 本周满五 | `week_logs >= 5` | `img-bm-06` |
| 6 | `bm_life_60` | 六十次 | `lifetime_logs >= 60` | `img-bm-07` |
| 7 | `bm_streak_7` | 连续七天 | `streak_days >= 7` | `img-bm-08` |
| 8 | `bm_week_cats_3` | 本周三色 | `week_categories >= 3` | `img-bm-09` |
| 9 | `bm_life_100` | 一百次 | `lifetime_logs >= 100` | `img-bm-10` |
| 10 | `bm_life_200` | 二百次 | `lifetime_logs >= 200` | `img-bm-03` |
| 11 | `bm_streak_14` | 连续十四天 | `streak_days >= 14` | `img-bm-11` |
| 12 | `bm_month_20` | 月满二十 | `month_logs >= 20` | `img-bm-12` |

---

## 1. 按种子映射

### `hygiene`

#### 1. `brush_teeth` · 刷牙

- 微步骤：只刷一排座牙
- 毛伊：洗完脸立即刷牙
- 话术：这次我们只刷一排座牙吧？
- 激励：牙齿保卫战！ · 小庆祝：牙齿保卫战，击掌！ → `ca_high_five`「击掌」· seed_env=standing

#### 2. `wash_face` · 洗脸

- 微步骤：只洗额头
- 毛伊：对自己说：“我要美美的！”
- 话术：是时候洗一把脸了。
- 小庆祝：洗脸完成，亮一下 → `ca_mirror_wink`「对镜眨眼」· seed_env=standing

#### 3. `wash_hands` · 饭前洗手

- 微步骤：只搓手心三下
- 毛伊：搓搓手指说「准备开饭」
- 话术：开饭前，搓搓手心三下？
- 小庆祝：洗手完成，开饭 → `ca_high_five`「击掌」· seed_env=standing

#### 4. `floss_once` · 用牙线一次

- 微步骤：只清洁门牙缝一处
- 毛伊：洗完脸就用牙线
- 话术：这次只清洁门牙缝一处吧。
- 小庆祝：牙线一次成功 → `ca_mirror_wink`「对镜眨眼」· seed_env=standing

#### 5. `brush_evening` · 晚上刷牙

- 微步骤：只刷门牙
- 毛伊：洗完脸就刷牙
- 话术：睡前刷一下，只刷门牙也行。
- 小庆祝：夜间清洁完成 → `ca_thumbs_up`「竖大拇指」· seed_env=standing

#### 6. `tidy_bathroom` · 毛巾挂好

- 微步骤：只挂好毛巾一头
- 毛伊：洗完脸就挂毛巾
- 话术：把毛巾挂好一头就行。
- 小庆祝：浴室整齐一分 → `ca_thumbs_up`「竖大拇指」· seed_env=standing

### `sleep`

#### 7. `bedtime_on_time` · 按时上床

- 微步骤：只把身体躺平
- 毛伊：刷完牙就上床
- 话术：到点了，先上床。
- 激励：上床充电开始 · 小庆祝：上床充电开始 → `ca_pillow_bump`「碰枕头」· seed_env=quiet_bed

#### 8. `no_phone_bed` · 睡前不玩手机

- 微步骤：只把屏幕扣在桌上
- 毛伊：手机放下后深呼吸一次
- 话术：睡觉前，把屏幕扣在桌上。
- 小庆祝：屏幕放下了 → `ca_whisper_ok`「贴耳轻说「成功了」」· `img-ca-whisper-ok-v2` · seed_env=quiet_bed

#### 9. `lights_out` · 准时关灯

- 微步骤：只关掉主灯
- 毛伊：轻声说「晚安世界」
- 话术：该关灯了，先关主灯。
- 小庆祝：关灯仪式完成 → `ca_blanket_squeeze`「抱抱被子」· seed_env=quiet_bed

#### 10. `morning_wake` · 按时起床

- 微步骤：只把上身坐起来
- 毛伊：起床前先想象自己的笑脸
- 话术：该起来了，先坐起来。
- 小庆祝：默念“成功了！” → `ca_air_high_five`「隔空击掌」· seed_env=standing

### `reading`

#### 11. `read_one_page` · 读一页书

- 微步骤：只读本页第一段
- 毛伊：吃完零食读一下
- 话术：读一下本页第一段吧。
- 激励：又一页！ · 小庆祝：又一页！ → `ca_desk_tap`「敲敲桌子」· `img-ca-desk-tap` · seed_env=seated

#### 12. `read_note` · 记读书笔记

- 微步骤：只记一句金句
- 毛伊：读完书就写
- 话术：咱们一起找一句金句吧。
- 小庆祝：再欣赏一番自己的笔记吧 → `ca_pencil_twirl`「笔转庆祝」· seed_env=seated

#### 13. `recite_poem` · 背一句古诗

- 微步骤：只背出诗题
- 毛伊：拍拍胸口说「我能行」
- 话术：先背出诗题就好。
- 小庆祝：古诗一句进袋 → `ca_thumbs_up`「竖大拇指」· seed_env=any

#### 14. `vocab_five` · 记单词

- 微步骤：只读出前五个词
- 毛伊：吃完零食记一下
- 话术：先读出前五个词就好。
- 小庆祝：五个词收下 → `ca_desk_tap`「敲敲桌子」· seed_env=seated

#### 15. `listen_story` · 听完一个故事

- 微步骤：只点开播客就行
- 毛伊：上床后就开始听
- 话术：我播一个故事。
- 小庆祝：好故事让人开怀 → `ca_bed_shoulder`「床上轻碰肩」· `img-ca-bed-shoulder` · seed_env=quiet_bed

### `chores`

#### 16. `make_bed` · 叠被子

- 微步骤：只把被子拉齐一边
- 毛伊：起床就叠被子
- 话术：被子拉齐一边行吗？
- 小庆祝：叠被完成 → `ca_shoulder_bump`「碰肩」· seed_env=standing

#### 17. `tidy_desk` · 书桌归位

- 微步骤：只推回椅子
- 毛伊：起身后扫视桌面和椅子
- 话术：椅子推回去一下？
- 小庆祝：书桌归位 → `ca_chair_shimmy`「坐着晃肩」· seed_env=seated

#### 18. `put_away_toys` · 玩具收好

- 微步骤：把玩具扔进箱子
- 毛伊：表扬自己「我玩得好，收拾得也好」
- 话术：我们表扬一下自己吧？
- 小庆祝：玩具箱整洁又闪亮 → `ca_high_five`「击掌」· seed_env=standing

#### 19. `trash_out` · 倒垃圾

- 微步骤：只扎紧袋口
- 毛伊：出门前就扎袋
- 话术：先扎紧袋口就好。
- 小庆祝：垃圾送走 → `ca_fridge_star`「冰箱贴纸」· seed_env=standing

#### 20. `water_plant` · 给植物浇水

- 微步骤：只浇一点点到土面
- 毛伊：路过花盆就浇一点点
- 话术：浇一点点到土面就好。
- 小庆祝：浇水完成 → `ca_thumbs_up`「竖大拇指」· seed_env=standing

#### 21. `set_table` · 摆碗筷

- 微步骤：只摆好自己的碗
- 毛伊：开饭铃响就摆自己的碗
- 话术：先摆好自己的碗。
- 小庆祝：碗筷摆齐 → `ca_fist_bump`「碰拳」· seed_env=standing

#### 22. `shoe_rack` · 鞋子摆齐

- 微步骤：只摆好左脚那只
- 毛伊：进门就摆好左脚那只
- 话术：先摆好左脚那只。
- 小庆祝：鞋子摆齐 → `ca_elbow_bump`「碰肘」· seed_env=standing

#### 23. `clothes_hamper` · 脏衣服放篮

- 微步骤：只放进一件脏衣
- 毛伊：脱掉就塞进脏衣篮
- 话术：脏衣服先放进一件。
- 小庆祝：衣物归位 → `ca_nod_smile`「点头微笑」· seed_env=standing

### `kindness`

#### 24. `thank_you` · 说谢谢

- 微步骤：只说出「谢谢」两个字
- 毛伊：心里先默念「谢谢」
- 话术：可以说一声「谢谢」。
- 小庆祝：温暖一句送达 → `ca_hug_3s`「拥抱三秒」· seed_env=any

#### 25. `help_sibling` · 帮助家人一次

- 微步骤：只帮递一样东西
- 毛伊：走近时微笑一下
- 话术：帮递一样东西就好。
- 小庆祝：帮忙一次看见 → `ca_shoulder_bump`「碰肩」· seed_env=standing

#### 26. `share_toy` · 分享玩具

- 微步骤：只递出一件玩具
- 毛伊：递出前说「给你玩」
- 话术：先递出一件玩具吧。
- 小庆祝：分享成功 → `ca_fist_bump`「碰拳」· seed_env=standing

#### 27. `greeting` · 主动问好

- 微步骤：只说一声「你好」
- 毛伊：抬头前先微笑一下
- 话术：打个招呼，说声「你好」。
- 小庆祝：主动问好 → `ca_cheek_soft`「轻轻点额头」· `img-ca-cheek-soft` · seed_env=standing

#### 28. `feed_pet` · 喂宠物

- 微步骤：只倒进一小勺粮
- 毛伊：看到食盆就倒一小勺
- 话术：倒进一小勺粮就好。
- 小庆祝：喂食完成 → `ca_thumbs_up`「竖大拇指」· seed_env=standing

#### 29. `call_grandma` · 给长辈打电话问好

- 微步骤：只说完第一句问好
- 毛伊：拨号前说「想你了」
- 话术：先说完第一句问好。
- 小庆祝：问候送到 → `ca_silent_clap`「无声鼓掌」· seed_env=seated

#### 30. `family_game` · 亲子小游戏一局

- 微步骤：只完成第一回合
- 毛伊：开局前击掌一下
- 话术：先玩完第一回合就好。
- 小庆祝：亲子一局完成 → `ca_double_high_five`「双击掌」· seed_env=standing

### `movement`

#### 31. `outdoor_ten` · 户外活动十分钟

- 微步骤：只在户外走两分钟
- 毛伊：换上鞋就出门走两分钟
- 话术：出门走走，先两分钟。
- 小庆祝：户外十分钟 → `ca_outdoor_spin`「户外转一圈」· seed_env=outdoor

#### 32. `stretch` · 伸展身体

- 微步骤：只向上伸一次手臂
- 毛伊：站起来就伸一次手臂
- 话术：向上伸一次手臂就好。
- 小庆祝：伸展完成 → `ca_spin_clap`「转圈鼓掌」· seed_env=standing

#### 33. `stairs_walk` · 走楼梯一层

- 微步骤：只走完半层
- 毛伊：到楼梯口就走半层
- 话术：先走完半层楼梯。
- 小庆祝：一层楼梯达成 → `ca_jump_once`「原地跳一下」· seed_env=standing

#### 34. `pushup_or_squat` · 做五个深蹲/俯卧撑

- 微步骤：只做一次深蹲/俯卧撑
- 毛伊：开始前说「先做一个」
- 话术：先做一次深蹲/俯卧撑。
- 小庆祝：五个动作完成 → `ca_victory_dance`「胜利小舞」· seed_env=standing

#### 35. `stretch_bed` · 起床伸懒腰

- 微步骤：只向上伸一次懒腰
- 毛伊：坐起时说「今天会很棒」
- 话术：向上伸一次懒腰吧。
- 小庆祝：起床懒腰完成 → `ca_toe_wiggle`「躺卧踩单车」· `img-ca-toe-bike-v2` · seed_env=quiet_bed

### `health`

#### 36. `drink_water` · 喝一杯水

- 微步骤：只喝两口
- 毛伊：看到杯子就喝两口
- 话术：先喝两口就好。
- 小庆祝：咕咚一杯完成 → `ca_high_five`「击掌」· seed_env=any

#### 37. `fruit_one` · 吃一份水果

- 微步骤：只吃一口水果
- 毛伊：洗完水果就咬一口
- 话术：先吃一口水果就好。
- 小庆祝：水果一份完成 → `ca_fridge_star`「冰箱贴纸」· seed_env=standing

#### 38. `no_snack_rush` · 不边走边吃零食

- 微步骤：只停下脚步这一下
- 毛伊：停下时说「不着急」
- 话术：先停下脚步这一下。
- 小庆祝：停下再吃 → `ca_nod_smile`「点头微笑」· seed_env=any

#### 39. `vitamin` · 按时吃药/维生素

- 微步骤：只咽下今日份
- 毛伊：拿起今日份时点头一下
- 话术：该吃今天的份了，咽下就好。
- 小庆祝：按时吃过了 → `ca_thumbs_up`「竖大拇指」· seed_env=any

#### 40. `lunch_finish` · 把饭吃完

- 微步骤：只再吃三口
- 毛伊：坐下吃饭时说「慢慢吃」
- 话术：再吃三口就好。
- 小庆祝：饭碗清空 → `ca_desk_tap`「敲敲桌子」· seed_env=seated

### `study`

#### 41. `homework_start` · 按时开始作业

- 微步骤：只写题号
- 毛伊：打开本子就写题号
- 话术：先写题号就好。
- 小庆祝：作业开动 → `ca_desk_tap`「敲敲桌子」· seed_env=seated

#### 42. `homework_focus` · 专注作业二十五分钟

- 微步骤：只专注满五分钟
- 毛伊：计时响起就专注五分钟
- 话术：先专注满五分钟。
- 小庆祝：专注段完成 → `ca_pencil_twirl`「笔转庆祝」· seed_env=seated

#### 43. `bag_pack` · 收拾书包

- 微步骤：只放进一本书
- 毛伊：拉开拉链就放进一本书
- 话术：先放进一本书就好。
- 小庆祝：书包收好 → `ca_thumbs_up`「竖大拇指」· seed_env=standing

#### 44. `review_mistakes` · 订正一道错题

- 微步骤：只订正错题的第一步
- 毛伊：翻到错题就订正第一步
- 话术：先订正错题的第一步。
- 小庆祝：错题订正 → `ca_desk_tap`「敲敲桌子」· seed_env=seated

#### 45. `plan_tomorrow` · 写下明天一件事

- 微步骤：只写下明天一件事的三个字
- 毛伊：落笔前说「一件就够」
- 话术：先写下三个字就好。
- 小庆祝：一件事写下 → `ca_pencil_twirl`「笔转庆祝」· seed_env=seated

#### 46. `math_drill` · 口算五题

- 微步骤：只做第一题
- 毛伊：写下第一题号时微笑
- 话术：先做第一题就好。
- 小庆祝：五题口算完成 → `ca_desk_tap`「敲敲桌子」· seed_env=seated

### `arts`

#### 47. `practice_instrument` · 练琴五分钟

- 微步骤：只弹/吹一个音
- 毛伊：触键前说「一小会」
- 话术：先弹/吹一个音就好。
- 小庆祝：练琴五分钟 → `ca_thumbs_up`「竖大拇指」· seed_env=seated

#### 48. `draw_one` · 画一幅小画

- 微步骤：只画一条线
- 毛伊：落笔前说「先画一条线」
- 话术：先画一条线就好。
- 小庆祝：小画完成 → `ca_pencil_twirl`「笔转庆祝」· seed_env=seated

#### 49. `sing_one` · 唱一首歌

- 微步骤：只唱副歌一句
- 毛伊：开口前清嗓一下
- 话术：先唱副歌一句就好。
- 小庆祝：一首歌唱完 → `ca_double_high_five`「双击掌」· seed_env=standing

#### 50. `journal_line` · 写一句日记

- 微步骤：只写下日期
- 毛伊：打开本子说「留一句」
- 话术：先写下日期就好。
- 小庆祝：日记一句记下 → `ca_desk_tap`「敲敲桌子」· seed_env=seated

### `screen`

#### 51. `screen_limit` · 守时下线

- 微步骤：只按下暂停
- 毛伊：看时间时说「到点就停」
- 话术：到点了，先按下暂停。
- 小庆祝：准时下线 → `ca_victory_dance`「胜利小舞」· seed_env=standing

#### 52. `one_show_only` · 只看一集

- 微步骤：只看到片尾字幕
- 毛伊：开播前说「只看一集」
- 话术：看到片尾字幕就停。
- 小庆祝：看完即停 → `ca_air_high_five`「隔空击掌」· seed_env=seated

### `calm`

#### 53. `deep_breath` · 深呼吸三次

- 微步骤：只做一次深呼吸
- 毛伊：肩膀一沉就做一次呼吸
- 话术：先做一次深呼吸。
- 小庆祝：三次呼吸完成 → `ca_quiet_heart`「胸口比心」· seed_env=any

#### 54. `quiet_five` · 安静五分钟

- 微步骤：只安静满一分钟
- 毛伊：坐下时轻声说「安静一下」
- 话术：先安静满一分钟。
- 小庆祝：安静五分钟 → `ca_silent_clap`「无声鼓掌」· seed_env=seated

#### 55. `nature_look` · 观察一片叶子/天空

- 微步骤：只看一片叶子三秒
- 毛伊：望向窗外就看一片叶子
- 话术：看一片叶子三秒就好。
- 小庆祝：观察一刻 → `ca_nature_point`「指一下风景」· seed_env=outdoor

