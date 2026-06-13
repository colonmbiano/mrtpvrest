package com.mrtpvrest.kds;

import android.app.ActivityManager;
import android.app.KeyguardManager;
import android.content.Context;
import android.os.Build;
import android.os.Bundle;
import android.os.StrictMode;
import android.view.View;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private boolean kioskReleaseRequested = false;
    private boolean relockOnNextResume = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TcpListenerPlugin.class);
        registerPlugin(KioskModePlugin.class);

        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        enterImmersiveMode();

        StrictMode.setThreadPolicy(new StrictMode.ThreadPolicy.Builder()
                .detectAll()
                .penaltyLog()
                .build());

        StrictMode.setVmPolicy(new StrictMode.VmPolicy.Builder()
                .detectAll()
                .penaltyLog()
                .build());
    }

    @Override
    public void onResume() {
        super.onResume();
        if (relockOnNextResume) {
            kioskReleaseRequested = false;
            relockOnNextResume = false;
        }
        enterImmersiveMode();
        if (!kioskReleaseRequested) {
            getWindow().getDecorView().postDelayed(this::startKioskMode, 500);
        }
    }

    @Override
    public void onPause() {
        if (kioskReleaseRequested) {
            relockOnNextResume = true;
        }
        super.onPause();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && !kioskReleaseRequested) {
            enterImmersiveMode();
            getWindow().getDecorView().postDelayed(this::startKioskMode, 300);
        }
    }

    @Override
    public void onBackPressed() {
        // The system back button must never leave the KDS.
    }

    public void releaseKioskMode() {
        kioskReleaseRequested = true;
        relockOnNextResume = false;
        try {
            if (isInAnyLockTaskMode()) {
                stopLockTask();
            }
        } catch (IllegalArgumentException | IllegalStateException ignored) {
            // The system had already released the pinned task.
        }
    }

    public void restoreKioskMode() {
        kioskReleaseRequested = false;
        enterImmersiveMode();
        startKioskMode();
    }

    private void startKioskMode() {
        KeyguardManager keyguard =
                (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
        if (keyguard != null && keyguard.isKeyguardLocked()) {
            return;
        }
        if (isInAnyLockTaskMode()) {
            return;
        }
        try {
            startLockTask();
        } catch (IllegalArgumentException | IllegalStateException ignored) {
            // Unmanaged devices can request one initial pinning confirmation.
        }
    }

    private boolean isInAnyLockTaskMode() {
        ActivityManager manager =
                (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
        if (manager == null) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            return manager.getLockTaskModeState() != ActivityManager.LOCK_TASK_MODE_NONE;
        }
        return manager.isInLockTaskMode();
    }

    private void enterImmersiveMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            if (getWindow().getInsetsController() != null) {
                getWindow().getInsetsController().hide(
                        android.view.WindowInsets.Type.statusBars()
                                | android.view.WindowInsets.Type.navigationBars());
                getWindow().getInsetsController().setSystemBarsBehavior(
                        android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
            return;
        }
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }
}
