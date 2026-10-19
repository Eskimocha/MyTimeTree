import Foundation
import UIKit
import Capacitor

/// Whole-DB file persistence: local Application Support + optional iCloud Documents.
@objc(ICloudDbPlugin)
public class ICloudDbPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ICloudDbPlugin"
    public let jsName = "ICloudDb"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "load", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restoreFromICloud", returnType: CAPPluginReturnPromise)
    ]

    private let fileName = "mytimetree.sqlite.v1"
    private let containerId = "iCloud.com.mytimetree.app"

    private var localURL: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let dir = base.appendingPathComponent("MyTimeTree", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent(fileName)
    }

    /// Prefer explicit container id from entitlements; fall back to default.
    private var ubiquityContainerRoot: URL? {
        let fm = FileManager.default
        if let url = fm.url(forUbiquityContainerIdentifier: containerId) {
            return url
        }
        return fm.url(forUbiquityContainerIdentifier: nil)
    }

    private var ubiquityDocumentsURL: URL? {
        guard let root = ubiquityContainerRoot else { return nil }
        let docs = root.appendingPathComponent("Documents", isDirectory: true)
        try? FileManager.default.createDirectory(at: docs, withIntermediateDirectories: true)
        return docs.appendingPathComponent(fileName)
    }

    private func stamp(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "Asia/Shanghai") ?? .current
        f.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return f.string(from: date)
    }

    private var isSimulator: Bool {
        #if targetEnvironment(simulator)
        return true
        #else
        return false
        #endif
    }

    private func iCloudReason() -> String {
        let fm = FileManager.default
        if isSimulator {
            return "模拟器限制：即使已登录 Apple ID，iCloud Documents 容器 API 也经常返回空。本机文件仍可保存；请用真机验证 iCloud 同步"
        }
        let hasContainer =
            fm.url(forUbiquityContainerIdentifier: containerId) != nil ||
            fm.url(forUbiquityContainerIdentifier: nil) != nil
        if !hasContainer {
            // Common on free Personal Team builds (no iCloud entitlement) or misconfigured App ID.
            return "当前构建无法访问 iCloud 容器。请确认：Xcode 使用付费 Team、Signing 已启用 iCloud Documents（容器 iCloud.com.mytimetree.app），并 Clean Build 后真机 Run"
        }
        if fm.ubiquityIdentityToken == nil {
            return "真机未拿到 iCloud 身份令牌：请确认「设置 → [你的名字] → iCloud → iCloud 云盘」已打开，并重新安装/Run 本 App"
        }
        return "iCloud 容器暂时不可用，稍后重试或重启 App"
    }

    @objc func status(_ call: CAPPluginCall) {
        let fm = FileManager.default
        let iCloud = ubiquityDocumentsURL
        let local = localURL
        let defaults = UserDefaults.standard
        let localExists = fm.fileExists(atPath: local.path)
        var payload: [String: Any] = [
            "iCloudAvailable": iCloud != nil,
            "localExists": localExists,
            "localPath": local.path,
            "fileName": fileName,
            "containerId": containerId,
            "hasIdentityToken": fm.ubiquityIdentityToken != nil,
            "isSimulator": isSimulator,
            "checkedAt": stamp(Date())
        ]
        if iCloud == nil {
            payload["iCloudReason"] = iCloudReason()
        }
        if let lastWrite = defaults.string(forKey: "mtt.lastWriteAt") {
            payload["lastWriteAt"] = lastWrite
        }
        if defaults.object(forKey: "mtt.lastWriteICloud") != nil {
            payload["lastWriteICloud"] = defaults.bool(forKey: "mtt.lastWriteICloud")
        }
        if let iCloud {
            payload["iCloudExists"] = fm.fileExists(atPath: iCloud.path)
            payload["iCloudPath"] = iCloud.path
            if let m = modificationDate(iCloud) {
                payload["iCloudModified"] = stamp(m)
            }
        } else {
            payload["iCloudExists"] = false
        }
        if localExists, let m = modificationDate(local) {
            payload["localModified"] = stamp(m)
        }
        call.resolve(payload)
    }

    @objc func load(_ call: CAPPluginCall) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let result = try self.loadBestData()
                call.resolve(result)
            } catch {
                call.reject("读取数据库失败: \(error.localizedDescription)")
            }
        }
    }

    @objc func save(_ call: CAPPluginCall) {
        guard var raw = call.getString("dataUrl") ?? call.getString("base64") else {
            call.reject("缺少 base64 数据")
            return
        }
        if let range = raw.range(of: "base64,") {
            raw = String(raw[range.upperBound...])
        }
        guard let data = Data(base64Encoded: raw) else {
            call.reject("base64 无效")
            return
        }
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let written = try self.writeData(data)
                call.resolve(written)
            } catch {
                call.reject("保存数据库失败: \(error.localizedDescription)")
            }
        }
    }

    /// Force-load the iCloud Documents copy (if any), overwrite local Application Support, return bytes.
    @objc func restoreFromICloud(_ call: CAPPluginCall) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let result = try self.forceRestoreFromICloud()
                call.resolve(result)
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    private func forceRestoreFromICloud() throws -> [String: Any] {
        guard let cloud = ubiquityDocumentsURL else {
            throw NSError(
                domain: "ICloudDb",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: iCloudReason()]
            )
        }
        let fm = FileManager.default
        let values = try? cloud.resourceValues(forKeys: [
            .ubiquitousItemDownloadingStatusKey,
            .isUbiquitousItemKey
        ])
        if values?.ubiquitousItemDownloadingStatus == .notDownloaded {
            try? fm.startDownloadingUbiquitousItem(at: cloud)
            // Poll briefly for small DB files
            for _ in 0..<10 {
                Thread.sleep(forTimeInterval: 0.35)
                let st = try? cloud.resourceValues(forKeys: [.ubiquitousItemDownloadingStatusKey])
                if st?.ubiquitousItemDownloadingStatus != .notDownloaded { break }
            }
        }
        guard fm.fileExists(atPath: cloud.path),
              let cloudData = coordinatedRead(cloud),
              !cloudData.isEmpty else {
            throw NSError(
                domain: "ICloudDb",
                code: 2,
                userInfo: [NSLocalizedDescriptionKey: "iCloud 中尚无数据库文件。请先在另一台设备点「立即同步到 iCloud」。"]
            )
        }
        let local = localURL
        try cloudData.write(to: local, options: .atomic)
        let now = Date()
        let nowStamp = stamp(now)
        UserDefaults.standard.set(nowStamp, forKey: "mtt.lastWriteAt")
        UserDefaults.standard.set(true, forKey: "mtt.lastWriteICloud")
        return [
            "data": cloudData.base64EncodedString(),
            "source": "icloud-restore",
            "iCloudAvailable": true,
            "iCloudExists": true,
            "localExists": true,
            "bytes": cloudData.count,
            "localModified": stamp(modificationDate(local) ?? now),
            "iCloudModified": stamp(modificationDate(cloud) ?? now),
            "lastWriteAt": nowStamp,
            "lastWriteICloud": true
        ]
    }

    private func loadBestData() throws -> [String: Any] {
        let fm = FileManager.default
        let local = localURL
        let cloud = ubiquityDocumentsURL

        if let cloud {
            let values = try? cloud.resourceValues(forKeys: [.ubiquitousItemDownloadingStatusKey])
            if values?.ubiquitousItemDownloadingStatus == .notDownloaded {
                try? fm.startDownloadingUbiquitousItem(at: cloud)
                Thread.sleep(forTimeInterval: 0.4)
            }
        }

        let localData = fm.fileExists(atPath: local.path) ? try? Data(contentsOf: local) : nil
        let cloudData: Data?
        if let cloud, fm.fileExists(atPath: cloud.path) {
            cloudData = coordinatedRead(cloud)
        } else {
            cloudData = nil
        }

        let localM = modificationDate(local)
        let cloudM = cloud.flatMap { modificationDate($0) }

        let useCloud: Bool
        if cloudData != nil, localData == nil {
            useCloud = true
        } else if cloudData == nil {
            useCloud = false
        } else if let cloudM, let localM {
            useCloud = cloudM >= localM
        } else {
            useCloud = cloudData != nil
        }

        if useCloud, let cloudData, let cloud {
            try cloudData.write(to: local, options: .atomic)
            return [
                "data": cloudData.base64EncodedString(),
                "source": "icloud",
                "iCloudAvailable": true,
                "bytes": cloudData.count,
                "modified": stamp(modificationDate(cloud) ?? Date())
            ]
        }
        if let localData {
            return [
                "data": localData.base64EncodedString(),
                "source": "local",
                "iCloudAvailable": cloud != nil,
                "bytes": localData.count,
                "modified": stamp(localM ?? Date())
            ]
        }
        return [
            "data": NSNull(),
            "source": "empty",
            "iCloudAvailable": cloud != nil,
            "bytes": 0
        ]
    }

    private func writeData(_ data: Data) throws -> [String: Any] {
        let local = localURL
        try data.write(to: local, options: .atomic)
        var iCloudOk = false
        var iCloudError: String? = nil
        if let cloud = ubiquityDocumentsURL {
            iCloudOk = coordinatedWrite(data, to: cloud)
            if !iCloudOk {
                iCloudError = "协调写入 iCloud Documents 失败"
            }
        } else {
            iCloudError = iCloudReason()
        }
        let now = Date()
        let nowStamp = stamp(now)
        UserDefaults.standard.set(nowStamp, forKey: "mtt.lastWriteAt")
        UserDefaults.standard.set(iCloudOk, forKey: "mtt.lastWriteICloud")
        var result: [String: Any] = [
            "ok": true,
            "local": true,
            "iCloud": iCloudOk,
            "bytes": data.count,
            "iCloudAvailable": ubiquityDocumentsURL != nil,
            "localExists": true,
            "localModified": stamp(modificationDate(local) ?? now),
            "lastWriteAt": nowStamp,
            "lastWriteICloud": iCloudOk,
            "containerId": containerId
        ]
        if iCloudOk, let cloud = ubiquityDocumentsURL {
            result["iCloudModified"] = stamp(modificationDate(cloud) ?? now)
            result["iCloudExists"] = true
        } else {
            result["iCloudExists"] = false
            if let iCloudError {
                result["iCloudReason"] = iCloudError
            }
        }
        return result
    }

    private func modificationDate(_ url: URL) -> Date? {
        (try? FileManager.default.attributesOfItem(atPath: url.path)[.modificationDate]) as? Date
    }

    private func coordinatedRead(_ url: URL) -> Data? {
        var data: Data?
        var coordError: NSError?
        let coordinator = NSFileCoordinator(filePresenter: nil)
        coordinator.coordinate(readingItemAt: url, options: [], error: &coordError) { readURL in
            data = try? Data(contentsOf: readURL)
        }
        return data
    }

    private func coordinatedWrite(_ data: Data, to url: URL) -> Bool {
        var ok = false
        var coordError: NSError?
        let coordinator = NSFileCoordinator(filePresenter: nil)
        coordinator.coordinate(writingItemAt: url, options: .forReplacing, error: &coordError) { writeURL in
            do {
                try data.write(to: writeURL, options: .atomic)
                ok = true
            } catch {
                ok = false
            }
        }
        return ok && coordError == nil
    }
}
