import type { CapacitorConfig } from '@capacitor/cli';

const otaDisabled = process.env.CAPACITOR_OTA_DISABLED === 'true';

const config: CapacitorConfig = {
  appId: 'com.mrtpvrest.delivery',
  appName: 'MRTPV Delivery',
  webDir: 'out',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    // OTA self-hosted en api.mrtpvrest.com (mismo backend que el TPV; el
    // plugin envía app_id=com.mrtpvrest.delivery y el backend separa los
    // bundles por appId). autoUpdate descarga en background y aplica al
    // próximo arranque — sin interrumpir al repartidor a mitad de reparto.
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
