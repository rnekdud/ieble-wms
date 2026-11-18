package com.ieble.wms.test;

import android.content.Context;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "WmsPrint")
public class WmsPrintPlugin extends Plugin {
    private WebView printView;

    @PluginMethod
    public void printLabel(PluginCall call) {
        String html = call.getString("html");
        String title = call.getString("title", "WMS 라벨");
        Double width = call.getDouble("width");
        Double height = call.getDouble("height");
        if (html == null || html.length() > 500000 || width == null || height == null
            || !Double.isFinite(width) || !Double.isFinite(height)
            || width < 1 || width > 1000 || height < 1 || height > 1000) {
            call.reject("Invalid label document"); return;
        }
        getActivity().runOnUiThread(() -> {
            if (printView != null) { call.reject("Print dialog already open"); return; }
            // The main Capacitor WebView and its history/session are never replaced.
            WebView view = new WebView(getActivity());
            printView = view;
            view.getSettings().setJavaScriptEnabled(false);
            view.getSettings().setAllowFileAccess(false);
            view.getSettings().setAllowContentAccess(false);
            view.getSettings().setBlockNetworkLoads(true);
            view.setWebViewClient(new WebViewClient() {
                private boolean started;
                @Override public void onPageFinished(WebView loaded, String url) {
                    if (started || printView != view) return;
                    started = true;
                    try {
                        PrintManager manager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                        if (manager == null) throw new IllegalStateException("Print service unavailable");
                        PrintDocumentAdapter delegate = view.createPrintDocumentAdapter(title);
                        PrintDocumentAdapter adapter = new PrintDocumentAdapter() {
                            @Override public void onStart() { delegate.onStart(); }
                            @Override public void onLayout(PrintAttributes oldAttributes, PrintAttributes newAttributes,
                                CancellationSignal signal, LayoutResultCallback callback, Bundle extras) {
                                delegate.onLayout(oldAttributes, newAttributes, signal, callback, extras);
                            }
                            @Override public void onWrite(PageRange[] pages, ParcelFileDescriptor destination,
                                CancellationSignal signal, WriteResultCallback callback) {
                                delegate.onWrite(pages, destination, signal, callback);
                            }
                            @Override public void onFinish() {
                                delegate.onFinish();
                                release(view);
                                // Closed does not distinguish printed from cancelled.
                                call.resolve();
                            }
                        };
                        PrintAttributes attributes = new PrintAttributes.Builder()
                            .setMediaSize(new PrintAttributes.MediaSize("WMS_LABEL", "WMS 라벨",
                                (int) Math.round(width * 1000 / 25.4), (int) Math.round(height * 1000 / 25.4)))
                            .setMinMargins(PrintAttributes.Margins.NO_MARGINS).build();
                        manager.print(title, adapter, attributes);
                    } catch (Exception error) {
                        release(view); call.reject("Unable to open print dialog", error);
                    }
                }
            });
            view.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
        });
    }

    private void release(WebView view) {
        if (printView != view) return;
        printView = null;
        view.destroy();
    }

    @Override protected void handleOnDestroy() {
        if (printView != null) release(printView);
    }
}
