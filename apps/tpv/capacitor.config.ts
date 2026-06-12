import type { CapacitorConfig } from '@capacitor/cli';

const otaDisabled = process.env.CAPACITOR_OTA_DISABLED === 'true';

const config: CapacitorConfig = {
  appId: 'com.mrtpvrest.tpv',
  appName: 'MRTPVREST',
  webDir: 'out',
  server: {
    androidScheme: 'https',
    // cleartext deshabilitado: todo el tráfico HTTP del WebView va por https.
    // La impresión LAN no se ve afectada (va por socket TCP nativo, puerto
    // 9100, fuera de la pila HTTP). Para dev contra backend http local, los
    // builds debug lo re-habilitan vía src/debug/AndroidManifest.xml.
  },
  android: {
    backgroundColor: '#0A0A0A',
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    // OTA self-hosted en api.mrtpvrest.com. autoUpdate descarga en background
    // y aplica al próximo arranque — cero interrupción al cajero. directUpdate
    // false para evitar cambio de bundle a mitad de turno.
    CapacitorUpdater: {
      autoUpdate: !otaDisabled,
      updateUrl: 'https://api.mrtpvrest.com/api/ota/check',
      defaultChannel: 'production',
      directUpdate: false,
      resetWhenUpdate: true,
      allowModifyUrl: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0C0C0E',
      overlaysWebView: false,
    },
  },
};

export default config;
