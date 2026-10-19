import Foundation
import UIKit
import UserNotifications
import Capacitor

/// App icon badge via UNUserNotificationCenter.
/// Capawesome Badge requests only `.badge` (often no system dialog) and still uses
/// deprecated `applicationIconBadgeNumber`. This plugin requests `.alert/.badge/.sound`
/// so iOS shows the permission alert, then sets the count with `setBadgeCount`.
///
/// stamp 20261018a — CAPPlugin permission overrides MUST be `@objc public override`
/// (Kai: if Xcode still shows bare `@objc func checkPermissions`, you are on a stale checkout).
/// `set`/`clear` never call requestAuthorization (avoids cold-start permission sheet).
@objc(AppIconBadgePlugin)
public class AppIconBadgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppIconBadgePlugin"
    public let jsName = "AppIconBadge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise)
    ]

    private let storageKey = "mytimetree.appIconBadge.count"

    @objc public override func checkPermissions(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            call.resolve(["display": Self.mapStatus(settings.authorizationStatus)])
        }
    }

    @objc public override func requestPermissions(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            UNUserNotificationCenter.current().requestAuthorization(
                options: [.alert, .badge, .sound]
            ) { granted, error in
                if let error {
                    call.reject(error.localizedDescription)
                    return
                }
                // Re-read settings — provisional/ephemeral also count as usable.
                UNUserNotificationCenter.current().getNotificationSettings { settings in
                    let display = Self.mapStatus(settings.authorizationStatus)
                    call.resolve([
                        "display": display,
                        "granted": granted,
                        "badgeSetting": Self.mapSetting(settings.badgeSetting)
                    ])
                }
            }
        }
    }

    @objc func set(_ call: CAPPluginCall) {
        let count = max(0, call.getInt("count") ?? 0)
        self.applyBadge(count: count) { err in
            if let err {
                call.reject(err)
            } else {
                UserDefaults.standard.set(count, forKey: self.storageKey)
                call.resolve(["count": count])
            }
        }
    }

    @objc func clear(_ call: CAPPluginCall) {
        self.applyBadge(count: 0) { err in
            if let err {
                call.reject(err)
            } else {
                UserDefaults.standard.set(0, forKey: self.storageKey)
                call.resolve(["count": 0])
            }
        }
    }

    @objc func get(_ call: CAPPluginCall) {
        let stored = UserDefaults.standard.integer(forKey: storageKey)
        call.resolve(["count": stored])
    }

    private func applyBadge(count: Int, completion: @escaping (String?) -> Void) {
        DispatchQueue.main.async {
            // Do NOT requestAuthorization here — cold-start `set` during WKWebView boot
            // can race the permission sheet and look like a black screen. JS asks via
            // requestPermissions after UI is up; here we only apply when already allowed.
            UNUserNotificationCenter.current().getNotificationSettings { settings in
                switch settings.authorizationStatus {
                case .authorized, .provisional, .ephemeral:
                    break
                case .notDetermined, .denied:
                    DispatchQueue.main.async { completion(nil) }
                    return
                @unknown default:
                    DispatchQueue.main.async { completion(nil) }
                    return
                }
                if #available(iOS 16.0, *) {
                    UNUserNotificationCenter.current().setBadgeCount(count) { error in
                        DispatchQueue.main.async {
                            if error != nil {
                                // Fallback when setBadgeCount fails on some OS builds
                                UIApplication.shared.applicationIconBadgeNumber = count
                            }
                            completion(nil)
                        }
                    }
                } else {
                    UIApplication.shared.applicationIconBadgeNumber = count
                    completion(nil)
                }
            }
        }
    }

    private static func mapStatus(_ status: UNAuthorizationStatus) -> String {
        switch status {
        case .authorized, .provisional, .ephemeral:
            return "granted"
        case .denied:
            return "denied"
        case .notDetermined:
            return "prompt"
        @unknown default:
            return "prompt"
        }
    }

    private static func mapSetting(_ setting: UNNotificationSetting) -> String {
        switch setting {
        case .enabled: return "enabled"
        case .disabled: return "disabled"
        case .notSupported: return "notSupported"
        @unknown default: return "unknown"
        }
    }
}
