package com.mrtpvrest.kds;

import android.content.Intent;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "KioskMode")
public class KioskModePlugin extends Plugin {
    @PluginMethod
    public void unlock(PluginCall call) {
        String pin = call.getString("pin", "");
        if (!BuildConfig.KIOSK_EXIT_PIN.equals(pin)) {
            call.reject("PIN incorrecto", "INVALID_PIN");
            return;
        }

        MainActivity activity = (MainActivity) getActivity();
        activity.releaseKioskMode();

        boolean openSettings = Boolean.TRUE.equals(call.getBoolean("openSettings", true));
        if (openSettings) {
            activity.startActivity(new Intent(Settings.ACTION_SETTINGS));
        }

        JSObject result = new JSObject();
        result.put("unlocked", true);
        call.resolve(result);
    }

    @PluginMethod
    public void lock(PluginCall call) {
        ((MainActivity) getActivity()).restoreKioskMode();
        call.resolve();
    }
}
