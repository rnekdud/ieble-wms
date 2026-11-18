import Capacitor
import WebKit

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
