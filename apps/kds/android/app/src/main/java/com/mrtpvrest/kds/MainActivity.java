package com.mrtpvrest.kds;

import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TcpListenerPlugin.class);
        super.onCreate(savedInstanceState);

        // Mantener visible el trabajo de cocina sin fijar la aplicación,
        // esconder la navegación de Android ni impedir cambiar de pantalla.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
}
