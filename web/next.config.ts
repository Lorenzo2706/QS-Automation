import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Allow imports from ../shared (the parser + URL builder are shared with the
  // Trigger.dev backend). outputFileTracingRoot makes Vercel's standalone
  // bundler include the shared/ folder in the deploy.
  outputFileTracingRoot: path.join(import.meta.dirname, ".."),
  serverExternalPackages: ["pdf2json"],
};

export default nextConfig;
