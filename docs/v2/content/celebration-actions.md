# 小庆祝动作库（≥24 · 可编辑）

> 记后**线下**亲子动作建议（非 App 内体感）。多媒体用 `image_key` 另出图。  
> **与 tip 图标文案无关**（tip / 微步骤图另册）。  
> `env_tag`：动作允许的环境；种子映射必须匹配（睡觉相关禁站起/跳起类）。

## 环境标签

| env_tag | 含义 | 禁例 |
|---------|------|------|
| `quiet_bed` | 卧床/睡前躺坐：轻声、小幅度 | **禁止**站起、跳、转圈、胜利舞 |
| `seated` | 坐姿（书桌/餐桌） | 禁止跳起、大范围转圈 |
| `standing` | 可站立、轻活动 | — |
| `outdoor` | 户外 | — |
| `any` | 多数场景可用（仍避免在 quiet_bed 种子上挂 standing-only） | — |

> 一动作可标多个 env（逗号分隔）。匹配：种子 `habit_env` ⊆ 动作 env，或动作含 `any` 且种子非强制 quiet_bed 时可用；**sleep / 卧听故事** 仅用含 `quiet_bed` 的动作。

| id | title | body | env_tags | image_key | active |
|----|-------|------|----------|-----------|--------|
| ca_high_five | 击掌 | 面对面击掌，短促有力说「做到了！」 | standing,any | img-ca-high-five | 1 |
| ca_fist_bump | 碰拳 | 轻碰拳头一下，相视一笑 | standing,any | img-ca-fist-bump | 1 |
| ca_elbow_bump | 碰肘 | 轻轻碰一下手肘 | standing,any | img-ca-elbow-bump | 1 |
| ca_shoulder_bump | 碰肩 | 站着轻碰肩膀，说「我看见你了」 | standing | img-ca-shoulder-bump | 1 |
| ca_hug_3s | 拥抱三秒 | 抱一下，默数到三 | standing,any | img-ca-hug-3s | 1 |
| ca_thumbs_up | 竖大拇指 | 对孩子竖起大拇指并点头 | any | img-ca-thumbs-up | 1 |
| ca_air_high_five | 隔空击掌 | 隔空「啪」一下，不必碰到 | any | img-ca-air-high-five | 1 |
| ca_nod_smile | 点头微笑 | 蹲下或平视，点头微笑 | any | img-ca-nod-smile | 1 |
| ca_mirror_wink | 对镜眨眼 | 一起对着镜子眨眨眼 | standing | img-ca-mirror-wink | 1 |
| ca_fridge_star | 冰箱贴纸 | 在贴纸墙/冰箱贴一颗星（或口头加星） | standing | img-ca-fridge-star | 1 |
| ca_spin_clap | 转圈鼓掌 | 原地小转一圈，再鼓掌三下 | standing | img-ca-spin-clap | 1 |
| ca_victory_dance | 胜利小舞 | 一起跳两下傻傻胜利舞 | standing | img-ca-victory-dance | 1 |
| ca_jump_once | 原地跳一下 | 轻轻跳一下再落地站稳 | standing | img-ca-jump-once | 1 |
| ca_desk_tap | 敲敲桌子 | 用手指关节在桌面轻叩两下 | seated | img-ca-desk-tap | 1 |
| ca_chair_shimmy | 坐着晃肩 | 坐着左右晃晃肩膀两下 | seated | img-ca-chair-shimmy | 1 |
| ca_pencil_twirl | 笔转庆祝 | 笔或手指转一小圈，说「收工」 | seated | img-ca-pencil-twirl | 1 |
| ca_silent_clap | 无声鼓掌 | 双手轻轻合两下，不出大声 | quiet_bed,seated,any | img-ca-silent-clap | 1 |
| ca_whisper_ok | 贴耳轻说「成功了」 | 贴近耳边轻声说「成功了」 | quiet_bed,seated,any | img-ca-whisper-ok | 1 |
| ca_quiet_heart | 胸口比心 | 双手在胸口比心，停一秒 | quiet_bed,seated,any | img-ca-quiet-heart | 1 |
| ca_pillow_bump | 碰枕头 | 轻轻碰一下枕头，宣布充电完成 | quiet_bed | img-ca-pillow-bump | 1 |
| ca_blanket_squeeze | 抱抱被子 | 把被子搂紧一下再放松 | quiet_bed | img-ca-blanket-squeeze | 1 |
| ca_toe_wiggle | 躺着抬起脚敲敲床 | 人躺着，抬起脚，用脚敲敲床面（五根脚趾清晰） | quiet_bed | img-ca-toe-wiggle | 1 |
| ca_bed_shoulder | 床上轻碰肩 | 躺/坐在床上轻轻碰一下肩 | quiet_bed | img-ca-bed-shoulder | 1 |
| ca_outdoor_spin | 户外转一圈 | 在户外原地转一小圈 | outdoor | img-ca-outdoor-spin | 1 |
| ca_nature_point | 指一下风景 | 指一下树或天空，说「看见了」 | outdoor,any | img-ca-nature-point | 1 |
| ca_double_high_five | 双击掌 | 击掌两次，第二次可以轻一点 | standing,any | img-ca-double-high-five | 1 |
| ca_cheek_soft | 轻轻点额头 | 用指尖轻轻点一下额头（征得同意） | any | img-ca-cheek-soft | 1 |
| ca_seated_stretch | 坐姿伸臂 | 坐着向上伸一下手臂再放下 | seated,quiet_bed | img-ca-seated-stretch | 1 |

## 旧 id 对照（迁移）

| 旧 och_* | 新 ca_* |
|----------|---------|
| och_high_five | ca_high_five |
| och_pillow | ca_pillow_bump |
| och_shoulder | ca_shoulder_bump |
| och_spin | ca_spin_clap |
| och_fridge | ca_fridge_star |
| och_hug | ca_hug_3s |
| och_dance | ca_victory_dance |
| och_generic | ca_nod_smile |
