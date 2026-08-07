const js = require("@eslint/js");

module.exports = [
  {
    ignores: ["node_modules/**", ".claude/**", "miniprogram/miniprogram_npm/**"],
  },
  js.configs.recommended,
  {
    languageOptions: {
      globals: {
        // Mini Program globals
        wx: "readonly",
        getApp: "readonly",
        getCurrentPages: "readonly",
        Page: "readonly",
        App: "readonly",
        Component: "readonly",
        // CloudBase
        cloud: "readonly",
        // Node.js (tests, scripts, cloud functions)
        console: "readonly",
        require: "readonly",
        module: "readonly",
        process: "readonly",
        global: "readonly",
        Buffer: "readonly",
        exports: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-useless-escape": "warn",
      "no-control-regex": "off",
      "no-undef": "error",
    },
  },
];
