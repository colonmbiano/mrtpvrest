import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mrtpvrest.delivery',
  appName: 'MRTPV Delivery',
  webDir: 'out',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    cleartext: true
  },
  ios: {
    // contentInset 'always' respeta el notch / Dynamic Island y la barra de
    // estado en iPhones modernos. Mantener las navegaciones no limitadas a
    // app-bound domains para poder hablar con el backend (Railway) y Mapbox.
    contentInset: 'always',
    limitsNavigationsToAppBoundDomains: false
  }
};

export default config;
