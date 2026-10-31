import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // API routes read personas and cached runs from public/ on disk.
  outputFileTracingIncludes: {
    "/api/**": ["./public/data/personas.json", "./public/cache/**"],
  },
};

export default nextConfig;
