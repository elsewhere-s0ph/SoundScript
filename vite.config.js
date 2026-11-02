import { defineConfig } from "vite";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8"));

/* Sostituisce il segnaposto __SW_BUILD__ in dist/sw.js con un timbro univoco a ogni build:
   è così che il service worker capisce che esiste una versione nuova e si aggiorna in silenzio. */
function stampServiceWorker() {
  return {
    name: "soundscript-sw-stamp",
    closeBundle() {
      const swPath = resolve(__dirname, "dist", "sw.js");
      if (!existsSync(swPath)) return;
      const src = readFileSync(swPath, "utf8");
      writeFileSync(swPath, src.replace("__SW_BUILD__", String(Date.now())));
    }
  };
}

export default defineConfig({
  /* Base RELATIVA: lo stesso build funziona su GitHub Pages (/SoundScript/)
     e sulla root di Cloudflare Pages (soundscript-app.pages.dev). */
  base: "./",

  /* Versione mostrata in Info → Versione corrente */
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version || "dev")
  },

  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
    target: "es2020"
  },

  plugins: [stampServiceWorker()]
});