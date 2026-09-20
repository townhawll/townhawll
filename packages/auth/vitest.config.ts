import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [{ find: /^next\/server$/, replacement: "next/server.js" }],
  },
  ssr: {
    noExternal: ["next-auth"],
  },
});
