import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/**/*.ts", "!**/*.test.ts"],
  splitting: false,
  sourcemap: false,
  bundle: true,
  minify: false,
  clean: true,
  format: ["esm"],
  dts: true,
});
