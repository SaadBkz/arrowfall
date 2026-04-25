import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.vercel/**",
      "packages/client/dist/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  // Server-side and Node-script files: allow Node globals + console.log.
  {
    files: ["packages/server/**/*.{ts,mts,mjs,js}", "scripts/**/*.{ts,mts,mjs,js}"],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "no-console": "off",
    },
  },
  // Browser entry points: allow console for hello-world boot logs (Phase 0 holdover).
  {
    files: ["packages/client/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      "no-console": "off",
    },
  },
  {
    files: ["**/*.test.ts", "**/__fixtures__/**"],
    rules: {
      "no-console": "off",
    },
  },
  prettier,
);
