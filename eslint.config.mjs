import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Images come from our own Blob routes, already resized, so next/image adds nothing.
      "@next/next/no-img-element": "off",
    },
  },
  {
    // react-pdf's Image renders into a PDF, where alt text does not exist.
    files: ["src/lib/report-pdf/**"],
    rules: { "jsx-a11y/alt-text": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/generated/**",
    "apps/**",
  ]),
]);

export default eslintConfig;
