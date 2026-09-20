import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Native/heavy server-only deps: do not let webpack bundle them.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;

