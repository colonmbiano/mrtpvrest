import type { CapacitorConfig } from "@capacitor/cli";

// OTA: en dev local (CAPACITOR_OTA_DISABLED=true) no auto-actualiza para ver
// el bundle web local; en release auto-actualiza desde api.mrtpvrest.com.
const otaDisabled = process.env.CAPACITOR_OTA_DISABLED === "true";

// APK Android de MRTPV Retail (TPV retail). Mismo patrón que apps/meseros-lite.
// webDir "out" = export estático de Next (CAPACITOR_BUILD=true → output:'export').
// cleartext/allowMixedContent quedan ON para que el build debug pueda apuntar a un
// backend http:// local/LAN durante pruebas; para release https-only, quitarlos y
// usar un overlay debug en android/app/src/debug/AndroidManifest.xml (ver TPV).
const config: CapacitorConfig = {
  appId: "com.mrtpvrest.moda",
  appName: "MRTPV Retail",
  webDir: "out",
  server: {
    androidScheme: "https",
    cleartext: true,
  },
  android: {
    backgroundColor: "#f6f8f7",
    allowMixedContent: true,
  },
  plugins: {
    CapacitorHttp: { enabled: true },
    // OTA self-hosted en api.mrtpvrest.com (mismo backend que el TPV, separado
    // por appId). autoUpdate descarga en background y aplica al próximo arranque.
    CapacitorUpdater: {
      autoUpdate: !otaDisabled,
      updateUrl: "https://api.mrtpvrest.com/api/ota/check",
      defaultChannel: "production",
      directUpdate: false,
      resetWhenUpdate: true,
      allowModifyUrl: false,
    },
  },
};

export default config;
