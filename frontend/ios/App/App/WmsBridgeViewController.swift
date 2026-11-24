import Capacitor
import WebKit
import UIKit

// A single validated origin is shared by fetch and authenticated /api image resources.
private enum WmsEndpoint {
    static func baseURL() throws -> URL {
        guard let file = Bundle.main.url(forResource: "capacitor.config", withExtension: "json"),
              let json = try JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any],
              let plugins = json["plugins"] as? [String: Any],
              let config = plugins["WmsApi"] as? [String: Any],
              let value = config["baseUrl"] as? String,
              let url = URL(string: value), let host = url.host?.lowercased(),
              url.user == nil, url.password == nil, url.query == nil, url.fragment == nil,
              url.path.isEmpty || url.path == "/" else { throw invalid() }
        let loopback = ["localhost", "127.0.0.1", "::1", "[::1]"].contains(host)
        #if !targetEnvironment(simulator)
        guard !loopback else { throw invalid() }
        #endif
        #if DEBUG
        guard url.scheme == "https" || (url.scheme == "http" && (loopback || host.hasSuffix(".local"))) else { throw invalid() }
        #else
        guard url.scheme == "https" else { throw invalid() }
        #endif
        return url
    }

    static func invalid() -> NSError {
        NSError(domain: "WmsApi", code: 1, userInfo: [NSLocalizedDescriptionKey:
            "iPhone에는 Mac의 .local 개발 주소 또는 HTTPS API 주소가 필요합니다. Release 빌드는 HTTPS만 허용합니다."])
    }
}

@objc(WmsApiPlugin)
public class WmsApiPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WmsApiPlugin"
    public let jsName = "WmsApi"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "getConfiguration", returnType: CAPPluginReturnPromise)]

    @objc func getConfiguration(_ call: CAPPluginCall) {
        do { call.resolve(["baseUrl": try WmsEndpoint.baseURL().absoluteString]) }
        catch { call.reject(error.localizedDescription) }
    }
}

class WmsBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(WmsApiPlugin())
        bridge?.registerPluginInstance(WmsDocumentsPlugin())
    }

    override func webView(with frame: CGRect, configuration: WKWebViewConfiguration) -> WKWebView {
        // Reuse Capacitor's native HTTP interceptor (including its cookie store) for
        // relative image/file GETs; JS fetch is routed by ios-entry.ts.
        if let original = configuration.urlSchemeHandler(forURLScheme: "capacitor") {
            configuration.setURLSchemeHandler(nil, forURLScheme: "capacitor")
            configuration.setURLSchemeHandler(WmsAssetHandler(original), forURLScheme: "capacitor")
        }
        return super.webView(with: frame, configuration: configuration)
    }
}

private final class WmsAssetHandler: NSObject, WKURLSchemeHandler {
    let original: WKURLSchemeHandler
    var tasks: [ObjectIdentifier: WmsSchemeTask] = [:]
    init(_ original: WKURLSchemeHandler) { self.original = original }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url, url.host == "localhost", url.path.hasPrefix("/api/") else {
            original.webView(webView, start: urlSchemeTask)
            return
        }
        do {
            guard (urlSchemeTask.request.httpMethod ?? "GET") == "GET" else { throw WmsEndpoint.invalid() }
            let base = try WmsEndpoint.baseURL()
            var target = URLComponents(url: base, resolvingAgainstBaseURL: false)!
            target.percentEncodedPath = URLComponents(url: url, resolvingAgainstBaseURL: false)!.percentEncodedPath
            target.percentEncodedQuery = URLComponents(url: url, resolvingAgainstBaseURL: false)!.percentEncodedQuery
            var proxy = URLComponents(string: "capacitor://localhost" + CapacitorBridge.httpInterceptorStartIdentifier)!
            proxy.queryItems = [URLQueryItem(name: CapacitorBridge.httpInterceptorUrlParam, value: target.url!.absoluteString)]
            var request = urlSchemeTask.request
            request.url = proxy.url
            let key = ObjectIdentifier(urlSchemeTask)
            let adapter = WmsSchemeTask(urlSchemeTask, request: request) { [weak self] in self?.tasks.removeValue(forKey: key) }
            tasks[key] = adapter
            original.webView(webView, start: adapter)
        } catch { urlSchemeTask.didFailWithError(error) }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        if let adapter = tasks.removeValue(forKey: ObjectIdentifier(urlSchemeTask)) {
            original.webView(webView, stop: adapter)
        } else { original.webView(webView, stop: urlSchemeTask) }
    }
}

private final class WmsSchemeTask: NSObject, WKURLSchemeTask {
    let wrapped: WKURLSchemeTask
    let request: URLRequest
    let complete: () -> Void
    init(_ wrapped: WKURLSchemeTask, request: URLRequest, complete: @escaping () -> Void) {
        self.wrapped = wrapped; self.request = request; self.complete = complete
    }
    func didReceive(_ response: URLResponse) { wrapped.didReceive(response) }
    func didReceive(_ data: Data) { wrapped.didReceive(data) }
    func didFinish() { wrapped.didFinish(); complete() }
    func didFailWithError(_ error: Error) { wrapped.didFailWithError(error); complete() }
}

@objc(WmsDocumentsPlugin)
public class WmsDocumentsPlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    public let identifier = "WmsDocumentsPlugin"
    public let jsName = "WmsDocuments"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise)]
    private var pendingCall: CAPPluginCall?
    private var temporaryDirectory: URL?
    @objc func save(_ call: CAPPluginCall) {
        guard let name = call.getString("fileName"), !name.isEmpty,
              !name.contains("/"), !name.contains("\\"), !name.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }),
              let mime = call.getString("mimeType"), let encoded = call.getString("base64"), encoded.count <= 44739244,
              let data = Data(base64Encoded: encoded), data.count <= 32 * 1024 * 1024,
              (mime == "application/pdf" && name.hasSuffix(".pdf") && data.starts(with: Data("%PDF-".utf8))) ||
              (mime == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" && name.hasSuffix(".xlsx") && data.starts(with: Data([80, 75])))
        else { call.reject("Invalid document"); return }
        DispatchQueue.main.async {
            guard self.pendingCall == nil, let controller = self.bridge?.viewController, controller.presentedViewController == nil else { call.reject("File picker unavailable"); return }
            do {
                let directory = FileManager.default.temporaryDirectory.appendingPathComponent("wms-document-" + UUID().uuidString, isDirectory: true)
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                self.temporaryDirectory = directory
                let url = directory.appendingPathComponent(name)
                try data.write(to: url, options: [.atomic, .completeFileProtection])
                let picker = UIDocumentPickerViewController(forExporting: [url], asCopy: true)
                picker.delegate = self
                picker.popoverPresentationController?.sourceView = controller.view
                picker.popoverPresentationController?.sourceRect = CGRect(x: controller.view.bounds.midX, y: controller.view.bounds.midY, width: 1, height: 1)
                self.pendingCall = call
                controller.present(picker, animated: true)
            } catch { self.cleanup(); call.reject("Unable to export document", nil, error) }
        }
    }
    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        let call = pendingCall; cleanup(); call?.resolve(["cancelled": false])
    }
    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        let call = pendingCall; cleanup(); call?.resolve(["cancelled": true])
    }
    private func cleanup() {
        if let directory = temporaryDirectory { try? FileManager.default.removeItem(at: directory) }
        temporaryDirectory = nil; pendingCall = nil
    }
}
