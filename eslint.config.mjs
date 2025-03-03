import globals from "globals";
import pluginJs from "@eslint/js";

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    files: ["**/*.js"],
    languageOptions: { sourceType: "commonjs", globals: globals.node },
  },
  pluginJs.configs.recommended,
  {
    rules: {
      "no-undef": "off", // Prevents ESLint from flagging Mongoose models
      "no-unused-vars": "warn", // Warn instead of error
      "import/no-unresolved": "off", // Fixes import resolution issues
      "no-restricted-globals": "off", // Avoids issues with globals
      strict: "off", // Disables strict mode issues in CommonJS
    },
  },
];
