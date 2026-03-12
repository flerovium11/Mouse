import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    sourcemap: true,
    minify: false,
    rollupOptions: {
      input: {
        "docs-frame": resolve(__dirname, "src/content/sites/docs-frame.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        format: "iife",
        name: "docsFrame",
        inlineDynamicImports: true,
      },
    },
  },
});
