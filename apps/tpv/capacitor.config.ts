import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mrtpvrest.tpv',
  appName: 'MRTPVREST',
  webDir: 'out',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  android: {
    backgroundColor: '#0A0A0A',
    allowMixedContent: true,
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    // OTA self-hosted en api.mrtpvrest.com. autoUpdate descarga en background
    // y aplica al próximo arranque — cero interrupción al cajero. directUpdate
    // false para evitar cambio de bundle a mitad de turno.
    CapacitorUpdater: {
      autoUpdate: true,
      updateUrl: 'https://api.mrtpvrest.com/api/ota/check',
      defaultChannel: 'production',
      directUpdate: false,
      resetWhenUpdate: true,
      allowModifyUrl: false,
    },
  },
};

export default config;
