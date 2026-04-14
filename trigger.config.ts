import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  // Get your project ref from: cloud.trigger.dev → your project → Settings
  project: "proj_byhwhjfkuxaeitnitzww",
  runtime: "node",
  logLevel: "log",
  dirs: ["src/trigger"],
  maxDuration: 3600,
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 2000,
      maxTimeoutInMs: 30_000,
      factor: 2,
    },
  },
});
