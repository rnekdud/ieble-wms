package com.ieble.wms.test;

import android.net.Uri;
import com.getcapacitor.Bridge;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "WmsApi")
public class WmsApiPlugin extends Plugin {
    static String apiBase(Bridge bridge) {
        String value = bridge.getConfig().getPluginConfiguration("WmsApi").getString("baseUrl");
        Uri uri = value == null ? Uri.EMPTY : Uri.parse(value);
        boolean secure = "https".equals(uri.getScheme());
        boolean usb = BuildConfig.DEBUG && "http".equals(uri.getScheme()) && "localhost".equals(uri.getHost());
        if ((!secure && !usb) || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null
            || (uri.getPath() != null && !uri.getPath().isEmpty() && !"/".equals(uri.getPath()))) {
            throw new IllegalStateException("Configure an HTTPS API or a debug USB localhost API");
        }
        return value.replaceAll("/+$", "");
    }

    @PluginMethod
    public void getConfiguration(PluginCall call) {
        try { call.resolve(new JSObject().put("baseUrl", apiBase(getBridge()))); }
        catch (IllegalStateException error) { call.reject(error.getMessage()); }
    }
}
