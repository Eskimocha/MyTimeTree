# MyTimeTree UI 主题说明

> 权威来源：`src/mytimetree/static/portal/styles.css`（`:root` + `.btn`）  
> 移动端锁屏/设置补充：`mobile/www-src/local/lock.css`  
> 树与挂件插画选型见 `docs/tree-visual-design-options.md`（绘本草地 Storybook）。

本文记录**当前已落地**的色板、字体与按钮约定，改 UI 时先对照此文档，避免再出现「主操作按钮底色不一致」。

---

## 1. 气质一句话

浅绿草地 + 暖阳点缀；圆角、轻量；**不是**紫炫光、也不是奶油 terracotta、也不是报纸风。主文案色偏墨绿，主操作是**叶绿 → 深绿渐变**白字。

---

## 2. CSS 变量（`:root`）

| Token | 值 | 用途 |
|-------|-----|------|
| `--sky-top` | `#d8eefc` | 页背景上沿天蓝 |
| `--sky-mid` | `#eef8f1` | 页背景中段浅绿 |
| `--leaf` | `#2f9e6b` | 叶绿（主色亮端） |
| `--leaf-deep` | `#1a6b48` | 叶绿深（主色暗端 / 强调字） |
| `--sun` | `#f5b942` | 暖阳（装饰渐变、挂件太阳） |
| `--ink` | `#1a3d32` | 正文墨色 |
| `--muted` | `#5a7268` | 次要说明文字 |
| `--surface` | `rgba(255,255,255,0.72)` | 半透明面板 |
| `--brand` | `#1a3d32` | 品牌字色（与 ink 同） |
| `--danger` | `#e53935` | 危险/错误 |
| `--ok` | `#43a047` | 成功态（少用；状态灯可用 leaf） |
| `--radius` | `18px` | 大圆角基准 |
| `--font-display` | `"Fredoka", "Noto Sans SC", sans-serif` | 标题/品牌 |
| `--font-body` | `"Noto Sans SC", system-ui, sans-serif` | 正文 |
| `--gutter-x` | `0.75rem` | 左右内边距（再加 safe-area） |
| `--gutter-top` | `0.25rem` | 顶内边距 |
| `--gutter-bottom` | `2rem` | 底内边距 |

**页面背景（勿改成纯平色）**

```css
background:
  radial-gradient(120% 80% at 10% -10%, #fff6d6 0%, transparent 45%),
  linear-gradient(165deg, var(--sky-top), var(--sky-mid) 55%, #f4faf6);
```

**常用实色（无变量但已广泛使用）**

| 色 | 用途 |
|----|------|
| `#dff3e8` | 次要按钮底、浅绿强调底 |
| `#c9ddd3` | 分隔线 / 边框 |
| `#f3faf6` / `#f7fcf8` | 列表块、弹层底 |
| `#0f2f26` | 列表强调字（略深于 ink） |
| `#2f9e6b33` / `#e5393533` | 状态灯外晕 |

---

## 3. 按钮约定（主题一致性核心）

门户与设置页统一三类按钮。**主操作必须用 `.btn.primary`，不要手写纯色深底。**

| 类型 | Class | 外观 | 典型用法 |
|------|-------|------|----------|
| **主操作** | `.btn.primary` | `linear-gradient(135deg, var(--leaf), var(--leaf-deep))` + 白字（无阴影） | 「保存设置」「开始种植」「立即同步到 iCloud」「确认恢复」 |
| **次要** | `.btn`（默认） | 底 `#dff3e8`，字 `var(--leaf-deep)` | 「刷新状态」「修改家长密码」「从 iCloud 恢复」 |
| **危险** | `.btn.danger` | 底 `var(--danger)`，白字 | 清除数据、删除账户 |

**开关（Switch）**

- 设置页「Face ID 解锁」使用横向开关（`.faceid-switch`），非原生 checkbox 方框。
- 关：轨道 `#c9ddd3`；开：与 primary 相同叶绿→深绿渐变；滑块白圆。
- 尺寸约 51×31（接近 iOS switch）。

