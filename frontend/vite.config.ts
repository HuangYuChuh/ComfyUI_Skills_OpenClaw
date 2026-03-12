import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  base: "/static/",
  publicDir: resolve(__dirname, "public"),
  build: {
    outDir: resolve(__dirname, "../ui/static"),
    emptyOutDir: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: resolve(__dirname, "src/test/setup.ts"),
    css: true,
    testTimeout: 20000,
  },
});
