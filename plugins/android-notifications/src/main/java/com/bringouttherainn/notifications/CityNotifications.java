package com.bringouttherainn.notifications;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.SystemClock;

import org.godotengine.godot.Godot;
import org.godotengine.godot.plugin.GodotPlugin;
import org.godotengine.godot.plugin.UsedByGodot;

/**
 * Schedules local notifications with AlarmManager. Each one fires
 * NotificationReceiver, which shows it. The game cancels them all when the
 * player comes back, and schedules fresh ones when the app goes to the
 * background (src/platform/notifications.gd).
 */
public class CityNotifications extends GodotPlugin {
    /** Ids above this are not tracked by cancelAll(). */
    static final int MAX_ID = 64;
    private static final int PERMISSION_REQUEST = 4711;

    public CityNotifications(Godot godot) {
        super(godot);
    }

    @Override
    public String getPluginName() {
        return "CityNotifications";
    }

    @UsedByGodot
    public void schedule(int id, String title, String text, int seconds) {
        Context context = getActivity();
        if (context == null || id < 1 || id > MAX_ID) {
            return;
        }
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        long at = SystemClock.elapsedRealtime() + seconds * 1000L;
        PendingIntent intent = pending(context, id, title, text);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarms.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, intent);
        } else {
            alarms.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, intent);
        }
    }

    @UsedByGodot
    public void cancelAll() {
        Context context = getActivity();
        if (context == null) {
            return;
        }
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        for (int id = 1; id <= MAX_ID; id++) {
            alarms.cancel(pending(context, id, "", ""));
        }
        NotificationReceiver.clearShown(context);
    }

    @UsedByGodot
    public boolean hasPermission() {
        Activity activity = getActivity();
        if (activity == null) {
            return false;
        }
        if (Build.VERSION.SDK_INT < 33) {
            return true;
        }
        return activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    @UsedByGodot
    public void requestPermission() {
        Activity activity = getActivity();
        if (activity != null && Build.VERSION.SDK_INT >= 33 && !hasPermission()) {
            activity.requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, PERMISSION_REQUEST);
        }
    }

    private static PendingIntent pending(Context context, int id, String title, String text) {
        Intent intent = new Intent(context, NotificationReceiver.class);
        intent.putExtra(NotificationReceiver.EXTRA_ID, id);
        intent.putExtra(NotificationReceiver.EXTRA_TITLE, title);
        intent.putExtra(NotificationReceiver.EXTRA_TEXT, text);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getBroadcast(context, id, intent, flags);
    }
}
