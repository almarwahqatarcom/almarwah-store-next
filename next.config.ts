import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // geoip-lite resolves its bundled .dat files relative to its own
  // __dirname at runtime — bundling it into the server build (Turbopack's
  // default for anything imported by an API route) relocates that code
  // into the build output instead, so __dirname no longer points at
  // node_modules/geoip-lite and the data files can't be found. Keeping it
  // external makes Next.js require() it from node_modules as-is instead.
  serverExternalPackages: ["geoip-lite"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "admin.almarwah.qa",
        pathname: "/storage/**",
      },
    ],
  },
};

export default nextConfig;
