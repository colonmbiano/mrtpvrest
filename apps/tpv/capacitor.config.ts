import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mrtpvrest.tpv',
  appName: 'MRTPVREST',
  webDir: 'out',
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
  android: {
    backgroundColor: '#0A0A0A',
    allowMixedContent: false,
  },
};

export default config;
