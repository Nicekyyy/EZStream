import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@ezstream/shared", "@ezstream/ui"]
};

export default nextConfig;
