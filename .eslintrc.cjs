module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:import/recommended",
    "plugin:n/recommended",
    "plugin:promise/recommended",
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  rules: {
    "no-console": process.env.NODE_ENV === "production" ? "warn" : "off",
    "no-empty": ["error", { allowEmptyCatch: true }],
    "no-unused-vars": ["error", { argsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" }],
  },
  settings: {
    "import/resolver": {
      node: {
        extensions: [".js", ".mjs"],
      },
    },
  },
  overrides: [
    {
      files: ["backend/tests/**/*.js", "backend/tests/**/*.mjs", "vitest.config.mjs", "playwright.config.mjs", "playwright/tests/**/*.js"],
      env: { node: true },
      rules: {
        "n/no-unpublished-import": ["error", { allowModules: ["vitest", "@playwright/test", "supertest"] }],
        "import/no-unresolved": "off",
      },
    },
    {
      files: ["frontend/js/**/*.js"],
      env: { browser: true, node: false },
    },
  ],
};
