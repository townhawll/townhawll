/** @type {import("next").NextConfig} */
const nextConfig = {
  agentRules: false,
  transpilePackages: [
    "@townhawll/config",
    "@townhawll/observability",
    "@townhawll/ui",
  ],
};

export default nextConfig;
