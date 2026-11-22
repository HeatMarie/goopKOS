import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@goopkos/core"],
  // Lets a test build run beside `next dev` without clobbering its .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default config;
