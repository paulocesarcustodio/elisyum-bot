import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  serverExternalPackages: ["better-auth", "drizzle-orm"],
  allowedDevOrigins: ["*"],
};

export default nextConfig;
