import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// Test-only configuration. It lives here (not in vite.config.ts) so the production build never loads `vitest`.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      globals: false,
      setupFiles: ["./src/test/setup.ts"],
      css: false,
      include: ["src/**/*.test.{ts,tsx}"],
    },
  }),
);
