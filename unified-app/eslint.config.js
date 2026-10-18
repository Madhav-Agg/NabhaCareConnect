import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

/**
 * ESLint flat config.
 *
 * `npm run lint` (`eslint .`) had no configuration file at all, so it failed
 * before it examined a single file — ESLint 9 dropped support for `.eslintrc.*`
 * and this repository only ever had the old format. Every plugin the config
 * needs was already a devDependency; only the file was missing. This is the
 * Vite React-TS template's config, with two deliberate additions:
 *
 *  • `@typescript-eslint/no-unused-vars` ignores `_`-prefixed names, so
 *    intentionally unused bindings can be documented rather than deleted.
 *  • `e2e-screenshots` is ignored — it holds test artefacts, not source.
 */
export default tseslint.config(
  { ignores: ["dist", "node_modules", "e2e-screenshots", "public"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
          // These files legitimately export more than a component: shadcn's
          // primitives ship their `cva` variants alongside the component, and the
          // context modules export the hook that consumes them, which is the
          // documented pattern for a React context. Listing them explicitly keeps
          // the rule useful everywhere else instead of silencing it globally.
          allowExportNames: [
            "badgeVariants",
            "buttonVariants",
            "toast",
            "useAuth",
            "useTheme",
          ],
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  }
);
