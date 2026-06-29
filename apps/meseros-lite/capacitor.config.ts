import type { CapacitorConfig } from "@capacitor/cli";

const otaDisabled = process.env.CAPACITOR_OTA_DISABLED === "true";

const config: CapacitorConfig = {
  appId: "com.mrtpvrest.meseroslite",
  appName: "MRTPV Meseros Lite",
  webDir: "out",
  server: {
    androidScheme: "https",
    cleartext: true,
  },
  android: {
    backgroundColor: "#0A0A0C",
    allowMixedContent: true,
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
