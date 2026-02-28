// Vite build config — compiles three MV3 entry points into dist/.
//
// MV3 NOTES:
//  • background.js runs as an ES module service worker
//    (manifest.json must include "type": "module" on the service_worker entry).
//  • content.js is injected as a plain <script> — it cannot use dynamic import()
//    at runtime. Keep all content/ imports static so Rollup inlines them.
//    If shared code causes a separate chunk, add @crxjs/vite-plugin to handle it.
//  • popup.js is loaded by popup.html as a normal script — ES module is fine.

import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
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
