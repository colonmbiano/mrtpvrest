import type { CapacitorConfig } from '@capacitor/cli';

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
  },
};

export default config;
