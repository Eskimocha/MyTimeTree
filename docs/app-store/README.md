# App Store 必备文案（Phase 5）

本目录供 App Store Connect / TestFlight 上架使用。

| 文件 | 用途 |
|------|------|
| [privacy-policy.zh-Hans.html](./privacy-policy.zh-Hans.html) | **隐私政策**可托管网页（Connect 必填 HTTPS URL） |
| [privacy-policy.zh-Hans.md](./privacy-policy.zh-Hans.md) | 隐私政策说明与摘要 |
| [privacy-nutrition-labels.md](./privacy-nutrition-labels.md) | **App 隐私**营养标签怎么勾 |
| [review-notes.md](./review-notes.md) | **审核附注**可直接粘贴 |
| [store-listing.zh-Hans.md](./store-listing.zh-Hans.md) | 副标题 / 描述 / 关键词等商店文案 |

## 你需要亲手改的两处

1. ~~隐私政策联系邮箱~~ → 已设为 `kaiak.fang@gmail.com`  
2. 审核备注、商店页里的「隐私政策 URL / 支持 URL / 版权署名」（URL 需托管后填入）

## 隐私政策如何变成 HTTPS 链接（任选）

- **GitHub Pages**：把 `privacy-policy.zh-Hans.html` 发到公开仓库 `docs/` 或 `gh-pages`，开启 Pages 后得到  
  `https://<user>.github.io/<repo>/privacy-policy.zh-Hans.html`  
- **自有域名 / 对象存储静态站**：上传该 HTML 即可  
- 临时验证：用任意可公网访问的静态托管；审核期间链接必须能打开  

本地预览：

```bash
open docs/app-store/privacy-policy.zh-Hans.html
```
