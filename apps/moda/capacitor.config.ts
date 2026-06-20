import type { CapacitorConfig } from "@capacitor/cli";

// APK Android de MODA+ (TPV retail). Mismo patrón que apps/meseros-lite.
// webDir "out" = export estático de Next (CAPACITOR_BUILD=true → output:'export').
// cleartext/allowMixedContent quedan ON para que el build debug pueda apuntar a un
// backend http:// local/LAN durante pruebas; para release https-only, quitarlos y
// usar un overlay debug en android/app/src/debug/AndroidManifest.xml (ver TPV).
const config: CapacitorConfig = {
  appId: "com.mrtpvrest.moda",
  appName: "MODA+ Retail",
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
  },
};

export default config;
