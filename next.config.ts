import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // FalkorDB is a Node/Redis client. Keep it out of Turbopack's server bundle.
  serverExternalPackages: ["falkordb"],
};

export default nextConfig;
