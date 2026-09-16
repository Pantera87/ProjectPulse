import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // better-sqlite3 is a native module; do not let webpack bundle it.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;

