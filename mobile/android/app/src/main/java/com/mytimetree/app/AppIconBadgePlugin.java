package com.mytimetree.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Android counterpart of iOS {@code AppIconBadge}.
 * Same JS API: checkPermissions / requestPermissions / set / clear / get.
 * Uses a silent notification with {@code setNumber} (launcher badge) and does
 * not request permission inside {@code set}/{@code clear} (matches iOS).
 */
@CapacitorPlugin(
        name = "AppIconBadge",
        permissions = {
                @Permission(
                        alias = "display",
                        strings = { Manifest.permission.POST_NOTIFICATIONS }
                )
        }
)
public class AppIconBadgePlugin extends Plugin {
    private static final String PREFS = "mytimetree.appIconBadge";
    private static final String KEY_COUNT = "count";
    private static final String CHANNEL_ID = "mytimetree_badge";
    private static final int NOTIFICATION_ID = 71019;

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm =
                (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel existing = nm.getNotificationChannel(CHANNEL_ID);
        if (existing != null) return;
        NotificationChannel channel =
                new NotificationChannel(CHANNEL_ID, "主屏角标", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("显示未完成的好习惯数量");
        channel.setShowBadge(true);
        channel.enableVibration(false);
        channel.setSound(null, null);
        nm.createNotificationChannel(channel);
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private String mapDisplayStatus() {
        if (Build.VERSION.SDK_INT < 33) {
            // Pre-Tiramisu: notification permission is granted at install.
            boolean enabled = NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
            return enabled ? "granted" : "denied";
        }
        int state = ContextCompat.checkSelfPermission(
                getContext(), Manifest.permission.POST_NOTIFICATIONS);
        if (state == PackageManager.PERMISSION_GRANTED) {
            return NotificationManagerCompat.from(getContext()).areNotificationsEnabled()
                    ? "granted"
                    : "denied";
        }
        if (ActivityCompat.shouldShowRequestPermissionRationale(
                getActivity(), Manifest.permission.POST_NOTIFICATIONS)) {
            return "prompt";
        }
        // First ask or permanently denied — JS treats non-granted as try/request.
        return "prompt";
    }

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("display", mapDisplayStatus());
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33) {
            JSObject ret = new JSObject();
            String display = mapDisplayStatus();
            ret.put("display", display);
            ret.put("granted", "granted".equals(display));
            call.resolve(ret);
            return;
        }
        if (getPermissionState("display") == com.getcapacitor.PermissionState.GRANTED) {
            JSObject ret = new JSObject();
            ret.put("display", "granted");
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias("display", call, "displayPermsCallback");
    }

    @PermissionCallback
    private void displayPermsCallback(PluginCall call) {
        JSObject ret = new JSObject();
        String display = mapDisplayStatus();
        ret.put("display", display);
        ret.put("granted", "granted".equals(display));
        call.resolve(ret);
    }

    @PluginMethod
    public void set(PluginCall call) {
        int count = Math.max(0, call.getInt("count", 0));
        applyBadge(count);
        prefs().edit().putInt(KEY_COUNT, count).apply();
        JSObject ret = new JSObject();
        ret.put("count", count);
        call.resolve(ret);
    }

    @PluginMethod
    public void clear(PluginCall call) {
        applyBadge(0);
        prefs().edit().putInt(KEY_COUNT, 0).apply();
        JSObject ret = new JSObject();
        ret.put("count", 0);
        call.resolve(ret);
    }

    @PluginMethod
    public void get(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("count", prefs().getInt(KEY_COUNT, 0));
        call.resolve(ret);
    }

    private void applyBadge(int count) {
        // Mirror iOS: do not requestAuthorization here — only apply when already allowed.
        if (!"granted".equals(mapDisplayStatus()) && Build.VERSION.SDK_INT >= 33) {
            return;
        }
        ensureChannel();
        NotificationManagerCompat nm = NotificationManagerCompat.from(getContext());
        if (count <= 0) {
            nm.cancel(NOTIFICATION_ID);
            return;
        }
        if (Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(
                        getContext(), Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        NotificationCompat.Builder builder =
                new NotificationCompat.Builder(getContext(), CHANNEL_ID)
                        .setSmallIcon(R.drawable.ic_stat_mytimetree)
                        .setContentTitle("MyTimeTree")
                        .setContentText("今日还剩 " + count + " 个好习惯")
                        .setNumber(count)
                        .setOnlyAlertOnce(true)
                        .setSilent(true)
                        .setPriority(NotificationCompat.PRIORITY_LOW)
                        .setCategory(NotificationCompat.CATEGORY_STATUS)
                        .setAutoCancel(false);
        try {
            nm.notify(NOTIFICATION_ID, builder.build());
        } catch (SecurityException ignored) {
            // Permission raced; JS will re-ask via requestPermissions.
        }
    }
}
