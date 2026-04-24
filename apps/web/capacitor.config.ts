import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.agentpilot.feishu",
  appName: "Feishu Agent-Pilot",
  webDir: "dist",
  server: {
    androidScheme: "https"
  }
};

export default config;
