package com.ieble.wms.test;

import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import java.util.Map;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(WmsApiPlugin.class);
        registerPlugin(WmsPrintPlugin.class);
        super.onCreate(savedInstanceState);
        if (bridge == null) return;
        // Images keep their existing relative /api URLs and authenticated native cookie store.
        // Fetch/POST requests use CapacitorHttp via android-entry.ts; bundled assets stay local.
        bridge.getWebView().setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (!request.isForMainFrame() && "GET".equals(request.getMethod())
                    && "https".equals(url.getScheme()) && bridge.getHost().equals(url.getHost())
                    && url.getPath() != null && url.getPath().startsWith("/api/")) {
                    String target = WmsApiPlugin.apiBase(bridge) + url.getEncodedPath()
                        + (url.getEncodedQuery() == null ? "" : "?" + url.getEncodedQuery());
                    Uri proxy = Uri.parse(bridge.getLocalUrl()).buildUpon()
                        .path(Bridge.CAPACITOR_HTTP_INTERCEPTOR_START).appendQueryParameter("u", target).build();
                    return super.shouldInterceptRequest(view, new WebResourceRequest() {
                        public Uri getUrl() { return proxy; }
                        public boolean isForMainFrame() { return false; }
                        public boolean isRedirect() { return false; }
                        public boolean hasGesture() { return request.hasGesture(); }
                        public String getMethod() { return request.getMethod(); }
                        public Map<String, String> getRequestHeaders() { return request.getRequestHeaders(); }
                    });
                }
                return super.shouldInterceptRequest(view, request);
            }
        });
    }
}
