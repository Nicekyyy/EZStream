import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ezstream/shared", "@ezstream/ui"]
};

export default nextConfig;
