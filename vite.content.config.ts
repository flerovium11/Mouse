import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false, // don't wipe the main build output
    sourcemap: true,
    minify: false,
    rollupOptions: {
      input: {
        content: resolve(__dirname, "src/content/index.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        format: "iife",
        name: "content",
        inlineDynamicImports: true,
      },
    },
  },
  resolve: {
    alias: { "@shared": resolve(__dirname, "src/shared") },
  },
});
