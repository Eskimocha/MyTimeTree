import Foundation
import UIKit
import Photos
import Capacitor

/// Present the iOS share sheet for a PNG; optional explicit save via `saveImage`.
@objc(SaveToPhotosPlugin)
public class SaveToPhotosPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SaveToPhotosPlugin"
    public let jsName = "SaveToPhotos"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "saveImage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "shareImage", returnType: CAPPluginReturnPromise)
    ]

    @objc func saveImage(_ call: CAPPluginCall) {
        guard let image = Self.image(from: call) else {
            call.reject("图片数据无效")
            return
        }
        Self.requestAddOnly { ok, message in
            guard ok else {
                call.reject(message ?? "未获得相册写入权限")
                return
            }
            Self.performSave(image: image) { saved, err in
                DispatchQueue.main.async {
                    if saved {
                        call.resolve(["saved": true])
                    } else {
                        call.reject(err ?? "保存相册失败")
                    }
                }
            }
        }
    }

    /// Open the system share sheet only — do **not** auto-write to Photos.
    /// User can tap 「存储图像」 in the sheet if they want the album.
    @objc func shareImage(_ call: CAPPluginCall) {
        guard let image = Self.image(from: call) else {
            call.reject("图片数据无效")
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                call.reject("插件已释放")
                return
            }

            // UIImage (not file URL) so the sheet offers 「存储图像」 and follows app locale.
            let vc = UIActivityViewController(activityItems: [image], applicationActivities: nil)
            vc.completionWithItemsHandler = { _, completed, _, error in
                if let error = error {
                    call.reject(error.localizedDescription)
                    return
                }
                call.resolve([
                    "saved": false,
                    "shared": completed
                ])
            }

            guard let presenter = self.bridge?.viewController else {
                call.reject("无法打开分享面板")
                return
            }
            if let pop = vc.popoverPresentationController {
                pop.sourceView = presenter.view
                pop.sourceRect = CGRect(
                    x: presenter.view.bounds.midX,
                    y: presenter.view.bounds.midY,
                    width: 1,
                    height: 1
                )
                pop.permittedArrowDirections = []
            }
            presenter.present(vc, animated: true, completion: nil)
        }
    }

    private static func image(from call: CAPPluginCall) -> UIImage? {
        guard var raw = call.getString("dataUrl") ?? call.getString("base64") else {
            return nil
        }
        if let range = raw.range(of: "base64,") {
            raw = String(raw[range.upperBound...])
        }
        guard let data = Data(base64Encoded: raw), let image = UIImage(data: data) else {
            return nil
        }
        return image
    }

    private static func requestAddOnly(_ finish: @escaping (Bool, String?) -> Void) {
        if #available(iOS 14, *) {
            PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
                let ok = status == .authorized || status == .limited
                finish(ok, ok ? nil : "未获得相册写入权限，请在设置中允许 MyTimeTree 添加照片")
            }
        } else {
            PHPhotoLibrary.requestAuthorization { status in
                let ok = status == .authorized
                finish(ok, ok ? nil : "未获得相册写入权限")
            }
        }
    }

    private static func performSave(image: UIImage, finish: @escaping (Bool, String?) -> Void) {
        PHPhotoLibrary.shared().performChanges({
            PHAssetChangeRequest.creationRequestForAsset(from: image)
        }, completionHandler: { ok, error in
            finish(ok, error?.localizedDescription)
        })
    }
}
