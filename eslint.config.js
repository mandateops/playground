import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier/flat";

export default tseslint.config(
  // The source gates in scripts/ are copied from the masters repository and run
  // by Node or Bun; they are not part of the typed site build.
  { ignores: ["dist/**", "node_modules/**", "scripts/**"] },
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
