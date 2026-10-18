import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // FalkorDB is a Node/Redis client. Keep it out of Turbopack's server bundle.
  serverExternalPackages: ["falkordb"],
  // Keeps the dev-mode route badge out of demo recordings; errors still surface.
  devIndicators: false,
};

export default nextConfig;
