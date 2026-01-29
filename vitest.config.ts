import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@core": resolve(__dirname, "./src/core"),
      "@core/*": resolve(__dirname, "./src/core/*"),
      "@ui": resolve(__dirname, "./src/ui"),
      "@ui/*": resolve(__dirname, "./src/ui/*"),
    },
  },
  esbuild: {
    target: "es2022",
  },
});
