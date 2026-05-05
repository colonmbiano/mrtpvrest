package com.mrtpvrest.kiosk;

import android.os.Bundle;
import android.os.StrictMode;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Relax StrictMode to prevent crashes during debugging/view inspection in Android Studio
        // This handles cases where system tools traverse the View hierarchy (including WebView)
        // on a background thread.
        StrictMode.setThreadPolicy(new StrictMode.ThreadPolicy.Builder()
                .detectAll()
                .penaltyLog()
                .build());
        
        StrictMode.VmPolicy.Builder builder = new StrictMode.VmPolicy.Builder()
                .detectAll()
                .penaltyLog();
        
        StrictMode.setVmPolicy(builder.build());
    }
}
