import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    threads: false,
    globals: true,
    environment: "node",
    include: ["backend/tests/**/*.test.js", "backend/tests/**/*.test.mjs"],
    setupFiles: ["backend/tests/setup/testEnv.js"],
    deps: {
      optimizer: {
        ssr: {
          include: ["supertest"]
        }
      }
    },
    transformMode: {
      web: [],
      ssr: [/.*/]
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["backend/**/*.js"],
      exclude: [
        "backend/tests/**",
        "backend/db/migrations/**",
        "backend/db/seed.js",
        "backend/server.js",
      ],
    },
  },
});
