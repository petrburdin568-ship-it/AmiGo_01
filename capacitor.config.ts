import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.amigo.app",
  appName: "AmiGo",
  webDir: ".next",
  server: {
    url: "https://ami-go-01.vercel.app",
    cleartext: false
  },
  android: {
    allowMixedContent: false
  }
};

export default config;
