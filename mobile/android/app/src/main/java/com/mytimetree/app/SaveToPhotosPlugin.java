package com.mytimetree.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * Android counterpart of iOS {@code SaveToPhotos}.
 * {@code shareImage} opens the system share sheet (does not auto-save to gallery).
 * {@code saveImage} writes a PNG into the MediaStore Pictures collection.
 */
@CapacitorPlugin(name = "SaveToPhotos")
public class SaveToPhotosPlugin extends Plugin {

    private Bitmap decodeImage(PluginCall call) {
        String raw = call.getString("dataUrl");
        if (raw == null) raw = call.getString("base64");
        if (raw == null || raw.isEmpty()) return null;
        int idx = raw.indexOf("base64,");
        if (idx >= 0) {
            raw = raw.substring(idx + "base64,".length());
        }
        try {
            byte[] data = Base64.decode(raw, Base64.DEFAULT);
            return BitmapFactory.decodeByteArray(data, 0, data.length);
        } catch (Exception e) {
            return null;
        }
    }

    @PluginMethod
    public void shareImage(PluginCall call) {
        Bitmap bitmap = decodeImage(call);
        if (bitmap == null) {
            call.reject("图片数据无效");
            return;
        }
        try {
            File cacheDir = new File(getContext().getCacheDir(), "share");
            if (!cacheDir.exists()) {
                //noinspection ResultOfMethodCallIgnored
                cacheDir.mkdirs();
            }
            File out = new File(cacheDir, "mytimetree-share-" + System.currentTimeMillis() + ".png");
            try (FileOutputStream fos = new FileOutputStream(out)) {
                if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, fos)) {
                    call.reject("无法编码图片");
                    return;
                }
                fos.flush();
            }
            Uri uri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    out
            );
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("image/png");
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_SUBJECT, "MyTimeTree");
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, "分享时间树长图");
            getActivity().startActivity(chooser);

            JSObject result = new JSObject();
            result.put("saved", false);
            result.put("shared", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("无法打开分享面板: " + e.getMessage());
        }
    }

    @PluginMethod
    public void saveImage(PluginCall call) {
        Bitmap bitmap = decodeImage(call);
        if (bitmap == null) {
            call.reject("图片数据无效");
            return;
        }
        try {
            String name = "mytimetree-" + System.currentTimeMillis() + ".png";
            ContentResolver resolver = getContext().getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.Images.Media.DISPLAY_NAME, name);
            values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/MyTimeTree");
                values.put(MediaStore.Images.Media.IS_PENDING, 1);
            }
            Uri uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
            if (uri == null) {
                call.reject("保存相册失败");
                return;
            }
            try (OutputStream out = resolver.openOutputStream(uri)) {
                if (out == null || !bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)) {
                    call.reject("写入相册失败");
                    return;
                }
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                values.clear();
                values.put(MediaStore.Images.Media.IS_PENDING, 0);
                resolver.update(uri, values, null, null);
            }
            JSObject result = new JSObject();
            result.put("saved", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("保存相册失败: " + e.getMessage());
        }
    }
}
