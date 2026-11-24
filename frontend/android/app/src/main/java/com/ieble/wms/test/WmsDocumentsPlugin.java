package com.ieble.wms.test;
import android.app.Activity;
import android.content.Intent;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.*;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;

// The system picker grants access only to the chosen destination; no storage permission.
@CapacitorPlugin(name = "WmsDocuments")
public class WmsDocumentsPlugin extends Plugin {
    private byte[] pending;
    @PluginMethod public void save(PluginCall call) {
        String name = call.getString("fileName", ""), mime = call.getString("mimeType", ""), encoded = call.getString("base64", "");
        if (pending != null) { call.reject("A document save is already open"); return; }
        boolean pdf = mime.equals("application/pdf") && name.endsWith(".pdf");
        boolean excel = mime.equals("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") && name.endsWith(".xlsx");
        if ((!pdf && !excel) || name.isEmpty() || name.matches(".*[\\\\/\\x00-\\x1f].*") || encoded.length() > 44739244) { call.reject("Invalid document"); return; }
        try {
            byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
            if (bytes.length < 5 || bytes.length > 32 * 1024 * 1024 || (pdf ? !(bytes[0] == '%' && bytes[1] == 'P' && bytes[2] == 'D' && bytes[3] == 'F' && bytes[4] == '-') : !(bytes[0] == 'P' && bytes[1] == 'K'))) { call.reject("Invalid document content"); return; }
            pending = bytes;
            startActivityForResult(call, new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime).putExtra(Intent.EXTRA_TITLE, name), "documentSaved");
        } catch (Exception error) { pending = null; call.reject("Unable to open file destination", error); }
    }
    @ActivityCallback private void documentSaved(PluginCall call, ActivityResult result) {
        byte[] bytes = pending; pending = null;
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK) { JSObject response = new JSObject(); response.put("cancelled", true); call.resolve(response); return; }
        if (bytes == null || result.getData() == null || result.getData().getData() == null) { call.reject("No destination selected"); return; }
        try (OutputStream output = getContext().getContentResolver().openOutputStream(result.getData().getData(), "w")) {
            if (output == null) throw new IllegalStateException("Destination unavailable");
            output.write(bytes); output.flush(); call.resolve();
        } catch (Exception error) { call.reject("Unable to save document", error); }
    }
    @Override protected void handleOnDestroy() { pending = null; }
}
