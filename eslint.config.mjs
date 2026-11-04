import js from "@eslint/js";
import tseslint from "typescript-eslint";
export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      ".wrangler/**",
      "docs/source/**",
      "art/**",
      "test-results/**",
      "scripts/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/server/**", "cloudflare:workers", "node:*"],
              message:
                "Browser code must not import server or Node runtime modules.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["server/**/*.ts", "tests/**/*.ts", "vite.config.ts"],
    rules: { "no-restricted-imports": "off" },
  },
);
