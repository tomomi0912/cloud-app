import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: '/reigetsukai_local1',
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
