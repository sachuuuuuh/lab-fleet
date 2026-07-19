import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@lab-fleet/shared": path.resolve(__dirname, "packages/shared/src/index.ts"),
      "@lab-fleet/agent": path.resolve(__dirname, "packages/agent/src/index.ts")
    }
  },
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts"],
    coverage: {
      reporter: ["text", "html"]
    }
  }
});