**样式定义（portal）**

```css
.btn {
  border: 0;
  border-radius: 14px;
  padding: 0.85rem 1rem;
  font: inherit;
  font-weight: 600;
  background: #dff3e8;
  color: var(--leaf-deep);
}
.btn.primary {
  background: linear-gradient(135deg, var(--leaf), var(--leaf-deep));
  color: #fff;
}
```

锁屏层（`.app-lock .btn.primary`）使用相同渐变色值，保证解锁页与门户一致。

### 反例（已纠正，勿再引入）

- 主操作写成纯色 `#1a3d32` 平底 → 与「保存设置」不一致  
- 恢复类破坏性操作误用红字/无主题边框 → 应仍用次要 `.btn` + 文案说明风险  

---

## 4. 状态灯（iCloud 等）

| 态 | Class | 色 |
|----|-------|-----|
| 可用 | `.sync-status-dot.ok` | `#2f9e6b` |
| 不可用 | `.sync-status-dot.bad` | `#e53935` |
| 警告（如模拟器） | `.sync-status-dot.warn` | `#c9a227` |

---

## 5. 表单与触控

- 输入框 / select / textarea：**`font-size: 16px`**（避免 iOS 聚焦自动缩放）  
- 中文答案区：优先 `<textarea rows="1" lang="zh-CN">`，勿随意 `autocapitalize/autocorrect="off"`  
- 面板聚焦时避免 `backdrop-filter`（WKWebView IME 问题）  
- 圆角控件边框：`#c9ddd3`；聚焦描边可用 `#2f9e6b` / `#2f9e6b55`

---

## 6. 布局尺度

- 内容最大宽：约 `430px`（`.portal`）  
- 大卡片圆角：约 `18–22px`；按钮：`14px`  
- 设置分区：顶部分隔线 `1px solid #c9ddd3`  
- 安全区：用 `env(safe-area-inset-*)` 加在 padding；**不要**把 safe-area 存进会算成 0 的自定义属性再复用（WKWebView 坑）  
- **主屏垂直（方案 A）**：`--frame-pad`（约 `0.55rem`）作顶底同一呼吸边距 `S`；`padding-top/bottom = safe-area + S`。`.main` / `#tab-home` 纵向 flex，剩余高度给 `#tab-home .tree-scene`（取消固定 5:4）。矮屏（`max-height: 720px`）允许主屏滚动并略减树最小高。  
- **版本号**：`.app-version` 绝对定位，垂直居中于底部空隙 `(safe-area-bottom + S)` 的中点（`bottom: (…) / 2` + `translateY(50%)`），**不参与**上下对称、不占 flex；勿贴主框底。文案来自 `APP_VERSION`（当前 `1.0.0`）。

---

## 7. 改主题时的检查清单

1. 只改 `:root` 变量，还是同时改了 lock.css 里写死的同色 hex？两边要一起改。  
2. 新主操作按钮是否加了 `primary`？  
3. 危险操作是否误用了 primary 绿渐变？应 `danger` 或次要 + 确认弹窗。  
4. 截图对比：「保存设置」与新主按钮在真机上是否同一套绿渐变。  
5. 主屏：标题距灵动岛底 ≈ 操作按钮区距屏幕底（目测 `S`）；长机不应再出现大块底空。

---

## 8. 相关文件

| 文件 | 内容 |
|------|------|
| `src/mytimetree/static/portal/styles.css` | 主题变量与门户组件 |
| `src/mytimetree/static/portal/index.html` | 门户结构（含「保存设置」） |
| `mobile/www-src/local/lock.css` | 锁屏、设置安全/iCloud 区块、Capacitor 壳布局 |
| `mobile/www-src/local/lock.js` | 设置页注入 DOM（按钮 class） |
| `docs/tree-visual-design-options.md` | 树/挂件视觉选型 |
