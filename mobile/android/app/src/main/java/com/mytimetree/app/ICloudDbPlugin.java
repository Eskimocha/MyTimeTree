package com.mytimetree.app;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Android local whole-DB persistence under the JS name {@code ICloudDb}
 * (shared contract with iOS). No cloud sync — local file only; backup via
 * exportBackup / importBackup.
 */
@CapacitorPlugin(name = "ICloudDb")
public class ICloudDbPlugin extends Plugin {
    private static final String FILE_NAME = "mytimetree.sqlite.v1";
    private static final String PREFS = "mytimetree.icloudDb";
    private static final String KEY_LAST_WRITE = "mtt.lastWriteAt";
    private static final String ANDROID_NO_ICLOUD =
            "Android 不做 iCloud / 云同步；数据仅保存在本机。请用「导出备份 / 导入备份」换机。";

    private File localFile() {
        File dir = new File(getContext().getFilesDir(), "MyTimeTree");
        if (!dir.exists()) {
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
        }
        return new File(dir, FILE_NAME);
    }

    private String stampNow() {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("Asia/Shanghai"));
        return f.format(new Date());
    }

    private String stamp(long millis) {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("Asia/Shanghai"));
        return f.format(new Date(millis));
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Activity.MODE_PRIVATE);
    }

    private byte[] readAll(File file) throws Exception {
        try (FileInputStream in = new FileInputStream(file);
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) >= 0) {
                out.write(buf, 0, n);
            }
            return out.toByteArray();
        }
    }

    private void writeAll(File file, byte[] data) throws Exception {
        File parent = file.getParentFile();
        if (parent != null && !parent.exists()) {
            //noinspection ResultOfMethodCallIgnored
            parent.mkdirs();
        }
        File tmp = new File(file.getAbsolutePath() + ".tmp");
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            out.write(data);
            out.flush();
            out.getFD().sync();
        }
        if (!tmp.renameTo(file)) {
            // Fallback overwrite
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(data);
                out.flush();
                out.getFD().sync();
            }
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
        }
    }

    private String stripDataUrl(String raw) {
        if (raw == null) return null;
        int idx = raw.indexOf("base64,");
        if (idx >= 0) {
            return raw.substring(idx + "base64,".length());
        }
        return raw;
    }

    @PluginMethod
    public void status(PluginCall call) {
        File local = localFile();
        boolean exists = local.exists() && local.length() > 0;
        JSObject payload = new JSObject();
        payload.put("iCloudAvailable", false);
        payload.put("iCloudExists", false);
        payload.put("iCloudReason", ANDROID_NO_ICLOUD);
        payload.put("localExists", exists);
        payload.put("localPath", local.getAbsolutePath());
        payload.put("fileName", FILE_NAME);
        payload.put("containerId", "android-local");
        payload.put("hasIdentityToken", false);
        payload.put("isSimulator", false);
        payload.put("platform", "android");
        payload.put("backupSupported", true);
        payload.put("checkedAt", stampNow());
        String lastWrite = prefs().getString(KEY_LAST_WRITE, null);
        if (lastWrite != null) {
            payload.put("lastWriteAt", lastWrite);
        }
        payload.put("lastWriteICloud", false);
        if (exists) {
            payload.put("localModified", stamp(local.lastModified()));
        }
        call.resolve(payload);
    }

    @PluginMethod
    public void load(PluginCall call) {
        try {
            File local = localFile();
            JSObject result = new JSObject();
            result.put("iCloudAvailable", false);
            if (local.exists() && local.length() > 0) {
                byte[] data = readAll(local);
                result.put("data", Base64.encodeToString(data, Base64.NO_WRAP));
                result.put("source", "local");
                result.put("bytes", data.length);
                result.put("modified", stamp(local.lastModified()));
            } else {
                result.put("data", JSObject.NULL);
                result.put("source", "empty");
                result.put("bytes", 0);
            }
            call.resolve(result);
        } catch (Exception e) {
            call.reject("读取数据库失败: " + e.getMessage());
        }
    }

    @PluginMethod
    public void save(PluginCall call) {
        String raw = call.getString("dataUrl");
        if (raw == null) raw = call.getString("base64");
        raw = stripDataUrl(raw);
        if (raw == null || raw.isEmpty()) {
            call.reject("缺少 base64 数据");
            return;
        }
        try {
            byte[] data = Base64.decode(raw, Base64.DEFAULT);
            File local = localFile();
            writeAll(local, data);
            String nowStamp = stampNow();
            prefs().edit().putString(KEY_LAST_WRITE, nowStamp).apply();

            JSObject result = new JSObject();
            result.put("ok", true);
            result.put("local", true);
            result.put("iCloud", false);
            result.put("bytes", data.length);
            result.put("iCloudAvailable", false);
            result.put("iCloudExists", false);
            result.put("iCloudReason", ANDROID_NO_ICLOUD);
            result.put("localExists", true);
            result.put("localModified", stamp(local.lastModified()));
            result.put("lastWriteAt", nowStamp);
            result.put("lastWriteICloud", false);
            result.put("containerId", "android-local");
            result.put("platform", "android");
            call.resolve(result);
        } catch (Exception e) {
            call.reject("保存数据库失败: " + e.getMessage());
        }
    }

    @PluginMethod
    public void restoreFromICloud(PluginCall call) {
        call.reject(ANDROID_NO_ICLOUD);
    }

    /**
     * Share the local DB file via the system share sheet (local backup export).
     */
    @PluginMethod
    public void exportBackup(PluginCall call) {
        try {
            File local = localFile();
            if (!local.exists() || local.length() == 0) {
                call.reject("本机尚无数据库文件，请先开户并保存后再导出");
                return;
            }
            File cacheDir = new File(getContext().getCacheDir(), "backups");
            if (!cacheDir.exists()) {
                //noinspection ResultOfMethodCallIgnored
                cacheDir.mkdirs();
            }
            String outName = "mytimetree-backup-" + stampNow().replace(" ", "_").replace(":", "") + ".sqlite";
            File out = new File(cacheDir, outName);
            writeAll(out, readAll(local));

            Uri uri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    out
            );
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("application/octet-stream");
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_SUBJECT, "MyTimeTree 本地备份");
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Intent chooser = Intent.createChooser(send, "导出 MyTimeTree 备份");
            getActivity().startActivity(chooser);

            JSObject result = new JSObject();
            result.put("ok", true);
            result.put("bytes", out.length());
            result.put("fileName", outName);
            result.put("shared", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("导出备份失败: " + e.getMessage());
        }
    }

    /**
     * Open a document picker; on success overwrite local DB and return base64
     * so JS can reload in-memory sql.js.
     */
    @PluginMethod
    public void importBackup(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
                "application/octet-stream",
                "application/x-sqlite3",
                "application/vnd.sqlite3",
                "*/*"
        });
        startActivityForResult(call, intent, "importBackupResult");
    }

    @ActivityCallback
    private void importBackupResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("已取消导入");
            return;
        }
        Uri uri = result.getData().getData();
        if (uri == null) {
            call.reject("未选择文件");
            return;
        }
        try {
            byte[] data;
            try (InputStream in = getContext().getContentResolver().openInputStream(uri);
                 ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                if (in == null) {
                    call.reject("无法读取所选文件");
                    return;
                }
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) >= 0) {
                    out.write(buf, 0, n);
                }
                data = out.toByteArray();
            }
            if (data.length == 0) {
                call.reject("备份文件为空");
                return;
            }
            File local = localFile();
            writeAll(local, data);
            String nowStamp = stampNow();
            prefs().edit().putString(KEY_LAST_WRITE, nowStamp).apply();

            JSObject payload = new JSObject();
            payload.put("data", Base64.encodeToString(data, Base64.NO_WRAP));
            payload.put("source", "local-backup-import");
            payload.put("iCloudAvailable", false);
            payload.put("iCloudExists", false);
            payload.put("localExists", true);
            payload.put("bytes", data.length);
            payload.put("localModified", stamp(local.lastModified()));
            payload.put("lastWriteAt", nowStamp);
            payload.put("lastWriteICloud", false);
            call.resolve(payload);
        } catch (Exception e) {
            call.reject("导入备份失败: " + e.getMessage());
        }
    }
}
