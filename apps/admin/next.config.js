/** @type {import("next").NextConfig} */
const nextConfig = {
  agentRules: false,
  transpilePackages: [
    "@townhawll/auth",
    "@townhawll/cache",
    "@townhawll/config",
    "@townhawll/db",
    "@townhawll/observability",
    "@townhawll/profile",
    "@townhawll/ui",
  ],
};

export default nextConfig;
