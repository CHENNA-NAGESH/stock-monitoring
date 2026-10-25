import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@atrium/domain": fileURLToPath(new URL("../../packages/domain/src/index.ts", import.meta.url)),
    },
  },
  server: {
    port: 9180,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:8081",
    },
  },
  preview: {
    port: 9180,
    strictPort: true,
  },
});
