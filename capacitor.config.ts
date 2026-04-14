import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim() || "https://ami-go-01.vercel.app";

const config: CapacitorConfig = {
  appId: "com.amigo.app",
  appName: "AmiGo",
  webDir: ".next",
  server: serverUrl
    ? {
        url: serverUrl,
        cleartext: serverUrl.startsWith("http://")
      }
    : undefined,
  android: {
    allowMixedContent: false
  }
};

export default config;
