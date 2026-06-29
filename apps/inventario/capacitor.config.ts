import type { CapacitorConfig } from "@capacitor/cli";

const otaDisabled = process.env.CAPACITOR_OTA_DISABLED === "true";

const config: CapacitorConfig = {
  appId: "com.mrtpvrest.inventario",
  appName: "MRTPV Inventario",
  webDir: "out",
  server: {
    androidScheme: "https",
  },
  android: {
    backgroundColor: "#0F1411",
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
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
