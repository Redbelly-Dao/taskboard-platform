import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  // Keep firebase-admin out of the server bundle.
  // When webpack bundles it, its google-auth-library transport fails to fetch an OAuth2 token
  // (the wallet-auth / reset-password routes error with
  // "failed to fetch a valid Google OAuth2 access token ... reason:"). Requiring it natively at runtime fixes that.
  serverExternalPackages: ["firebase-admin"],
  // The brand kit is a self-contained dark-locked document with its own CSS, so it is served as a static file
  // rather than rebuilt as a page: putting it inside the app shell would fight the light/dark theme system.
  // This rewrite is what makes the bare /brand path resolve to it.
  async rewrites() {
    return [{ source: "/brand", destination: "/brand/index.html" }];
  },
};

export default nextConfig;
