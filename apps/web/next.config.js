/** @type {import("next").NextConfig} */
const nextConfig = {
  agentRules: false,
  transpilePackages: [
    "@townhawll/auth",
    "@townhawll/cache",
    "@townhawll/config",
    "@townhawll/db",
    "@townhawll/email",
    "@townhawll/ui",
  ],
};

export default nextConfig;
