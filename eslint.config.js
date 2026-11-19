import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier/flat";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
      "@typescript-eslint/no-explicit-any": "error",
      "no-eval": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
    },
  },
  { files: ["eslint.config.js"], ...tseslint.configs.disableTypeChecked },
  prettierConfig,
);
