# habit media（正式交付）

**生成器**：Cursor 内置 `GenerateImage`  
**风格锚点**：仓内 `src/mytimetree/static/portal/ornaments/*`（副本在 `_style-refs/`，**勿进包**）

| 文件 | 角色 | image_key / id |
|------|------|----------------|
| `icon-tip-seed.png` (+ `@2x`) | 种子旁 tip | ui.tip_seed |
| `mark-celeb-small.png` (+ `@2x`) | 小庆祝 mark | ui.celeb_small |
| `img-high-five.png` (+ `@2x`) | 击掌 | `img-high-five` |
| `img-pillow-bump.png` (+ `@2x`) | 碰枕头 | `img-pillow-bump` |

- 格式：透明底 PNG 256（主）/ 512（@2x）；**工程侧优先 PNG**，无 SVG 交付。
- 进包：拷到 `src/mytimetree/static/portal/habit/`（排除 `_style-refs/`）。
