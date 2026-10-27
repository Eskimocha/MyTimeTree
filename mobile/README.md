# MyTimeTree — Capacitor 单机壳（iOS + Android）

完全离线；本机 SQLite（sql.js）；家长密码 + 生物识别；安全问题可重置密码。

- **iOS**：整库经 `ICloudDb` 写入本机 + iCloud Documents。
- **Android**：同名 `ICloudDb` 仅本机 `filesDir`；**无云同步**；设置里「本地备份」导出/导入整库。

## 命令

```bash
export PATH="$HOME/.local/node/bin:$PATH"
cd mobile
npm install

# iOS（发版路径不变）
npm run cap:sync
npm run open:ios

# Android
npm run cap:sync:android
npm run open:android
# Debug APK：
npm run build:android:debug
# Release 签名 APK（需 android/keystore.properties，见 keystore.properties.example）：
npm run build:android:release
# APK: android/app/build/outputs/apk/release/app-release.apk
```

大陆自分发：用 Release 签名包；**勿**把 `.jks` / 密码提交进 git。

改过 iOS 原生插件 / entitlements 后：Xcode **Product → Clean Build Folder**，再 Run。

## Phase 2 验收（锁屏）

### 若提示「密码不正确」（旧数据）

锁屏点 **忘记密码？**  
- 若无安全问题 → **清除本机数据并重新开户**（会丢掉旧树数据）  
- 重新开户时会要求设置安全问题

### 新流程

1. 开户：昵称 + 密码 + **安全问题/答案** + 利率  
2. 冷启动锁屏 → 密码解锁  
3. 解锁后若设备支持 Face ID → 询问是否启用（设置里也可开关）  
4. Face ID：先点「使用 Face ID 解锁」弹出系统框，模拟器再选 **Matching Face**  
5. 忘记密码 → 答安全问题 → 设新密码  

## Phase 3 验收（iCloud 整库）

1. Xcode → **Signing & Capabilities** → 确认 **iCloud** 且勾选 **iCloud Documents**（容器 `iCloud.com.mytimetree.app`）
2. 真机请登录同一 Apple ID，并打开 **设置 → [Apple ID] → iCloud → iCloud 云盘**
3. App 设置页 → **iCloud 同步**：应显示「iCloud 可用」；点 **立即同步到 iCloud**
4. **从 iCloud 恢复**：设置页点 **从 iCloud 恢复**（本机已有数据时需填家长密码确认）→ 用云端整库覆盖本机 → 重新解锁
5. 另开一台同 Apple ID 设备：冷启动会自动取较新的整库；也可手动点「从 iCloud 恢复」
6. 切到后台再回前台：会触发 flush；锁屏策略仍按 Phase 2

```bash
npm run smoke:phase1
npm run smoke:phase2
npm run smoke:phase3
```

## Phase 4 备注（电脑 `.db` 导入）

正式 UI 已隐藏「从电脑导入」。调试时可在 Safari 远程控制台执行：

```js
window.__MYTIMETREE_SHOW_IMPORT__ = true;
location.reload();
```

日常换机请用 **iCloud 同步 / 从 iCloud 恢复**。

## Phase 5：TestFlight → App Store

对外版本：**`1.0.0`**（Build 从 **`1`** 起，每次上传 +1）。  
Bundle ID：`com.mytimetree.app` · iCloud：`iCloud.com.mytimetree.app`

### 5.1 仓库内已对齐

| 项 | 值 |
|----|-----|
| 主屏 `APP_VERSION` | `1.0.0` |
| Xcode `MARKETING_VERSION` | `1.0.0` |
| Xcode `CURRENT_PROJECT_VERSION`（Build） | `1`（下次上传改为 2…） |
| `mobile/package.json` | `1.0.0` |
| 出口合规 | `ITSAppUsesNonExemptEncryption = false`（仅用系统标准加密） |

### 5.2 App Store Connect（需你在网页完成）

1. [App Store Connect](https://appstoreconnect.apple.com) → 我的 App → **+** 新建  
   - 平台 iOS · 名称 MyTimeTree · Bundle ID `com.mytimetree.app` · SKU 自定（如 `mytimetree001`）
2. 在 App 内创建 **TestFlight** 外测（可先内部测试，最多 100 名 Apple ID）
3. 准备商店信息（简体中文优先）——文案见仓库：
   - 总索引：[`docs/app-store/README.md`](../docs/app-store/README.md)
   - 商店描述 / 关键词：[`docs/app-store/store-listing.zh-Hans.md`](../docs/app-store/store-listing.zh-Hans.md)
   - 隐私政策（需先托管出 HTTPS）：[`docs/app-store/privacy-policy.zh-Hans.html`](../docs/app-store/privacy-policy.zh-Hans.html)
   - 隐私营养标签：[`docs/app-store/privacy-nutrition-labels.md`](../docs/app-store/privacy-nutrition-labels.md)
   - 审核附注：[`docs/app-store/review-notes.md`](../docs/app-store/review-notes.md)
   - 截图：至少按 Connect 当前要求准备 6.7" 等机型尺寸
   - 年龄分级问卷按实填写（预期多为 4+）

### 5.3 隐私营养标签（建议勾选）

详见 [`docs/app-store/privacy-nutrition-labels.md`](../docs/app-store/privacy-nutrition-labels.md)。摘要：

本 App **无账号服务器**；数据在本机 + 可选 iCloud：

| 类型 | 说明 |
|------|------|
| 用户内容 / 其他用户内容 | 孩子昵称、流水、设置（存在本机 / iCloud） |
| 标识符 | 一般可不收集；若未用广告 SDK → 不勾广告相关 |
| 用途 | App 功能；关联到用户；不用于追踪 |
| 是否链接用户 / 用于追踪 | 关联用户内容；不用于追踪 |

权限文案已在 Info.plist：Face ID、添加照片到相册。

### 5.4 Xcode 上传

```bash
export PATH="$HOME/.local/node/bin:$PATH"
cd mobile && npm run cap:sync && npm run open:ios
```

1. Signing：选**付费** Team，Release 自动签名  
2. 目标 **Any iOS Device (arm64)**（不要模拟器）  
3. **Product → Archive** → Distribute App → App Store Connect → Upload  
4. 到 Connect 里等构建处理完成 → 加到 TestFlight 测试组 → 安装验证

### 5.5 上架前冒烟（真机 / TestFlight 包）

- [ ] 开户 / 锁屏 / Face ID / 忘记密码  
- [ ] 记账、主屏树与挂件、分享长图（中文菜单、不自动存相册）  
- [ ] iCloud：立即同步 + 从 iCloud 恢复（双机更佳）  
- [ ] 主屏版本号 `v1.0.0` 在底隙中部  
- [ ] 杀进程冷启动数据仍在  

### 5.6 正式审核

TestFlight 稳定后：在 Connect 选构建 → 填写审核备注（见 [`docs/app-store/review-notes.md`](../docs/app-store/review-notes.md)）→ 提交审核。

---

## 下一步（执行顺序建议）

1. 把隐私政策 HTML **托管为 HTTPS**（联系邮箱已为 `kaiak.fang@gmail.com`）→ 填进 Connect  
2. Connect 建 App → 粘贴商店文案与隐私标签  
3. 本地 **Archive 上传** 第一包 TestFlight  
