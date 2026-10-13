# MyTimeTree 习惯 Tab — 设计检查清单（H7.1）

评审对象：家长端 Portal「习惯」模块（浅色儿童主题，移动优先）

## 必须满足

- [x] **习惯 Tab** 进入主壳导航（与主屏/流水并列）
- [x] **今日清单**：一键「记录」完成打卡
- [x] **小庆祝**：记录后展示情绪路径 / celebration 反馈（动效）
- [x] **待兑换**：可单笔或批量兑换入账
- [x] **好习惯总表**：展示当日记录与统计；触发大庆祝时可见反馈
- [x] **小红点**：Tab 上 badge = 今日未记录习惯数（Q10）
- [x] 保持既有浅色儿童主题与 Fredoka / Noto Sans SC 字体

## 动效

- 小庆祝卡片 `celeb-pop`
- Tab 切换既有 `rise`
- 记录按钮沿用按压反馈

## 原型路径

`src/mytimetree/static/portal/`（`#tab-habits`）
