import type { CapacitorConfig } from '@capacitor/cli';

const otaDisabled = process.env.CAPACITOR_OTA_DISABLED === 'true';

const config: CapacitorConfig = {
  appId: 'com.mrtpvrest.kds',
  appName: 'MRTPV KDS',
  webDir: 'out',
  server: {
    androidScheme: 'https',
    // cleartext deshabilitado: la impresión LAN va por TCP nativo (no HTTP).
    // Builds debug lo re-habilitan vía src/debug/AndroidManifest.xml.
  },
  android: {
    backgroundColor: '#0A0A0A',
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    CapacitorUpdater: {
      autoUpdate: !otaDisabled,
      updateUrl: 'https://api.mrtpvrest.com/api/ota/check',
      defaultChannel: 'production',
      directUpdate: false,
      resetWhenUpdate: true,
      allowModifyUrl: false,
    },
  },
};

export default config;
