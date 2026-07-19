import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  // Keep firebase-admin out of the server bundle.
  // When webpack bundles it, its google-auth-library transport fails to fetch an OAuth2 token
  // (the wallet-auth / reset-password routes error with
  // "failed to fetch a valid Google OAuth2 access token ... reason:"). Requiring it natively at runtime fixes that.
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
