# 短激励 + 小庆祝（可编辑）

> **取代**初版 `emotion-copy` 的 approach/avoid（趋利/避害）成对说教。  
> `incentive_text`：记前 chip 旁，具体可感，不讲大道理。  
> `small_celebration`：记后小庆祝一句（可配动效/音效键，由多媒体后置）。  
> `offline_hint_id`：可选关联线下动作（与 `och_*` 对齐；空则仅文字）。

| id | habit_slug | category | incentive_text | small_celebration | offline_hint_id | active |
|----|------------|----------|----------------|-------------------|-----------------|--------|
| cc_brush | brush_teeth | hygiene | 口气清新 | 牙齿保卫战，击掌！ | och_high_five | 1 |
| cc_brushe | brush_evening | hygiene | 嘴巴香香的 | 夜间清洁完成 | och_high_five | 1 |
| cc_wash_f | wash_face | hygiene | 脸蛋清爽 | 洗脸打卡亮一下 | och_high_five | 1 |
| cc_hands | wash_hands | hygiene | 小手干干净净 | 洗手完成，开饭 | och_high_five | 1 |
| cc_floss | floss_once | hygiene | 缝隙清清爽爽 | 牙线一次成功 | och_high_five | 1 |
| cc_towel | tidy_bathroom | hygiene | 毛巾归位了 | 浴室整齐一分 | och_shoulder | 1 |
| cc_bed | bedtime_on_time | sleep | 身体开始放松 | 上床充电开始 | och_pillow | 1 |
| cc_nophone | no_phone_bed | sleep | 眼睛可以歇歇 | 屏幕放下了 | och_pillow | 1 |
| cc_lights | lights_out | sleep | 房间暗下来了 | 关灯仪式完成 | och_pillow | 1 |
| cc_wake | morning_wake | sleep | 新的一天见面 | 起床第一步成功 | och_spin | 1 |
| cc_read1 | read_one_page | reading | 故事又前进一页 | 又一页！ | och_high_five | 1 |
| cc_read10 | read_ten_min | reading | 沉浸在故事里 | 十分钟阅读到位 | och_high_five | 1 |
| cc_poem | recite_poem | reading | 嘴里有一句诗 | 古诗一句进袋 | och_high_five | 1 |
| cc_vocab | vocab_five | reading | 多认识几个词 | 五个词收下 | och_fridge | 1 |
| cc_story | listen_story | reading | 耳朵吃饱故事 | 故事听到尾 | och_high_five | 1 |
| cc_makebed | make_bed | chores | 床面平整好看 | 叠被完成 | och_shoulder | 1 |
| cc_desk | tidy_desk | chores | 桌面清爽 | 书桌归位 | och_shoulder | 1 |
| cc_toys | put_away_toys | chores | 玩具有了家 | 收玩具完成 | och_shoulder | 1 |
| cc_trash | trash_out | chores | 家里更清爽 | 垃圾送走 | och_fridge | 1 |
| cc_plant | water_plant | chores | 叶子喝到水 | 浇水完成 | och_shoulder | 1 |
| cc_table | set_table | chores | 饭桌准备好 | 碗筷摆齐 | och_shoulder | 1 |
| cc_shoe | shoe_rack | chores | 门口整齐 | 鞋子摆齐 | och_shoulder | 1 |
| cc_hamper | clothes_hamper | chores | 脏衣进篮 | 衣物归位 | och_shoulder | 1 |
| cc_thank | thank_you | kindness | 谢谢说出口 | 温暖一句送达 | och_hug | 1 |
| cc_help | help_sibling | kindness | 被需要的感觉 | 帮忙一次看见 | och_shoulder | 1 |
| cc_share | share_toy | kindness | 一起玩更开心 | 分享成功 | och_hug | 1 |
| cc_greet | greeting | kindness | 对方会回以微笑 | 主动问好 | och_high_five | 1 |
| cc_pet | feed_pet | kindness | 小动物靠你 | 喂食完成 | och_shoulder | 1 |
| cc_call | call_grandma | kindness | 声音连到长辈 | 问候送到 | och_hug | 1 |
| cc_game | family_game | kindness | 一起笑一场 | 亲子一局完成 | och_spin | 1 |
| cc_out | outdoor_ten | movement | 身体暖起来 | 户外十分钟 | och_spin | 1 |
| cc_stretch | stretch | movement | 肩膀松一点 | 伸展完成 | och_spin | 1 |
| cc_stairs | stairs_walk | movement | 腿脚在动 | 一层楼梯达成 | och_spin | 1 |
| cc_squat | pushup_or_squat | movement | 肌肉醒一醒 | 五个动作完成 | och_spin | 1 |
| cc_stretchb | stretch_bed | movement | 身体舒展开 | 起床懒腰完成 | och_spin | 1 |
| cc_water | drink_water | health | 喉咙润润的 | 咕咚一杯完成 | och_high_five | 1 |
| cc_fruit | fruit_one | health | 嘴里甜甜的 | 水果一份完成 | och_fridge | 1 |
| cc_snack | no_snack_rush | health | 吃得更从容 | 停下再吃 | och_fridge | 1 |
| cc_vit | vitamin | health | 今日份完成 | 按时吃过了 | och_fridge | 1 |
| cc_lunch | lunch_finish | health | 肚子踏实 | 饭碗清空 | och_high_five | 1 |
| cc_hw | homework_start | study | 本子打开了 | 作业开动 | och_fridge | 1 |
| cc_hwfocus | homework_focus | study | 注意力在题上 | 专注段完成 | och_fridge | 1 |
| cc_bag | bag_pack | study | 明天不慌乱 | 书包收好 | och_fridge | 1 |
| cc_mistake | review_mistakes | study | 这道题弄明白 | 错题订正 | och_fridge | 1 |
| cc_plan | plan_tomorrow | study | 明天心里有数 | 一件事写下 | och_fridge | 1 |
| cc_math | math_drill | study | 脑子转起来 | 五题口算完成 | och_fridge | 1 |
| cc_piano | practice_instrument | arts | 琴声出来了 | 练琴五分钟 | och_spin | 1 |
| cc_draw | draw_one | arts | 纸上留下痕迹 | 小画完成 | och_spin | 1 |
| cc_sing | sing_one | arts | 歌声在房间 | 一首歌唱完 | och_spin | 1 |
| cc_journal | journal_line | arts | 今天留下一句 | 日记一句记下 | och_high_five | 1 |
| cc_screen | screen_limit | screen | 说到做到的感觉 | 准时下线 | och_dance | 1 |
| cc_oneep | one_show_only | screen | 一集就够了 | 看完即停 | och_dance | 1 |
| cc_breath | deep_breath | calm | 胸口松一点 | 三次呼吸完成 | och_hug | 1 |
| cc_quiet | quiet_five | calm | 耳朵安静下来 | 安静五分钟 | och_hug | 1 |
| cc_nature | nature_look | calm | 看见一片风景 | 观察一刻 | och_generic | 1 |
| cc_hygiene | | hygiene | 清清爽爽 | 清洁完成，击掌 | och_high_five | 1 |
| cc_sleep | | sleep | 身体准备休息 | 休息这一步到位 | och_pillow | 1 |
| cc_chores | | chores | 家里更整齐 | 家务一小步 | och_shoulder | 1 |
| cc_kind | | kindness | 被看见的温暖 | 善意被记下 | och_hug | 1 |
| cc_move | | movement | 身体更有劲 | 动起来了 | och_spin | 1 |
| cc_health | | health | 照顾好自己一下 | 健康一小步 | och_fridge | 1 |
| cc_study | | study | 心里更踏实 | 学习一小步 | och_fridge | 1 |
| cc_arts | | arts | 创作留下来了 | 艺术一小步 | och_spin | 1 |
| cc_screen_c | | screen | 约定守住了 | 屏幕约定达成 | och_dance | 1 |
| cc_calm | | calm | 心里稳一点 | 平静一刻 | och_hug | 1 |
| cc_reading | | reading | 故事在脑子里 | 阅读一小步 | och_high_five | 1 |
| cc_generic | | | 被看见真好 | 做到了，一起高兴 | och_generic | 1 |

## 已废弃写法（勿回填）

| 类型 | 反例 | 原因 |
|------|------|------|
| 避害说教 | 少牙痛、少后悔、少浪费时间 | 向上抽象 / 易成医疗暗示 |
| 趋利讲座 | 为未来负责、养成终身习惯 | 大道理，chip 旁放不下也不想听 |
| 正确替代 | 口气清新 + 击掌小庆祝 | 当下可感 + 即时庆祝 |
