import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true, // allows debugging original .ts files during development
    minify: false, // keep readable during development
    rollupOptions: {
      input: {
        background: resolve(__dirname, "src/background/index.ts"),
        content: resolve(__dirname, "src/content/index.ts"),
        popup: resolve(__dirname, "src/popup/popup.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name]-chunk.js",
        format: "es",
      },
    },
  },
  resolve: {
    alias: { "@shared": resolve(__dirname, "src/shared") },
  },
});
