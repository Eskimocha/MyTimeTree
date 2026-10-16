import UIKit
import Capacitor

/// Capacitor 7 requires local plugins to be registered here (CAPBridgedPlugin alone is not enough).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(SaveToPhotosPlugin())
        bridge?.registerPluginInstance(ICloudDbPlugin())
        bridge?.registerPluginInstance(AppIconBadgePlugin())
    }
}
